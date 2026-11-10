# PDF2Obsidian · Installation, Configuration and Usage Guide

中文：[安装、配置与使用指南](../zh/user-guide.md)

How to install, configure and use PDF2Obsidian locally. Architecture and API: [system design](system-design.md); stage details: [PDF Import Pipeline](topics/pdf-import-pipeline.md).

## 1. Requirements

| Item | Requirement |
| --- | --- |
| Node.js | >= 20.0.0 |
| pnpm | 10.x (`packageManager: pnpm@10.0.0`) |
| PDF parsing | A MinerU official API token, or a local / remote MinerU service, or a local MinerU command |
| AI service (translation and reading assets) | An API key for DeepSeek, Cloudflare Workers AI, OpenAI, OpenRouter or another OpenAI-compatible service, or a local Ollama |
| Optional | EasyScholar SecretKey (journal metrics); a contact email for CrossRef |
| Obsidian | A local Vault directory; the Bases database needs an Obsidian version with Bases |

## 2. Install and start

```bash
pnpm install
```

```bash
cp pdf2obsidian.config.example.yaml pdf2obsidian.config.yaml
```

Set the key env vars for the services you use:

```bash
export MINERU_OFFICIAL_API_TOKEN=...
export DEEPSEEK_API_KEY=sk-...
```

Start the local web workbench (builds `packages/` first):

```bash
pnpm dev:oss
```

Default address `http://localhost:3000` (port set in `apps/desktop-web/package.json`). Set env vars before starting; restart after changing them.

Use another config file:

```bash
PDF2OBSIDIAN_CONFIG=/path/to/pdf2obsidian.config.yaml pnpm dev:oss
```

Builds: `pnpm build:packages` (shared packages), `pnpm build:cli`, `pnpm build:oss`.

## 3. Configuration

The config file is `pdf2obsidian.config.yaml`. "Default" below is the code default (`packages/core/src/config/load-config.ts`, used when the key is omitted); the template uses the same values. Relative paths in config resolve against the config file's directory. The template comments are the full reference for each key.

### 3.1 `vault`

| Key | Default | Meaning |
| --- | --- | --- |
| `path` | required | Absolute path of the Obsidian Vault |
| `documentDir` | required | Sub-directory for paper output, treated as a path inside the Vault (drive letters and edge slashes removed) |
| `imageDirName` | required | Image dir name inside each paper folder, e.g. `images` |

### 3.2 `mineru`

| Key | Default | Meaning |
| --- | --- | --- |
| `mode` | `official` | `official`: MinerU official API; `local`: MinerU HTTP service at `apiUrl`; `cli`: run `command` directly |
| `backend` | required | `pipeline`, `vlm-http-client`, `hybrid-http-client`, `vlm-auto-engine`, `hybrid-auto-engine` (local service / CLI) |
| `method` | — | `auto`, `txt`, `ocr` |
| `apiUrl` | — | Local or remote service URL; `https://` added if no scheme |
| `command` | required | Local MinerU command path (`cli` mode) |
| `outputDir` | required | Parse output directory |
| `apiTokenEnv` | `MINERU_OFFICIAL_API_TOKEN` | Env var name holding the official API token |
| `modelVersion` | `vlm` | Official API model: `vlm` (high accuracy) or `pipeline` |
| `modelSource` | — | Local model source, e.g. `modelscope` |
| `formula` / `table` / `imageAnalysis` | — | Formula, table and image-analysis switches |

### 3.3 `translation`

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | When off, `*.zh.md` holds the original text |
| `provider` | `openai-compatible` | `openai-compatible` or `ollama`; legacy `deepseek` is migrated |
| `preset` | — | `deepseek`, `cloudflare`, `openai`, `openrouter`, `custom`; labels the service and drives the settings form |
| `model` | required | Model name, e.g. `deepseek-v4-flash`, `@cf/qwen/qwen3-30b-a3b-fp8`, `qwen2.5:14b` |
| `baseUrl` | required | Service root URL, without `/chat/completions`; Ollama is usually `http://127.0.0.1:11434` |
| `apiKeyEnv` / `apiKey` | — | Env var name of the key (recommended) or the literal key; one is required for non-Ollama providers when translation is on |
| `systemPrompt` | required | Translation prompt |
| `chunkCharLimit` | `24000` | Max characters per translation chunk |
| `cacheDir` | `.pipeline/core-cache` | Translation cache dir |
| `maxRetries` | `3` | Max attempts per chunk |

Cloudflare Workers AI `baseUrl` looks like `https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1`.

