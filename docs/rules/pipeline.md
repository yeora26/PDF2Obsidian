# Import Pipeline

> Agent-facing. Read before changing `packages/pipeline/` or anything in `packages/core/` that `importPdf` calls. Full walkthrough: [PDF 导入流水线](../zh/topics/pdf-import-pipeline.md). Design: [系统设计 §4](../zh/system-design.md#4-导入流水线packagespipeline).

## Stages

`importPdf({ pdfPath, config, onStep, completedSteps })` runs `upload → mineru → normalize → translate → obsidian_export → quality_check` (`importPipelineSteps`). It reports each stage through `onStep` (`running | completed | failed | skipped`) and returns `ImportPdfResult` (paths of the notes, `slug`, `sourceHash`, `configSummary`).

- Stage names are a contract with `packages/tasks` (`state.yaml`), the Web task queue, and the Web progress UI labels. Adding, renaming or reordering a stage changes all of them and persisted task files.
- Work that is not a named stage (auto-link, metadata enrichment, reading assets, reference stubs, Bases file) runs inside the stage that needs it or between stages. It runs again on every resume; keep it idempotent.
- `importPdf` throws on failure; it does not catch per-stage. Callers turn the error into task state. Error text is shown to users: Chinese, say what to check.

## Caches and identities

| Identity | Built from | Effect if its inputs change |
| --- | --- | --- |
| `sourceHash` | SHA-256 of the PDF | Task reuse in `packages/tasks` |
| MinerU `runId` | first 15 chars of the file-name slug + 16 chars of the hash → `<mineru.outputDir>/<runId>/` | Re-parse (MinerU quota / time) |
| `slug` | first heading of MinerU Markdown, else file name | Paper folder in the Vault moves; old folder is left behind |
| Translation cache | sha256(provider, preset, baseUrl, model, systemPrompt, chunk content) in `translation.cacheDir` | Re-translate (paid calls) |
| Chunking | `chunkMarkdown(markdown, chunkCharLimit)` | Different chunks → every chunk misses cache |
| Reading-asset cache | sha256(provider, preset, baseUrl, model, `readingAssets.systemPrompt`, `sourceHash`, asset kind, asset prompt) in `readingAssets.cacheDir` | Regenerate 摘要 / 术语表 / 问答 |
| Metadata cache | `<provider>-sha256(provider:doi‖title)` in `metadata.online.cacheDir` | Re-query CrossRef / OpenAlex |

Changing any of these (including the chunker or the prompt format sent with each chunk) must be on purpose, stated in the commit body, and noted in the topic doc.

## Vault writes

- All output goes under `<vault.path>/<vault.documentDir>/`. `documentDir` is forced to a relative path by the schema.
- `normalize` deletes `<documentDir>/<slug>/` and rebuilds it (unless resumed). Two PDFs whose first heading gives the same slug overwrite each other; do not add more deletion.
- Reference stubs are written as `<documentDir>/<stub-slug>.md` only when no note with a matching title exists; never overwrite user notes.
- Auto-link skips frontmatter, code, headings, existing links and images. Keep that guarantee when changing `auto-link.ts`.

## Translation rules

Markdown structure, image paths, tables, code, LaTeX, URLs and identifiers stay unchanged; only prose becomes Simplified Chinese. Documents detected as `zh-CN` (`detectMarkdownLanguage`) or with `translation.enabled: false` skip translation, and `*.zh.md` then holds the original text.
