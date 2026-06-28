export type MarkdownLanguage = 'zh-CN' | 'en' | 'unknown';

export interface MarkdownLanguageDetection {
  language: MarkdownLanguage;
  hanRatio: number;
  hanCount: number;
  latinCount: number;
}

export function detectMarkdownLanguage(markdown: string): MarkdownLanguageDetection {
  const text = markdown
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[[^\]]*]\([^)]+\)/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[0-9\s\p{P}\p{S}]/gu, '');

  const hanCount = Array.from(text.matchAll(/\p{Script=Han}/gu)).length;
  const latinCount = Array.from(text.matchAll(/\p{Script=Latin}/gu)).length;
  const letterCount = hanCount + latinCount;
  const hanRatio = letterCount > 0 ? hanCount / letterCount : 0;

  if (hanCount >= 120 && (hanRatio >= 0.18 || hanCount >= latinCount * 0.25)) {
    return {
      language: 'zh-CN',
      hanRatio,
      hanCount,
      latinCount
    };
  }

  if (latinCount >= 120 && hanRatio < 0.08) {
    return {
      language: 'en',
      hanRatio,
      hanCount,
      latinCount
    };
  }

  return {
    language: 'unknown',
    hanRatio,
    hanCount,
    latinCount
  };
}
