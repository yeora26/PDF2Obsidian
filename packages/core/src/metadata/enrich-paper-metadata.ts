import { join } from 'node:path';
import type { EasyScholarConfig, MetadataConfig, OnlineMetadataConfig, PaperMetadata } from '../config/types.js';
import { ensureDirectory, pathExists, readTextFile, writeJsonFile } from '../storage/file-system.js';
import { sha256Text } from '../utils/hash.js';
import { getStoredJournalMetrics, upsertJournalMetrics } from './journal-metrics-store.js';

type MetadataPatch = {
  [Key in keyof PaperMetadata]?: PaperMetadata[Key] | undefined;
};

export interface MetadataEnrichmentResult {
  metadata: PaperMetadata;
  sources: string[];
  warnings: string[];
  cacheHits: string[];
}

interface CrossrefWork {
  title?: string[];
  author?: Array<{ given?: string; family?: string; name?: string }>;
  issued?: { 'date-parts'?: number[][] };
  published?: { 'date-parts'?: number[][] };
  'container-title'?: string[];
  publisher?: string;
  volume?: string;
  issue?: string;
  page?: string;
  DOI?: string;
  URL?: string;
  abstract?: string;
  subject?: string[];
}

interface OpenAlexWork {
  id?: string;
  doi?: string;
  title?: string;
  publication_year?: number;
  cited_by_count?: number;
  primary_location?: {
    landing_page_url?: string;
    source?: {
      display_name?: string;
      host_organization_name?: string;
    };
  };
  open_access?: {
    oa_url?: string;
  };
  authorships?: Array<{
    author?: {
      display_name?: string;
    };
  }>;
  concepts?: Array<{
    display_name?: string;
  }>;
}

interface EasyScholarResponse {
  code?: number;
  msg?: string;
  data?: {
    officialRank?: {
      all?: Record<string, string>;
      select?: Record<string, string>;
    };
  } | null;
}

