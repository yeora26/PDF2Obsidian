# PDF2Obsidian · 安装、配置与使用指南

English: [Installation, Configuration and Usage Guide](../en/user-guide.md)

本文说明如何在本机安装、配置并使用 PDF2Obsidian。架构与接口见[系统设计](system-design.md)；各阶段细节见 [PDF 导入流水线](topics/pdf-import-pipeline.md)。

## 1. 环境要求

| 项目 | 要求 |
| --- | --- |
| Node.js | >= 20.0.0 |
| pnpm | 10.x（`packageManager: pnpm@10.0.0`） |
| PDF 解析 | MinerU 官方 API Token，或本机 / 远程 MinerU 服务，或本地 MinerU 命令 |
| AI 服务（翻译与阅读材料） | DeepSeek、Cloudflare Workers AI、OpenAI、OpenRouter、其他 OpenAI 兼容服务的 API Key，或本机 Ollama |
| 可选 | EasyScholar SecretKey（期刊指标）；CrossRef 联系邮箱 |
| Obsidian | 一个本地 Vault 目录；Bases 数据库需要支持 Bases 的 Obsidian 版本 |

## 2. 安装与启动

```bash
pnpm install
```

```bash
cp pdf2obsidian.config.example.yaml pdf2obsidian.config.yaml
```

设置密钥环境变量（按实际使用的服务）：

```bash
export MINERU_OFFICIAL_API_TOKEN=...
export DEEPSEEK_API_KEY=sk-...
```

启动本地 Web 工作台（会先编译 `packages/`）：

```bash
pnpm dev:oss
```

默认地址 `http://localhost:3000`（端口写在 `apps/desktop-web/package.json`）。环境变量要在启动前设置；修改后需重启。

指定其他配置文件：

```bash
PDF2OBSIDIAN_CONFIG=/path/to/pdf2obsidian.config.yaml pnpm dev:oss
```

构建：`pnpm build:packages`（共享包）、`pnpm build:cli`、`pnpm build:oss`。

## 3. 配置

