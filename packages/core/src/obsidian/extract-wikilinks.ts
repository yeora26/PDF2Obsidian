import { sep } from 'node:path';

export interface ExtractedWikiLink {
  text: string;
  target: string;
}

export function extractWikiLinksFromMarkdown(input: {
  markdown: string;
  excludeTargets?: string[];
}): ExtractedWikiLink[] {
  const excludedTargets = new Set((input.excludeTargets ?? []).map(normalizeWikiTarget));
  const links: ExtractedWikiLink[] = [];
  const linksByTarget = new Map<string, ExtractedWikiLink>();
  const lines = input.markdown.split(/\r?\n/);
  let inFrontmatter = false;
  let inCodeFence = false;

  for (const [index, line] of lines.entries()) {
    if (index === 0 && line.trim() === '---') {
      inFrontmatter = true;
      continue;
    }

    if (inFrontmatter) {
      if (line.trim() === '---') {
        inFrontmatter = false;
      }
      continue;
    }

    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      continue;
    }

    for (const match of line.matchAll(/\[\[([^\]]+)]]/g)) {
      const linkContent = match[1];
      if (!linkContent) {
        continue;
      }

      const parsed = parseWikiLink(linkContent);
      if (!parsed || excludedTargets.has(parsed.target)) {
        continue;
      }

      const key = parsed.target.toLocaleLowerCase();
      const existing = linksByTarget.get(key);
      if (!existing) {
        linksByTarget.set(key, parsed);
        links.push(parsed);
        continue;
      }

      if (!containsCjk(existing.text) && containsCjk(parsed.text)) {
        existing.text = parsed.text;
      }
    }
  }

  return links;
}

export function normalizeWikiTarget(target: string): string {
  const withoutAnchor = target.split('#')[0]?.split('^')[0] ?? target;
  const withoutMarkdownExtension = withoutAnchor.replace(/\.md$/i, '');
  const normalizedSeparators = withoutMarkdownExtension.split(sep).join('/');
  return normalizedSeparators.replace(/\.(?:original|zh)$/i, '.index');
}

function parseWikiLink(value: string): ExtractedWikiLink | undefined {
  const [rawTarget, rawAlias] = value.split('|');
  const target = normalizeWikiTarget((rawTarget ?? '').trim());
  if (!target) {
    return undefined;
  }

  const text = (rawAlias ?? rawTarget ?? '').trim();
  return {
    target,
    text: text || target
  };
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}
