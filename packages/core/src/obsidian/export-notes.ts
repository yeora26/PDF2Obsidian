import { basename, join } from 'node:path';
import type { AppConfig } from '../config/types.js';
import { copyFileTo, deleteFileIfExists, ensureDirectory, writeTextFile } from '../storage/file-system.js';

export interface ExportNotesInput {
  config: AppConfig;
  slug: string;
  pdfPath: string;
  originalNote: string | undefined;
  translatedNote: string;
  indexNote: string;
  documentRoot: string;
}

export interface ExportNotesResult {
  originalNotePath?: string | undefined;
  translatedNotePath: string;
  indexNotePath: string;
}

export async function exportNotes(input: ExportNotesInput): Promise<ExportNotesResult> {
  await ensureDirectory(input.documentRoot);

  // 每篇论文导出为 index/zh/original 三类笔记；original 可关闭，关闭后要清理旧文件。
  const originalNotePath = join(input.documentRoot, `${input.slug}.original.md`);
  const translatedNotePath = join(input.documentRoot, `${input.slug}.zh.md`);
  const indexNotePath = join(input.documentRoot, `${input.slug}.index.md`);

  if (input.originalNote) {
    await writeTextFile(originalNotePath, input.originalNote);
  } else {
    await deleteFileIfExists(originalNotePath);
  }

  await writeTextFile(translatedNotePath, input.translatedNote);
  await writeTextFile(indexNotePath, input.indexNote);
  // PDF 原件放在同一目录下，Obsidian 内部链接和用户手动归档都更直观。
  await copyFileTo(input.pdfPath, join(input.documentRoot, basename(input.pdfPath)));

  return {
    originalNotePath: input.originalNote ? originalNotePath : undefined,
    translatedNotePath,
    indexNotePath
  };
}
