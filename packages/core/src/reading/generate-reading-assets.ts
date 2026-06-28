import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { ReadingAssetsConfig, TranslationConfig } from '../config/types.js';
import { ensureDirectory, pathExists, readTextFile, writeTextFile } from '../storage/file-system.js';
import { createFrontmatter } from '../utils/frontmatter.js';
import { createTextGenerationClient, type TextGenerationClient } from '@pdf2obsidian/providers';

// 生成阅读材料的输入
export interface GenerateReadingAssetsInput {
  slug: string;
  title: string;
  translatedTitle: string;
  originalMarkdown: string;
  translatedMarkdown: string;
  documentRoot: string;
  translationConfig: TranslationConfig;
  config: ReadingAssetsConfig;
  sourceHash: string;
  createdAt: string;
}

// 生成阅读材料的结果
export interface ReadingAssetResult {
  kind: ReadingAssetKind;
  path: string;
  cacheHit: boolean;
  warnings: string[];
}

// 阅读材料类型
export type ReadingAssetKind = 'summary' | 'terms' | 'qa';

// 阅读材料规范
interface ReadingAssetSpec {
  kind: ReadingAssetKind;
  fileName: string;
  title: string;
  prompt: string;
  minimumItemCount: number;
}

/**
 * 生成阅读材料
 * @param input 生成阅读材料的输入
 * @returns 生成阅读材料的结果
 */
export async function generateReadingAssets(input: GenerateReadingAssetsInput): Promise<ReadingAssetResult[]> {
  if (!input.config.enabled) {
    return [];
  }

  await ensureDirectory(input.config.cacheDir);
  await ensureDirectory(input.documentRoot);

  // 阅读材料复用翻译模型，但使用独立 systemPrompt 和 cacheDir，避免和正文翻译缓存相互污染。
  const sourceContext = createSourceContext(input);
  const client = createTextGenerationClient(input.translationConfig);

  const specs = createReadingAssetSpecs(input, sourceContext);
  const results: ReadingAssetResult[] = [];

  for (const spec of specs) {
    // 缓存维度包含源文档 hash 和具体 prompt，论文不变但产物模板调整时会自动重新生成。
    const cachePath = join(input.config.cacheDir, `${createCacheKey(input, spec)}.md`);
    const cacheHit = await pathExists(cachePath);
    const content = cacheHit
      ? await readTextFile(cachePath)
      : await generateWithRetry({
        client,
        systemPrompt: input.config.systemPrompt,
        prompt: spec.prompt,
        maxRetries: input.config.maxRetries
      });

    if (!cacheHit) {
      await writeTextFile(cachePath, content);
    }

    const warnings = validateReadingAsset(spec, content);
    // 这里统一补 Obsidian frontmatter 和返回索引，保证 AI 偶发漏写占位符时仍可导航。
    const note = createFrontmatter({
      title: spec.title,
      paperTitle: input.title,
      translatedTitle: input.translatedTitle,
      type: spec.kind,
      parent: `[[${input.slug}.index]]`,
      sourceHash: input.sourceHash,
      createdAt: input.createdAt
    }, ensureBacklink(content, input.slug));
    const outputPath = join(input.documentRoot, spec.fileName);
    await writeTextFile(outputPath, note);
    results.push({
      kind: spec.kind,
      path: outputPath,
      cacheHit,
      warnings
    });
  }

  return results;
}

function createReadingAssetSpecs(input: GenerateReadingAssetsInput, sourceContext: string): ReadingAssetSpec[] {
  // prompt 使用硬性格式约束，后续 UI/质量报告可以依赖标题、返回链接和最小条目数做轻量校验。
  return [
    {
      kind: 'summary',
      fileName: input.config.summaryFileName,
      title: `${input.translatedTitle} - 摘要`,
      minimumItemCount: 5,
      prompt: [
        '请为下面论文生成 summary.md。',
        '',
        '硬性要求：',
        '- 第一行标题必须是 `# 摘要`。',
        '- 必须包含 `返回索引：[[INDEX_LINK]]`，INDEX_LINK 保持原样。',
        '- 包含 5 到 10 条核心观点，使用有序列表。',
        '- 每条观点都必须能从文档中找到依据。',
        '- 不要生成文档中没有依据的结论。',
        '',
        sourceContext
      ].join('\n')
    },
    {
      kind: 'terms',
      fileName: input.config.termsFileName,
      title: `${input.translatedTitle} - 术语表`,
      minimumItemCount: 8,
      prompt: [
        '请为下面论文生成 terms.md。',
        '',
        '硬性要求：',
        '- 第一行标题必须是 `# 术语表`。',
        '- 必须包含 `返回索引：[[INDEX_LINK]]`，INDEX_LINK 保持原样。',
        '- 使用 Markdown 表格，列为：术语、中文译名、上下文解释。',
        '- 至少包含 8 个文档中的关键术语。',
        '- 上下文解释要说明该术语在本文中的含义，不要写泛泛定义。',
        '',
        sourceContext
      ].join('\n')
    },
    {
      kind: 'qa',
      fileName: input.config.qaFileName,
      title: `${input.translatedTitle} - 问答`,
      minimumItemCount: 10,
      prompt: [
        '请为下面论文生成 qa.md。',
        '',
        '硬性要求：',
        '- 第一行标题必须是 `# 问答`。',
        '- 必须包含 `返回索引：[[INDEX_LINK]]`，INDEX_LINK 保持原样。',
        '- 至少包含 10 个基于文档内容的问题。',
        '- 每个问题后给出简洁答案。',
        '- 问题应覆盖动机、方法、实验、结论、局限或适用场景。',
        '- 不要编造文档中没有出现的信息。',
        '',
        sourceContext
      ].join('\n')
    }
  ];
}

