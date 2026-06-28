import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { TranslationConfig } from '../config/types.js';
import { chunkMarkdown, type MarkdownChunk } from '../markdown/chunk-markdown.js';
import { ensureDirectory, pathExists, readTextFile, writeTextFile } from '../storage/file-system.js';
import { createTextGenerationClient, type TextGenerationClient } from '@pdf2obsidian/providers';

export interface TranslateMarkdownResult {
  markdown: string;
  chunks: Array<{
    index: number;
    headingPath: string[];
    cacheHit: boolean;
    charCount: number;
  }>;
}

export async function translateMarkdownInChunks(input: {
  markdown: string;
  title: string;
  config: TranslationConfig;
}): Promise<TranslateMarkdownResult> {
  // 翻译按 Markdown 结构分块执行，避免单次请求超过模型上下文，同时尽量保留章节边界。
  const chunks = chunkMarkdown(input.markdown, input.config.chunkCharLimit);
  const client = createTextGenerationClient(input.config);
  const translatedChunks: string[] = [];
  const stats: TranslateMarkdownResult['chunks'] = [];

  await ensureDirectory(input.config.cacheDir);
  console.log(`[Translation] Prepared ${chunks.length} chunk(s), max ${input.config.chunkCharLimit} chars each.`);

  for (const chunk of chunks) {
    const cachePath = join(input.config.cacheDir, `${cacheKey(input.config, chunk)}.md`);
    const cacheHit = await pathExists(cachePath);
    const translated = cacheHit
      ? await readTextFile(cachePath)
      : await translateWithRetry({
        client,
        systemPrompt: input.config.systemPrompt,
        title: input.title,
        chunk,
        maxRetries: input.config.maxRetries
      });

    if (!cacheHit) {
      await writeTextFile(cachePath, translated);
    }

    translatedChunks.push(translated.trim());
    stats.push({
      index: chunk.index,
      headingPath: chunk.headingPath,
      cacheHit,
      charCount: chunk.content.length
    });
  }

  return {
    markdown: translatedChunks.join('\n\n'),
    chunks: stats
  };
}

function cacheKey(config: TranslationConfig, chunk: MarkdownChunk): string {
  // 缓存键包含 provider/model/systemPrompt/content，提示词或模型变化后不会误用旧译文。
  return createHash('sha256')
    .update(config.provider)
    .update('\n')
    .update(config.preset ?? '')
    .update('\n')
    .update(config.baseUrl)
    .update('\n')
    .update(config.model)
    .update('\n')
    .update(config.systemPrompt)
    .update('\n')
    .update(chunk.content)
    .digest('hex');
}

async function translateWithRetry(input: {
  client: TextGenerationClient;
  systemPrompt: string;
  title: string;
  chunk: MarkdownChunk;
  maxRetries: number;
}): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= input.maxRetries; attempt += 1) {
    try {
      return await input.client.generateText({
        systemPrompt: input.systemPrompt,
        userPrompt: formatChunkPrompt(input.title, input.chunk)
      });
    } catch (error) {
      lastError = error;
      if (attempt === input.maxRetries) {
        break;
      }
      // 简单线性退避即可覆盖本地模型加载、远端短暂限流等临时失败。
      await wait(1000 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function formatChunkPrompt(title: string, chunk: MarkdownChunk): string {
  const headingPath = chunk.headingPath.length > 0 ? chunk.headingPath.join(' > ') : title;
  // 把文档标题和章节路径放进用户消息，降低分块翻译时术语漂移的概率。
  return [
    `文档标题：${title}`,
    `当前章节：${headingPath}`,
    `当前分块：${chunk.index + 1}`,
    '',
    '请将下面 Markdown 翻译为简体中文，保留 Markdown 结构、标题层级、图片引用、表格、代码块、公式和引用标记。不要添加解释，不要遗漏原文信息。',
    '',
    chunk.content
  ].join('\n');
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
