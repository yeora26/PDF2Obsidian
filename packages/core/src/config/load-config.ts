import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { z } from 'zod';
import type { AppConfig } from './types.js';

// 论文元数据模式
const paperMetadataSchema = z.object({
  title: z.string().min(1).optional(),
  translatedTitle: z.string().min(1).optional(),
  metadataSources: z.array(z.string().min(1)).optional(),
  aliases: z.array(z.string().min(1)).optional(),
  authors: z.array(z.string().min(1)).optional(),
  year: z.number().int().positive().optional(),
  venue: z.string().min(1).optional(),
  journal: z.string().min(1).optional(),
  publisher: z.string().min(1).optional(),
  volume: z.string().min(1).optional(),
  issue: z.string().min(1).optional(),
  pages: z.string().min(1).optional(),
  doi: z.string().min(1).optional(),
  arxivId: z.string().min(1).optional(),
  abstract: z.string().min(1).optional(),
  keywords: z.array(z.string().min(1)).optional(),
  url: z.string().url().optional(),
  openAccessUrl: z.string().url().optional(),
  citationCount: z.number().int().nonnegative().optional(),
  influentialCitationCount: z.number().int().nonnegative().optional(),
  openAlexId: z.string().min(1).optional(),
  semanticScholarId: z.string().min(1).optional(),
  fieldsOfStudy: z.array(z.string().min(1)).optional(),
  impactFactor: z.number().positive().optional(),
  fiveYearImpactFactor: z.number().positive().optional(),
  jci: z.number().positive().optional(),
  jcrQuartile: z.string().min(1).optional(),
  casQuartile: z.string().min(1).optional(),
  easyScholarQueryTried: z.array(z.string().min(1)).optional(),
  easyScholarQueryMatched: z.string().min(1).optional(),
  easyScholarRanks: z.record(z.string(), z.string()).optional(),
  citeScore: z.number().positive().optional(),
  sjr: z.number().positive().optional()
});