### 3.4 `tasks` (CLI)

| Key | Default | Meaning |
| --- | --- | --- |
| `stateDir` | `.pipeline/tasks` | Task state dir |
| `inboxDir` | `.pipeline/inbox` | Dir watched by `watch` |
| `concurrency` | `3` | Batch concurrency |
| `watchPollIntervalMs` | `5000` | Watch poll interval (ms, min 500) |

### 3.5 `readingAssets`

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Generate summary, glossary and Q&A (uses the AI service in `translation`) |
| `summaryFileName` / `termsFileName` / `qaFileName` | `摘要.md` / `术语表.md` / `问答.md` | File names |
| `maxSourceChars` | `50000` | Total characters of original + translation sent to the model; head and tail kept when longer |
| `maxRetries` | `3` | Max attempts per asset |
| `cacheDir` | `.pipeline/core-assets-cache` | Cache dir |
| `systemPrompt` | built in | Reading-asset prompt |

### 3.6 `quality`

| Key | Default | Meaning |
| --- | --- | --- |
| `reportFileName` | `report.json` | Quality report file name |

### 3.7 `obsidian`

| Key | Default | Meaning |
| --- | --- | --- |
| `autoLink.enabled` | `true` | Scan existing Vault notes and turn mentions of their titles / aliases into `[[WikiLink]]`s |
| `autoLink.scanDirs` | `[]` | Dirs to scan; empty means the whole Vault |
| `autoLink.excludeDirs` | `.obsidian`, `.trash` | Excluded dirs |
| `autoLink.minAliasLength` | `4` | Minimum alias length |
| `autoLink.maxLinksPerNote` | `30` | Max auto-links per note |
| `database.enabled` / `database.fileName` | `true` / `数据库.base` | Generate the Bases database file |

### 3.8 `metadata`

| Key | Default | Meaning |
| --- | --- | --- |
| `enrichFromMarkdown` | `true` | Heuristically extract title, authors, year, DOI, arXiv id, … from the text |
| `online.enabled` | `false` | Enrich online via CrossRef / OpenAlex |
| `online.providers` | `crossref`, `openalex` | Sources |
| `online.timeoutMs` / `online.cacheDir` | `12000` / `.pipeline/core-cache` | Timeout and cache |
| `online.email` | — | CrossRef contact email (polite pool) |
| `journalMetrics.sqlite.path` | `.pipeline/journal-metrics.sqlite` | Journal-metrics cache |
| `journalMetrics.easyScholar.enabled` | `false` | Look up impact factor, JCR and CAS quartiles via EasyScholar |
| `journalMetrics.easyScholar.secretKeyEnv` | — | Env var name of the SecretKey |
| `overrides` | `{}` | Manual metadata per paper slug or PDF file name |

### 3.9 Environment variables

| Variable | Purpose |
| --- | --- |
| `PDF2OBSIDIAN_CONFIG` | Config file used by the web workbench |
| The one named by `translation.apiKeyEnv` (e.g. `DEEPSEEK_API_KEY`, `CLOUDFLARE_API_TOKEN`) | AI service key |
| The one named by `mineru.apiTokenEnv` (default `MINERU_OFFICIAL_API_TOKEN`) | MinerU official API token; may also be in `.env.local` / `.env` in the current dir |
| The one named by `easyScholar.secretKeyEnv` | EasyScholar SecretKey |
| `MINERU_VL_SERVER` | VLM backend URL for `cli` mode, default `http://127.0.0.1:30000` |
| `MINERU_MANAGED_API_URL` | Service URL passed to the MinerU command in `local` mode without `apiUrl` |

## 4. Local web workbench

1. **First run**: when config is missing or invalid, the wizard opens and walks through Vault location, PDF parsing, AI service and output options. Reopen it with 向导 (wizard) at the top, or edit everything under 设置 (settings).
2. **Import**: drop or choose a PDF, or enter an arXiv id, DOI or PDF URL under 从链接导入 (import from link). Each task starts immediately.
3. **Progress**: the task list on the left shows status and stages; failed tasks show a Chinese reason and suggestions.
4. **Results**: the original PDF is previewed in the middle; switch between translation, reading assets, paper info and Bases on the right.
5. **Review**: tasks with quality warnings show 需复核 (needs review) and the warning count; the reasons are in `report.json` in the paper folder.
6. **Retry and delete**: failed tasks can be retried, skipping completed stages; tasks that had not finished before the web app restarted are marked failed and can be retried too. Delete removes only the task record and uploaded PDF, not the notes in the Vault.

