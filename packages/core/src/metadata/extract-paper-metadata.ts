import { basename } from 'node:path';
import type { MetadataConfig, PaperMetadata, PaperMetadataOverride } from '../config/types.js';
import { mergeMetadata } from './enrich-paper-metadata.js';
import { createCitationFormats } from './format-citations.js';

export interface ExtractPaperMetadataInput {
  markdown: string;
  title: string;
  slug: string;
  pdfPath: string;
  config: MetadataConfig;
}

export function extractPaperMetadata(input: ExtractPaperMetadataInput): PaperMetadata {
  // MinerU 输出里通常能识别标题页、摘要和关键词；这里只做启发式提取，在线元数据会继续补全。
  return input.config.enrichFromMarkdown
    ? detectPaperMetadata(input.markdown, input.title)
    : createEmptyPaperMetadata(input.title);
}

export function applyPaperMetadataOverride(input: {
  metadata: PaperMetadata;
  slug: string;
  pdfPath: string;
  config: MetadataConfig;
}): PaperMetadata {
  // overrides 支持 slug 和原 PDF 文件名两种键，方便用户在文件重命名后仍可手动修正元数据。
  const override = findOverride({
    config: input.config,
    slug: input.slug,
    pdfFileName: basename(input.pdfPath)
  });

  return mergeMetadata(input.metadata, override ?? {});
}

export function createPaperFrontmatter(metadata: PaperMetadata): Record<string, unknown> {
  // 指标字段保留 null，方便 Obsidian Dataview 区分“已查询但为空”和“字段完全不存在”。
  return pruneEmptyValues({
    paperTitle: metadata.title,
    translatedTitle: metadata.translatedTitle,
    metadataSources: metadata.metadataSources,
    aliases: metadata.aliases,
    authors: metadata.authors,
    year: metadata.year,
    venue: metadata.venue,
    journal: metadata.journal,
    publisher: metadata.publisher,
    volume: metadata.volume,
    issue: metadata.issue,
    pages: metadata.pages,
    doi: metadata.doi,
    arxivId: metadata.arxivId,
    keywords: metadata.keywords,
    url: metadata.url,
    openAccessUrl: metadata.openAccessUrl,
    citationCount: metadata.citationCount,
    influentialCitationCount: metadata.influentialCitationCount,
    openAlexId: metadata.openAlexId,
    semanticScholarId: metadata.semanticScholarId,
    fieldsOfStudy: metadata.fieldsOfStudy,
    abstract: metadata.abstract,
    impactFactor: metadata.impactFactor ?? null,
    fiveYearImpactFactor: metadata.fiveYearImpactFactor ?? null,
    jci: metadata.jci ?? null,
    jcrQuartile: metadata.jcrQuartile ?? null,
    casQuartile: metadata.casQuartile ?? null,
    easyScholarQueryTried: metadata.easyScholarQueryTried,
    easyScholarQueryMatched: metadata.easyScholarQueryMatched,
    easyScholarRanks: metadata.easyScholarRanks,
    citeScore: metadata.citeScore,
    sjr: metadata.sjr,
    ...createCitationFormats(metadata)
  });
}

function detectPaperMetadata(markdown: string, title: string): PaperMetadata {
  // 只扫描标题页附近内容，避免正文引用、参考文献中的 DOI/年份被误判为论文自身信息。
  const plainLines = markdown
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const firstHeadingIndex = plainLines.findIndex((line) => /^#{1,6}\s+/.test(line));
  const frontMatterLines = plainLines.slice(Math.max(firstHeadingIndex, 0) + 1, Math.max(firstHeadingIndex, 0) + 8);
  const authors = detectAuthors(frontMatterLines);
  const abstract = detectAbstract(markdown);
  const keywords = detectKeywords(markdown);
  const titlePageMarkdown = getTitlePageMarkdown(markdown);
  const doi = matchFirst(titlePageMarkdown, /\b(?:doi:?\s*)?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i);
  const arxivId = matchFirst(titlePageMarkdown, /\barXiv:?\s*([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?|[a-z-]+\/[0-9]{7}(?:v[0-9]+)?)\b/i);
  const year = detectYear(markdown, doi, arxivId);

  return {
    title,
    authors,
    year,
    doi,
    arxivId,
    abstract,
    keywords
  };
}

function createEmptyPaperMetadata(title: string): PaperMetadata {
  return {
    title,
    authors: [],
    keywords: []
  };
}

function detectAuthors(lines: string[]): string[] {
  // 作者行通常紧跟标题，优先识别逗号/and/中文顿号分隔的紧凑名单。
  const candidate = lines.find((line) => {
    if (/^(abstract|keywords?|doi|arxiv)\b/i.test(line)) {
      return false;
    }

    return (/[,;]|\band\b|，|、/.test(line) || looksLikeCompactAuthorLine(line)) && !/[.!?。！？]$/.test(line);
  });

  if (!candidate) {
    return [];
  }

  const separatedAuthors = candidate
    .replace(/\[[^\]]+]/g, '')
    .replace(/\([^)]*\)/g, '')
    .split(/\s*(?:,|;|，|、|\band\b)\s*/i)
    .map((author) => author.replace(/\d+/g, '').trim())
    .filter((author) => author.length > 1)
    .slice(0, 30);

  if (separatedAuthors.length > 1) {
    return separatedAuthors;
  }

  return splitCompactAuthorLine(candidate);
}