export async function enrichPaperMetadata(input: {
  metadata: PaperMetadata;
  config: MetadataConfig;
}): Promise<MetadataEnrichmentResult> {
  const warnings: string[] = [];
  const sources: string[] = [];
  const cacheHits: string[] = [];
  let metadata = input.metadata;

  if (input.config.online.enabled) {
    // Crossref/OpenAlex 逐个补全字段；单个来源失败只降级为 warning，不能阻断论文导入。
    for (const provider of input.config.online.providers) {
      try {
        const result = await fetchProviderMetadata(provider, metadata, input.config.online);
        if (result.cacheHit) {
          cacheHits.push(provider);
        }

        if (result.metadata) {
          metadata = mergeOnlineMetadata(metadata, result.metadata);
          sources.push(provider);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`${provider}: ${message}`);
      }
    }
  }

  const metrics = await readJournalMetrics(metadata, input.config.journalMetrics);
  if (metrics) {
    // 本地期刊指标库优先，避免 EasyScholar 额度消耗，也让离线场景可用。
    metadata = mergeMetadata(metadata, metrics);
    sources.push('journalMetricsDb');
  }

  try {
    const easyScholarMetrics = await fetchEasyScholarMetrics(metadata, input.config.journalMetrics);
    if (easyScholarMetrics.metadata) {
      metadata = mergeMetadata(metadata, easyScholarMetrics.metadata);
      sources.push('easyScholar');
      if (easyScholarMetrics.cacheHit) {
        cacheHits.push('easyScholar');
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`easyScholar: ${message}`);
  }

  return {
    metadata,
    sources,
    warnings,
    cacheHits
  };
}

export function mergeMetadata(base: PaperMetadata, next: MetadataPatch): PaperMetadata {
  // 本地解析出的 title/authors/keywords 优先保留，在线来源主要用于补 DOI、年份、期刊和指标。
  return {
    ...base,
    ...pruneEmptyValues(next),
    title: next.title || base.title || '',
    aliases: base.aliases ?? next.aliases,
    authors: base.authors.length > 0 ? base.authors : mergeStringArrays(base.authors, next.authors),
    keywords: base.keywords.length > 0 ? base.keywords : mergeStringArrays(base.keywords, next.keywords)
  };
}

function mergeOnlineMetadata(base: PaperMetadata, next: MetadataPatch): PaperMetadata {
  // 在线元数据只填补空缺字段；引用量和指标类字段使用更新来源覆盖。
  return {
    ...base,
    year: base.year ?? next.year,
    venue: base.venue ?? next.venue,
    journal: base.journal ?? next.journal,
    publisher: base.publisher ?? next.publisher,
    volume: base.volume ?? next.volume,
    issue: base.issue ?? next.issue,
    pages: base.pages ?? next.pages,
    doi: base.doi ?? next.doi,
    arxivId: base.arxivId ?? next.arxivId,
    abstract: base.abstract ?? next.abstract,
    url: base.url ?? next.url,
    openAccessUrl: base.openAccessUrl ?? next.openAccessUrl,
    citationCount: next.citationCount ?? base.citationCount,
    influentialCitationCount: next.influentialCitationCount ?? base.influentialCitationCount,
    openAlexId: next.openAlexId ?? base.openAlexId,
    semanticScholarId: next.semanticScholarId ?? base.semanticScholarId,
    fieldsOfStudy: base.fieldsOfStudy ?? next.fieldsOfStudy,
    impactFactor: next.impactFactor ?? base.impactFactor,
    fiveYearImpactFactor: next.fiveYearImpactFactor ?? base.fiveYearImpactFactor,
    jci: next.jci ?? base.jci,
    jcrQuartile: next.jcrQuartile ?? base.jcrQuartile,
    casQuartile: next.casQuartile ?? base.casQuartile,
    easyScholarQueryTried: next.easyScholarQueryTried ?? base.easyScholarQueryTried,
    easyScholarQueryMatched: next.easyScholarQueryMatched ?? base.easyScholarQueryMatched,
    easyScholarRanks: next.easyScholarRanks ?? base.easyScholarRanks,
    citeScore: next.citeScore ?? base.citeScore,
    sjr: next.sjr ?? base.sjr,
    aliases: base.aliases ?? next.aliases,
    authors: base.authors.length > 0 ? base.authors : mergeStringArrays(base.authors, next.authors),
    keywords: base.keywords.length > 0 ? base.keywords : mergeStringArrays(base.keywords, next.keywords)
  };
}

async function fetchProviderMetadata(
  provider: OnlineMetadataConfig['providers'][number],
  metadata: PaperMetadata,
  config: OnlineMetadataConfig
): Promise<{ metadata: MetadataPatch | undefined; cacheHit: boolean }> {
  const cacheKey = sha256Text(`${provider}:${metadata.doi ?? metadata.title}`);
  const cachePath = join(config.cacheDir, `${provider}-${cacheKey.slice(0, 24)}.json`);
  await ensureDirectory(config.cacheDir);

  if (await pathExists(cachePath)) {
    const cached = JSON.parse(await readTextFile(cachePath)) as MetadataPatch | null;
    return {
      metadata: cached ?? undefined,
      cacheHit: true
    };
  }

  const fetched = await fetchFreshProviderMetadata(provider, metadata, config);
  // 标题相似度太低时认为命中了错误论文，缓存 null 防止后续重复请求同一错误结果。
  const checked = isCompatibleMetadata(metadata, fetched) ? fetched : undefined;
  await writeJsonFile(cachePath, checked ?? null);
  return {
    metadata: checked,
    cacheHit: false
  };
}

async function fetchFreshProviderMetadata(
  provider: OnlineMetadataConfig['providers'][number],
  metadata: PaperMetadata,
  config: OnlineMetadataConfig
): Promise<MetadataPatch | undefined> {
  if (provider === 'crossref') {
    return fetchCrossref(metadata, config);
  }

  if (provider === 'openalex') {
    return fetchOpenAlex(metadata, config);
  }

  return undefined;
}

async function fetchCrossref(metadata: PaperMetadata, config: OnlineMetadataConfig): Promise<MetadataPatch | undefined> {
  // DOI 查询精度最高；没有 DOI 时只按标题取第一条候选，并在外层做兼容性校验。
  const baseUrl = metadata.doi
    ? `https://api.crossref.org/works/${encodeURIComponent(metadata.doi)}`
    : `https://api.crossref.org/works?rows=1&query.title=${encodeURIComponent(metadata.title)}`;
  const url = withMailto(baseUrl, config.email);
  const data = await fetchJson<{ message?: CrossrefWork | { items?: CrossrefWork[] } }>(url, config.timeoutMs);
  const message = data.message;
  const work = isCrossrefSearchMessage(message) ? message.items?.[0] : message;
  if (!work || isCrossrefSearchMessage(work)) {
    return undefined;
  }

  const year = extractCrossrefYear(work);
  return pruneEmptyValues({
    title: work.title?.[0],
    authors: work.author?.map((author) => formatCrossrefAuthor(author)).filter((author): author is string => Boolean(author)),
    year,
    journal: work['container-title']?.[0],
    publisher: work.publisher,
    volume: work.volume,
    issue: work.issue,
    pages: work.page,
    doi: work.DOI,
    url: work.URL,
    abstract: stripXml(work.abstract),
    keywords: work.subject
  });
}

async function fetchOpenAlex(metadata: PaperMetadata, config: OnlineMetadataConfig): Promise<MetadataPatch | undefined> {
  const filter = metadata.doi ? `filter=doi:${encodeURIComponent(metadata.doi)}` : `search=${encodeURIComponent(metadata.title)}`;
  const url = `https://api.openalex.org/works?${filter}&per-page=1${config.email ? `&mailto=${encodeURIComponent(config.email)}` : ''}`;
  const data = await fetchJson<{ results?: OpenAlexWork[] }>(url, config.timeoutMs);
  const work = data.results?.[0];
  if (!work) {
    return undefined;
  }

  return pruneEmptyValues({
    title: work.title,
    authors: work.authorships?.map((authorship) => authorship.author?.display_name).filter((author): author is string => Boolean(author)),
    year: work.publication_year,
    journal: work.primary_location?.source?.display_name,
    publisher: work.primary_location?.source?.host_organization_name,
    doi: normalizeDoi(work.doi),
    url: work.primary_location?.landing_page_url,
    openAccessUrl: work.open_access?.oa_url,
    citationCount: work.cited_by_count,
    openAlexId: work.id,
    keywords: work.concepts?.map((concept) => concept.display_name).filter((concept): concept is string => Boolean(concept))
  });
}

async function fetchJson<T>(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<T> {
  // 所有外部元数据请求统一走超时控制，避免单个网络调用拖住整条导入流水线。
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const init: RequestInit = { signal: controller.signal };
    if (headers) {
      init.headers = headers;
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJournalMetrics(
  metadata: PaperMetadata,
  config: MetadataConfig['journalMetrics']
): Promise<MetadataPatch | undefined> {
  const publicationNames = createEasyScholarCandidates(metadata);
  // journal 与 venue 都可能承载期刊/会议名称，逐个查本地缓存并记录实际匹配项。
  for (const publicationName of publicationNames) {
    const stored = await getStoredJournalMetrics(config, publicationName);
    if (stored?.status === 'found' && stored.metadata) {
      return {
        ...stored.metadata,
        easyScholarQueryTried: publicationNames,
        easyScholarQueryMatched: stored.metadata.easyScholarQueryMatched ?? stored.publicationName
      };
    }
  }

  return undefined;
}

async function fetchEasyScholarMetrics(
  metadata: PaperMetadata,
  config: MetadataConfig['journalMetrics']
): Promise<{ metadata: MetadataPatch | undefined; cacheHit: boolean }> {
  if (!config.easyScholar.enabled) {
    return {
      metadata: undefined,
      cacheHit: false
    };
  }

  const secretKey = config.easyScholar.secretKey ?? (config.easyScholar.secretKeyEnv ? process.env[config.easyScholar.secretKeyEnv] : undefined);
  if (!secretKey) {
    throw new Error(`Missing ${config.easyScholar.secretKeyEnv ?? 'EasyScholar secretKey'} environment variable`);
  }

  // EasyScholar 只查询期刊/会议名；publisher 或论文标题会浪费额度且几乎没有有效命中。
  const publicationNames = createEasyScholarCandidates(metadata);
  let sawDatabaseHit = false;
  const missingNames: string[] = [];

  for (const publicationName of publicationNames) {
    const stored = await getStoredJournalMetrics(config, publicationName);
    if (stored) {
      sawDatabaseHit = true;
      if (stored.status === 'found' && stored.metadata) {
        return {
          metadata: {
            easyScholarQueryTried: publicationNames,
            ...stored.metadata,
            easyScholarQueryMatched: stored.metadata.easyScholarQueryMatched ?? stored.publicationName
          },
          cacheHit: true
        };
      }
      continue;
    }

    missingNames.push(publicationName);
  }

  for (const publicationName of missingNames) {
    const url = new URL(config.easyScholar.baseUrl);
    url.searchParams.set('secretKey', secretKey);
    url.searchParams.set('publicationName', publicationName);

    const data = await fetchJson<EasyScholarResponse>(url.toString(), config.easyScholar.timeoutMs);
    if (data.code !== 200 || !data.data) {
      await upsertJournalMetrics(config, publicationName, undefined);
      continue;
    }

    const metrics = parseEasyScholarMetrics(data.data.officialRank?.all ?? {}, publicationName);
    await upsertJournalMetrics(config, publicationName, metrics);
    if (metrics) {
      return {
        metadata: {
          easyScholarQueryTried: publicationNames,
          ...metrics
        },
        cacheHit: sawDatabaseHit
      };
    }
  }

  return {
    metadata: {
      easyScholarQueryTried: publicationNames
    },
    cacheHit: sawDatabaseHit
  };
}

function createEasyScholarCandidates(metadata: PaperMetadata): string[] {
  return Array.from(new Set([
    metadata.journal,
    metadata.venue
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim())
    .filter((value) => value.length > 0)));
}

function parseEasyScholarMetrics(ranks: Record<string, string>, publicationName: string): MetadataPatch | undefined {
  const metrics = pruneEmptyValues({
    impactFactor: parseNumber(ranks.sciif),
    fiveYearImpactFactor: parseNumber(ranks.sciif5),
    jci: parseNumber(ranks.jci),
    jcrQuartile: normalizeQuartile(ranks.sci ?? ranks.ssci),
    casQuartile: ranks.sciUp ?? ranks.sciBase,
    easyScholarQueryMatched: publicationName,
    easyScholarRanks: Object.keys(ranks).length > 0 ? ranks : undefined
  });

  return Object.keys(metrics).length > 0 ? metrics : undefined;
}

function isCrossrefSearchMessage(value: unknown): value is { items?: CrossrefWork[] } {
  return typeof value === 'object' && value !== null && 'items' in value;
}

function withMailto(url: string, email: string | undefined): string {
  if (!email) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}mailto=${encodeURIComponent(email)}`;
}

function extractCrossrefYear(work: CrossrefWork): number | undefined {
  return work.published?.['date-parts']?.[0]?.[0] ?? work.issued?.['date-parts']?.[0]?.[0];
}

function formatCrossrefAuthor(author: { given?: string; family?: string; name?: string }): string | undefined {
  if (author.name) {
    return author.name;
  }

  return [author.given, author.family].filter(Boolean).join(' ') || undefined;
}

function stripXml(value: string | undefined): string | undefined {
  return value?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeDoi(value: string | undefined): string | undefined {
  return value?.replace(/^https?:\/\/doi\.org\//i, '');
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeQuartile(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const upper = value.toLocaleUpperCase();
  return /^Q[1-4]$/.test(upper) ? upper : value;
}

function isCompatibleMetadata(base: PaperMetadata, next: MetadataPatch | undefined): boolean {
  if (!next?.title || !base.title) {
    return true;
  }

  // 标题相似度阈值偏保守，宁可少补字段，也不要把另一篇论文的 DOI/作者写进笔记。
  return calculateTitleSimilarity(base.title, next.title) >= 0.45;
}

function calculateTitleSimilarity(left: string, right: string): number {
  const leftWords = normalizeTitleWords(left);
  const rightWords = normalizeTitleWords(right);
  if (leftWords.size === 0 || rightWords.size === 0) {
    return 0;
  }

  const intersection = Array.from(leftWords).filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size;
  return intersection / union;
}

function normalizeTitleWords(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
}

function mergeStringArrays(base: string[] | undefined, next: string[] | undefined): string[] {
  return Array.from(new Set([...(base ?? []), ...(next ?? [])].filter((value) => value.length > 0)));
}

function pruneEmptyValues<T extends Record<string, unknown>>(values: T): MetadataPatch {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }

      return value !== undefined && value !== null && value !== '';
    })
  ) as MetadataPatch;
}