Web and CLI task records are independent.

## 5. CLI

`pnpm dev:cli` builds the shared packages and then runs. Relative PDF paths, `--config` and the inbox dir resolve against the directory where you run the command.

```bash
pnpm dev:cli import paper.pdf --config ./pdf2obsidian.config.yaml
```

| Command | Meaning |
| --- | --- |
| `import <source>` | Import one paper: local path, arXiv id (e.g. `2401.12345`), DOI or PDF URL; prints the result JSON; creates no task record |
| `batch <pdf...> [-j N]` | Batch import; the same PDF reuses an existing non-failed task |
| `watch [inboxDir]` | Keep watching a dir (including sub-dirs) and import new PDFs |
| `tasks list` | List tasks: `taskId  status  file name -> slug [needs review] (error)` |
| `tasks show <taskId>` | Print a task's full state as JSON |
| `tasks retry <taskId>` | Retry a failed task, skipping completed stages |

Every command accepts `-c, --config <path>`.

## 6. Output files

A successful import writes `<vault>/<documentDir>/<slug>/`:

| File | Content |
| --- | --- |
| `<slug>.index.md` | Index note: links to original / translation / PDF / reading assets, language detection, metadata, auto-links |
| `<slug>.zh.md` | Chinese translation; the original text for Chinese docs or when translation is off |
| `<slug>.original.md` | Original Markdown |
| `<original file name>.pdf` | Copy of the PDF |
| `摘要.md`, `术语表.md`, `问答.md` | Reading assets (when enabled) |
| `report.json` | Quality report, `status` `completed` or `needs_review` |
| `images/` | Images |

`<documentDir>/` also gets reference stub notes (created when no note with the same title exists in the Vault) and `数据库.base`.

**Note:** re-importing a paper wipes its paper folder before writing; don't keep hand-written notes inside paper folders. A different paper with the same first heading goes to a new folder with a hash suffix (e.g. `<slug>-1a2b3c4d/`) instead of overwriting.

## 7. Data and cache directories

| Directory | Default | Content |
| --- | --- | --- |
| MinerU output | `.pipeline/mineru` in the template | Parse output |
| Translation cache | `.pipeline/core-cache` | Translated chunks |
| Reading-asset cache | `.pipeline/core-assets-cache` | Summary / glossary / Q&A cache |
| Online metadata cache | `.pipeline/core-cache` | CrossRef / OpenAlex responses |
| Journal metrics | `.pipeline/journal-metrics.sqlite` | EasyScholar results |
| CLI tasks | `.pipeline/tasks` | `state.yaml` |
| Inbox | `.pipeline/inbox` | PDFs waiting to be imported |
| CLI downloads | `.pipeline/downloads` | PDFs imported by link |
| Web data | `.pipeline/desktop-web/` | `uploads/`, `downloads/`, `tasks/tasks.json` |

All defaults above are relative to the config file's directory. All are in `.gitignore`. Deleting a cache dir means the next import calls MinerU or the AI service again.

## 8. Troubleshooting

| Symptom | Check |
| --- | --- |
| Config file not found | Is there a `pdf2obsidian.config.yaml` in the dir where you ran the command, or pass a path with `--config` / `PDF2OBSIDIAN_CONFIG` |
| "配置预检失败" (pre-flight check failed) | Fix as prompted; does `baseUrl` still contain a placeholder or end in `/chat/completions`; was the key env var set before starting the web app |
| AI service 401 / 403 | Is the key valid and allowed to use the model; does `apiKeyEnv` hold a variable name rather than the key itself |
| AI service 404 | Is `baseUrl` the service root; is the model name available on that service; is the Cloudflare Account ID filled in |
| MinerU token not configured | Set `MINERU_OFFICIAL_API_TOKEN` (or the variable named by `apiTokenEnv`) and restart |
| MinerU service unreachable | Is the local service running and `apiUrl` reachable; port mapping for WSL / containers |
| Ollama unreachable | Is Ollama running, is `baseUrl` `http://127.0.0.1:11434` |
| Metadata enrichment fails | Network and rate limits; set `metadata.online.enabled: false`; fill in `online.email` |
| Images missing in Obsidian | Are `vault.path`, `documentDir`, `imageDirName` right; did MinerU extract images; check `missingImages` in `report.json` |
| Port 3000 in use | Stop the other process, or run `pnpm exec next dev -p <port>` in `apps/desktop-web` (after `pnpm build:packages`) |
