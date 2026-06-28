import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { NextResponse } from 'next/server';
import type { ImportPdfResult } from '@pdf2obsidian/pipeline';
import { loadLocalAppConfig } from '../../../../../lib/config';
import { getLocalTask } from '../../../../../lib/local-tasks';

export const runtime = 'nodejs';

const artifactKinds = ['original', 'translated', 'index', 'database', 'summary', 'terms', 'qa'] as const;
type ArtifactKind = typeof artifactKinds[number];

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const task = await getLocalTask(id);
  if (!task?.result) {
    return NextResponse.json({ error: '任务产物不存在' }, { status: 404 });
  }

  const kind = parseArtifactKind(new URL(request.url).searchParams.get('kind'));
  if (!kind) {
    return NextResponse.json({ error: '不支持的产物类型' }, { status: 400 });
  }

  const path = await resolveArtifactPath(task.result, kind);
  if (!path) {
    return NextResponse.json({ error: '该产物未生成或已在设置中关闭。' }, { status: 404 });
  }

  try {
    const content = await readFile(path, 'utf8');
    return NextResponse.json({ path, content });
  } catch (error) {
    return NextResponse.json({
      path,
      error: isReadingArtifact(kind)
        ? '当前任务没有生成该阅读材料。请在设置中开启“生成阅读材料”后重新处理。'
        : error instanceof Error ? error.message : String(error)
    }, { status: 404 });
  }
}

function isReadingArtifact(kind: ArtifactKind | null): kind is 'summary' | 'terms' | 'qa' {
  return kind === 'summary' || kind === 'terms' || kind === 'qa';
}

function parseArtifactKind(value: string | null): ArtifactKind | undefined {
  return artifactKinds.find((kind) => kind === value);
}

async function resolveArtifactPath(result: ImportPdfResult, kind: ArtifactKind | null): Promise<string | undefined> {
  if (kind === 'original') return result.originalNotePath;
  if (kind === 'translated') return result.translatedNotePath;
  if (kind === 'index') return result.indexNotePath;
  if (kind === 'database') return result.databaseNotePath;
  if (kind === 'summary' || kind === 'terms' || kind === 'qa') {
    const config = await loadLocalAppConfig();
    const fileNames: Record<'summary' | 'terms' | 'qa', string> = {
      summary: config.readingAssets.summaryFileName,
      terms: config.readingAssets.termsFileName,
      qa: config.readingAssets.qaFileName
    };
    return join(dirname(result.translatedNotePath), fileNames[kind]);
  }
  return undefined;
}
