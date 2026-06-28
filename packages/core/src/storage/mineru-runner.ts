import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { spawn, exec, execSync } from 'node:child_process';
import { unzipSync } from 'fflate';

export interface RunMineruInput {
  pdfPath: string;
  outputDir: string;
  command: string;
  mode: 'cli' | 'local' | 'remote' | 'managed' | 'official';
  backend: 'pipeline' | 'vlm-http-client' | 'hybrid-http-client' | 'vlm-auto-engine' | 'hybrid-auto-engine';
  method?: 'auto' | 'txt' | 'ocr' | undefined;
  apiUrl?: string | undefined;
  apiTokenEnv?: string | undefined;
  modelVersion?: 'pipeline' | 'vlm' | undefined;
  modelSource?: string | undefined;
  formula?: boolean | undefined;
  table?: boolean | undefined;
  imageAnalysis?: boolean | undefined;
}

interface OfficialApiResponse<T> {
  code?: number;
  msg?: string;
  trace_id?: string;
  data?: T;
}

type OfficialApplyUploadResponse = OfficialApiResponse<{
  batch_id?: string;
  file_urls?: string[];
}>;

interface OfficialBatchResult {
  file_name?: string;
  state?: string;
  full_zip_url?: string;
  err_msg?: string;
  extract_progress?: {
    extracted_pages?: number;
    total_pages?: number;
    start_time?: string;
  };
}

type OfficialBatchStatusResponse = OfficialApiResponse<{
  batch_id?: string;
  extract_result?: OfficialBatchResult[];
}>;

export async function runMineru(input: RunMineruInput): Promise<void> {
  // MinerU 是外部依赖，入口处只负责路由到不同运行模式：
  // official 走官方批量 API，remote/local+apiUrl 走 HTTP 服务，其他情况回退到本地 CLI。
  if (input.mode === 'official') {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await runMineruOfficialApi(input);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt < maxAttempts) {
          console.warn(`[MinerU Official] Attempt ${attempt} failed: ${message}. Retrying...`);
          continue;
        }
        throw new Error(`MinerU 官方精准解析 API 失败: ${message}。请检查 Token 是否有效或稍后重试。`);
      }
    }
    return;
  }

  if ((input.mode === 'remote' || input.mode === 'managed') && input.apiUrl) {
    const baseUrl = await resolveApiUrl(input.apiUrl);
    if (!(await isUrlReachable(baseUrl))) {
      throw new Error(`MinerU 解析服务不可用，请确认已启动服务（接口地址: ${baseUrl}）。`);
    }
    await runMineruHttpApi({ ...input, apiUrl: baseUrl });
    return;
  }

  if (input.mode === 'local' && input.apiUrl) {
    const baseUrl = await resolveApiUrl(input.apiUrl);
    if (!(await isUrlReachable(baseUrl))) {
      throw new Error(`MinerU 解析服务不可用，请确认已启动服务（接口地址: ${baseUrl}）。`);
    }
    await runMineruHttpApi({ ...input, apiUrl: baseUrl });
    return;
  }

  await runMineruLocal(input);
}


async function runMineruLocal(input: RunMineruInput): Promise<void> {
  const env = {
    ...process.env
  };

  // 本地 VLM 后端默认约定 30000 端口；用户显式传入时仍以环境变量优先。
  if (!env.MINERU_VL_SERVER) {
    env.MINERU_VL_SERVER = 'http://127.0.0.1:30000';
  }

  if (input.modelSource) {
    env.MINERU_MODEL_SOURCE = input.modelSource;
  }

  const args = ['-p', input.pdfPath, '-o', input.outputDir, '-b', input.backend];

  if (input.method) {
    args.push('-m', input.method);
  }

  if (typeof input.formula === 'boolean') {
    args.push('-f', String(input.formula));
  }

  if (typeof input.table === 'boolean') {
    args.push('-t', String(input.table));
  }

  if (typeof input.imageAnalysis === 'boolean') {
    args.push('--image-analysis', String(input.imageAnalysis));
  }

  if (input.mode === 'local') {
    // local+apiUrl 实际是“本机 HTTP 服务”模式，API 地址可以由服务端环境变量统一托管。
    const resolvedApiUrl = process.env.MINERU_MANAGED_API_URL ?? input.apiUrl;

    if (!resolvedApiUrl) {
      throw new Error('managed 模式需要服务端配置环境变量 MINERU_MANAGED_API_URL');
    }

    args.push('--api-url', resolvedApiUrl);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(input.command, args, {
      env,
      stdio: 'inherit'
    });

    const cleanup = () => {
      try {
        if (process.platform === 'win32') {
          exec(`taskkill /F /T /PID ${child.pid}`);
        } else {
          child.kill('SIGKILL');
        }
      } catch {}
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    child.on('error', (err) => {
      process.off('exit', cleanup);
      process.off('SIGINT', cleanup);
      process.off('SIGTERM', cleanup);
      reject(err);
    });
    child.on('exit', (code, signal) => {
      process.off('exit', cleanup);
      process.off('SIGINT', cleanup);
      process.off('SIGTERM', cleanup);
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`MinerU exited with code ${code ?? 'null'} and signal ${signal ?? 'null'}`));
    });
  });
}

