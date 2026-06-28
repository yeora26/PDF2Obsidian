export interface MarkdownChunk {
  index: number;
  headingPath: string[];
  content: string;
}

/**
 * 将 Markdown 文本分割成多个块
 * @param markdown 输入的 Markdown 文本
 * @param chunkCharLimit 每个块的最大字符数
 * @returns 分割后的 Markdown 块数组
 */
export function chunkMarkdown(markdown: string, chunkCharLimit: number): MarkdownChunk[] {
  // 先按标题切出语义段，再处理超长段落，最后合并小块，减少翻译时上下文断裂。
  const sections = splitByHeadings(markdown);
  const rawChunks: MarkdownChunk[] = [];
  let currentHeadingPath: string[] = [];

  for (const section of sections) {
    if (section.headingPath.length > 0) {
      currentHeadingPath = section.headingPath;
    }

    const pieces = splitLargeSection(section.content, chunkCharLimit);
    for (const piece of pieces) {
      rawChunks.push({
        index: rawChunks.length,
        headingPath: currentHeadingPath,
        content: piece
      });
    }
  }

  return mergeSmallChunks(rawChunks, chunkCharLimit);
}

/**
 * 按标题分割 Markdown 文本
 * @param markdown 输入的 Markdown 文本
 * @returns 按标题分割后的 Markdown 块数组
 */
function splitByHeadings(markdown: string): Array<{ headingPath: string[]; content: string }> {
  const lines = markdown.split(/\r?\n/);
  const sections: Array<{ headingPath: string[]; content: string }> = [];
  // headingStack 保留当前位置的标题路径，后续 prompt 会用它稳定术语和上下文。
  const headingStack: string[] = [];
  let currentLines: string[] = [];
  let currentHeadingPath: string[] = [];

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (heading && currentLines.length > 0) {
      sections.push({
        headingPath: currentHeadingPath,
        content: currentLines.join('\n').trim()
      });
      currentLines = [];
    }

    if (heading) {
      const level = heading[1]?.length ?? 1;
      const title = heading[2]?.trim() ?? '';
      headingStack.splice(level - 1);
      headingStack[level - 1] = title;
      currentHeadingPath = headingStack.filter(Boolean);
    }

    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    sections.push({
      headingPath: currentHeadingPath,
      content: currentLines.join('\n').trim()
    });
  }

  return sections.filter((section) => section.content.length > 0);
}

/**
 * 分割超长段落
 * @param content 输入的 Markdown 文本
 * @param chunkCharLimit 每个块的最大字符数
 * @returns 分割后的 Markdown 块数组
 */
function splitLargeSection(content: string, chunkCharLimit: number): string[] {
  if (content.length <= chunkCharLimit) {
    return [content];
  }

  // 优先按空行切段，尽量不拆散 Markdown 表格、列表和公式块。
  const paragraphs = content.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= chunkCharLimit) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length <= chunkCharLimit) {
      current = paragraph;
      continue;
    }

    chunks.push(...splitBySoftLimit(paragraph, chunkCharLimit));
    current = '';
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * 合并小块
 * @param chunks 输入的 Markdown 块数组
 * @param chunkCharLimit 每个块的最大字符数
 * @returns 合并后的 Markdown 块数组
 */
function mergeSmallChunks(chunks: MarkdownChunk[], chunkCharLimit: number): MarkdownChunk[] {
  const merged: MarkdownChunk[] = [];
  let current: MarkdownChunk | undefined;

  // MinerU 输出常出现短标题/短段落，合并小块可以减少模型调用次数并保留局部上下文。
  for (const chunk of chunks) {
    if (!current) {
      current = {
        index: 0,
        headingPath: chunk.headingPath,
        content: chunk.content
      };
      continue;
    }

    const candidate = `${current.content}\n\n${chunk.content}`;
    if (candidate.length <= chunkCharLimit) {
      current = {
        ...current,
        headingPath: mergeHeadingPaths(current.headingPath, chunk.headingPath),
        content: candidate
      };
      continue;
    }

    merged.push(current);
    current = {
      index: 0,
      headingPath: chunk.headingPath,
      content: chunk.content
    };
  }

  if (current) {
    merged.push(current);
  }

  return merged.map((chunk, index) => ({
    ...chunk,
    index
  }));
}

function mergeHeadingPaths(left: string[], right: string[]): string[] {
  if (left.join('\n') === right.join('\n')) {
    return left;
  }

  const unique = new Set([...left, ...right]);
  return Array.from(unique);
}

function splitBySoftLimit(content: string, chunkCharLimit: number): string[] {
  const chunks: string[] = [];
  let remaining = content.trim();

  while (remaining.length > chunkCharLimit) {
    const splitPoint = findBestSplitPoint(remaining, chunkCharLimit);
    chunks.push(remaining.slice(0, splitPoint).trim());
    remaining = remaining.slice(splitPoint).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * 按软限制分割
 * @param content 输入的 Markdown 文本
 * @param chunkCharLimit 每个块的最大字符数
 * @returns 分割后的 Markdown 块数组
 */
function findBestSplitPoint(content: string, chunkCharLimit: number): number {
  const windowStart = Math.floor(chunkCharLimit * 0.6);
  const window = content.slice(windowStart, chunkCharLimit);
  // 从强边界到弱边界依次尝试
  const patterns = [
    /\n#{1,6}\s+/g,
    /\n\n+/g,
    /[.!?。！？]\s+/g,
    /[,;，；]\s+/g,
    /\s+/g
  ];

  for (const pattern of patterns) {
    const matches = Array.from(window.matchAll(pattern));
    const last = matches.at(-1);
    if (last?.index !== undefined) {
      return windowStart + last.index + last[0].length;
    }
  }

  return chunkCharLimit;
}