配置文件为 `pdf2obsidian.config.yaml`。下表的「默认」是代码默认值（`packages/core/src/config/load-config.ts`，省略该键时生效）；模板文件中个别值与此不同，见[系统设计 §9](system-design.md#9-已知问题与文档代码差异)。每个键的完整说明以模板注释为准。

### 3.1 `vault`

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `path` | 必填 | Obsidian Vault 绝对路径 |
| `documentDir` | 必填 | 论文产物写入的子目录，按 Vault 内相对路径处理（自动去掉盘符与首尾斜杠） |
| `imageDirName` | 必填 | 论文目录下的图片目录名，如 `images` |

### 3.2 `mineru`

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `mode` | `official` | `official`：MinerU 官方 API；`local`：连接 `apiUrl` 上的 MinerU HTTP 服务；`cli`：直接运行 `command` |
| `backend` | 必填 | `pipeline`、`vlm-http-client`、`hybrid-http-client`、`vlm-auto-engine`、`hybrid-auto-engine`（本地服务 / CLI 使用） |
| `method` | — | `auto`、`txt`、`ocr` |
| `apiUrl` | — | 本地或远程服务地址，缺协议时补 `https://` |
| `command` | 必填 | 本地 MinerU 命令路径（`cli` 模式） |
| `outputDir` | 必填 | 解析中间产物目录 |
| `apiTokenEnv` | `MINERU_OFFICIAL_API_TOKEN` | 官方 API Token 的环境变量名 |
| `modelVersion` | `vlm` | 官方 API 云端模型：`vlm`（高精度）或 `pipeline` |
| `modelSource` | — | 本地模型来源，如 `modelscope` |
| `formula` / `table` / `imageAnalysis` | — | 公式、表格、图片分析开关 |

### 3.3 `translation`

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 关闭后 `*.zh.md` 保存原文 |
| `provider` | `openai-compatible` | `openai-compatible` 或 `ollama`；旧值 `deepseek` 自动迁移 |
| `preset` | — | `deepseek`、`cloudflare`、`openai`、`openrouter`、`custom`，用于标识服务与设置表单 |
| `model` | 必填 | 模型名，如 `deepseek-v4-flash`、`@cf/qwen/qwen3-30b-a3b-fp8`、`qwen2.5:14b` |
| `baseUrl` | 必填 | 服务根地址，不要带 `/chat/completions`；Ollama 通常为 `http://127.0.0.1:11434` |
| `apiKeyEnv` / `apiKey` | — | Key 的环境变量名（推荐）或明文 Key；非 Ollama 且启用翻译时二选一必填 |
| `systemPrompt` | 必填 | 翻译提示词 |
| `chunkCharLimit` | `24000` | 每个翻译块的最大字符数 |
| `cacheDir` | `.pipeline/core-cache` | 翻译缓存目录 |
| `maxRetries` | `3` | 每块最多尝试次数 |

Cloudflare Workers AI 的 `baseUrl` 形如 `https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1`。

### 3.4 `tasks`（命令行）

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `stateDir` | `.pipeline/tasks` | 任务状态目录 |
| `inboxDir` | `.pipeline/inbox` | `watch` 监听目录 |
| `concurrency` | `3` | 批量并发数 |
| `watchPollIntervalMs` | `5000` | 监听轮询间隔（毫秒，最小 500） |

### 3.5 `readingAssets`

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 生成摘要、术语表、问答（使用 `translation` 中的 AI 服务） |
| `summaryFileName` / `termsFileName` / `qaFileName` | `摘要.md` / `术语表.md` / `问答.md` | 文件名 |
| `maxSourceChars` | `50000` | 送给模型的原文与译文总字符上限，超出时截取头尾 |
| `maxRetries` | `3` | 每份材料最多尝试次数 |
| `cacheDir` | `.pipeline/core-assets-cache` | 缓存目录 |
| `systemPrompt` | 内置 | 阅读材料提示词 |

### 3.6 `quality`

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `reportFileName` | `report.json` | 质量报告文件名 |

### 3.7 `obsidian`

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `autoLink.enabled` | `true` | 扫描 Vault 已有笔记，为正文中出现的标题 / 别名加 `[[WikiLink]]` |
| `autoLink.scanDirs` | `[]` | 扫描目录，空表示整个 Vault |
| `autoLink.excludeDirs` | `.obsidian`、`.trash` | 排除目录 |
| `autoLink.minAliasLength` | `4` | 别名最短字符数 |
| `autoLink.maxLinksPerNote` | `30` | 单篇最多自动链接数 |
| `database.enabled` / `database.fileName` | `true` / `数据库.base` | 生成 Bases 数据库文件 |

### 3.8 `metadata`

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enrichFromMarkdown` | `true` | 从正文启发式抽取标题、作者、年份、DOI、arXiv ID 等 |
| `online.enabled` | `false` | 通过 CrossRef / OpenAlex 在线补全 |
| `online.providers` | `crossref`、`openalex` | 数据源 |
| `online.timeoutMs` / `online.cacheDir` | `12000` / `.pipeline/core-cache` | 超时与缓存 |
| `online.email` | — | CrossRef 联系邮箱（polite pool） |
| `journalMetrics.sqlite.path` | `.pipeline/journal-metrics.sqlite` | 期刊指标缓存 |
| `journalMetrics.easyScholar.enabled` | `false` | 通过 EasyScholar 查影响因子、JCR、中科院分区 |
| `journalMetrics.easyScholar.secretKeyEnv` | — | SecretKey 的环境变量名 |
| `overrides` | `{}` | 按论文 slug 或 PDF 文件名手动覆盖元数据 |

### 3.9 环境变量

| 变量 | 用途 |
| --- | --- |
| `PDF2OBSIDIAN_CONFIG` | 本地 Web 使用的配置文件路径 |
| `translation.apiKeyEnv` 指定的变量（如 `DEEPSEEK_API_KEY`、`CLOUDFLARE_API_TOKEN`） | AI 服务 Key |
| `mineru.apiTokenEnv` 指定的变量（默认 `MINERU_OFFICIAL_API_TOKEN`） | MinerU 官方 API Token；也可写在当前目录的 `.env.local` / `.env` |
| `easyScholar.secretKeyEnv` 指定的变量 | EasyScholar SecretKey |
| `MINERU_VL_SERVER` | `cli` 模式 VLM 后端地址，默认 `http://127.0.0.1:30000` |
| `MINERU_MANAGED_API_URL` | `local` 模式未配 `apiUrl` 时传给 MinerU 命令的服务地址 |

## 4. 本地 Web 工作台

1. **首次启动**：配置不存在或无效时自动打开向导，依次设置 Vault 位置、PDF 解析、AI 服务、输出增强；也可从页面顶部「向导」重新打开，或在「设置」中编辑全部配置。
2. **导入**：拖入或选择 PDF；或在「从链接导入」中填 arXiv ID、DOI 或 PDF URL。每个任务立即开始处理。
3. **查看进度**：左侧任务列表显示状态和阶段；失败任务显示中文原因和处理建议。
4. **查看结果**：中间预览原 PDF；右侧切换译文、阅读材料、论文信息、Bases。
5. **重试与删除**：失败任务可重试，已完成的阶段会跳过；删除只删除任务记录和上传的 PDF，不删除 Vault 中的笔记。

Web 与命令行的任务记录互相独立。

## 5. 命令行

`pnpm dev:cli` 会先编译共享包，然后在 `apps/cli` 目录下运行，所以 PDF 路径和 `--config` 请使用绝对路径（见[系统设计 §9](system-design.md#9-已知问题与文档代码差异)）。

```bash
pnpm dev:cli import /abs/path/paper.pdf --config /abs/path/pdf2obsidian.config.yaml
```

| 命令 | 说明 |
| --- | --- |
| `import <source>` | 导入单篇：本地路径或 PDF URL（裸 arXiv ID 与 DOI 的识别问题见[系统设计 §9](system-design.md#9-已知问题与文档代码差异)），输出结果 JSON，不建任务记录 |
| `batch <pdf...> [-j N]` | 批量导入，同一 PDF 复用已有未失败的任务 |
| `watch [inboxDir]` | 持续监听目录（含子目录），新 PDF 自动导入 |
| `tasks list` | 列出任务：`taskId  状态  文件名 -> slug (错误)` |
| `tasks show <taskId>` | 输出任务完整状态 JSON |
| `tasks retry <taskId>` | 重试失败任务，已完成阶段跳过 |

所有命令都支持 `-c, --config <path>`。

## 6. 输出产物

一次成功导入写入 `<vault>/<documentDir>/<slug>/`：

| 文件 | 内容 |
| --- | --- |
| `<slug>.index.md` | 索引页：原文 / 译文 / PDF / 阅读材料链接、语言检测、元信息、自动关联 |
| `<slug>.zh.md` | 中文译文；中文文档或关闭翻译时为原文 |
| `<slug>.original.md` | 原文 Markdown |
| `<原文件名>.pdf` | PDF 原件副本 |
| `摘要.md`、`术语表.md`、`问答.md` | 阅读材料（开启时） |
| `report.json` | 质量报告，`status` 为 `completed` 或 `needs_review` |
| `images/` | 图片资源 |

此外，`<documentDir>/` 下会有参考文献桩笔记（Vault 中尚无同名笔记时创建）和 `数据库.base`。

**注意：** 重新导入同一篇论文（或首个标题相同的另一篇）会先清空该论文目录再写入；请不要在论文目录内存放手写笔记。

## 7. 数据与缓存目录

| 目录 | 默认 | 内容 |
| --- | --- | --- |
| MinerU 输出 | 模板为 `.pipeline/mineru` | 解析中间产物 |
| 翻译缓存 | `.pipeline/core-cache` | 按块缓存的译文 |
| 阅读材料缓存 | `.pipeline/core-assets-cache` | 摘要 / 术语表 / 问答缓存 |
| 在线元数据缓存 | `.pipeline/core-cache` | CrossRef / OpenAlex 响应 |
| 期刊指标 | `.pipeline/journal-metrics.sqlite` | EasyScholar 结果 |
| 命令行任务 | `.pipeline/tasks` | `state.yaml` |
| 监听目录 | `.pipeline/inbox` | 待处理 PDF |
| 命令行下载 | `.pipeline/downloads` | 按链接导入的 PDF |
| Web 数据 | `.pipeline/desktop-web/` | `uploads/`、`downloads/`、`tasks/tasks.json` |

全部目录已在 `.gitignore` 中。删除缓存目录会导致下次导入重新调用 MinerU 或 AI 服务。

## 8. 常见问题

| 现象 | 检查 |
| --- | --- |
| 找不到配置文件 | 当前目录是否有 `pdf2obsidian.config.yaml`，或用 `--config` / `PDF2OBSIDIAN_CONFIG` 指定绝对路径 |
| 「配置预检失败」 | 按提示修正；`baseUrl` 是否仍含占位符或带 `/chat/completions`；Key 环境变量是否在启动 Web 前设置 |
| AI 服务 401 / 403 | Key 是否有效、有该模型权限；`apiKeyEnv` 是否填的是变量名而不是 Key 原文 |
| AI 服务 404 | `baseUrl` 是否为服务根地址；模型名是否在该服务可用；Cloudflare 的 Account ID 是否已替换 |
| MinerU Token 未配置 | 设置 `MINERU_OFFICIAL_API_TOKEN`（或 `apiTokenEnv` 指定的变量）后重启 |
| MinerU 服务连接失败 | 本地服务是否启动、`apiUrl` 是否可访问；WSL / 容器的端口映射 |
| Ollama 无法连接 | Ollama 是否运行，`baseUrl` 是否为 `http://127.0.0.1:11434` |
| 元数据补全失败 | 网络与请求限制；可设 `metadata.online.enabled: false`；填写 `online.email` |
| Obsidian 中图片不显示 | `vault.path`、`documentDir`、`imageDirName` 是否正确；MinerU 是否提取出图片；看 `report.json` 的 `missingImages` |
| 端口 3000 被占用 | 结束占用进程，或在 `apps/desktop-web` 下运行 `pnpm exec next dev -p <端口>`（需先 `pnpm build:packages`） |
