import { importPipelineSteps, type ImportPdfResult, type ImportPipelineStep } from '@pdf2obsidian/pipeline';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type PipelineTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped';

export interface PipelineStepState {
  status: StepStatus;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  error?: string | undefined;
}

export interface PipelineTaskState {
  taskId: string;
  sourcePath: string;
  sourceHash: string;
  status: PipelineTaskStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | undefined;
  finishedAt?: string | undefined;
  slug?: string | undefined;
  result?: ImportPdfResult | undefined;
  error?: string | undefined;
  steps: Record<ImportPipelineStep, PipelineStepState>;
}

export const pipelineSteps: ImportPipelineStep[] = [...importPipelineSteps];

export function createInitialStepStates(): Record<ImportPipelineStep, PipelineStepState> {
  return Object.fromEntries(
    pipelineSteps.map((step) => [step, { status: 'pending' }])
  ) as Record<ImportPipelineStep, PipelineStepState>;
}
