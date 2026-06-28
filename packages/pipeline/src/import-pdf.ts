import { stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { AppConfig } from '@pdf2obsidian/core';
import { autoLinkMarkdown, createReferenceStubs, discoverReferenceAliases, exportNotes, exportObsidianDatabase, extractStructuredReferences, extractWikiLinksFromMarkdown } from '@pdf2obsidian/core';
import { copyDirectory, copyFileTo, deleteDirectory, deleteFileIfExists, ensureDirectory, findPrimaryMarkdown, pathExists, readTextFile, runMineru, writeJsonFile } from '@pdf2obsidian/core';
import { createFrontmatter, detectMarkdownLanguage, extractFirstHeading, rewriteMarkdownAssetLinks, sha256File, toSlug } from '@pdf2obsidian/core';
import { translateMarkdownInChunks, type TranslateMarkdownResult } from '@pdf2obsidian/core';
import { createQualityReport } from '@pdf2obsidian/core';
import { applyPaperMetadataOverride, createPaperFrontmatter, enrichPaperMetadata, extractPaperMetadata } from '@pdf2obsidian/core';
import { generateReadingAssets, type ReadingAssetResult } from '@pdf2obsidian/core';

export interface ImportPdfInput {
  pdfPath: string;
  config: AppConfig;
  onStep?: ImportPipelineStepCallback | undefined;
  /** 已完成阶段集合，用于断点续跑时跳过已成功的阶段 */
  completedSteps?: Set<ImportPipelineStep> | undefined;
}

export type ImportPipelineStep = 'upload' | 'mineru' | 'normalize' | 'translate' | 'obsidian_export' | 'quality_check';
export type ImportPipelineStepStatus = 'running' | 'completed' | 'failed' | 'skipped';
export type ImportPipelineStepCallback = (event: {
  step: ImportPipelineStep;
  status: ImportPipelineStepStatus;
  message?: string | undefined;
}) => Promise<void> | void;

export const importPipelineSteps = [
  'upload',
  'mineru',
  'normalize',
  'translate',
  'obsidian_export',
  'quality_check'
] as const satisfies readonly ImportPipelineStep[];

export interface ImportPdfResult {
  sourceHash: string;
  slug: string;
  originalNotePath: string;
  translatedNotePath: string;
  indexNotePath: string;
  databaseNotePath?: string | undefined;
  referenceStubCount?: number | undefined;
  configSummary?: {
    mineruMode: string;
    mineruBackend: string;
    translationEnabled: boolean;
    translationSkipped: boolean;
    translationProvider?: string;
    translationModel?: string;
    readingAssetsEnabled: boolean;
  } | undefined;
}

export async function importPdf(input: ImportPdfInput): Promise<ImportPdfResult> {
  const resume = input.completedSteps ?? new Set<ImportPipelineStep>();

  // ── upload ────────────────────────────────────────────────────
  await notifyStep(input, 'upload', 'running');
  const sourceStats = await stat(input.pdfPath);
  if (!sourceStats.isFile()) {
    throw new Error(`PDF path is not a file: ${input.pdfPath}`);
  }

  const sourceHash = await sha256File(input.pdfPath);
  await notifyStep(input, 'upload', 'completed');

  const baseName = basename(input.pdfPath, '.pdf');
  const sourceSlug = toSlug(baseName);
  const hashSlug = sourceHash.replace(/[^a-zA-Z0-9]+/g, '-');
  const runId = `${sourceSlug.slice(0, 15)}-${hashSlug.slice(0, 16)}`;
  const mineruOutputRoot = join(input.config.mineru.outputDir, runId);
  await ensureDirectory(mineruOutputRoot);

  // ── mineru ────────────────────────────────────────────────────
  if (resume.has('mineru')) {
    await notifyStep(input, 'mineru', 'skipped', '断点续跑：已有解析产物');
  } else {
    const safePdfPath = join(mineruOutputRoot, 'document.pdf');
    await copyFileTo(input.pdfPath, safePdfPath);

    await notifyStep(input, 'mineru', 'running');
    try {
      await runMineru({
        pdfPath: safePdfPath,
        outputDir: mineruOutputRoot,
        command: input.config.mineru.command,
        mode: input.config.mineru.mode,
        backend: input.config.mineru.backend,
        method: input.config.mineru.method,
        apiUrl: input.config.mineru.apiUrl,
        apiTokenEnv: input.config.mineru.apiTokenEnv,
        modelVersion: input.config.mineru.modelVersion,
        modelSource: input.config.mineru.modelSource,
        formula: input.config.mineru.formula,
        table: input.config.mineru.table,
        imageAnalysis: input.config.mineru.imageAnalysis
      });
    } finally {
      await deleteFileIfExists(safePdfPath);
    }
    await notifyStep(input, 'mineru', 'completed');
  }

  // ── normalize ─────────────────────────────────────────────────
  // normalize 始终需要运行以定位产物路径（slug 依赖解析结果），但 resume 时可跳过文件复制。
  await notifyStep(input, 'normalize', 'running');
  const primaryMarkdownPath = await findPrimaryMarkdown(mineruOutputRoot, 'document');
  const originalMarkdown = await readTextFile(primaryMarkdownPath);
  const originalTitle = extractFirstHeading(originalMarkdown) ?? baseName;
  const slug = toSlug(originalTitle) || sourceSlug;

  const documentRoot = join(input.config.vault.path, input.config.vault.documentDir, slug);

  if (resume.has('normalize')) {
    await notifyStep(input, 'normalize', 'skipped', '断点续跑：已有规范化产物');
  } else {
    await deleteDirectory(documentRoot);
    const mineruDocumentRoot = dirname(primaryMarkdownPath);
    const mineruImagesRoot = join(mineruDocumentRoot, 'images');
    const documentImagesRoot = join(documentRoot, input.config.vault.imageDirName);
    await ensureDirectory(documentRoot);
    if (await pathExists(mineruImagesRoot)) {
      await copyDirectory(mineruImagesRoot, documentImagesRoot);
    }
    await notifyStep(input, 'normalize', 'completed');
  }

  const linkedOriginalMarkdown = rewriteMarkdownAssetLinks({
    markdown: originalMarkdown,
    noteDirRelativeToVaultRoot: join(input.config.vault.documentDir, slug),
    noteFileName: `${slug}.original.md`,
    assetRootFromVault: join(input.config.vault.documentDir, slug, input.config.vault.imageDirName)
  });

  // ── translate ─────────────────────────────────────────────────
  const languageDetection = detectMarkdownLanguage(linkedOriginalMarkdown);
  const translationSkipped = languageDetection.language === 'zh-CN' || input.config.translation.enabled === false;

  let translated: TranslateMarkdownResult;
  if (resume.has('translate')) {
    await notifyStep(input, 'translate', 'skipped', '断点续跑：已有翻译产物');
    // 从已有译文文件恢复
    const existingTranslatedPath = join(documentRoot, `${slug}.zh.md`);
    if (await pathExists(existingTranslatedPath)) {
      const existingContent = await readTextFile(existingTranslatedPath);
      // 去掉 frontmatter 获取正文
      const bodyMatch = /^---\n[\s\S]*?\n---\n?/.exec(existingContent);
      translated = { markdown: bodyMatch ? existingContent.slice(bodyMatch[0].length) : existingContent, chunks: [] };
    } else {
      translated = { markdown: linkedOriginalMarkdown, chunks: [] };
    }
  } else {
    await notifyStep(input, 'translate', translationSkipped ? 'skipped' : 'running');
    translated = translationSkipped
      ? { markdown: linkedOriginalMarkdown, chunks: [] }
      : await translateMarkdownInChunks({
        markdown: linkedOriginalMarkdown,
        title: originalTitle,
        config: input.config.translation
      });
    if (!translationSkipped) {
      await notifyStep(input, 'translate', 'completed');
    }
  }

  const excludeTargets = [
    join(input.config.vault.documentDir, slug, `${slug}.original`),
    join(input.config.vault.documentDir, slug, `${slug}.zh`),
    join(input.config.vault.documentDir, slug, `${slug}.index`)
  ];

  const referenceAliasDiscovery = await discoverReferenceAliases({
    markdown: [linkedOriginalMarkdown, translated.markdown].join('\n\n'),
    vaultPath: input.config.vault.path,
    config: input.config.obsidian.autoLink,
    excludeTargets
  });
  const autoLinked = await autoLinkMarkdown({
    markdown: translated.markdown,
    vaultPath: input.config.vault.path,
    config: input.config.obsidian.autoLink,
    excludeTargets
  });
  const translatedBody = autoLinked.markdown;
  const translatedTitle = translationSkipped
    ? originalTitle
    : extractFirstHeading(translatedBody) ?? `${originalTitle} 中文翻译`;

  const detectedPaperMetadata = extractPaperMetadata({
    markdown: linkedOriginalMarkdown,
    title: originalTitle,
    slug,
    pdfPath: input.pdfPath,
    config: input.config.metadata
  });
  const enriched = await enrichPaperMetadata({
    metadata: detectedPaperMetadata,
    config: input.config.metadata
  });
  const paperMetadata = applyPaperMetadataOverride({
    metadata: enriched.metadata,
    slug,
    pdfPath: input.pdfPath,
    config: input.config.metadata
  });
  const paperMetadataForNotes = {
    ...paperMetadata,
    translatedTitle,
    metadataSources: enriched.sources
  };
  const paperFrontmatter = createPaperFrontmatter(paperMetadataForNotes);

  const createdAt = new Date().toISOString();
  const originalNote = createFrontmatter({
    title: originalTitle,
    ...paperFrontmatter,
    lang: languageDetection.language,
    sourceHash,
    sourcePdf: `./${basename(input.pdfPath)}`,
    translatedNote: translationSkipped ? undefined : `[[${slug}.zh]]`,
    indexNote: `[[${slug}.index]]`,
    createdAt,
    translationProvider: input.config.translation.provider,
    translationModel: input.config.translation.model,
    detectedSourceLanguage: languageDetection.language,
    translationSkipped
  }, linkedOriginalMarkdown);

  const translatedNote = createFrontmatter({
    title: translatedTitle,
    ...paperFrontmatter,
    lang: 'zh-CN',
    sourceHash,
    originalNote: `[[${slug}.original]]`,
    indexNote: `[[${slug}.index]]`,
    createdAt,
    translationProvider: input.config.translation.provider,
    translationModel: input.config.translation.model,
    detectedSourceLanguage: languageDetection.language,
    translationSkipped
  }, translatedBody);
  const actualLinkedReferences = extractWikiLinksFromMarkdown({
    markdown: [originalNote, translatedNote].join('\n\n'),
    excludeTargets
  });

  const readingAssets = await generateReadingAssets({
    slug,
    title: originalTitle,
    translatedTitle,
    originalMarkdown: linkedOriginalMarkdown,
    translatedMarkdown: translatedBody,
    documentRoot,
    translationConfig: input.config.translation,
    config: input.config.readingAssets,
    sourceHash,
    createdAt
  });

  const indexBody = [
    `# ${translatedTitle}`,
    '',
    `- 原文：[[${slug}.original]]`,
    `- ${translationSkipped ? '中文原文' : '译文'}：[[${slug}.zh]]`,
    `- 来源 PDF：[${basename(input.pdfPath)}](./${basename(input.pdfPath)})`,
    `- 语言检测：${formatDetectedLanguage(languageDetection.language)}${translationSkipped ? '，已跳过翻译' : ''}`,
    ...formatReadingAssetLinks(readingAssets),
    '',
    '## 元信息',
    '',
    ...formatMetadataList(paperMetadataForNotes),
    '',
    '## 自动关联',
    '',
    ...formatAutoLinkedReferences(actualLinkedReferences, referenceAliasDiscovery.discoveredCount)
  ].join('\n');

  const indexNote = createFrontmatter({
    title: translatedTitle,
    ...paperFrontmatter,
    type: 'index',
    sourceHash,
    createdAt
  }, indexBody);

  let exportedNotes: Awaited<ReturnType<typeof exportNotes>> | undefined;

  // ── obsidian_export ───────────────────────────────────────────
  if (resume.has('obsidian_export')) {
    await notifyStep(input, 'obsidian_export', 'skipped', '断点续跑：已有导出产物');
  } else {
    await notifyStep(input, 'obsidian_export', 'running');
    exportedNotes = await exportNotes({
      config: input.config,
      slug,
      pdfPath: input.pdfPath,
      originalNote,
      translatedNote,
      indexNote,
      documentRoot
    });

    // 结构化参考文献：提取并创建桩笔记
    const structuredRefs = extractStructuredReferences(
      [linkedOriginalMarkdown, translated.markdown].join('\n\n')
    );
    const stubResult = await createReferenceStubs({
      references: structuredRefs,
      citingPaperSlug: slug,
      citingPaperTitle: translatedTitle,
      vaultPath: input.config.vault.path,
      documentDir: join(input.config.vault.documentDir),
      excludeTargets
    });

    await notifyStep(input, 'obsidian_export', 'completed',
      stubResult.createdCount > 0
        ? `已创建 ${stubResult.createdCount} 个参考文献桩笔记`
        : undefined
    );
  }

  // ── quality_check ─────────────────────────────────────────────
  if (resume.has('quality_check')) {
    await notifyStep(input, 'quality_check', 'skipped', '断点续跑：已有质检报告');
  } else {
    await notifyStep(input, 'quality_check', 'running');
    await createQualityReport({
      originalNotePath: join(documentRoot, `${slug}.original.md`),
      translatedNotePath: join(documentRoot, `${slug}.zh.md`),
      originalNote,
      translatedNote,
      translatedChunks: translated.chunks,
      translationSkipped,
      detectedSourceLanguage: languageDetection.language,
      autoLinkedReferenceCount: actualLinkedReferences.length,
      discoveredReferenceAliasCount: referenceAliasDiscovery.discoveredCount,
      metadataFieldCount: Object.keys(paperFrontmatter).length,
      metadataSources: enriched.sources,
      metadataWarnings: enriched.warnings,
      metadataCacheHits: enriched.cacheHits,
      readingAssets,
      reportPath: join(documentRoot, input.config.quality.reportFileName)
    });
    await notifyStep(input, 'quality_check', 'completed');
  }

  const databaseNotePath = await exportObsidianDatabase(input.config);

  await writeJsonFile(join(mineruOutputRoot, 'import-result.json'), {
    sourceHash,
    slug,
    databaseNotePath
  });

  return {
    sourceHash,
    slug,
    originalNotePath: exportedNotes?.originalNotePath ?? join(documentRoot, `${slug}.original.md`),
    translatedNotePath: join(documentRoot, `${slug}.zh.md`),
    indexNotePath: join(documentRoot, `${slug}.index.md`),
    databaseNotePath,
    configSummary: {
      mineruMode: input.config.mineru.mode,
      mineruBackend: input.config.mineru.backend,
      translationEnabled: input.config.translation.enabled !== false,
      translationSkipped,
      translationProvider: input.config.translation.provider,
      translationModel: input.config.translation.model,
      readingAssetsEnabled: input.config.readingAssets.enabled
    }
  };
}

async function notifyStep(
  input: ImportPdfInput,
  step: ImportPipelineStep,
  status: ImportPipelineStepStatus,
  message?: string
): Promise<void> {
  await input.onStep?.({ step, status, message });
}

function formatMetadataList(metadata: ReturnType<typeof extractPaperMetadata>): string[] {
  const rows = [
    ['标题', metadata.title],
    ['元信息来源', metadata.metadataSources?.join(', ')],
    ['作者', metadata.authors.join(', ')],
    ['年份', metadata.year?.toString()],
    ['期刊/会议', metadata.journal ?? metadata.venue],
    ['出版社', metadata.publisher],
    ['卷', metadata.volume],
    ['期', metadata.issue],
    ['页码', metadata.pages],
    ['DOI', metadata.doi],
    ['arXiv', metadata.arxivId],
    ['URL', metadata.url],
    ['开放访问', metadata.openAccessUrl],
    ['引用数', metadata.citationCount?.toString()],
    ['OpenAlex', metadata.openAlexId],
    ['Semantic Scholar', metadata.semanticScholarId],
    ['研究领域', metadata.fieldsOfStudy?.join(', ')],
    ['关键词', metadata.keywords.join(', ')],
    ['影响因子', formatNullableMetadataValue(metadata.impactFactor)],
    ['五年影响因子', formatNullableMetadataValue(metadata.fiveYearImpactFactor)],
    ['JCI', formatNullableMetadataValue(metadata.jci)],
    ['JCR 分区', formatNullableMetadataValue(metadata.jcrQuartile)],
    ['中科院分区', formatNullableMetadataValue(metadata.casQuartile)],
    ['EasyScholar 查询', metadata.easyScholarQueryTried?.join(', ')],
    ['EasyScholar 命中', metadata.easyScholarQueryMatched]
  ];

  const lines = rows
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([label, value]) => `- ${label}：${value}`);

  return lines.length > 0 ? lines : ['- 暂未抽取到可用元信息'];
}

