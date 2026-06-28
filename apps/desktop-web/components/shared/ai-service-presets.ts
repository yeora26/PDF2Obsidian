import type { ConfigData, SelectOption } from './config-utils';
import { getValue } from './config-utils';

export type AiServiceId = 'deepseek' | 'cloudflare' | 'openai' | 'openrouter' | 'custom' | 'ollama';

interface AiServicePreset {
  id: AiServiceId;
  label: string;
  provider: 'openai-compatible' | 'ollama';
  modelPlaceholder: string;
  baseUrlPlaceholder: string;
  apiKeyLabel: string;
  apiKeyEnvPlaceholder: string;
}

export const aiServicePresets: Record<AiServiceId, AiServicePreset> = {
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    provider: 'openai-compatible',
    modelPlaceholder: 'deepseek-v4-flash',
    baseUrlPlaceholder: 'https://api.deepseek.com',
    apiKeyLabel: 'DeepSeek API Key',
    apiKeyEnvPlaceholder: 'DEEPSEEK_API_KEY'
  },
  cloudflare: {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI',
    provider: 'openai-compatible',
    modelPlaceholder: '@cf/qwen/qwen3-30b-a3b-fp8',
    baseUrlPlaceholder: 'https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/v1',
    apiKeyLabel: 'Cloudflare API Token',
    apiKeyEnvPlaceholder: 'CLOUDFLARE_API_TOKEN'
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    provider: 'openai-compatible',
    modelPlaceholder: '填写模型名称',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    apiKeyLabel: 'OpenAI API Key',
    apiKeyEnvPlaceholder: 'OPENAI_API_KEY'
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    provider: 'openai-compatible',
    modelPlaceholder: '填写模型名称',
    baseUrlPlaceholder: 'https://openrouter.ai/api/v1',
    apiKeyLabel: 'OpenRouter API Key',
    apiKeyEnvPlaceholder: 'OPENROUTER_API_KEY'
  },
  custom: {
    id: 'custom',
    label: '自定义 OpenAI 兼容服务',
    provider: 'openai-compatible',
    modelPlaceholder: '填写模型名称',
    baseUrlPlaceholder: 'https://example.com/v1',
    apiKeyLabel: 'API Key',
    apiKeyEnvPlaceholder: 'AI_API_KEY'
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama 本地模型',
    provider: 'ollama',
    modelPlaceholder: 'qwen2.5:14b',
    baseUrlPlaceholder: 'http://127.0.0.1:11434',
    apiKeyLabel: '',
    apiKeyEnvPlaceholder: ''
  }
};

export const aiServiceOptions: SelectOption[] = Object.values(aiServicePresets).map(({ id, label }) => ({
  value: id,
  label
}));

export function getAiServiceId(data: ConfigData): AiServiceId {
  if (getValue<string>(data, 'translation.provider', 'openai-compatible') === 'ollama') return 'ollama';
  const preset = getValue<string>(data, 'translation.preset', 'custom');
  return preset in aiServicePresets && preset !== 'ollama' ? preset as AiServiceId : 'custom';
}

export function applyAiService(
  serviceId: string,
  onChange: (path: string, value: unknown) => void
): void {
  const preset = serviceId in aiServicePresets ? aiServicePresets[serviceId as AiServiceId] : aiServicePresets.custom;
  onChange('translation.provider', preset.provider);
  onChange('translation.preset', preset.id === 'ollama' ? undefined : preset.id);
  onChange('translation.model', preset.modelPlaceholder === '填写模型名称' ? '' : preset.modelPlaceholder);
  onChange('translation.baseUrl', preset.id === 'custom' ? '' : preset.baseUrlPlaceholder);
  onChange('translation.apiKey', undefined);
  onChange('translation.apiKeyEnv', preset.apiKeyEnvPlaceholder || undefined);
}