async function runMineruOfficialApi(input: RunMineruInput): Promise<void> {
  const tokenEnv = input.apiTokenEnv ?? 'MINERU_OFFICIAL_API_TOKEN';
  const token = await readConfiguredToken(tokenEnv);
  if (!token) {
    throw new Error(`MinerU 官方精准解析 API Token 未配置，请在服务端环境或 .env.local 中设置 ${tokenEnv}`);
  }

  const fileName = basename(input.pdfPath);
  const modelVersion = input.modelVersion ?? 'vlm';
  const batchEndpoint = 'https://mineru.net/api/v4/file-urls/batch';
  console.log(`[MinerU Official] Requesting upload URL from ${batchEndpoint}`);
  // 官方 API 采用“申请上传 URL -> PUT 原文件 -> 轮询 batch -> 下载 zip”的四段式协议。
  const applyResponse = await fetchWithRetry(batchEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: '*/*'
    },
    body: JSON.stringify({
      files: [
        {
          name: fileName,
          data_id: createDataId(input.pdfPath),
          is_ocr: input.method === 'ocr'
        }
      ],
      model_version: modelVersion,
      enable_formula: input.formula ?? true,
      enable_table: input.table ?? true
    })
  });

  const applied = await readOfficialJson<OfficialApplyUploadResponse>(applyResponse, '申请 MinerU 官方上传 URL 失败');
  if (applied.code !== 0 || !applied.data?.batch_id || !applied.data.file_urls?.[0]) {
    throw new Error(`申请 MinerU 官方上传 URL 失败：${applied.msg || '响应缺少 batch_id/file_urls'}`);
  }

  const batchId = applied.data.batch_id;
  const uploadUrl = applied.data.file_urls[0];
  console.log(`[MinerU Official] Batch submitted: ${batchId}`);
  console.log('[MinerU Official] Uploading source file');
  const uploadResponse = await fetchWithRetry(uploadUrl, {
    method: 'PUT',
    body: await readFile(input.pdfPath)
  });
  if (!uploadResponse.ok) {
    throw new Error(`上传文件到 MinerU 官方存储失败 (${uploadResponse.status}): ${await uploadResponse.text()}`);
  }

  const result = await waitForOfficialBatch(token, batchId);
  if (!result.full_zip_url) {
    throw new Error('MinerU 官方精准解析结果缺少 full_zip_url');
  }

  console.log('[MinerU Official] Downloading result zip');
  const zipResponse = await fetchWithRetry(result.full_zip_url);
  if (!zipResponse.ok) {
    throw new Error(`下载 MinerU 官方结果 zip 失败 (${zipResponse.status}): ${await zipResponse.text()}`);
  }

  const documentDir = join(input.outputDir, basename(input.pdfPath, extname(input.pdfPath)));
  await extractOfficialZip(Buffer.from(await zipResponse.arrayBuffer()), documentDir);
  console.log(`[MinerU Official] Result zip extracted to ${documentDir}`);
}