function formatNullableMetadataValue(value: number | string | undefined): string {
  return value === undefined || value === '' ? '未获取' : value.toString();
}

function formatDetectedLanguage(language: string): string {
  const labels: Record<string, string> = {
    'zh-CN': '中文',
    en: '英文',
    unknown: '未知'
  };

  return labels[language] ?? language;
}

function formatAutoLinkedReferences(links: Array<{ text: string; target: string }>, discoveredReferenceAliasCount: number): string[] {
  if (links.length === 0) {
    return discoveredReferenceAliasCount > 0
      ? [`- 发现引用别名：${discoveredReferenceAliasCount} 条`, '- 暂无正文链接']
      : ['- 暂无'];
  }

  return [
    ...(discoveredReferenceAliasCount > 0 ? [`- 发现引用别名：${discoveredReferenceAliasCount} 条`] : []),
    ...links.map((link) => `- [[${link.target}|${link.text}]]`)
  ];
}

function formatReadingAssetLinks(assets: ReadingAssetResult[]): string[] {
  if (assets.length === 0) {
    return [];
  }

  const labels: Record<ReadingAssetResult['kind'], string> = {
    summary: '摘要',
    terms: '术语表',
    qa: '问答'
  };

  return assets.map((asset) => {
    const noteName = basename(asset.path, '.md');
    return `- ${labels[asset.kind]}：[[${noteName}|${labels[asset.kind]}]]`;
  });
}