function createSourceContext(input: GenerateReadingAssetsInput): string {
  // 摘录同时包含原文和译文：原文保留术语依据，译文提高中文阅读材料的稳定性。
  const original = trimMarkdownForReading(input.originalMarkdown, Math.floor(input.config.maxSourceChars / 2));
  const translated = trimMarkdownForReading(input.translatedMarkdown, Math.ceil(input.config.maxSourceChars / 2));

  return [
    `论文英文标题：${input.title}`,
    `论文中文标题：${input.translatedTitle}`,
    '',
    '## 原文摘录',
    original,
    '',
    '## 译文摘录',
    translated
  ].join('\n');
}

function trimMarkdownForReading(markdown: string, maxChars: number): string {
  const withoutFrontmatter = markdown.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  if (withoutFrontmatter.length <= maxChars) {
    return withoutFrontmatter;
  }

  // 长论文只取头部和尾部，保留摘要/引言与结论区域，成本比全文送入模型更可控。
  const headLength = Math.floor(maxChars * 0.72);
  const tailLength = maxChars - headLength;
  return [
    withoutFrontmatter.slice(0, headLength).trim(),
    '',
    '[中间内容因长度限制省略]',
    '',
    withoutFrontmatter.slice(-tailLength).trim()
  ].join('\n');
}

function createCacheKey(input: GenerateReadingAssetsInput, spec: ReadingAssetSpec): string {
  return createHash('sha256')
    .update(input.translationConfig.provider)
    .update('\n')
    .update(input.translationConfig.preset ?? '')
    .update('\n')
    .update(input.translationConfig.baseUrl)
    .update('\n')
    .update(input.translationConfig.model)
    .update('\n')
    .update(input.config.systemPrompt)
    .update('\n')
    .update(input.sourceHash)
    .update('\n')
    .update(spec.kind)
    .update('\n')
    .update(spec.prompt)
    .digest('hex');
}

async function generateWithRetry(input: {
  client: TextGenerationClient;
  systemPrompt: string;
  prompt: string;
  maxRetries: number;
}): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= input.maxRetries; attempt += 1) {
    try {
      return await input.client.generateText({
        systemPrompt: input.systemPrompt,
        userPrompt: input.prompt
      });
    } catch (error) {
      lastError = error;
      if (attempt === input.maxRetries) {
        break;
      }
      await wait(1000 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function validateReadingAsset(spec: ReadingAssetSpec, content: string): string[] {
  const warnings: string[] = [];
  // 质量问题只记 warning，不阻断主流水线；阅读材料失败不应该让正文导出失败。
  if (!content.includes('[[INDEX_LINK]]')) {
    warnings.push(`${spec.kind}: missing index backlink placeholder`);
  }

  if (countMeaningfulItems(content) < spec.minimumItemCount) {
    warnings.push(`${spec.kind}: fewer than ${spec.minimumItemCount} items`);
  }

  return warnings;
}

function countMeaningfulItems(content: string): number {
  return content
    .split(/\r?\n/)
    .filter((line) => /^(\s*[-*]\s+|\s*\d+[.)]\s+|\|[^|]+.*\|$|#{2,6}\s+)/.test(line.trim()))
    .length;
}

function ensureBacklink(content: string, slug: string): string {
  const backlink = `[[${slug}.index]]`;
  const replaced = content.replaceAll('[[INDEX_LINK]]', backlink).trim();
  if (replaced.includes(backlink)) {
    return replaced;
  }

  return [`返回索引：${backlink}`, '', replaced].join('\n');
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
