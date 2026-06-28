import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export type PdfSourceType = 'local' | 'arxiv' | 'doi' | 'url';

export interface ResolvedPdfSource {
  /** 下载到本地后的 PDF 文件绝对路径 */
  pdfPath: string;
  /** 输入源的类型 */
  sourceType: PdfSourceType;
  /** 提取到的 arXiv ID（仅 arxiv 类型） */
  arxivId?: string;
  /** 提取到的 DOI（仅 doi 类型） */
  doi?: string;
  /** 原始输入字符串 */
  originalInput: string;
}

/**
 * 将用户输入（本地路径、arXiv ID、DOI 或 PDF URL）解析为本地 PDF 文件路径。
 * 远程源会下载到 outputDir 目录中。
 */
export async function resolvePdfSource(input: string, outputDir: string): Promise<ResolvedPdfSource> {
  const trimmed = input.trim();

  // 本地文件路径
  if (!looksLikeRemoteSource(trimmed)) {
    const stats = await stat(trimmed);
    if (!stats.isFile()) {
      throw new Error(`路径不是文件：${trimmed}`);
    }
    return { pdfPath: trimmed, sourceType: 'local', originalInput: input };
  }

  await mkdir(outputDir, { recursive: true });

  // arXiv
  const arxivId = extractArxivId(trimmed);
  if (arxivId) {
    const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    const pdfPath = await downloadPdf(pdfUrl, outputDir, `${arxivId}.pdf`);
    return { pdfPath, sourceType: 'arxiv', arxivId, originalInput: input };
  }

  // DOI
  if (looksLikeDoi(trimmed)) {
    const pdfUrl = await resolveDoiToPdfUrl(trimmed);
    const safeName = sanitizeDoiFileName(trimmed);
    const pdfPath = await downloadPdf(pdfUrl, outputDir, safeName);
    return { pdfPath, sourceType: 'doi', doi: trimmed, originalInput: input };
  }

  // 直接 URL
  if (/^https?:\/\//i.test(trimmed)) {
    const fileName = extractFileNameFromUrl(trimmed);
    const pdfPath = await downloadPdf(trimmed, outputDir, fileName);
    return { pdfPath, sourceType: 'url', originalInput: input };
  }

  throw new Error(`无法识别的输入源：${trimmed}。支持本地 PDF 路径、arXiv ID、DOI 或 PDF URL。`);
}

// ─── 内部工具 ───────────────────────────────────────────────

function looksLikeRemoteSource(value: string): boolean {
  return /^https?:\/\//i.test(value)
    || /^arxiv[:.]?\s*\d{4}\.\d{4,}/i.test(value)
    || /^\d{4}\.\d{4,}(v\d+)?$/.test(value)
    || /^10\.\d{4,}\//.test(value);
}

function extractArxivId(value: string): string | undefined {
  // "arXiv:2301.12345" / "arxiv:2301.12345v2" / "2301.12345" / "2301.12345v2"
  const prefixed = /^arxiv[:.\s]*(\d{4}\.\d{4,}(?:v\d+)?)/i.exec(value);
  if (prefixed?.[1]) return prefixed[1];

  if (/^\d{4}\.\d{4,}(v\d+)?$/.test(value)) return value;

  // URL form: https://arxiv.org/abs/2301.12345 or /pdf/2301.12345
  const urlForm = /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,}(?:v\d+)?)/i.exec(value);
  return urlForm?.[1];
}

function looksLikeDoi(value: string): boolean {
  return /^10\.\d{4,}\/[^\s]+$/.test(value);
}

async function resolveDoiToPdfUrl(doi: string): Promise<string> {
  // 优先通过 Crossref API 获取 PDF 链接（link 字段通常指向 PDF）
  try {
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { 'User-Agent': 'PDF2Obsidian/0.1 (mailto:pdf2obsidian@example.com)' }
    });
    if (response.ok) {
      const data = await response.json() as {
        message?: { link?: Array<{ URL: string; 'content-type'?: string }> };
      };
      const links = data.message?.link ?? [];
      const pdfLink = links.find((link) => link['content-type']?.includes('pdf')) ?? links[0];
      if (pdfLink?.URL) return pdfLink.URL;
    }
  } catch {
    // Crossref 查询失败，退回到 DOI 重定向
  }

  // 退回到 doi.org 重定向，跟随到最终页面
  return `https://doi.org/${doi}`;
}

function sanitizeDoiFileName(doi: string): string {
  return doi.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) + '.pdf';
}

function extractFileNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const name = basename(pathname);
    if (name.toLowerCase().endsWith('.pdf') && name.length > 4) return name;
  } catch {
    // URL 解析失败
  }
  return `download-${randomUUID().slice(0, 8)}.pdf`;
}

async function downloadPdf(url: string, outputDir: string, fileName: string): Promise<string> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`下载失败 (${response.status} ${response.statusText}): ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 检查 PDF 魔数（%PDF-）
  const header = buffer.subarray(0, 5).toString('ascii');
  if (!header.startsWith('%PDF-')) {
    throw new Error(`下载的内容不是有效的 PDF 文件：${url}`);
  }

  const outputPath = join(outputDir, fileName);
  await writeFile(outputPath, buffer);
  return outputPath;
}
