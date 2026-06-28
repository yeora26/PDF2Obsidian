import { join } from 'node:path';
import YAML from 'yaml';
import type { AppConfig } from '../config/types.js';
import { ensureDirectory, writeTextFile } from '../storage/file-system.js';

interface BaseFile {
  filters: string;
  properties: Record<string, { displayName: string }>;
  views: BaseView[];
}

interface BaseView {
  type: 'table';
  name: string;
  order: string[];
  sort?: Array<{
    property: string;
    direction: 'ASC' | 'DESC';
  }>;
  filters?: string;
}

export async function exportObsidianDatabase(config: AppConfig): Promise<string | undefined> {
  if (!config.obsidian.database.enabled) {
    return undefined;
  }

  const databasePath = join(config.vault.path, config.vault.documentDir, config.obsidian.database.fileName);
  await ensureDirectory(join(config.vault.path, config.vault.documentDir));
  await writeTextFile(databasePath, createBaseFile(config));
  return databasePath;
}

function createBaseFile(config: AppConfig): string {
  const base: BaseFile = {
    filters: `type == "index" && file.inFolder("${config.vault.documentDir}")`,
    properties: {
      'file.name': { displayName: '名称' },
      translatedTitle: { displayName: '标题' },
      authors: { displayName: '作者' },
      year: { displayName: '年份' },
      journal: { displayName: '期刊/会议' },
      citationCount: { displayName: '引用' },
      impactFactor: { displayName: '影响因子' },
      jcrQuartile: { displayName: 'JCR' },
      casQuartile: { displayName: '中科院' },
      doi: { displayName: 'DOI' },
      citationApa: { displayName: '引用 APA' },
      citationBibtex: { displayName: '引用 BibTeX' }
    },
    views: [
      {
        type: 'table',
        name: '论文',
        order: [
          'file.name',
          'translatedTitle',
          'year',
          'journal',
          'citationCount',
          'impactFactor',
          'jcrQuartile',
          'casQuartile',
          'doi'
        ],
        sort: [
          { property: 'year', direction: 'DESC' },
          { property: 'citationCount', direction: 'DESC' }
        ]
      },
      {
        type: 'table',
        name: '引用',
        order: [
          'file.name',
          'translatedTitle',
          'authors',
          'year',
          'citationApa',
          'citationBibtex',
          'doi'
        ],
        sort: [
          { property: 'year', direction: 'DESC' },
          { property: 'file.name', direction: 'ASC' }
        ]
      }
    ]
  };

  return YAML.stringify(base);
}
