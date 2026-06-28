export type ConfigData = Record<string, unknown>;
export type WorkflowMode = 'parse-only' | 'translate' | 'reading' | 'knowledge-base' | 'custom';

export interface SelectOption {
  value: string;
  label: string;
}

export interface StepProps {
  data: ConfigData;
  onChange: (path: string, value: unknown) => void;
}

export const workflowModes: Array<{ mode: Exclude<WorkflowMode, 'custom'>; title: string; desc: string }> = [
  { mode: 'parse-only', title: '只解析论文', desc: '生成 Markdown、图片和索引，不调用 AI。' },
  { mode: 'translate', title: '解析 + 翻译', desc: '额外生成中文译文，适合快速阅读。' },
  { mode: 'reading', title: '翻译 + 阅读材料', desc: '额外生成摘要、术语表和问答。' },
  { mode: 'knowledge-base', title: '全量知识库', desc: '启用元数据、双链和 Bases。' }
];

export function getValue<T>(data: ConfigData, path: string, fallback: T): T {
  const value = path.split('.').reduce<unknown>((current, key) => isRecord(current) ? current[key] : undefined, data);
  return value === undefined || value === null ? fallback : value as T;
}

export function setNestedValue(data: ConfigData, path: string, value: unknown): ConfigData {
  const next = structuredClone(data);
  const keys = path.split('.');
  let cursor: ConfigData = next;
  for (const key of keys.slice(0, -1)) {
    if (!isRecord(cursor[key])) cursor[key] = {};
    cursor = cursor[key] as ConfigData;
  }
  cursor[keys[keys.length - 1] ?? path] = value;
  return next;
}

export function isRecord(value: unknown): value is ConfigData {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function applyWorkflowMode(
  mode: WorkflowMode,
  data: ConfigData,
  onChange: (path: string, value: unknown) => void
): void {
  const enableTranslation = mode !== 'parse-only';
  const enableReading = mode === 'reading' || mode === 'knowledge-base';
  const enableKnowledgeBase = mode === 'knowledge-base';

  onChange('translation.enabled', enableTranslation);
  onChange('readingAssets.enabled', enableReading);
  onChange('obsidian.autoLink.enabled', enableKnowledgeBase);
  onChange('obsidian.database.enabled', enableKnowledgeBase);
  onChange('metadata.online.enabled', enableKnowledgeBase);

  if (enableKnowledgeBase && getValue<string[]>(data, 'metadata.online.providers', []).length === 0) {
    onChange('metadata.online.providers', ['crossref', 'openalex']);
  }
}

export function getWorkflowMode(data: ConfigData): WorkflowMode {
  const translationEnabled = getValue(data, 'translation.enabled', true);
  const readingAssetsEnabled = getValue(data, 'readingAssets.enabled', true);
  const metadataOnlineEnabled = getValue(data, 'metadata.online.enabled', false);
  const autoLinkEnabled = getValue(data, 'obsidian.autoLink.enabled', true);
  const databaseEnabled = getValue(data, 'obsidian.database.enabled', true);

  if (!translationEnabled && !readingAssetsEnabled && !metadataOnlineEnabled && !autoLinkEnabled && !databaseEnabled) return 'parse-only';
  if (translationEnabled && !readingAssetsEnabled && !metadataOnlineEnabled && !autoLinkEnabled && !databaseEnabled) return 'translate';
  if (translationEnabled && readingAssetsEnabled && !metadataOnlineEnabled && !autoLinkEnabled && !databaseEnabled) return 'reading';
  if (translationEnabled && readingAssetsEnabled && metadataOnlineEnabled && autoLinkEnabled && databaseEnabled) return 'knowledge-base';
  return 'custom';
}

export function getEnabledCapabilityLabels(data: ConfigData): string[] {
  const labels = ['PDF 解析', 'Obsidian 文件'];
  if (getValue(data, 'translation.enabled', true)) labels.push('AI 译文');
  if (getValue(data, 'readingAssets.enabled', true)) labels.push('AI 阅读材料');
  if (getValue(data, 'metadata.online.enabled', false)) labels.push('在线元数据');
  if (getValue(data, 'obsidian.autoLink.enabled', true)) labels.push('自动双链');
  if (getValue(data, 'obsidian.database.enabled', true)) labels.push('Bases 数据库');
  return labels;
}

export function updateProvider(providers: string[], provider: 'crossref' | 'openalex', enabled: boolean): string[] {
  const next = new Set(providers.filter((item) => item === 'crossref' || item === 'openalex'));
  if (enabled) next.add(provider);
  else next.delete(provider);
  return Array.from(next);
}

export function getSupportedMineruBackend(value: string): string {
  return value === 'vlm-http-client' ? 'vlm-http-client' : 'pipeline';
}
