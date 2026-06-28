import { NextResponse } from 'next/server';
import { readLocalConfig, writeLocalConfig, writeLocalConfigData } from '../../../lib/config';
import type { LocalConfigData } from '../../../lib/config';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(await readLocalConfig());
}

export async function POST(request: Request) {
  const body = await request.json() as { raw?: unknown; data?: unknown };
  if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    const result = await writeLocalConfigData(body.data as LocalConfigData);
    return NextResponse.json(result, { status: result.valid ? 200 : 400 });
  }

  if (typeof body.raw !== 'string') {
    return NextResponse.json({ error: '配置内容不合法' }, { status: 400 });
  }

  const result = await writeLocalConfig(body.raw);
  return NextResponse.json(result, { status: result.valid ? 200 : 400 });
}
