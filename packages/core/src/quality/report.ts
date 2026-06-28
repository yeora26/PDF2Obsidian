import { dirname, join } from 'node:path';
import YAML from 'yaml';
import { pathExists, writeJsonFile } from '../storage/file-system.js';

export interface QualityReport {
  status: 'completed' | 'needs_review';
  warnings: string[];
  metrics: {
    originalHeadingCount: number;
    translatedHeadingCount: number;
    originalImageCount: number;
    translatedImageCount: number;
    missingImages: string[];
    translatedChunkCount: number;
    cacheHitCount: number;
    translationSkipped: boolean;
    detectedSourceLanguage: string;
    autoLinkedReferenceCount: number;
    discoveredReferenceAliasCount: number;
    metadataFieldCount: number;
    metadataSources: string[];
    metadataCacheHits: string[];
    readingAssetCount: number;
    readingAssetCacheHitCount: number;
  };
}

export async function createQualityReport(input: {
  originalNotePath: string;
  translatedNotePath: string;
  originalNote: string;
  translatedNote: string;
  translatedChunks: Array<{ cacheHit: boolean }>;
  translationSkipped: boolean;
  detectedSourceLanguage: string;
  autoLinkedReferenceCount: number;
  discoveredReferenceAliasCount: number;
  metadataFieldCount: number;
  metadataSources: string[];
  metadataWarnings: string[];
  metadataCacheHits: string[];
  readingAssets: Array<{
    cacheHit: boolean;
    warnings: string[];
  }>;
  reportPath: string;
}): Promise<QualityReport> {
  const warnings: string[] = [];
  // 质量报告不改变用户产物，只把结构差异和外部服务告警沉淀成机器可读 JSON。
  const originalHeadingCount = countHeadings(input.originalNote);
  const translatedHeadingCount = countHeadings(input.translatedNote);
  const originalImageRefs = extractImageRefs(input.originalNote);
  const translatedImageRefs = extractImageRefs(input.translatedNote);
  const missingImages = [
    ...(await findMissingImages(input.originalNotePath, originalImageRefs)),
    ...(await findMissingImages(input.translatedNotePath, translatedImageRefs))
  ];

  validateFrontmatter(input.originalNote, 'original', warnings);
  validateFrontmatter(input.translatedNote, 'translated', warnings);
  // metadata/reading 的 warning 统一汇入报告，UI 可以直接显示“需要检查”的原因。
  warnings.push(...input.metadataWarnings.map((warning) => `Metadata warning: ${warning}`));
  warnings.push(...input.readingAssets.flatMap((asset) => asset.warnings.map((warning) => `Reading asset warning: ${warning}`)));

  if (originalHeadingCount !== translatedHeadingCount) {
    warnings.push(`Heading count mismatch: original=${originalHeadingCount}, translated=${translatedHeadingCount}`);
  }

  if (originalImageRefs.length !== translatedImageRefs.length) {
    warnings.push(`Image count mismatch: original=${originalImageRefs.length}, translated=${translatedImageRefs.length}`);
  }

  if (missingImages.length > 0) {
    warnings.push(`Missing image files: ${missingImages.length}`);
  }

  const report: QualityReport = {
    status: warnings.length > 0 ? 'needs_review' : 'completed',
    warnings,
    metrics: {
      originalHeadingCount,
      translatedHeadingCount,
      originalImageCount: originalImageRefs.length,
      translatedImageCount: translatedImageRefs.length,
      missingImages,
      translatedChunkCount: input.translatedChunks.length,
      cacheHitCount: input.translatedChunks.filter((chunk) => chunk.cacheHit).length,
      translationSkipped: input.translationSkipped,
      detectedSourceLanguage: input.detectedSourceLanguage,
      autoLinkedReferenceCount: input.autoLinkedReferenceCount,
      discoveredReferenceAliasCount: input.discoveredReferenceAliasCount,
      metadataFieldCount: input.metadataFieldCount,
      metadataSources: input.metadataSources,
      metadataCacheHits: input.metadataCacheHits,
      readingAssetCount: input.readingAssets.length,
      readingAssetCacheHitCount: input.readingAssets.filter((asset) => asset.cacheHit).length
    }
  };

  await writeJsonFile(input.reportPath, report);
  return report;
}

function countHeadings(markdown: string): number {
  return markdown.split(/\r?\n/).filter((line) => /^#{1,6}\s+/.test(line.trim())).length;
}

function extractImageRefs(markdown: string): string[] {
  // 只检查本地图片，远程图片和 data URI 不属于当前导出目录的完整性范围。
  return Array.from(markdown.matchAll(/!\[[^\]]*]\(([^)]+)\)/g))
    .map((match) => match[1])
    .filter((path): path is string => Boolean(path))
    .filter((path) => !path.startsWith('http://') && !path.startsWith('https://') && !path.startsWith('data:'));
}

async function findMissingImages(notePath: string, refs: string[]): Promise<string[]> {
  const noteDir = dirname(notePath);
  const missing: string[] = [];

  for (const ref of refs) {
    const imagePath = join(noteDir, ref);
    if (!(await pathExists(imagePath))) {
      missing.push(imagePath);
    }
  }

  return missing;
}

function validateFrontmatter(markdown: string, label: string, warnings: string[]): void {
  const match = /^---\n([\s\S]*?)\n---/.exec(markdown);
  if (!match?.[1]) {
    warnings.push(`Missing ${label} frontmatter`);
    return;
  }

  try {
    YAML.parse(match[1]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Invalid ${label} frontmatter: ${message}`);
  }
}