async function readConfiguredToken(tokenEnv: string): Promise<string | undefined> {
  // apiTokenEnv 优先作为环境变量名读取；也允许临时传入直接 Token，便于本地调试。
  // 公开配置示例仍推荐使用环境变量名，避免把 Token 写进配置文件。
  if (tokenEnv.startsWith('eyJ') || tokenEnv.includes('.')) {
    return tokenEnv;
  }

  const fromProcess = process.env[tokenEnv]?.trim();
  if (fromProcess) {
    return fromProcess;
  }

  for (const envFile of ['.env.local', '.env', 'web/.env.local', 'web/.env']) {
    const fromFile = await readEnvFileValue(envFile, tokenEnv);
    if (fromFile) {
      return fromFile;
    }
  }

  return undefined;
}

async function readEnvFileValue(filePath: string, key: string): Promise<string | undefined> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trimStart() : trimmed;
    const separatorIndex = withoutExport.indexOf('=');
    if (separatorIndex === -1 || withoutExport.slice(0, separatorIndex).trim() !== key) {
      continue;
    }

    return unquoteEnvValue(withoutExport.slice(separatorIndex + 1).trim());
  }

  return undefined;
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

async function runMineruHttpApi(input: RunMineruInput): Promise<void> {
  const baseUrl = await resolveApiUrl(input.apiUrl ?? '');
  const endpoint = new URL('/tasks', baseUrl).toString();
  console.log(`[MinerU] Submitting task to ${endpoint}`);
  const pdfBytes = await readFile(input.pdfPath);
  const pdfName = basename(input.pdfPath);
  const form = new FormData();
  form.append('files', new Blob([pdfBytes], { type: 'application/pdf' }), pdfName);
  form.append('backend', input.backend);
  form.append('parse_method', input.method ?? 'auto');
  form.append('formula_enable', String(input.formula ?? true));
  form.append('table_enable', String(input.table ?? true));
  form.append('image_analysis', String(input.imageAnalysis ?? true));
  form.append('return_md', 'true');
  form.append('return_images', 'true');
  form.append('response_format_zip', 'false');

  const response = await fetchWithRetry(endpoint, {
    method: 'POST',
    body: form
  });

  if (response.status !== 202 && !response.ok) {
    throw new Error(`MinerU HTTP API failed (${response.status}): ${await response.text()}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`MinerU HTTP API returned unsupported content type: ${contentType}`);
  }

  const submitted = await response.json() as { task_id?: string; result_url?: string; status?: string; error?: string };
  if (submitted.task_id) {
    console.log(`[MinerU] Task submitted: ${submitted.task_id}`);
  }
  // 兼容两类 HTTP 服务：一种直接返回 Markdown，另一种返回 task_id 后异步轮询结果。
  const result = submitted.task_id
    ? await waitForMineruTask(baseUrl, submitted.task_id)
    : submitted;
  const markdown = findFirstStringByKey(result, ['md_content', 'markdown', 'md']);
  if (!markdown) {
    throw new Error('MinerU HTTP API response did not include markdown content');
  }

  const documentDir = join(input.outputDir, basename(input.pdfPath, extname(input.pdfPath)));
  const imageDir = join(documentDir, 'images');
  await mkdir(imageDir, { recursive: true });
  await writeFile(join(documentDir, `${basename(input.pdfPath, extname(input.pdfPath))}.md`), markdown, 'utf8');
  await writeImagesFromResponse(result, imageDir);
  console.log(`[MinerU] Markdown written: ${markdown.length} chars`);
}

async function waitForMineruTask(baseUrl: string, taskId: string): Promise<unknown> {
  const statusUrl = new URL(`/tasks/${taskId}`, baseUrl).toString();
  const resultUrl = new URL(`/tasks/${taskId}/result`, baseUrl).toString();
  const timeoutAt = Date.now() + 30 * 60 * 1000;

  while (Date.now() < timeoutAt) {
    const statusResponse = await fetchWithRetry(statusUrl);
    if (!statusResponse.ok) {
      throw new Error(`MinerU task status failed (${statusResponse.status}): ${await statusResponse.text()}`);
    }

    const status = await statusResponse.json() as { status?: string; error?: string };
    console.log(`[MinerU] Task ${taskId} status: ${status.status ?? 'unknown'}`);
    if (status.status === 'failed') {
      throw new Error(status.error ?? 'MinerU task failed');
    }

    if (status.status === 'completed') {
      const resultResponse = await fetchWithRetry(resultUrl);
      if (!resultResponse.ok) {
        throw new Error(`MinerU task result failed (${resultResponse.status}): ${await resultResponse.text()}`);
      }

      console.log(`[MinerU] Task ${taskId} completed`);
      return resultResponse.json();
    }

    await delay(5000);
  }

  throw new Error(`MinerU task timed out: ${taskId}`);
}

async function waitForOfficialBatch(token: string, batchId: string): Promise<OfficialBatchResult> {
  const statusUrl = `https://mineru.net/api/v4/extract-results/batch/${batchId}`;
  const start = Date.now();
  const timeoutAt = start + 30 * 60 * 1000;

  while (Date.now() < timeoutAt) {
    const statusResponse = await fetchWithRetry(statusUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: '*/*'
      }
    });
    const status = await readOfficialJson<OfficialBatchStatusResponse>(statusResponse, '查询 MinerU 官方批量任务失败');
    if (status.code !== 0) {
      throw new Error(`查询 MinerU 官方批量任务失败：${status.msg ?? '未知错误'}`);
    }

    const result = status.data?.extract_result?.[0];
    const state = result?.state ?? 'unknown';
    const progress = result?.extract_progress;
    const progressText = progress?.total_pages
      ? ` ${progress.extracted_pages ?? 0}/${progress.total_pages} pages`
      : '';
    console.log(`[MinerU Official] Batch ${batchId} state: ${state}${progressText}`);

    // 官方队列如果长期 pending，通常是套餐/并发/服务端排队问题，提前失败比让用户等 30 分钟更可控。
    if (state === 'pending' && Date.now() - start > 20 * 1000) {
      throw new Error('MinerU 官方精准解析任务排队超时（20秒仍处于 pending 状态）');
    }

    if (state === 'failed') {
      throw new Error(result?.err_msg || 'MinerU 官方精准解析任务失败');
    }

    if (state === 'done' && result) {
      console.log(`[MinerU Official] Batch ${batchId} completed`);
      return result;
    }

    await delay(5000);
  }

  throw new Error(`MinerU 官方精准解析任务超时：${batchId}`);
}

