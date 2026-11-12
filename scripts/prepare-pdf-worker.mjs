import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../apps/desktop-web/', import.meta.url));
const require = createRequire(join(app, 'package.json'));
const pdfjs = dirname(require.resolve('pdfjs-dist/package.json'));
await mkdir(join(app, 'public'), { recursive: true });
await copyFile(join(pdfjs, 'build/pdf.worker.min.mjs'), join(app, 'public/pdf.worker.min.mjs'));
