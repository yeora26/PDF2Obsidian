import { NextResponse } from 'next/server';
import { getLocalTask } from '../../../../../lib/local-tasks';
import { readLayoutImage, readMineruLayout } from '../../../../../lib/mineru-layout';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const task = await getLocalTask((await context.params).id);
  if (!task?.result) {
    return NextResponse.json({ blocks: [], message: '任务尚未生成解析结果。' }, { status: 404 });
  }

  const imageId = new URL(request.url).searchParams.get('image');
  try {
    const layout = await readMineruLayout(task);
    if (imageId !== null) {
      const image = layout?.blocks.find((block) => block.id === imageId)?.image;
      if (layout && image) {
        const response = await readLayoutImage(layout.directory, image);
        if (response) return response;
      }
    } else if (layout?.blocks.some((block) => block.bbox)) {
      return NextResponse.json({ blocks: layout.blocks });
    }
  } catch {
    // 缺失或损坏的坐标属于预览降级，原 PDF 和已有笔记仍然可用。
  }

  if (imageId !== null) return new Response(null, { status: 404 });
  return NextResponse.json({ blocks: [], message: '此任务没有可用的区块坐标，仍可预览原 PDF。' });
}
