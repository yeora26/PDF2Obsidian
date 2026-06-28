export interface StructuredReference {
  /** 参考文献标题 */
  title: string;
  /** 作者列表（已拆分为独立姓名） */
  authors: string[];
  /** 发表年份 */
  year?: number;
  /** DOI */
  doi?: string;
  /** arXiv ID */
  arxivId?: string;
  /** 期刊/会议名称（启发式提取） */
  venue?: string;
  /** 原文中的完整引用行 */
  rawText: string;
}

/**
 * 从 Markdown 正文中提取结构化参考文献信息。
 * 支持编号列表格式（如 [1]、1.、1)）和冒号分隔的作者-标题模式。
 * 在标题和年份基础上，额外提取 DOI、arXiv ID、作者列表和期刊名。
 */
export function extractStructuredReferences(markdown: string): StructuredReference[] {
  const lines = markdown
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const references: StructuredReference[] = [];

  for (const line of lines) {
    const ref = parseReferenceLine(line);
    if (ref) {
      references.push(ref);
    }
  }

  return dedupeReferences(references);
}

// ─── 内部工具 ───────────────────────────────────────────────

const REFERENCE_LINE_PATTERN = /^\d+[.)]?\s+(.+?)[：:]\s+(.+)$/;
const DOI_PATTERN = /\b(10\.\d{4,}\/[^\s,;]+)\b/;
const ARXIV_PATTERN = /arXiv[:.\s]*(\d{4}\.\d{4,}(?:v\d+)?)/i;
const YEAR_PATTERN_PAREN = /\((19\d{2}|20\d{2})\)/;
const YEAR_PATTERN_BARE = /\b(19\d{2}|20\d{2})\b/;

const TITLE_END_SEPARATORS = [
  '. ', '。 ', '. J.', '. In:', '. IEEE', '. SPE',
  '. ACM', '. Springer', '. Elsevier', '. Wiley',
  '. Nature', '. Science', '. arXiv',
  ', vol.', ', v.', ', no.', ', pp.',
  '. https://', '. http://'
];

function parseReferenceLine(line: string): StructuredReference | undefined {
  const match = REFERENCE_LINE_PATTERN.exec(line);
  if (!match?.[1] || !match?.[2]) return undefined;

  const authorPart = match[1].trim();
  const detailPart = match[2];

  const title = normalizeTitle(extractTitleSegment(detailPart));
  if (title.length < 6 || /^(doi|http|www)\b/i.test(title)) return undefined;

  const authors = parseAuthors(authorPart);
  const ref: StructuredReference = { title, authors, rawText: line };

  const year = extractYear(line);
  if (year !== undefined) ref.year = year;

  const doi = extractDoi(line);
  if (doi !== undefined) ref.doi = doi;

  const arxivId = extractArxivId(line);
  if (arxivId !== undefined) ref.arxivId = arxivId;

  const venue = extractVenue(detailPart, title);
  if (venue !== undefined) ref.venue = venue;

  return ref;
}

function extractTitleSegment(value: string): string {
  let end = value.length;
  for (const separator of TITLE_END_SEPARATORS) {
    const index = value.indexOf(separator);
    if (index > 0) end = Math.min(end, index);
  }
  return value.slice(0, end);
}

function normalizeTitle(title: string): string {
  return title
    .replace(/\[\[[^\]|]+\|([^\]]+)]]/g, '$1')
    .replace(/\[\[([^\]]+)]]/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/[.。；;，,：:]+$/g, '')
    .trim();
}

function extractYear(line: string): number | undefined {
  const paren = YEAR_PATTERN_PAREN.exec(line)?.[1];
  if (paren) return Number(paren);
  const bare = YEAR_PATTERN_BARE.exec(line)?.[1];
  return bare ? Number(bare) : undefined;
}

function extractDoi(line: string): string | undefined {
  return DOI_PATTERN.exec(line)?.[1]?.replace(/[.)]+$/, '');
}

function extractArxivId(line: string): string | undefined {
  return ARXIV_PATTERN.exec(line)?.[1];
}

/**
 * 拆分作者部分为独立姓名列表。
 * 支持逗号、"and"、顿号分隔，以及 "Last, First" 格式。
 */
function parseAuthors(authorPart: string): string[] {
  // 按 ", " / " and " / "、" 拆分
  const parts = authorPart.split(/\s*(?:,\s*|\s+and\s+|、)\s*/i);
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.length < 60);
}

/**
 * 从标题结束位置之后提取期刊/会议名称（启发式）。
 * 常见模式: "...标题. Journal Name, vol..." 或 "...标题. In: Conference Name..."
 */
function extractVenue(detailPart: string, title: string): string | undefined {
  const afterTitle = detailPart.slice(detailPart.indexOf(title) + title.length);
  if (!afterTitle) return undefined;

  // "In: Conference Name" 模式
  const inMatch = /In:\s*([^,.(]+)/i.exec(afterTitle);
  if (inMatch?.[1]) return inMatch[1].trim().replace(/[.。]+$/, '');

  // ". Journal Name," 模式
  const journalMatch = /^[.。]\s*([^,，(（]{3,60})[,，(（]/.exec(afterTitle);
  if (journalMatch?.[1]) return journalMatch[1].trim();

  return undefined;
}

function dedupeReferences(references: StructuredReference[]): StructuredReference[] {
  const seen = new Set<string>();
  const deduped: StructuredReference[] = [];

  for (const ref of references) {
    const key = `${ref.title.toLocaleLowerCase()}-${ref.year ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(ref);
    }
  }

  return deduped;
}
