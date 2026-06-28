import type {
  GenerateTextInput,
  TextGenerationClient,
  TextGenerationClientConfig
} from '../types.js';

interface OllamaChatResponse {
  message?: {
    role?: string;
    content?: string;
  };
  error?: string;
}

interface ErrorDetails {
  code: string;
  message: string;
}

export class OllamaClient implements TextGenerationClient {
  private warmedUp = false;

  constructor(private readonly config: TextGenerationClientConfig) {}

  async warmUp(): Promise<void> {
    if (this.warmedUp) return;

    const url = `${this.resolveBaseUrl()}/api/chat`;
    console.log(`[Ollama] 预热模型 ${this.config.model}…`);

    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60_000);
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.config.model,
            messages: [{ role: 'user', content: 'hi' }],
            stream: false,
            think: false,
            options: { num_predict: 1 }
          }),
          signal: controller.signal
        }).finally(() => clearTimeout(timer));

        if (response.ok) {
          this.warmedUp = true;
          console.log(`[Ollama] 模型 ${this.config.model} 已加载`);
          return;
        }

        if (response.status === 404 && attempt < maxAttempts) {
          console.log(`[Ollama] 模型加载中 (${attempt}/${maxAttempts})，等待 10 秒…`);
          await wait(10_000);
          continue;
        }

        throw new Error(`Ollama 预热失败：${response.status} ${await response.text()}`);
      } catch (error: unknown) {
        if (attempt >= maxAttempts) throw error;
        console.log(`[Ollama] 预热重试 (${attempt}/${maxAttempts})：${getErrorDetails(error).message}`);
        await wait(10_000);
      }
    }
  }

  async generateText(input: GenerateTextInput): Promise<string> {
    await this.warmUp();

    const url = `${this.resolveBaseUrl()}/api/chat`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.userPrompt }
          ],
          stream: false,
          think: false,
          options: {
            temperature: 0.3,
            num_ctx: 32768,
            num_predict: 16384
          }
        }),
        signal: controller.signal
      });
    } catch (error: unknown) {
      const details = getErrorDetails(error);
      throw new Error(
        `Ollama 请求失败 [${details.code}]：${details.message}（url=${url}，model=${this.config.model}）`
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Ollama 请求失败：${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as OllamaChatResponse;
    if (payload.error) throw new Error(`Ollama 错误：${payload.error}`);

    const content = payload.message?.content?.trim();
    if (!content) throw new Error('Ollama 返回了空内容');
    return content;
  }

  private resolveBaseUrl(): string {
    let baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    if (/^https:\/\/(localhost|127\.0\.0\.1)/i.test(baseUrl)) {
      baseUrl = baseUrl.replace(/^https:/, 'http:');
    }
    return baseUrl;
  }
}

function getErrorDetails(error: unknown): ErrorDetails {
  if (!(error instanceof Error)) return { code: 'UNKNOWN', message: String(error) };

  const cause = error.cause;
  if (typeof cause === 'object' && cause !== null) {
    const record = cause as Record<string, unknown>;
    return {
      code: typeof record.code === 'string' ? record.code : 'UNKNOWN',
      message: typeof record.message === 'string' ? record.message : error.message
    };
  }

  return { code: 'UNKNOWN', message: error.message };
}

async function wait(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}
