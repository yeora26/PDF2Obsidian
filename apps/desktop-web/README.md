# PDF2Obsidian Desktop Web

`apps/desktop-web` 是 PDF2Obsidian 的本地 Web 工作台，面向个人桌面使用。

## 当前能力

- 读取和保存根目录 `pdf2obsidian.config.yaml`
- 使用示例配置作为首次启动草稿
- 可视化配置 Vault、MinerU、AI 服务和输出增强
- 上传单个 PDF 到 `.pipeline/desktop-web/uploads`
- 在本地后台调用 `@pdf2obsidian/pipeline`
- 轮询展示任务状态和阶段进度
- 删除本地任务记录
- 预览原 PDF
- 预览译文、阅读材料、论文信息、Obsidian 文件和 Bases 内容

## 启动

```bash
pnpm dev:oss
```

如果需要指定配置文件：

```bash
PDF2OBSIDIAN_CONFIG=/path/to/pdf2obsidian.config.yaml pnpm dev:oss
```

默认访问：

```text
http://localhost:3000
```