function looksLikeCompactAuthorLine(line: string): boolean {
  const tokens = normalizeNameTokens(line);

  return tokens.length >= 4
    && tokens.every((token) => /^[A-ZÀ-Þ][A-Za-zÀ-ÿ-]+$/.test(token));
}

function detectAbstract(markdown: string): string | undefined {
  const body = stripFrontmatter(markdown);
  const match = /(?:^|\n)#{1,6}\s*Abstract\s*\n([\s\S]*?)(?=\n#{1,6}\s+|\n\s*(?:Keywords?|Acknowledg|References)\b|$)/i.exec(body);
  const fallback = /(?:^|\n)\s*Abstract\s*[:：]\s*([\s\S]*?)(?=\n\s*(?:Keywords?|Acknowledg|References)\b|\n#{1,6}\s+|$)/i.exec(body);
  const value = match?.[1] ?? fallback?.[1];

  return normalizeMultiline(value);
}

function detectKeywords(markdown: string): string[] {
  const value = matchFirst(stripFrontmatter(markdown), /(?:^|\n)\s*Keywords?\s*[:：]\s*([^\n]+)/i);
  if (!value) {
    return [];
  }

  return value
    .split(/\s*(?:,|;|，|；|、)\s*/)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0)
    .slice(0, 30);
}

function detectYear(markdown: string, doi: string | undefined, arxivId: string | undefined): number | undefined {
  const currentYear = new Date().getFullYear() + 1;
  // 年份来源按 DOI/arXiv/标题页排序，越靠前越接近论文自身元数据。
  const doiYear = firstValidYear(doi, currentYear);
  if (doiYear) {
    return doiYear;
  }

  const arxivYear = firstValidYear(arxivId, currentYear);
  if (arxivYear) {
    return arxivYear;
  }

  const preAbstract = getTitlePageMarkdown(markdown);
  const titlePageYear = firstValidYear(preAbstract, currentYear);
  if (titlePageYear) {
    return titlePageYear;
  }

  return undefined;
}

function getTitlePageMarkdown(markdown: string): string {
  const body = stripFrontmatter(markdown);
  return body.split(/\n#{1,6}\s*Abstract\b/i)[0]?.slice(0, 4000) ?? body.slice(0, 4000);
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

function matchFirst(markdown: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(markdown);
  return match?.[1]?.trim();
}

function normalizeMultiline(value: string | undefined): string | undefined {
  const normalized = value
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized && normalized.length > 0 ? normalized : undefined;
}

function splitCompactAuthorLine(line: string): string[] {
  const tokens = normalizeNameTokens(line);

  if (tokens.length < 4) {
    return [];
  }

  const authors: string[] = [];
  for (let index = 0; index + 1 < tokens.length; index += 2) {
    authors.push(`${tokens[index]} ${tokens[index + 1]}`);
  }

  return authors.slice(0, 30);
}

function normalizeNameTokens(line: string): string[] {
  const rawTokens = line
    .replace(/[´`]/g, '')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((token) => token.replace(/[^A-Za-zÀ-ÿ-]/g, '').trim())
    .filter((token) => token.length > 0);
  const tokens: string[] = [];

  for (const token of rawTokens) {
    if (/^[a-zà-ÿ]$/.test(token) && tokens.length > 0) {
      tokens[tokens.length - 1] = `${tokens[tokens.length - 1]}${token}`;
      continue;
    }

    if (/^[A-ZÀ-Þ][A-Za-zÀ-ÿ-]+$/.test(token)) {
      tokens.push(token);
    }
  }

  return tokens;
}

function firstValidYear(value: string | undefined, currentYear: number): number | undefined {
  const years = Array.from((value ?? '').matchAll(/\b(19[8-9][0-9]|20[0-9]{2})\b/g)).map((match) => Number(match[1]));
  return years.find((year) => year >= 1980 && year <= currentYear);
}

function findOverride(input: {
  config: MetadataConfig;
  slug: string;
  pdfFileName: string;
}): PaperMetadataOverride | undefined {
  return input.config.overrides[input.slug] ?? input.config.overrides[input.pdfFileName];
}

function pruneEmptyValues(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }

      return value !== undefined && value !== '';
    })
  );
}
