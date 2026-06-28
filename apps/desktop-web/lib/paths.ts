import { access, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

let cachedWorkspaceRoot: string | undefined;

export async function getWorkspaceRoot(): Promise<string> {
  if (cachedWorkspaceRoot) {
    return cachedWorkspaceRoot;
  }

  let current = resolve(process.cwd());
  for (;;) {
    if (await exists(join(current, 'pnpm-workspace.yaml'))) {
      cachedWorkspaceRoot = current;
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new Error('无法定位 pnpm-workspace.yaml，请从 PDF2Obsidian workspace 内启动 Desktop Web。');
    }
    current = parent;
  }
}

export async function getConfigPath(): Promise<string> {
  if (process.env.PDF2OBSIDIAN_CONFIG) {
    return resolve(process.env.PDF2OBSIDIAN_CONFIG);
  }

  return join(await getWorkspaceRoot(), 'pdf2obsidian.config.yaml');
}

export async function getExampleConfigPath(): Promise<string> {
  return join(await getWorkspaceRoot(), 'pdf2obsidian.config.example.yaml');
}

export async function getDesktopPipelineDir(): Promise<string> {
  const dir = join(await getWorkspaceRoot(), '.pipeline', 'desktop-web');
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function getUploadDir(): Promise<string> {
  const dir = join(await getDesktopPipelineDir(), 'uploads');
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
