# Repository Structure

> Agent-facing. Read when creating a file, moving code, or deciding which package owns a change. Architecture background: [系统设计 §2–§3](../zh/system-design.md).

## Where code goes

pnpm workspace (`pnpm-workspace.yaml`: `apps/*`, `packages/*`), TypeScript ESM, Node >= 20. Packages build with `tsc` to `dist/`; apps import the built `dist`, so run `pnpm build:packages` after changing a package.

| Path | Owns | Does not own |
| --- | --- | --- |
| `packages/providers` | Text-generation clients: `openai-compatible`, `ollama`, `createTextGenerationClient` | Prompts, retries, caching |
| `packages/core/src/config` | `AppConfig` types and the zod schema / defaults (`load-config.ts`) | Reading env vars for keys at runtime |
| `packages/core/src/storage` | File helpers, MinerU runner (`mineru-runner.ts`: official API, HTTP service, CLI) | — |
| `packages/core/src/markdown`, `translation` | Heading-aware chunking, chunked translation with cache and retry | — |
| `packages/core/src/metadata` | Metadata extraction from Markdown, CrossRef / OpenAlex enrichment, EasyScholar journal metrics (SQLite cache), citation formats, overrides | — |
| `packages/core/src/reading` | 摘要 / 术语表 / 问答 generation with its own cache | — |
| `packages/core/src/obsidian` | Auto WikiLinks, reference alias discovery, structured references and stub notes, note export, Bases file | — |
| `packages/core/src/quality`, `utils` | `report.json`; slug, hash, language detection, frontmatter, link rewriting | — |
| `packages/pipeline` | `importPdf` (the six stages), `resolvePdfSource` (local / arXiv / DOI / URL) | Task persistence |
| `packages/tasks` | CLI task store (`state.yaml` per task), batch pool, retry, inbox watch, `runCoreImportTask` event adapter | Web task queue |
| `apps/cli` | `commander` entry (`src/cli/main.ts`): `import`, `batch`, `watch`, `tasks list/show/retry` | Business logic |
| `apps/desktop-web` | Next.js 15 App Router workbench: `app/` pages and `app/api/*` routes, `components/`, `lib/` (config IO, local task queue, error diagnosis, paths) | Pipeline stages |
| `docs/` | `zh/` (source), `en/` (mirror), `rules/` (agent-facing) | — |

Dependency direction: `providers` ← `core` ← `pipeline` ← `tasks` ← apps. Never import an app from a package, or `tasks` from `pipeline`.

## Runtime and generated paths (git-ignored, never commit)

`.pipeline/` (MinerU output, caches, tasks, uploads, SQLite), `node_modules/`, `dist/`, `.next/`, `*.tsbuildinfo`, `*.sqlite`, `*.db`, `pdf2obsidian.config.yaml`, `.env*` (except `.env.example`), `output/`.

- `pnpm dev:cli` and `pnpm dev:oss` run inside `apps/cli` / `apps/desktop-web` (pnpm `--filter`), not the repo root. So never resolve a user path against `process.cwd()`: config paths resolve against the config file's dir (`loadConfig`), CLI arguments against `INIT_CWD`, web data against the workspace root (`lib/paths.ts`).
- Scratch files, sample PDFs and experiment output go in a temp dir outside the repo.
- Never hand-edit files in a user's Vault or in `.pipeline/` to "fix" a result; re-run the task.

## Naming

- Files `kebab-case.ts`; React components `PascalCase.tsx` in `apps/desktop-web/components/`.
- Packages are `@pdf2obsidian/<name>`; each exports through `src/index.ts`.
- Config keys are `camelCase` under an existing top-level section; secret keys are referenced by env-var name in a `*Env` key.
