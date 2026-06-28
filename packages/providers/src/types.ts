export type TextGenerationProvider = 'openai-compatible' | 'ollama';

export interface TextGenerationClientConfig {
  provider: TextGenerationProvider;
  model: string;
  baseUrl: string;
  apiKeyEnv?: string | undefined;
  apiKey?: string | undefined;
}

export interface GenerateTextInput {
  systemPrompt: string;
  userPrompt: string;
}

export interface TextGenerationClient {
  generateText(input: GenerateTextInput): Promise<string>;
}
