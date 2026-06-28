import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AppConfig } from '@pdf2obsidian/core';
import { ensureDirectory } from '@pdf2obsidian/core';
import { runPdfBatch } from './task-runner.js';

export async function watchPdfInbox(input: {
  config: AppConfig;
  inboxDir?: string | undefined;
}): Promise<void> {
  const inboxDir = resolve(input.inboxDir ?? input.config.tasks.inboxDir);
  await ensureDirectory(inboxDir);
  console.log(`[Watch] 正在监听 PDF 目录：${inboxDir}`);
  console.log(`[Watch] 轮询间隔：${input.config.tasks.watchPollIntervalMs}ms，并发：${input.config.tasks.concurrency}`);

  const seen = new Set<string>();
  let running = false;

  async function tick(): Promise<void> {
    // 轮询可能被 setInterval 重入；running 锁保证同一时间只有一轮扫描和导入在执行。
    if (running) {
      return;
    }

    running = true;
    try {
      const pdfPaths = await collectPdfFiles(inboxDir);
      const fresh = pdfPaths.filter((pdfPath) => !seen.has(pdfPath));
      for (const pdfPath of fresh) {
        // 先标记 seen 再执行导入，避免长任务期间下一轮 tick 重复提交同一个 PDF。
        seen.add(pdfPath);
      }

      if (fresh.length > 0) {
        console.log(`[Watch] 发现 ${fresh.length} 个新 PDF`);
        await runPdfBatch({
          pdfPaths: fresh,
          config: input.config
        });
      }
    } finally {
      running = false;
    }
  }

  await tick();
  setInterval(() => {
    void tick().catch((error) => {
      console.error(`[Watch] ${error instanceof Error ? error.message : String(error)}`);
    });
  }, input.config.tasks.watchPollIntervalMs);
}

async function collectPdfFiles(rootDir: string): Promise<string[]> {
  // inbox 支持多层目录，便于用户按项目或来源归档待处理 PDF。
  const entries = await readdir(rootDir, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await collectPdfFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.toLocaleLowerCase().endsWith('.pdf')) {
      paths.push(fullPath);
    }
  }

  return paths.sort();
}