async function readOfficialJson<T>(response: Response, failureMessage: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${failureMessage} (${response.status}): ${text}`);
  }

  if (!text.trim()) {
    throw new Error(`${failureMessage}：响应为空`);
  }

  return JSON.parse(text) as T;
}

async function extractOfficialZip(zipBytes: Buffer, outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const entries = unzipSync(new Uint8Array(zipBytes));
  let markdownWritten = false;

  for (const [entryName, bytes] of Object.entries(entries)) {
    if (entryName.endsWith('/')) {
      continue;
    }

    const normalizedName = normalizeZipEntryName(entryName);
    if (!normalizedName) {
      continue;
    }

    const outputPath = join(outputDir, normalizedName);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, Buffer.from(bytes));
    if (basename(normalizedName).toLowerCase() === 'full.md') {
      markdownWritten = true;
    }
  }

  if (!markdownWritten) {
    throw new Error('MinerU 官方精准解析结果 zip 中没有 full.md');
  }
}

function normalizeZipEntryName(entryName: string): string | undefined {
  // 解压官方 zip 时强制去掉空段、当前目录和父目录，避免 zip-slip 覆盖输出目录外文件。
  const parts = entryName
    .replaceAll('\\', '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..');
  if (parts.length === 0) {
    return undefined;
  }

  return join(...parts);
}

function createDataId(value: string): string {
  return basename(value)
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .slice(0, 128) || `pdf-${Date.now()}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(value: string): string {
  if (!value) {
    throw new Error('mineru.apiUrl is required for HTTP API mode');
  }

  return /^https?:\/\//i.test(value) ? value : `http://${value}`;
}

async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    // 这里不强依赖健康检查端点，404/405/202 也说明服务进程可达。
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok || response.status === 404 || response.status === 405 || response.status === 202;
  } catch {
    return false;
  }
}


function findFirstStringByKey(value: unknown, keys: string[]): string | undefined {
  // 不同 MinerU HTTP 封装返回结构不完全一致，这里递归寻找常见 Markdown 字段名。
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstStringByKey(item, keys);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  for (const candidate of Object.values(record)) {
    const found = findFirstStringByKey(candidate, keys);
    if (found) return found;
  }

  return undefined;
}

