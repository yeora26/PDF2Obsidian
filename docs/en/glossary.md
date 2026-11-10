# Glossary

One word per concept. UI, docs and code comments use the terms in this table; the "Code / config" column gives the identifiers to search for. 中文：[术语表](../zh/glossary.md).

## Input and tasks

| Term (zh) | Meaning | Code / config |
| --- | --- | --- |
| Import (导入) | Running one PDF through the whole pipeline and writing it to the Vault | `importPdf` |
| Source (来源) | Import input: local path, arXiv id, DOI or PDF URL | `resolvePdfSource`, `PdfSourceType` |
| Task (任务) | Tracking unit of one import: status, stages, result. The CLI and the web app each have their own | `PipelineTaskState` (`packages/tasks`), `LocalTask` (`apps/desktop-web`) |
| Stage (阶段) | The six named steps: `upload`, `mineru`, `normalize`, `translate`, `obsidian_export`, `quality_check`; shown in the UI as 上传, 解析, 规范化, 翻译, 导出, 质检 | `importPipelineSteps` |
| Resume (断点续跑) | On retry, skip stages already completed or skipped | `completedSteps`, `resetTaskForRetry` |
| Task reuse (任务复用) | In the CLI, a PDF whose content hash already has a non-failed task returns that task instead of reprocessing | `createOrReuseTask` |
| Inbox (监听目录) | Directory polled by `watch`; PDFs dropped there are imported | `tasks.inboxDir` |
| Content hash (内容哈希) | SHA-256 of the PDF, used for task reuse, directory names and note frontmatter | `sourceHash`, `sha256File` |

## Parsing and translation

| Term (zh) | Meaning | Code / config |
| --- | --- | --- |
| Parse (解析) | MinerU turns the PDF into Markdown and images | `runMineru`, `mineru.*` |
| Parse mode (解析模式) | `official` (official API), `local` (HTTP service), `cli` (local command) | `mineru.mode` |
| Parse dir (解析目录) | Per-paper MinerU output dir `<outputDir>/<runId>/` | `runId` |
| Primary Markdown (主 Markdown) | The Markdown file in the parse dir used as the body | `findPrimaryMarkdown` |
| Normalize (规范化) | Locate the primary Markdown, decide the slug, rebuild the paper folder, copy images and rewrite image links | `normalize`, `rewriteMarkdownAssetLinks` |
| Chunking (分块) | Split Markdown along headings into translation chunks under a size limit | `chunkMarkdown`, `translation.chunkCharLimit` |
| AI service (AI 服务) | The LLM service shared by translation and reading assets | `translation.provider` / `preset` / `model` / `baseUrl` |
| Service preset (服务预设) | Which OpenAI-compatible service: DeepSeek, Cloudflare, OpenAI, OpenRouter, custom | `translation.preset` |
| Translation skipped (跳过翻译) | When the text is detected as Chinese or translation is off, the translated note holds the original | `translationSkipped`, `detectMarkdownLanguage` |
| Translation cache (翻译缓存) | Translated chunks keyed by service, model, prompt and chunk content | `translation.cacheDir` |

## Obsidian output

| Term (zh) | Meaning | Code / config |
| --- | --- | --- |
| Vault | The user's Obsidian vault root | `vault.path` |
| Paper folder (论文目录) | Per-paper output dir `<vault>/<documentDir>/<slug>/` | `documentRoot` |
| slug | Folder and file name made from the primary Markdown's first heading (or the file name) | `toSlug` |
| Index note (索引页) | `<slug>.index.md`, the paper's entry point: links, metadata, auto-links; frontmatter `type: index` | `indexNote` |
| Translated / original note (译文笔记 / 原文笔记) | `<slug>.zh.md` / `<slug>.original.md` | `translatedNote`, `originalNote` |
| Reading assets (阅读材料) | AI-generated summary, glossary and Q&A | `readingAssets.*`, `generateReadingAssets` |
| Auto-link (自动双链) | Turn mentions of existing note titles / aliases into `[[WikiLink]]`s | `obsidian.autoLink`, `autoLinkMarkdown` |
| Reference alias (引用别名) | Aliases found in the text and the Vault that can be link targets | `discoverReferenceAliases` |
| Reference stub (参考文献桩) | Placeholder note for a cited reference, with basic metadata and a link back to the citing paper | `createReferenceStubs` |
| Bases database (Bases 数据库) | Obsidian Bases file listing all index notes as a table | `obsidian.database`, `数据库.base` |
| Quality report (质量报告) | `report.json`, `status` is `completed` or `needs_review` (需复核) | `quality.reportFileName`, `createQualityReport` |

## Metadata

| Term (zh) | Meaning | Code / config |
| --- | --- | --- |
| Paper metadata (论文元数据) | Title, authors, year, journal, DOI, arXiv id, citation count, journal metrics … | `PaperMetadata` |
| Text extraction (正文抽取) | Heuristic metadata extraction from Markdown | `metadata.enrichFromMarkdown`, `extractPaperMetadata` |
| Online enrichment (在线补全) | Fill empty fields from CrossRef / OpenAlex; discarded when title similarity is too low | `metadata.online`, `enrichPaperMetadata` |
| Journal metrics (期刊指标) | Impact factor, 5-year IF, JCI, JCR quartile, CAS quartile; local SQLite first, then EasyScholar | `metadata.journalMetrics` |
| Metadata override (元数据覆盖) | Fields set by hand per slug or PDF file name | `metadata.overrides` |
