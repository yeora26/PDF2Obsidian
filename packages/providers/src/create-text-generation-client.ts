import { OllamaClient } from './ollama/ollama-client.js';
import { OpenAICompatibleClient } from './openai-compatible/openai-compatible-client.js';
import type { TextGenerationClient, TextGenerationClientConfig } from './types.js';

export function createTextGenerationClient(config: TextGenerationClientConfig): TextGenerationClient {
  switch (config.provider) {
    case 'ollama':
      return new OllamaClient(config);
    case 'openai-compatible':
      return new OpenAICompatibleClient(config);
  }
}
