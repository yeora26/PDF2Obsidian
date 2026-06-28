import { access, cp, mkdir, readFile, unlink, writeFile, rm } from 'node:fs/promises';

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await writeFile(path, content, 'utf8');
}

export async function writeJsonFile(path: string, content: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(content, null, 2), 'utf8');
}

export async function copyDirectory(source: string, destination: string): Promise<void> {
  await cp(source, destination, { recursive: true, force: true });
}

export async function copyFileTo(source: string, destination: string): Promise<void> {
  await cp(source, destination, { force: true });
}

export async function deleteFileIfExists(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function deleteDirectory(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

