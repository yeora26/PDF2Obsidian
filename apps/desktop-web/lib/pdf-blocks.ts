export type PdfBounds = [left: number, top: number, right: number, bottom: number];

export interface PdfBlock {
  id: string;
  page: number;
  type: string;
  bbox?: PdfBounds;
  markdown: string;
  image?: string;
  continuationOf?: string;
}

export type BlockSelection = {
  id: string;
  source: 'pdf' | 'markdown';
  sequence: number;
};

export function parsePdfBlocks(value: unknown): PdfBlock[] {
  if (!Array.isArray(value)) return [];

  const blocks: PdfBlock[] = [];
  let previousParagraph: PdfBlock | undefined;

  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== 'object' || !Number.isSafeInteger(item.page_idx) || item.page_idx < 0) continue;

    const id = `block-${index}`;
    const page = item.page_idx + 1;
    const bbox = parseBounds(item.bbox);
    const body = typeof item.text === 'string' ? item.text.trim() : '';
    const type = typeof item.type === 'string' ? item.type : 'text';
    const isParagraph = type === 'text' || type === 'paragraph';
    const heading = Number.isInteger(item.text_level) ? Math.min(3, Math.max(0, item.text_level)) : 0;
    const image = typeof item.img_path === 'string' && item.img_path.startsWith('images/')
      ? item.img_path
      : undefined;
    const table = !image && typeof item.table_body === 'string' ? item.table_body.trim() : '';
    const markdown = [
      ...readStrings(item.table_caption),
      body && (heading ? `${'#'.repeat(heading)} ${body}` : body),
      table,
      ...readStrings(item.image_caption),
      ...readStrings(item.chart_caption),
      ...readStrings(item.list_items).map((text) => `- ${text}`),
      ...readStrings(item.table_footnote),
      ...readStrings(item.image_footnote),
      ...readStrings(item.chart_footnote)
    ].filter(Boolean).join('\n\n');

    if (!markdown && !image) {
      // MinerU 可能只在第一处区块中保留完整的段落文本。
      if (bbox && isParagraph && previousParagraph && page <= previousParagraph.page + 1) {
        blocks.push({ id, page, type, bbox, markdown: previousParagraph.markdown, continuationOf: previousParagraph.id });
      }
      continue;
    }

    const block = { id, page, type, bbox, markdown, image };
    blocks.push(block);
    if (isParagraph) previousParagraph = heading ? undefined : block;
  }

  // 页眉可能位于列表末尾，原文预览按页面顺序把它放在正文前。
  return blocks.sort((a, b) => a.page - b.page || Number(b.type === 'header') - Number(a.type === 'header'));
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((text): text is string => typeof text === 'string' && Boolean(text.trim()))
    : [];
}

function parseBounds(value: unknown): PdfBounds | undefined {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite)) return undefined;

  // MinerU v1 区块使用以左上角为原点的 0–1000 坐标。
  const [left, top, right, bottom] = value.map((coordinate) => Math.max(0, Math.min(1000, coordinate)));
  if (left >= right || top >= bottom) return undefined;
  return [left, top, right, bottom];
}
