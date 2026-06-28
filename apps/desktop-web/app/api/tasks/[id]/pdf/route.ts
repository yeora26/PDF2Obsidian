import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { getLocalTask } from '../../../../../lib/local-tasks';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const task = await getLocalTask(id);
  if (!task) {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  }

  try {
    const content = await readFile(task.pdfPath);
    return new Response(content, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${encodeURIComponent(task.fileName)}"`
      }
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 404 });
  }
}
