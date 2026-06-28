import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import YAML from 'yaml';
import type { AppConfig } from '@pdf2obsidian/core';
import { ensureDirectory, pathExists } from '@pdf2obsidian/core';
import { sha256File } from '@pdf2obsidian/core';
import { toSlug } from '@pdf2obsidian/core';
import { createInitialStepStates, type PipelineTaskState, type PipelineTaskStatus, type StepStatus } from './task-types.js';
import type { ImportPdfResult, ImportPipelineStep } from '@pdf2obsidian/pipeline';

export interface TaskStateStore {
  createOrReuseTask(pdfPath: string): Promise<PipelineTaskState>;
  listTasks(): Promise<PipelineTaskState[]>;
  readTask(taskId: string): Promise<PipelineTaskState | undefined>;
  updateTask(task: PipelineTaskState, patch: Partial<PipelineTaskState>): Promise<PipelineTaskState>;
  updateStep(task: PipelineTaskState, step: ImportPipelineStep, status: StepStatus, error?: string): Promise<PipelineTaskState>;
  markResult(task: PipelineTaskState, result: ImportPdfResult): Promise<PipelineTaskState>;
}

export function createTaskStateStore(config: AppConfig): TaskStateStore {
  const stateDir = config.tasks.stateDir;

  return {
    async createOrReuseTask(pdfPath: string): Promise<PipelineTaskState> {
      const sourceHash = await sha256File(pdfPath);
      // 任务 ID 由内容哈希参与生成；同一 PDF 只要已有成功/排队/运行任务，就直接复用。
      const duplicate = (await this.listTasks()).find((task) => {
        return task.sourceHash === sourceHash && task.status !== 'failed';
      });

      if (duplicate) {
        return duplicate;
      }

      const now = new Date().toISOString();
      const fileSlug = toSlug(basename(pdfPath, '.pdf')) || 'pdf';
      const taskId = `${formatTaskDate(now)}-${fileSlug}-${sourceHash.slice(7, 19)}`;
      const task: PipelineTaskState = {
        taskId,
        sourcePath: pdfPath,
        sourceHash,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        steps: createInitialStepStates()
      };

      await writeTaskState(stateDir, task);
      return task;
    },

    async listTasks(): Promise<PipelineTaskState[]> {
      await ensureDirectory(stateDir);
      const entries = await readdir(stateDir, { withFileTypes: true });
      const tasks: PipelineTaskState[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const task = await readTaskState(stateDir, entry.name);
        if (task) {
          tasks.push(task);
        }
      }

      return tasks.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },

    async readTask(taskId: string): Promise<PipelineTaskState | undefined> {
      return readTaskState(stateDir, taskId);
    },

    async updateTask(task: PipelineTaskState, patch: Partial<PipelineTaskState>): Promise<PipelineTaskState> {
      const next: PipelineTaskState = {
        ...task,
        ...patch,
        updatedAt: new Date().toISOString()
      };
      await writeTaskState(stateDir, next);
      return next;
    },

    async updateStep(
      task: PipelineTaskState,
      step: ImportPipelineStep,
      status: StepStatus,
      error?: string
    ): Promise<PipelineTaskState> {
      const now = new Date().toISOString();
      const previous = task.steps[step];
      // startedAt 只在进入 running 时写入，completedAt 在终态写入，保留阶段耗时分析能力。
      const nextStep = {
        ...previous,
        status,
        startedAt: status === 'running' ? now : previous.startedAt,
        completedAt: status === 'completed' || status === 'failed' || status === 'skipped' ? now : previous.completedAt,
        error
      };
      return this.updateTask(task, {
        steps: {
          ...task.steps,
          [step]: nextStep
        }
      });
    },

    async markResult(task: PipelineTaskState, result: ImportPdfResult): Promise<PipelineTaskState> {
      return this.updateTask(task, {
        status: 'completed',
        slug: result.slug,
        result,
        finishedAt: new Date().toISOString()
      });
    }
  };
}

export function formatTaskLine(task: PipelineTaskState): string {
  const result = task.slug ? ` -> ${task.slug}` : '';
  const error = task.error ? ` (${task.error})` : '';
  return `${task.taskId}  ${task.status.padEnd(9)}  ${basename(task.sourcePath)}${result}${error}`;
}

export function resetTaskForRetry(task: PipelineTaskState): PipelineTaskState {
  const now = new Date().toISOString();
  // 保留已完成和已跳过的阶段状态，只重置失败和等待中的阶段（断点续跑）。
  const nextSteps = { ...task.steps };
  for (const [step, state] of Object.entries(nextSteps) as Array<[ImportPipelineStep, { status: StepStatus }]>) {
    if (state.status === 'failed' || state.status === 'pending' || state.status === 'running') {
      nextSteps[step] = { status: 'pending' };
    }
  }

  return {
    ...task,
    status: 'queued',
    updatedAt: now,
    startedAt: undefined,
    finishedAt: undefined,
    error: undefined,
    result: undefined,
    steps: nextSteps
  };
}

/**
 * 从任务状态中提取已完成阶段集合，传给 pipeline 的 completedSteps 参数。
 */
export function getCompletedSteps(task: PipelineTaskState): Set<ImportPipelineStep> {
  const completed = new Set<ImportPipelineStep>();
  for (const [step, state] of Object.entries(task.steps) as Array<[ImportPipelineStep, { status: StepStatus }]>) {
    if (state.status === 'completed' || state.status === 'skipped') {
      completed.add(step);
    }
  }
  return completed;
}

function formatTaskDate(isoDate: string): string {
  return isoDate.replace(/[-:TZ.]/g, '').slice(0, 14);
}

async function readTaskState(stateDir: string, taskId: string): Promise<PipelineTaskState | undefined> {
  const statePath = taskStatePath(stateDir, taskId);
  if (!(await pathExists(statePath))) {
    return undefined;
  }

  const parsed = YAML.parse(await readFile(statePath, 'utf8')) as PipelineTaskState | null;
  return parsed ?? undefined;
}

async function writeTaskState(stateDir: string, task: PipelineTaskState): Promise<void> {
  const taskDir = join(stateDir, task.taskId);
  await ensureDirectory(taskDir);
  await writeFile(taskStatePath(stateDir, task.taskId), YAML.stringify(task), 'utf8');
}

function taskStatePath(stateDir: string, taskId: string): string {
  return join(stateDir, taskId, 'state.yaml');
}

export function isRunnableStatus(status: PipelineTaskStatus): boolean {
  return status === 'queued' || status === 'failed';
}