// 应用配置模式
const configSchema = z.object({
  vault: z.object({
    path: z.string().min(1),
    documentDir: z.preprocess((val) => {
      if (typeof val !== 'string') return val;
      let cleaned = val.trim();
      // Obsidian 输出目录必须是 vault 内的相对路径，避免把 Windows/UNC/Unix 绝对路径写进 frontmatter 和链接。
      cleaned = cleaned.replace(/^[a-zA-Z]:[\\/]*/, '');
      cleaned = cleaned.replace(/^\\\\[^\\]+\\[^\\]+[\\/]*/, '');
      cleaned = cleaned.replace(/^[\\/]+/, '').replace(/[\\/]+$/, '');
      return cleaned || 'Thesis';
    }, z.string().min(1)),
    imageDirName: z.string().min(1)
  }),
  mineru: z.object({
    command: z.string().min(1),
    outputDir: z.string().min(1),
    mode: z.enum(['cli', 'local', 'official']).default('official'),
    backend: z.enum(['pipeline', 'vlm-http-client', 'hybrid-http-client', 'vlm-auto-engine', 'hybrid-auto-engine']),
    method: z.enum(['auto', 'txt', 'ocr']).optional(),
    apiUrl: z.preprocess((val) => {
      if (typeof val !== 'string' || val.trim() === '') return undefined;
      if (!/^https?:\/\//i.test(val)) {
        return `https://${val}`;
      }
      return val;
    }, z.string().url()).optional(),
    apiTokenEnv: z.string().min(1).default('MINERU_OFFICIAL_API_TOKEN'),
    modelVersion: z.enum(['pipeline', 'vlm']).default('vlm'),
    modelSource: z.string().min(1).optional(),
    formula: z.boolean().optional(),
    table: z.boolean().optional(),
    imageAnalysis: z.boolean().optional()
  }),
  translation: z.preprocess((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const translation = value as Record<string, unknown>;
    if (translation.provider !== 'deepseek') return value;
    return {
      ...translation,
      provider: 'openai-compatible',
      preset: translation.preset ?? 'deepseek'
    };
  }, z.object({
    enabled: z.boolean().default(true),
    provider: z.enum(['openai-compatible', 'ollama']).default('openai-compatible'),
    preset: z.enum(['deepseek', 'cloudflare', 'openai', 'openrouter', 'custom']).optional(),
    model: z.string().min(1),
    baseUrl: z.string().min(1),
    apiKeyEnv: z.string().min(1).optional(),
    apiKey: z.string().min(1).optional(),
    systemPrompt: z.string().min(1),
    chunkCharLimit: z.number().int().positive().default(24000),
    cacheDir: z.string().min(1).default('.pipeline/core-cache'),
    maxRetries: z.number().int().min(1).default(3)
  }).refine((value) => value.provider === 'ollama' || !value.enabled || Boolean(value.apiKeyEnv || value.apiKey), {
    message: 'translation.apiKeyEnv or translation.apiKey is required for non-ollama providers when translation is enabled'
  })),
  tasks: z.object({
    stateDir: z.string().min(1).default('.pipeline/tasks'),
    inboxDir: z.string().min(1).default('.pipeline/inbox'),
    concurrency: z.number().int().min(1).default(3),
    watchPollIntervalMs: z.number().int().min(500).default(5000)
  }).default({
    stateDir: '.pipeline/tasks',
    inboxDir: '.pipeline/inbox',
    concurrency: 3,
    watchPollIntervalMs: 5000
  }),
  readingAssets: z.object({
    enabled: z.boolean().default(true),
    cacheDir: z.string().min(1).default('.pipeline/core-assets-cache'),
    summaryFileName: z.string().min(1).default('摘要.md'),
    termsFileName: z.string().min(1).default('术语表.md'),
    qaFileName: z.string().min(1).default('问答.md'),
    maxSourceChars: z.number().int().positive().default(50000),
    maxRetries: z.number().int().min(1).default(3),
    systemPrompt: z.string().min(1).default([
      '你是严谨的论文阅读助手。',
      '只根据用户提供的原文和译文生成内容，不要引入外部知识或没有依据的结论。',
      '输出必须是简体中文 Markdown。',
      '保留必要的英文术语、论文名、方法名和缩写。'
    ].join('\n'))
  }).default({
    enabled: true,
    cacheDir: '.pipeline/core-assets-cache',
    summaryFileName: '摘要.md',
    termsFileName: '术语表.md',
    qaFileName: '问答.md',
    maxSourceChars: 50000,
    maxRetries: 3,
    systemPrompt: [
      '你是严谨的论文阅读助手。',
      '只根据用户提供的原文和译文生成内容，不要引入外部知识或没有依据的结论。',
      '输出必须是简体中文 Markdown。',
      '保留必要的英文术语、论文名、方法名和缩写。'
    ].join('\n')
  }),
  quality: z.object({
    reportFileName: z.string().min(1).default('report.json')
  }).default({
    reportFileName: 'report.json'
  }),
  obsidian: z.object({
    autoLink: z.object({
      enabled: z.boolean().default(true),
      scanDirs: z.array(z.string().min(1)).default([]),
      excludeDirs: z.array(z.string().min(1)).default(['.obsidian', '.trash']),
      minAliasLength: z.number().int().min(2).default(4),
      maxLinksPerNote: z.number().int().min(0).default(30)
    }).default({
      enabled: true,
      scanDirs: [],
      excludeDirs: ['.obsidian', '.trash'],
      minAliasLength: 4,
      maxLinksPerNote: 30
    }),
    database: z.object({
      enabled: z.boolean().default(true),
      fileName: z.string().min(1).default('数据库.base')
    }).default({
      enabled: true,
      fileName: '数据库.base'
    })
  }).default({
    autoLink: {
      enabled: true,
      scanDirs: [],
      excludeDirs: ['.obsidian', '.trash'],
      minAliasLength: 4,
      maxLinksPerNote: 30
    },
    database: {
      enabled: true,
      fileName: '数据库.base'
    }
  }),
  metadata: z.object({
    enrichFromMarkdown: z.boolean().default(true),
    online: z.object({
      enabled: z.boolean().default(false),
      providers: z.array(z.enum(['crossref', 'openalex'])).default(['crossref', 'openalex']),
      timeoutMs: z.number().int().positive().default(12000),
      cacheDir: z.string().min(1).default('.pipeline/core-cache'),
      email: z.string().email().optional()
    }).default({
      enabled: false,
      providers: ['crossref', 'openalex'],
      timeoutMs: 12000,
      cacheDir: '.pipeline/core-cache'
    }),
    journalMetrics: z.object({
      sqlite: z.object({
        path: z.string().min(1).default('.pipeline/journal-metrics.sqlite')
      }).default({
        path: '.pipeline/journal-metrics.sqlite'
      }),
      easyScholar: z.object({
        enabled: z.boolean().default(false),
        baseUrl: z.string().url().default('https://www.easyscholar.cc/open/getPublicationRank'),
        secretKey: z.string().min(1).optional(),
        secretKeyEnv: z.string().min(1).optional(),
        timeoutMs: z.number().int().positive().default(12000)
      }).default({
        enabled: false,
        baseUrl: 'https://www.easyscholar.cc/open/getPublicationRank',
        timeoutMs: 12000
      })
    }).default({
      sqlite: {
        path: '.pipeline/journal-metrics.sqlite'
      },
      easyScholar: {
        enabled: false,
        baseUrl: 'https://www.easyscholar.cc/open/getPublicationRank',
        timeoutMs: 12000
      }
    }),
    overrides: z.preprocess((value) => value ?? {}, z.record(z.string(), paperMetadataSchema)).default({})
  }).default({
    enrichFromMarkdown: true,
    online: {
      enabled: false,
      providers: ['crossref', 'openalex'],
      timeoutMs: 12000,
      cacheDir: '.pipeline/core-cache'
    },
    journalMetrics: {
      sqlite: {
        path: '.pipeline/journal-metrics.sqlite'
      },
      easyScholar: {
        enabled: false,
        baseUrl: 'https://www.easyscholar.cc/open/getPublicationRank',
        timeoutMs: 12000
      }
    },
    overrides: {}
  })
});

export async function loadConfig(configPath: string): Promise<AppConfig> {
  // AppConfig 是 CLI 和本地 Web 共同依赖的配置边界。
  // 在这里统一做默认值补全和结构校验，避免下游 pipeline 重复兜底。
  const raw = await readFile(configPath, 'utf8');
  const parsed = YAML.parse(raw);
  return configSchema.parse(parsed);
}
