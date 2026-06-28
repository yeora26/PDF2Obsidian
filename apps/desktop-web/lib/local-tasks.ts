import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { importPdf, importPipelineSteps, resolvePdfSource, type ImportPdfResult, type ImportPipelineStep, type ImportPipelineStepCallback } from '@pdf2obsidian/pipeline';
import { loadLocalAppConfig, validateLocalRuntimeConfig } from './config';
import { diagnoseError, formatDiagnosisForLog } from './error-diagnostics';
import { getDesktopPipelineDir, getUploadDir } from './paths';

export type LocalTaskStatus = 'queued' | 'running' | 'completed' | 'failed';
export type LocalStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface LocalTaskStep {
  step: ImportPipelineStep;
  status: LocalStepStatus;
  message?: string;
  updatedAt?: string;
}

export interface LocalTask {
  id: string;
  fileName: string;
  pdfPath: string;
  status: LocalTaskStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  result?: ImportPdfResult;
  steps: LocalTaskStep[];
  logs: string[];
}

const pipelineSteps: ImportPipelineStep[] = [...importPipelineSteps];

const tasks = new Map<string, LocalTask>();
const running = new Set<string>();

export async function listLocalTasks(): Promise<LocalTask[]> {
  await hydrateTasks();
  return [...tasks.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getLocalTask(id: string): Promise<LocalTask | undefined> {
  await hydrateTasks();
  return tasks.get(id);
}

export async function createLocalTask(file: File): Promise<LocalTask> {
  const id = `${formatTaskDate(new Date())}-${randomUUID().slice(0, 8)}`;
  const safeName = sanitizeFileName(file.name || `${id}.pdf`);
  const uploadDir = await getUploadDir();
  const pdfPath = join(uploadDir, `${id}-${safeName}`);
  await writeFile(pdfPath, Buffer.from(await file.arrayBuffer()));

  const now = new Date().toISOString();
  const task: LocalTask = {
    id,
    fileName: safeName,
    pdfPath,
    status: 'queued',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    steps: pipelineSteps.map((step) => ({ step, status: 'pending' })),
    logs: [`${formatTime(now)} 已加入本地队列：${basename(pdfPath)}`]
  };

  tasks.set(id, task);
  await persistTask(task);
  void runTask(id);
  return task;
}

/**
 * 从 URL / arXiv ID / DOI 创建导入任务。
 * 先下载 PDF 到上传目录，然后复用与文件上传相同的流水线。
 */
export async function createLocalTaskFromUrl(url: string): Promise<LocalTask> {
  const id = `${formatTaskDate(new Date())}-${randomUUID().slice(0, 8)}`;
  const uploadDir = await getUploadDir();
  const downloadDir = join(await getDesktopPipelineDir(), 'downloads');

  const resolved = await resolvePdfSource(url, downloadDir);
  // 将下载的文件移到上传目录，统一命名规范
  const safeName = sanitizeFileName(basename(resolved.pdfPath));
  const pdfPath = join(uploadDir, `${id}-${safeName}`);
  const { rename } = await import('node:fs/promises');
  await rename(resolved.pdfPath, pdfPath);

  const now = new Date().toISOString();
  const task: LocalTask = {
    id,
    fileName: safeName,
    pdfPath,
    status: 'queued',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    steps: pipelineSteps.map((step) => ({ step, status: 'pending' })),
    logs: [`${formatTime(now)} 已从 ${resolved.sourceType} 源导入：${url}`]
  };

  tasks.set(id, task);
  await persistTask(task);
  void runTask(id);
  return task;
}

export async function deleteLocalTask(id: string): Promise<void> {
  await hydrateTasks();
  const task = tasks.get(id);
  if (!task) {
    throw new Error('任务不存在');
  }
  if (running.has(id) || task.status === 'running' || task.status === 'queued') {
    throw new Error('任务运行中，完成或失败后再删除。');
  }

  tasks.delete(id);
  await unlink(task.pdfPath).catch(() => undefined);
  await persistTasks();
}

export async function retryLocalTask(id: string): Promise<LocalTask> {
  await hydrateTasks();
  const task = tasks.get(id);
  if (!task) {
    throw new Error('任务不存在');
  }
  if (running.has(id) || task.status === 'running' || task.status === 'queued') {
    throw new Error('任务正在运行，不需要重复开始。');
  }

  const now = new Date().toISOString();
  // 断点续跑：保留已完成和已跳过的步骤状态，只重置失败和等待中的步骤。
  const nextSteps = task.steps.map((step) => {
    if (step.status === 'completed' || step.status === 'skipped') return step;
    return { ...step, status: 'pending' as const, message: undefined, updatedAt: now };
  });

  const next: LocalTask = {
    ...task,
    status: 'queued',
    progress: 0,
    updatedAt: now,
    startedAt: undefined,
    finishedAt: undefined,
    error: undefined,
    result: undefined,
    steps: nextSteps,
    logs: [...task.logs, `${formatTime(now)} 已重新加入本地队列（断点续跑）`].slice(-240)
  };
  tasks.set(id, next);
  await persistTasks();
  void runTask(id);
  return next;
}

async function runTask(id: string): Promise<void> {
  if (running.has(id)) return;
  running.add(id);

  let task = tasks.get(id);
  if (!task) return;

  try {
    const config = await loadLocalAppConfig();
    validateLocalRuntimeConfig(config);

    task = await updateTask(id, {
      status: 'running',
      progress: 4,
      startedAt: new Date().toISOString()
    }, '开始执行 PDF 导入流水线');

    // 断点续跑：从任务状态中提取已完成步骤集合，传给流水线跳过。
    const completedSteps = new Set<ImportPipelineStep>(
      task.steps
        .filter((s) => s.status === 'completed' || s.status === 'skipped')
        .map((s) => s.step)
    );

    const result = await importPdf({
      pdfPath: task.pdfPath,
      config,
      completedSteps,
      onStep: (async (event) => {
        await updateStep(id, event.step, event.status, event.message);
      }) satisfies ImportPipelineStepCallback
    });

    await updateTask(id, {
      status: 'completed',
      progress: 100,
      finishedAt: new Date().toISOString(),
      result
    }, `处理完成：${result.slug}`);
  } catch (error) {
    const diagnosis = diagnoseError(error);
    await updateTask(id, {
      status: 'failed',
      progress: task.progress,
      finishedAt: new Date().toISOString(),
      error: diagnosis.summary
    }, [
      `处理失败：${diagnosis.summary}`,
      ...formatDiagnosisForLog(diagnosis)
    ].join('\n'));
  } finally {
    running.delete(id);
  }
}

async function updateStep(
  id: string,
  step: ImportPipelineStep,
  status: 'running' | 'completed' | 'failed' | 'skipped',
  message?: string
): Promise<void> {
  const task = tasks.get(id);
  if (!task) return;

  const now = new Date().toISOString();
  const stepIndex = pipelineSteps.indexOf(step);
  const nextSteps = task.steps.map((item) => {
    if (item.step !== step) return item;
    return {
      ...item,
      status,
      message,
      updatedAt: now
    };
  });

  const progressBase = stepIndex >= 0 ? Math.round(((stepIndex + (status === 'completed' || status === 'skipped' ? 1 : 0.35)) / pipelineSteps.length) * 96) : task.progress;
  await updateTask(id, {
    steps: nextSteps,
    progress: Math.max(task.progress, Math.min(progressBase, 96))
  }, `${formatStep(step)} ${formatStepStatus(status)}${message ? `：${message}` : ''}`);
}

async function updateTask(id: string, patch: Partial<LocalTask>, log?: string): Promise<LocalTask> {
  const previous = tasks.get(id);
  if (!previous) {
    throw new Error(`任务不存在：${id}`);
  }

  const now = new Date().toISOString();
  const next: LocalTask = {
    ...previous,
    ...patch,
    updatedAt: now,
    logs: log ? [...previous.logs, `${formatTime(now)} ${log}`].slice(-240) : previous.logs
  };
  tasks.set(id, next);
  await persistTask(next);
  return next;
}

async function hydrateTasks(): Promise<void> {
  const taskDir = await getTaskDir();
  await mkdir(taskDir, { recursive: true });
  const indexPath = join(taskDir, 'tasks.json');
  try {
    const parsed = JSON.parse(await readFile(indexPath, 'utf8')) as LocalTask[];
    for (const task of parsed) {
      if (!tasks.has(task.id)) {
        tasks.set(task.id, task);
      }
    }
  } catch {
    // 首次启动没有任务索引是正常情况。
  }
}

async function persistTask(task: LocalTask): Promise<void> {
  tasks.set(task.id, task);
  await persistTasks();
}

async function persistTasks(): Promise<void> {
  const taskDir = await getTaskDir();
  await mkdir(taskDir, { recursive: true });
  await writeFile(join(taskDir, 'tasks.json'), JSON.stringify([...tasks.values()], null, 2), 'utf8');
}

async function getTaskDir(): Promise<string> {
  return join(await getDesktopPipelineDir(), 'tasks');
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^\w\u4e00-\u9fa5.\- ]+/g, '_').replace(/\s+/g, ' ').slice(0, 140) || 'document.pdf';
}

function formatTaskDate(date: Date): string {
  return date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function formatTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString('zh-CN', { hour12: false });
}

function formatStep(step: ImportPipelineStep): string {
  const labels: Record<ImportPipelineStep, string> = {
    upload: '上传',
    mineru: '解析',
    normalize: '规范化',
    translate: '翻译',
    obsidian_export: '导出',
    quality_check: '质检'
  };
  return labels[step];
}

function formatStepStatus(status: LocalStepStatus): string {
  const labels: Record<LocalStepStatus, string> = {
    pending: '等待',
    running: '开始',
    completed: '完成',
    failed: '失败',
    skipped: '跳过'
  };
  return labels[status];
}
