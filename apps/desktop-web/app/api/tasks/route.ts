import { NextResponse } from 'next/server';
import { createLocalTask, createLocalTaskFromUrl, listLocalTasks } from '../../../lib/local-tasks';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ tasks: await listLocalTasks() });
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';

  // JSON body: URL / arXiv / DOI 导入
  if (contentType.includes('application/json')) {
    const body = await request.json() as { url?: unknown };
    if (typeof body.url !== 'string' || !body.url.trim()) {
      return NextResponse.json({ error: '请提供 url 字段（支持 arXiv ID、DOI 或 PDF URL）' }, { status: 400 });
    }

    try {
      const task = await createLocalTaskFromUrl(body.url.trim());
      return NextResponse.json({ task }, { status: 201 });
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : String(error)
      }, { status: 400 });
    }
  }

  // FormData: PDF 文件上传
  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '请上传 PDF 文件，或通过 JSON body 提供 url 字段' }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: '仅支持 PDF 文件' }, { status: 400 });
  }

  const task = await createLocalTask(file);
  return NextResponse.json({ task }, { status: 201 });
}
