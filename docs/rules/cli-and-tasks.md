# CLI and Tasks

> Agent-facing. Read before changing `apps/cli/` or `packages/tasks/`. Usage: [使用指南 §5](../zh/user-guide.md#5-命令行).

## Commands (`apps/cli/src/cli/main.ts`)

`import <source>` (local path, arXiv id, DOI or PDF URL; runs `importPdf` directly, no task record), `batch <pdfPaths...> [-j N]`, `watch [inboxDir]`, `tasks list | show <id> | retry <id>`. Every command takes `-c, --config` (default `pdf2obsidian.config.yaml`). Errors print the stack and set exit code 1.

## Task store (`packages/tasks`)

- One directory per task: `<tasks.stateDir>/<taskId>/state.yaml` (YAML of `PipelineTaskState`). `taskId` = `<yyyyMMddHHmmss>-<file slug>-<hash chars 7–18>`.
- `createOrReuseTask` returns an existing task with the same `sourceHash` unless it `failed`; this is what stops re-spending MinerU / LLM quota. Keep it.
- Task status `queued → running → completed | failed`; step status `pending → running → completed | failed | skipped`. Steps still `pending` at the end are marked `skipped`.
- `retryPipelineTask` only runs `queued` / `failed` tasks; `resetTaskForRetry` keeps `completed` / `skipped` steps for resume.
- `runTaskPool` is a shared-cursor pool sized by `--concurrency` or `tasks.concurrency`.
- `watchPdfInbox` polls `tasks.inboxDir` recursively every `watchPollIntervalMs`, remembers seen paths in memory only, and guards re-entry with a `running` flag.
- `runCoreImportTask` emits `CoreTaskEvent`s for callers that keep their own state; it is exported but unused by the apps today.

## Rules

- New CLI options need a Chinese or English `--help` description matching neighbours, and an entry in the user guide.
- Changing `PipelineTaskState` must still read old `state.yaml` files (optional fields, no renames).
- Keep CLI output parseable: `import` prints the result JSON; list-style commands print one `formatTaskLine` per task.
