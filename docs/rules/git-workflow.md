# Git Workflow

> Agent-facing. The completion gate in [AGENTS.md](../../AGENTS.md#completion-gate) is the summary; this page has the details.

## Commits

- Format `type(scope): summary`. `type` and `scope` are English; the summary (and body) is Chinese, e.g. `feat(pipeline): 翻译缓存键加入分块参数`.
- Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `chore`, `revert`.
- Scopes: the package or app name (`core`, `providers`, `pipeline`, `tasks`, `cli`, `web`) or a feature (`mineru`, `translation`, `metadata`, `obsidian`, `config`); omit only for repo-wide changes.
- One purpose per commit; code, the example config and docs go in the same commit. The body lists what changed for users and whether caches or output paths are affected.
- Never commit `pdf2obsidian.config.yaml`, `.env*`, `.pipeline/`, `dist/`, `.next/`, PDFs or Vault content.

## Staging and history

- `git status` before editing; pre-existing or concurrent changes are the user's — don't stage, revert or stash them.
- Stage by path or hunk, then review `git diff --cached`.
- Local commits only. Push, force-push, amend, rebase or squash only when the user asks for this task.

## Branches and worktrees

- Feature work happens on a branch from `main`; keep `main` buildable (`pnpm build:packages && pnpm build:cli && pnpm build:oss`).
- Worktrees you create (including `.claude/worktrees/agent-*`) are removed at the end of the task: merge, or commit and tag `archive/<name>`, then `git worktree remove` and `git branch -D`. If one must stay, name its path and why.
