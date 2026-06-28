export interface AppConfig {
  vault: VaultConfig;
  mineru: MineruConfig;
  translation: TranslationConfig;
  tasks: TaskConfig;
  readingAssets: ReadingAssetsConfig;
  quality: QualityConfig;
  obsidian: ObsidianConfig;
  metadata: MetadataConfig;
}

export interface VaultConfig {
  path: string;
  documentDir: string;
  imageDirName: string;
}

export interface MineruConfig {
  command: string;
  outputDir: string;
  mode: 'cli' | 'local' | 'official';
  backend: 'pipeline' | 'vlm-http-client' | 'hybrid-http-client' | 'vlm-auto-engine' | 'hybrid-auto-engine';
  method?: 'auto' | 'txt' | 'ocr' | undefined;
  apiUrl?: string | undefined;
  apiTokenEnv?: string | undefined;
  modelVersion?: 'pipeline' | 'vlm' | undefined;
  modelSource?: string | undefined;
  formula?: boolean | undefined;
  table?: boolean | undefined;
  imageAnalysis?: boolean | undefined;
  allowLocalMode?: boolean | undefined;
}

export interface TranslationConfig {
  enabled?: boolean | undefined;
  provider: TextGenerationProvider;
  preset?: AiServicePreset | undefined;
  model: string;
  baseUrl: string;
  apiKeyEnv?: string | undefined;
  apiKey?: string | undefined;
  systemPrompt: string;
  chunkCharLimit: number;
  cacheDir: string;
  maxRetries: number;
}

export type AiServicePreset = 'deepseek' | 'cloudflare' | 'openai' | 'openrouter' | 'custom';

export interface TaskConfig {
  stateDir: string;
  inboxDir: string;
  concurrency: number;
  watchPollIntervalMs: number;
}

export interface QualityConfig {
  reportFileName: string;
}

export interface ReadingAssetsConfig {
  enabled: boolean;
  cacheDir: string;
  summaryFileName: string;
  termsFileName: string;
  qaFileName: string;
  maxSourceChars: number;
  maxRetries: number;
  systemPrompt: string;
}

export interface ObsidianConfig {
  autoLink: AutoLinkConfig;
  database: ObsidianDatabaseConfig;
}

export interface AutoLinkConfig {
  enabled: boolean;
  scanDirs: string[];
  excludeDirs: string[];
  minAliasLength: number;
  maxLinksPerNote: number;
}

export interface ObsidianDatabaseConfig {
  enabled: boolean;
  fileName: string;
}

export interface MetadataConfig {
  enrichFromMarkdown: boolean;
  online: OnlineMetadataConfig;
  journalMetrics: JournalMetricsConfig;
  overrides: Record<string, PaperMetadataOverride>;
}

export interface OnlineMetadataConfig {
  enabled: boolean;
  providers: OnlineMetadataProvider[];
  timeoutMs: number;
  cacheDir: string;
  email?: string | undefined;
}

export type OnlineMetadataProvider = 'crossref' | 'openalex';

export interface JournalMetricsConfig {
  sqlite: JournalMetricsSqliteConfig;
  easyScholar: EasyScholarConfig;
}

export interface JournalMetricsSqliteConfig {
  path: string;
}

export interface EasyScholarConfig {
  enabled: boolean;
  baseUrl: string;
  secretKey?: string | undefined;
  secretKeyEnv?: string | undefined;
  timeoutMs: number;
}

export interface PaperMetadata {
  title: string;
  translatedTitle?: string | undefined;
  metadataSources?: string[] | undefined;
  aliases?: string[] | undefined;
  authors: string[];
  year?: number | undefined;
  venue?: string | undefined;
  journal?: string | undefined;
  publisher?: string | undefined;
  volume?: string | undefined;
  issue?: string | undefined;
  pages?: string | undefined;
  doi?: string | undefined;
  arxivId?: string | undefined;
  abstract?: string | undefined;
  keywords: string[];
  url?: string | undefined;
  openAccessUrl?: string | undefined;
  citationCount?: number | undefined;
  influentialCitationCount?: number | undefined;
  openAlexId?: string | undefined;
  semanticScholarId?: string | undefined;
  fieldsOfStudy?: string[] | undefined;
  impactFactor?: number | undefined;
  fiveYearImpactFactor?: number | undefined;
  jci?: number | undefined;
  jcrQuartile?: string | undefined;
  casQuartile?: string | undefined;
  easyScholarQueryTried?: string[] | undefined;
  easyScholarQueryMatched?: string | undefined;
  easyScholarRanks?: Record<string, string> | undefined;
  citeScore?: number | undefined;
  sjr?: number | undefined;
}

export type PaperMetadataOverride = Partial<Omit<PaperMetadata, 'title' | 'authors' | 'keywords'>> & {
  title?: string | undefined;
  authors?: string[] | undefined;
  keywords?: string[] | undefined;
};
import type { TextGenerationProvider } from '@pdf2obsidian/providers';
