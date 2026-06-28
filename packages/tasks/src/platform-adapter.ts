import type { AppConfig } from '@pdf2obsidian/core';
import { importPdf, type ImportPdfResult, type ImportPipelineStep, type ImportPipelineStepStatus } from '@pdf2obsidian/pipeline';

export type CoreTaskStatus = 'running' | 'completed' | 'failed';

export type CoreTaskEvent =
  | {
    type: 'task';
    taskId: string;
    status: CoreTaskStatus;
    at: string;
    error?: string | undefined;
    result?: ImportPdfResult | undefined;
  }
  | {
    type: 'step';
    taskId: string;
    step: ImportPipelineStep;
    status: ImportPipelineStepStatus;
    at: string;
    message?: string | undefined;
  };

export interface RunCoreImportTaskInput {
  taskId: string;
  pdfPath: string;
  config: AppConfig;
  onEvent?: ((event: CoreTaskEvent) => Promise<void> | void) | undefined;
}

export type RunCoreImportTaskResult =
  | {
    status: 'completed';
    taskId: string;
    result: ImportPdfResult;
  }
  | {
    status: 'failed';
    taskId: string;
    error: string;
  };

export async function runCoreImportTask(input: RunCoreImportTaskInput): Promise<RunCoreImportTaskResult> {
  // 调用方通过 CoreTaskEvent 自己保存任务状态、刷新 UI 或记录日志。
  await emitTaskEvent(input, {
    type: 'task',
    taskId: input.taskId,
    status: 'running',
    at: new Date().toISOString()
  });

  try {
    const result = await importPdf({
      pdfPath: input.pdfPath,
      config: input.config,
      onStep: async (event) => {
        await emitTaskEvent(input, {
          type: 'step',
          taskId: input.taskId,
          step: event.step,
          status: event.status,
          at: new Date().toISOString(),
          message: event.message
        });
      }
    });

    await emitTaskEvent(input, {
      type: 'task',
      taskId: input.taskId,
      status: 'completed',
      at: new Date().toISOString(),
      result
    });

    return {
      status: 'completed',
      taskId: input.taskId,
      result
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await emitTaskEvent(input, {
      type: 'task',
      taskId: input.taskId,
      status: 'failed',
      at: new Date().toISOString(),
      error: message
    });

    return {
      status: 'failed',
      taskId: input.taskId,
      error: message
    };
  }
}

async function emitTaskEvent(input: RunCoreImportTaskInput, event: CoreTaskEvent): Promise<void> {
  await input.onEvent?.(event);
}
