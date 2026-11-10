import { Command } from 'commander';
import { dirname, join, resolve } from 'node:path';
import { loadConfig } from '@pdf2obsidian/core';
import { importPdf, resolvePdfSource } from '@pdf2obsidian/pipeline';
import { formatTaskLine, getPipelineTask, listPipelineTasks, retryPipelineTask, runPdfBatch, watchPdfInbox } from '@pdf2obsidian/tasks';

// pnpm --filter 会把工作目录切到 apps/cli；INIT_CWD 是用户实际执行命令的目录，命令行参数里的相对路径按它解析。
const invocationDir = process.env.INIT_CWD ?? process.cwd();

function fromInvocationDir(path: string): string {
  return resolve(invocationDir, path);
}

const program = new Command();

program
  .name('pdf2obsidian')
  .description('Import a PDF into Obsidian using MinerU and DeepSeek translation.')
  .version('0.1.0');

program
  .command('import')
  .argument('<source>', '本地 PDF 路径、arXiv ID、DOI 或 PDF URL')
  .option('-c, --config <path>', 'Path to config yaml', 'pdf2obsidian.config.yaml')
  .action(wrapAction(async (source: string, options: { config: string }) => {
    const configPath = fromInvocationDir(options.config);
    const config = await loadConfig(configPath);

    // 自动检测输入类型：本地路径按执行目录解析，远程源先下载到配置文件旁的 .pipeline/downloads。
    const resolved = await resolvePdfSource(source, join(dirname(configPath), '.pipeline', 'downloads'), invocationDir);
    if (resolved.sourceType !== 'local') {
      console.log(`已识别 ${resolved.sourceType} 源，下载完成：${resolved.pdfPath}`);
    }

    const result = await importPdf({
      pdfPath: resolved.pdfPath,
      config
    });

    console.log(JSON.stringify(result, null, 2));
  }));

program
  .command('batch')
  .argument('<pdfPaths...>', 'PDF files to import')
  .option('-c, --config <path>', 'Path to config yaml', 'pdf2obsidian.config.yaml')
  .option('-j, --concurrency <count>', 'Maximum concurrent imports')
  .action(wrapAction(async (pdfPaths: string[], options: { config: string; concurrency?: string }) => {
    const config = await loadConfig(fromInvocationDir(options.config));
    const concurrency = parseOptionalPositiveInteger(options.concurrency, 'concurrency');
    const result = await runPdfBatch({
      pdfPaths: pdfPaths.map((pdfPath) => fromInvocationDir(pdfPath)),
      config,
      concurrency
    });

    for (const task of result.tasks) {
      console.log(formatTaskLine(task));
    }
  }));

program
  .command('watch')
  .argument('[inboxDir]', 'Directory to watch for PDF files')
  .option('-c, --config <path>', 'Path to config yaml', 'pdf2obsidian.config.yaml')
  .action(wrapAction(async (inboxDir: string | undefined, options: { config: string }) => {
    const config = await loadConfig(fromInvocationDir(options.config));
    await watchPdfInbox({
      config,
      inboxDir: inboxDir ? fromInvocationDir(inboxDir) : undefined
    });
  }));

const tasks = program.command('tasks').description('Inspect or retry persisted pipeline tasks.');

tasks
  .command('list')
  .option('-c, --config <path>', 'Path to config yaml', 'pdf2obsidian.config.yaml')
  .action(wrapAction(async (options: { config: string }) => {
    const config = await loadConfig(fromInvocationDir(options.config));
    const taskList = await listPipelineTasks(config);
    for (const task of taskList) {
      console.log(formatTaskLine(task));
    }
  }));

tasks
  .command('show')
  .argument('<taskId>', 'Task id')
  .option('-c, --config <path>', 'Path to config yaml', 'pdf2obsidian.config.yaml')
  .action(wrapAction(async (taskId: string, options: { config: string }) => {
    const config = await loadConfig(fromInvocationDir(options.config));
    const task = await getPipelineTask({
      taskId,
      config
    });
    if (!task) {
      throw new Error(`任务不存在：${taskId}`);
    }

    console.log(JSON.stringify(task, null, 2));
  }));

tasks
  .command('retry')
  .argument('<taskId>', 'Task id')
  .option('-c, --config <path>', 'Path to config yaml', 'pdf2obsidian.config.yaml')
  .action(wrapAction(async (taskId: string, options: { config: string }) => {
    const config = await loadConfig(fromInvocationDir(options.config));
    const task = await retryPipelineTask({
      taskId,
      config
    });
    console.log(formatTaskLine(task));
  }));

await program.parseAsync(process.argv);

function wrapAction<T extends any[]>(fn: (...args: T) => Promise<void>): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (error) {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exitCode = 1;
    }
  };
}

function parseOptionalPositiveInteger(value: string | undefined, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsed;
}
