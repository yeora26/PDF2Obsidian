import { resolve } from 'node:path';
import type { AppConfig } from '@pdf2obsidian/core';
import { importPdf, type ImportPipelineStep } from '@pdf2obsidian/pipeline';
import { createTaskStateStore, formatTaskLine, getCompletedSteps, isRunnableStatus, resetTaskForRetry, type TaskStateStore } from './state-store.js';
import type { PipelineTaskState, StepStatus } from './task-types.js';

export interface RunBatchInput {
  pdfPaths: string[];
  config: AppConfig;
  concurrency?: number | undefined;
}

export interface RunBatchResult {
  tasks: PipelineTaskState[];
}

export async function runPdfBatch(input: RunBatchInput): Promise<RunBatchResult> {
  const store = createTaskStateStore(input.config);
  const tasks: PipelineTaskState[] = [];

  for (const pdfPath of input.pdfPaths) {
    // 相同 PDF 会复用已有非失败任务，避免重复解析和重复消耗 LLM / MinerU 额度。
    const task = await store.createOrReuseTask(resolve(pdfPath));
    tasks.push(task);
  }

  const uniqueRunnableTasks = dedupeTasks(tasks).filter((task) => task.status === 'queued');
  const concurrency = input.concurrency ?? input.config.tasks.concurrency;
  await runTaskPool({
    tasks: uniqueRunnableTasks,
    config: input.config,
    store,
    concurrency
  });

  return {
    tasks: await Promise.all(tasks.map(async (task) => {
      return (await store.readTask(task.taskId)) ?? task;
    }))
  };
}

export async function retryPipelineTask(input: {
  taskId: string;
  config: AppConfig;
}): Promise<PipelineTaskState> {
  const store = createTaskStateStore(input.config);
  const task = await store.readTask(input.taskId);
  if (!task) {
    throw new Error(`任务不存在：${input.taskId}`);
  }

  if (!isRunnableStatus(task.status)) {
    throw new Error(`任务状态为 ${task.status}，不能重试`);
  }

  const reset = await store.updateTask(task, resetTaskForRetry(task));
  await runTaskPool({
    tasks: [reset],
    config: input.config,
    store,
    concurrency: 1
  });

  return (await store.readTask(input.taskId)) ?? reset;
}

export async function listPipelineTasks(config: AppConfig): Promise<PipelineTaskState[]> {
  return createTaskStateStore(config).listTasks();
}

export async function getPipelineTask(input: {
  taskId: string;
  config: AppConfig;
}): Promise<PipelineTaskState | undefined> {
  return createTaskStateStore(input.config).readTask(input.taskId);
}

export { formatTaskLine };

async function runTaskPool(input: {
  tasks: PipelineTaskState[];
  config: AppConfig;
  store: TaskStateStore;
  concurrency: number;
}): Promise<void> {
  let cursor = 0;
  const workerCount = Math.min(Math.max(input.concurrency, 1), Math.max(input.tasks.length, 1));

  // 使用共享游标实现轻量任务池，避免引入额外队列依赖；每个 worker 串行消费一个任务。
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < input.tasks.length) {
      const task = input.tasks[cursor];
      cursor += 1;
      if (task) {
        await runSingleTask(task, input.config, input.store);
      }
    }
  }));
}

async function runSingleTask(
  task: PipelineTaskState,
  config: AppConfig,
  store: TaskStateStore
): Promise<void> {
  let currentTask = await store.updateTask(task, {
    status: 'running',
    startedAt: new Date().toISOString(),
    error: undefined
  });
  let currentStep: ImportPipelineStep | undefined;

  try {
    const result = await importPdf({
      pdfPath: currentTask.sourcePath,
      config,
      completedSteps: getCompletedSteps(currentTask),
      onStep: async (event) => {
        // importPdf 只暴露短生命周期事件，任务层负责把事件持久化为可查询状态。
        currentStep = event.step;
        currentTask = await store.updateStep(
          currentTask,
          event.step,
          toPersistedStepStatus(event.status),
          event.status === 'failed' ? event.message : undefined
        );
      }
    });
    // 某些阶段可能因配置被跳过（例如中文文档跳过翻译），结束时统一补齐 skipped，方便 UI 展示完整进度。
    currentTask = await markPendingStepsSkipped(store, currentTask);
    await store.markResult(currentTask, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (currentStep) {
      // 如果失败发生在某个明确阶段，先把阶段标红，再标记整个任务失败。
      currentTask = await store.updateStep(currentTask, currentStep, 'failed', message);
    }

    await store.updateTask(currentTask, {
      status: 'failed',
      error: message,
      finishedAt: new Date().toISOString()
    });
  }
}

async function markPendingStepsSkipped(
  store: TaskStateStore,
  task: PipelineTaskState
): Promise<PipelineTaskState> {
  let current = task;
  for (const [step, state] of Object.entries(task.steps) as Array<[ImportPipelineStep, { status: StepStatus }]>) {
    if (state.status === 'pending') {
      current = await store.updateStep(current, step, 'skipped');
    }
  }

  return current;
}

function toPersistedStepStatus(status: 'running' | 'completed' | 'failed' | 'skipped'): StepStatus {
  return status;
}

function dedupeTasks(tasks: PipelineTaskState[]): PipelineTaskState[] {
  const seen = new Set<string>();
  const unique: PipelineTaskState[] = [];

  for (const task of tasks) {
    if (seen.has(task.taskId)) {
      continue;
    }

    seen.add(task.taskId);
    unique.push(task);
  }

  return unique;
}
