# 术语表

同一概念只用一个词。界面、文档与代码注释都按此表用词；「代码 / 配置」列给出对应的标识，便于在代码中查找。English: [Glossary](../en/glossary.md).

## 输入与任务

| 术语 | 含义 | 代码 / 配置 |
| --- | --- | --- |
| 导入 | 把一篇 PDF 走完整条流水线、写入 Vault 的过程 | `importPdf` |
| 来源 | 导入的输入：本地路径、arXiv ID、DOI 或 PDF URL | `resolvePdfSource`，`PdfSourceType` |
| 任务 | 一次导入的跟踪单元，记录状态、阶段与结果。命令行与 Web 各有一套 | `PipelineTaskState`（`packages/tasks`），`LocalTask`（`apps/desktop-web`） |
| 阶段 | 流水线的六个命名步骤：`upload`、`mineru`、`normalize`、`translate`、`obsidian_export`、`quality_check`；界面显示为上传、解析、规范化、翻译、导出、质检 | `importPipelineSteps` |
| 断点续跑 | 重试时跳过状态为已完成 / 已跳过的阶段 | `completedSteps`，`resetTaskForRetry` |
| 任务复用 | 命令行中同一内容哈希已有未失败任务时直接返回该任务，不重复处理 | `createOrReuseTask` |
| 监听目录（inbox） | `watch` 模式轮询的目录，放入的 PDF 自动导入 | `tasks.inboxDir` |
| 内容哈希 | PDF 文件的 SHA-256，用于任务复用、目录命名和笔记 frontmatter | `sourceHash`，`sha256File` |

## 解析与翻译

| 术语 | 含义 | 代码 / 配置 |
| --- | --- | --- |
| 解析 | 用 MinerU 把 PDF 转成 Markdown 与图片 | `runMineru`，`mineru.*` |
| 解析模式 | `official`（官方 API）、`local`（HTTP 服务）、`cli`（本地命令） | `mineru.mode` |
| 解析目录 | 单篇的 MinerU 输出目录 `<outputDir>/<runId>/` | `runId` |
| 主 Markdown | 解析目录中作为正文来源的 Markdown 文件 | `findPrimaryMarkdown` |
| 规范化 | 定位主 Markdown、确定 slug、重建论文目录、复制图片并改写图片链接 | `normalize`，`rewriteMarkdownAssetLinks` |
| 分块 | 按标题结构把 Markdown 切成不超过上限的翻译块 | `chunkMarkdown`，`translation.chunkCharLimit` |
| AI 服务 | 翻译与阅读材料共用的大模型服务 | `translation.provider` / `preset` / `model` / `baseUrl` |
| 服务预设 | OpenAI 兼容服务的具体来源：DeepSeek、Cloudflare、OpenAI、OpenRouter、自定义 | `translation.preset` |
| 跳过翻译 | 检测为中文或关闭翻译时，译文笔记直接使用原文 | `translationSkipped`，`detectMarkdownLanguage` |
| 翻译缓存 | 按服务、模型、提示词与块内容哈希保存的译文块 | `translation.cacheDir` |

## Obsidian 产物

| 术语 | 含义 | 代码 / 配置 |
| --- | --- | --- |
| Vault | 用户的 Obsidian 知识库根目录 | `vault.path` |
| 论文目录 | 单篇产物所在目录 `<vault>/<documentDir>/<slug>/` | `documentRoot` |
| slug | 由主 Markdown 首个标题（无则用文件名）生成的目录与文件名 | `toSlug` |
| 索引页 | `<slug>.index.md`，论文的总入口：链接、元信息、自动关联；frontmatter `type: index` | `indexNote` |
| 译文笔记 / 原文笔记 | `<slug>.zh.md` / `<slug>.original.md` | `translatedNote`，`originalNote` |
| 阅读材料 | AI 生成的摘要、术语表、问答 | `readingAssets.*`，`generateReadingAssets` |
| 自动双链 | 把正文中出现的已有笔记标题 / 别名改成 `[[WikiLink]]` | `obsidian.autoLink`，`autoLinkMarkdown` |
| 引用别名 | 从正文与 Vault 中发现、可作为链接目标的别名 | `discoverReferenceAliases` |
| 参考文献桩 | 为正文参考文献创建的占位笔记，含基本元数据和指回引用论文的链接 | `createReferenceStubs` |
| Bases 数据库 | Obsidian Bases 文件，按表格列出全部索引页 | `obsidian.database`，`数据库.base` |
| 质量报告 | `report.json`，`status` 为 `completed` 或 `needs_review`（需复核） | `quality.reportFileName`，`createQualityReport` |

## 元数据

| 术语 | 含义 | 代码 / 配置 |
| --- | --- | --- |
| 论文元数据 | 标题、作者、年份、期刊、DOI、arXiv ID、引用数、期刊指标等 | `PaperMetadata` |
| 正文抽取 | 从 Markdown 启发式提取元数据 | `metadata.enrichFromMarkdown`，`extractPaperMetadata` |
| 在线补全 | 通过 CrossRef / OpenAlex 补空缺字段，标题相似度不足时丢弃 | `metadata.online`，`enrichPaperMetadata` |
| 期刊指标 | 影响因子、五年影响因子、JCI、JCR 分区、中科院分区；先查本地 SQLite，再查 EasyScholar | `metadata.journalMetrics` |
| 元数据覆盖 | 按 slug 或 PDF 文件名手动指定字段 | `metadata.overrides` |
