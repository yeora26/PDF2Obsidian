# AGENTS.md

Global rules and reading map for coding agents working on PDF2Obsidian (a local-first tool that turns paper PDFs into Obsidian notes). This file only routes and sets global constraints; details live in `docs/rules/` (agent-facing, English) and `docs/zh/` (human-facing, Chinese source of truth, mirrored in `docs/en/`). Keep this file under 80 lines; add new detail to the owning page and link it here.

## Reading and language

- Reply in the language the user writes in. Keep code identifiers, config keys, commands and established terms as they are.
- Find your task in the table below, read only the linked pages or sections, then the target module and its neighbours. Do not read all of `docs/` or `packages/`.
- UI copy, user-facing error messages, log messages and code comments are Chinese (match the surrounding code). Agent-facing rules are English.

## When to read what

| Task | Read |
| --- | --- |
| Where a file goes, package boundaries, runtime dirs | [repo-structure](docs/rules/repo-structure.md) |
| Config keys, defaults, schema, the example YAML | [config](docs/rules/config.md) |
| Import stages, MinerU, translation, reading assets, metadata, Obsidian export, caches | [pipeline](docs/rules/pipeline.md) → [PDF 导入流水线](docs/zh/topics/pdf-import-pipeline.md) |
| Next.js workbench: pages, components, API routes, local task queue | [desktop-web](docs/rules/desktop-web.md) |
| CLI commands, `packages/tasks`, batch / watch / retry | [cli-and-tasks](docs/rules/cli-and-tasks.md) |
| API keys, tokens, what may be sent to external services | [secrets-and-privacy](docs/rules/secrets-and-privacy.md) |
| Verifying a change (there is no automated test suite) | [verification](docs/rules/verification.md) |
| Commits, staging, branches, worktrees | [git-workflow](docs/rules/git-workflow.md) |
| Writing or changing docs | [文档约定](docs/zh/README.md#文档约定) |
| A term you don't recognise (slug, 索引页, 桩笔记, 断点续跑 …) | [glossary](docs/zh/glossary.md) |
| Architecture, data model, API contract | [系统设计](docs/zh/system-design.md) via the [阅读路线](docs/zh/README.md#阅读路线) |

## Global hard constraints

1. **The pipeline lives in packages, not apps.** `importPdf` in `packages/pipeline` is the single import path for CLI and Web. Apps call it; they do not re-implement stages. Shared logic goes in `packages/core`.
2. **Never break caches or output paths by accident.** Translation and reading-asset cache keys, the MinerU `runId`, the task id and the note `slug` decide what is re-parsed, re-translated (paid API calls) and where notes land in the user's Vault. Changing their inputs must be intentional and said so (see [pipeline](docs/rules/pipeline.md#caches-and-identities)).
3. **The user's Vault is user data.** Only write inside `<vault>/<documentDir>/`. `normalize` deletes `<documentDir>/<slug>/` before rewriting it; never widen what gets deleted, and never touch notes outside the paper folder except reference stubs and the Bases file.
4. **Config has one schema.** `packages/core/src/config/load-config.ts` (zod) is the source of defaults and validation; `pdf2obsidian.config.example.yaml` documents every key with a Chinese comment. Change both together (see [config](docs/rules/config.md)).
5. **Secrets never enter the repo.** Keys and tokens come from env vars named in config (`*Env`); `pdf2obsidian.config.yaml`, `.env*` and `.pipeline/` are git-ignored. Never commit, log or echo a key.
6. **Spec and code move together.** When behaviour, config keys, API fields, CLI options or defaults change on purpose, update the owning doc section (zh and en) in the same commit. Report conflicts between docs and code instead of silently picking one; known ones are listed in [系统设计 §9](docs/zh/system-design.md#9-已知问题与文档代码差异).
7. Report only checks you actually ran; list what was skipped and why.

## Completion gate

Every task that changes files ends with a local commit before the final reply (details: [git-workflow](docs/rules/git-workflow.md)).

- Run `git status` before editing; changes that existed before the task belong to the user.
- Review the final diff, run checks sized to the risk, and report them.
- Stage only this task's files or hunks; check `git diff --cached`.
- Message format `type(scope): summary`; the summary is Chinese. Report the commit hash.
- Never push (including force-push) unless the user asks for this task. Never amend or rewrite history unless asked. No empty commits for read-only tasks.
- Remove any worktree you created (including `.claude/worktrees/agent-*`) before finishing: merge it, or commit and tag `archive/<name>` first. Name any worktree you must keep, and why.
