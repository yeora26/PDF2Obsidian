import { NextResponse } from 'next/server';
import { deleteLocalTask, getLocalTask, retryLocalTask } from '../../../../lib/local-tasks';

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

  return NextResponse.json({ task });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { action?: unknown };
  if (body.action !== 'retry') {
    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  }

  try {
    return NextResponse.json({ task: await retryLocalTask(id) });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    await deleteLocalTask(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 400 });
  }
}
