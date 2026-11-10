# Desktop Web

> Agent-facing. Read before changing `apps/desktop-web/`. Design: [系统设计 §6](../zh/system-design.md#6-本地-web-工作台appsdesktop-web).

## Stack and layout

- Next.js 15 App Router, React 19, plain CSS (`app/globals.css`), no UI library, no client state library.
- Styling uses the design tokens at the top of `globals.css` (`--bg`, `--surface`, `--text-*`, `--accent*`, `--warn*`, `--danger*`, `--success*`, `--radius-*`, `--shadow-*`, `--ring`), with dark values under `prefers-color-scheme: dark`. Component rules reference tokens only; never hard-code a color, font size or radius.
- Pages: `/` → `LocalWorkspace` (task list, upload / link import, PDF preview, result tabs 译文 / 阅读材料 / 论文信息 / Bases), `/settings` → `SettingsWorkspace`. `OnboardingWizard` (steps 位置 / 解析 / AI / 输出) opens from `/` when config is missing or invalid.
- API routes (all `runtime = 'nodejs'`): `GET/POST /api/config`, `GET/POST /api/tasks`, `GET/POST/DELETE /api/tasks/[id]`, `GET /api/tasks/[id]/pdf`, `GET /api/tasks/[id]/artifact?kind=`. Contract: [系统设计 §7](../zh/system-design.md#7-接口契约).
- Dev server: `pnpm dev:oss` (port 3000 pinned in `package.json`). In the Claude preview use `.claude/launch.json` → `desktop-web`.

## Task queue

- `lib/local-tasks.ts` keeps tasks in an in-memory `Map` on `globalThis` (Next.js may load the module once per route; module-level state would split), persisted to `<workspace>/.pipeline/desktop-web/tasks/tasks.json` after every change. It does **not** use `packages/tasks`; CLI and Web task lists are separate.
- Each upload starts `runTask` immediately (no concurrency limit, no reuse by hash). Retry keeps `completed` / `skipped` steps and passes them as `completedSteps`.
- Single Node process: the queue does not survive a restart. On the first read after start, `queued` / `running` tasks not running in this process are marked `failed` with a retry hint. Every exported entry point calls `hydrateTasks()` before touching the map, so persisting never drops older tasks.
- Errors go through `lib/error-diagnostics.ts` (`diagnoseError`) to a Chinese summary plus suggestions. Add a rule there when you add a new user-fixable failure.

## Rules

- Server code reads files only through task results or config-derived paths. Never accept a client-supplied file path.
- UI copy is Chinese, short, says what to do next; no raw stack traces in the UI.
- Progress shows real stage states from the pipeline, not invented percentages beyond the existing per-stage estimate.
- Do not add dependencies without need; use `pnpm add --filter @pdf2obsidian/desktop-web` and commit the lockfile.
