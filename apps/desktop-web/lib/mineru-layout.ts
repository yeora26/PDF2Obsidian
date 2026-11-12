import { readdir, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { findPrimaryMarkdown } from '@pdf2obsidian/core';
import { getMineruOutputDir } from '@pdf2obsidian/pipeline';
import { loadLocalAppConfig } from './config';
import type { LocalTask } from './local-tasks';
import { parsePdfBlocks } from './pdf-blocks';

export async function readMineruLayout(task: LocalTask) {
  if (!task.result) return undefined;

  const root = task.result.mineruOutputDir ?? getMineruOutputDir(
    (await loadLocalAppConfig()).mineru.outputDir,
    task.pdfPath,
    task.result.sourceHash
  );
  const markdownPath = await findPrimaryMarkdown(root, 'document');
  const directory = dirname(markdownPath);
  const entries = await readdir(directory, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && /(?:^|_)content_list\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const preferred = `${basename(markdownPath, '.md')}_content_list.json`;
  const file = candidates.find((name) => name === preferred) ?? candidates[0];
  if (!file) return undefined;

  const blocks = parsePdfBlocks(JSON.parse(await readFile(join(directory, file), 'utf8')));
  return { directory, blocks };
}

export async function readLayoutImage(directory: string, image: string) {
  const root = join(await realpath(directory), 'images');
  const target = await realpath(resolve(directory, image));
  const path = relative(root, target);
  if (!path || isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`)) return undefined;

  const types: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
  };
  const contentType = types[extname(target).toLowerCase()];
  if (!contentType) return undefined;
  return new Response(await readFile(target), {
    headers: { 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' }
  });
}
