import { dirname, posix, relative } from 'node:path';

interface RewriteMarkdownAssetLinksInput {
  markdown: string;
  noteDirRelativeToVaultRoot: string;
  noteFileName: string;
  assetRootFromVault: string;
}

const markdownImagePattern = /(!\[[^\]]*]\()([^)]+)(\))/g;

export function rewriteMarkdownAssetLinks(input: RewriteMarkdownAssetLinksInput): string {
  const noteDir = input.noteDirRelativeToVaultRoot;
  const notePath = posix.join(noteDir.replaceAll('\\', '/'), input.noteFileName);
  const noteFolder = dirname(notePath);
  const assetRoot = input.assetRootFromVault.replaceAll('\\', '/');

  return input.markdown.replace(markdownImagePattern, (_, prefix: string, rawPath: string, suffix: string) => {
    if (isExternalOrAnchor(rawPath)) {
      return `${prefix}${rawPath}${suffix}`;
    }

    const normalizedRawPath = rawPath.replaceAll('\\', '/').replace(/^\.?\/*/, '');
    const assetRelativePath = normalizedRawPath.startsWith('images/')
      ? normalizedRawPath.slice('images/'.length)
      : normalizedRawPath;
    const normalizedAssetTarget = posix.join(assetRoot, assetRelativePath);
    const relativePath = relative(noteFolder, normalizedAssetTarget).replaceAll('\\', '/');
    return `${prefix}${relativePath}${suffix}`;
  });
}

function isExternalOrAnchor(path: string): boolean {
  return path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('#');
}
