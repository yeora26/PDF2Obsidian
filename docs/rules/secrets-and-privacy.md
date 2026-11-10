# Secrets and Privacy

> Agent-facing. Read before touching API keys, provider clients, network calls, logs, or anything that sends paper content off the machine.

## Secrets

- Keys live in env vars or a git-ignored `.env.local` / `.env`. Config refers to them by name: `translation.apiKeyEnv` (e.g. `DEEPSEEK_API_KEY`), `mineru.apiTokenEnv` (default `MINERU_OFFICIAL_API_TOKEN`), `easyScholar.secretKeyEnv`.
- `mineru-runner.ts` also reads the token from `.env.local`, `.env`, `web/.env.local`, `web/.env` relative to cwd, and treats a value that starts with `eyJ` or contains `.` as a literal token.
- Never commit `pdf2obsidian.config.yaml`, `.env*`, or a key in code, docs, fixtures or commit messages. Never print a key in logs or error messages; say which env var is missing instead.
- Test values you need go in env vars of your own shell, not in tracked files.

## What leaves the machine

| Destination | What is sent | When |
| --- | --- | --- |
| MinerU official API (`mineru.net`) | The whole PDF | `mineru.mode: official` |
| Configured AI service (`translation.baseUrl`) | Markdown chunks; for reading assets, up to `readingAssets.maxSourceChars` of original + translation | Translation enabled / reading assets enabled |
| CrossRef, OpenAlex | DOI or title, contact email | `metadata.online.enabled` |
| EasyScholar | Journal name, secret key | `easyScholar.enabled` |
| arXiv / doi.org / given URL | Download request | Importing by id, DOI or URL |

- With `mineru.mode: local|cli` and `translation.provider: ollama` and online metadata off, nothing about the paper leaves the machine. Keep that combination working; don't add a network call that ignores these switches.
- New outbound calls must be behind a config switch, documented in the table above and in [使用指南](../zh/user-guide.md), with a timeout.
- Sample PDFs used for checks are public papers or generated files; never commit them, and never commit a user's Vault content.