async function writeImagesFromResponse(value: unknown, imageDir: string): Promise<void> {
  const images = findFirstRecordByKey(value, ['images']);
  if (!images) {
    return;
  }

  for (const [name, content] of Object.entries(images)) {
    if (typeof content !== 'string') {
      continue;
    }

    const base64 = content.includes(',') ? content.split(',').pop() : content;
    if (!base64) {
      continue;
    }

    await writeFile(join(imageDir, name), Buffer.from(base64, 'base64'));
  }
}

function findFirstRecordByKey(value: unknown, keys: string[]): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstRecordByKey(item, keys);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as Record<string, unknown>;
    }
  }

  for (const candidate of Object.values(record)) {
    const found = findFirstRecordByKey(candidate, keys);
    if (found) return found;
  }

  return undefined;
}

export async function findPrimaryMarkdown(rootDir: string, preferredStem: string): Promise<string> {
  const markdownFiles = await collectMarkdownFiles(rootDir);
  if (markdownFiles.length === 0) {
    throw new Error(`MinerU did not generate any markdown file in: ${rootDir}`);
  }

  const preferred = markdownFiles.find((file) => basename(file, extname(file)) === preferredStem);
  const fallback = markdownFiles.sort()[0];
  if (!fallback) {
    throw new Error(`MinerU did not generate any markdown file in: ${rootDir}`);
  }

  return preferred ?? fallback;
}

async function collectMarkdownFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && extname(entry.name) === '.md') {
      files.push(fullPath);
    }
  }

  return files;
}

async function fetchWithRetry(url: string | URL, options?: RequestInit, retries = 5, delayMs = 3000): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      console.warn(`[Fetch Retry] Attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}. Retrying in ${delayMs}ms...`);
      await delay(delayMs);
      delayMs *= 2; // 指数退避，降低外部 API 抖动时的重试压力。
    }
  }
  throw new Error('Fetch failed after all retries');
}

/* ---- WSL2 自动发现 ---- */

let cachedWslIp: string | null = null;

function getWslIp(): string | null {
  if (process.platform !== 'win32') return null;
  try {
    const output = execSync('wsl hostname -I', { encoding: 'utf8', timeout: 5000 }).trim();
    const ip = output.split(/\s+/)[0];
    if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      return ip;
    }
  } catch {
    // 未安装 WSL 或 WSL 未启动时直接回退到普通 localhost 探测。
  }
  return null;
}

function buildAlternativeUrl(originalUrl: string, newHost: string): string {
  try {
    const parsed = new URL(originalUrl);
    parsed.hostname = newHost;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return originalUrl;
  }
}

function isLocalhostUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

async function resolveApiUrl(configuredUrl: string): Promise<string> {
  const baseUrl = normalizeBaseUrl(configuredUrl);

  if (!isLocalhostUrl(baseUrl)) {
    return baseUrl;
  }

  // 优先尝试用户配置的 localhost，避免 Windows 原生服务被错误替换为 WSL 地址。
  if (await isUrlReachable(baseUrl)) {
    return baseUrl;
  }

  console.warn(`[MinerU] Configured API URL ${configuredUrl} is not reachable`);

  // WSL2 IP 通常会变化，但同一次进程内缓存可以减少重复探测。
  if (cachedWslIp) {
    const wslUrl = buildAlternativeUrl(baseUrl, cachedWslIp);
    if (await isUrlReachable(wslUrl)) {
      console.log(`[MinerU] Using cached WSL2 address: ${wslUrl}`);
      return wslUrl;
    }
    cachedWslIp = null;
  }

  // Windows 访问 WSL2 内服务时经常不能直接走 localhost，必要时动态发现 WSL IP。
  const wslIp = getWslIp();
  if (wslIp) {
    const wslUrl = buildAlternativeUrl(baseUrl, wslIp);
    if (await isUrlReachable(wslUrl)) {
      cachedWslIp = wslIp;
      console.log(`[MinerU] Discovered WSL2 instance at ${wslUrl}`);
      return wslUrl;
    }
  }

  // 保留原地址返回，让调用方抛出包含配置地址的连接错误。
  console.warn('[MinerU] No reachable MinerU HTTP API found (tried localhost and WSL2)');
  return baseUrl;
}
