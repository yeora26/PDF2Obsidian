import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function sha256File(path: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);

    stream.on('error', reject);
    stream.on('data', (chunk: string | Buffer) => {
      hash.update(chunk);
    });
    stream.on('end', () => {
      resolve(`sha256:${hash.digest('hex')}`);
    });
  });
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
