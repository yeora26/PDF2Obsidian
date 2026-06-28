'use client';

import { Close, Content, Description, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState } from 'react';
import {
  applyWorkflowMode,
  getEnabledCapabilityLabels,
  getSupportedMineruBackend,
  getWorkflowMode,
  getValue,
  setNestedValue,
  updateProvider,
  workflowModes,
  type ConfigData,
  type StepProps,
  type WorkflowMode
} from './shared/config-utils';
import { ModeCard, SecretField, SelectField, TextField, ToggleField } from './shared/form-fields';
import { aiServiceOptions, aiServicePresets, applyAiService, getAiServiceId } from './shared/ai-service-presets';

type WizardStep = 'vault' | 'mineru' | 'ai' | 'output';

export interface OnboardingConfigResponse {
  data?: ConfigData;
  exists?: boolean;
  valid: boolean;
  error?: string;
}

interface OnboardingWizardProps {
  config?: OnboardingConfigResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}

const steps: Array<{ key: WizardStep; label: string; title: string }> = [
  { key: 'vault', label: '位置', title: '选择本地知识库' },
  { key: 'mineru', label: '解析', title: '配置 PDF 解析' },
  { key: 'ai', label: 'AI', title: '选择翻译和阅读能力' },
  { key: 'output', label: '输出', title: '确认输出增强' }
];

export function OnboardingWizard({ config, open, onOpenChange, onSaved }: OnboardingWizardProps) {
  const [data, setData] = useState<ConfigData>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const step = steps[stepIndex] ?? steps[0];
  const issues = useMemo(() => getStepIssues(data, step.key), [data, step.key]);
  const allIssues = useMemo(() => steps.flatMap((item) => getStepIssues(data, item.key)), [data]);

  useEffect(() => {
    if (config?.data) {
      setData(config.data);
    }
  }, [config?.data]);

  function updateConfig(path: string, value: unknown) {
    setData((current) => setNestedValue(current, path, value));
  }

  function closeWizard(nextOpen: boolean) {
    if (!nextOpen) {
      window.localStorage.setItem('pdf2obsidian.onboarding.dismissed', 'true');
    }
    onOpenChange(nextOpen);
  }

  async function saveConfig() {
    setSaving(true);
    setMessage(undefined);
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: normalizeWizardData(data) })
      });
      const payload = await response.json() as OnboardingConfigResponse;
      if (!response.ok || !payload.valid) {
        setMessage(payload.error ?? '配置校验失败，请检查标红项目。');
        return;
      }

      window.localStorage.setItem('pdf2obsidian.onboarding.completed', 'true');
      window.localStorage.removeItem('pdf2obsidian.onboarding.dismissed');
      await onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Root open={open} onOpenChange={closeWizard}>
      <Portal>
        <Overlay className="wizard-overlay" />
        <Content className="wizard-dialog">
          <div className="wizard-shell">
            <aside className="wizard-steps" aria-label="首次启动步骤">
              <div>
                <p className="eyebrow">First Run</p>
                <Title asChild>
                  <h2>首次启动向导</h2>
                </Title>
                <Description>
                  用四步完成本地处理配置，保存后即可上传 PDF。
                </Description>
              </div>
              <ol>
                {steps.map((item, index) => (
                  <li
                    data-active={index === stepIndex ? 'true' : 'false'}
                    data-done={index < stepIndex ? 'true' : 'false'}
                    key={item.key}
                  >
                    <button type="button" onClick={() => setStepIndex(index)}>
                      <span>{index + 1}</span>
                      <strong>{item.label}</strong>
                    </button>
                  </li>
                ))}
              </ol>
            </aside>

            <section className="wizard-content">
              <div className="wizard-header">
                <div>
                  <span>步骤 {stepIndex + 1} / {steps.length}</span>
                  <h3>{step.title}</h3>
                </div>
                <Close className="wizard-close" type="button" aria-label="关闭向导">×</Close>
              </div>

              <div className="wizard-body">
                {step.key === 'vault' ? <VaultStep data={data} onChange={updateConfig} /> : null}
                {step.key === 'mineru' ? <MineruStep data={data} onChange={updateConfig} /> : null}
                {step.key === 'ai' ? <AiStep data={data} onChange={updateConfig} /> : null}
                {step.key === 'output' ? <OutputStep data={data} onChange={updateConfig} /> : null}
              </div>

              <div className="wizard-issues">
                {issues.length === 0 ? (
                  <span data-state="ok">当前步骤已完整</span>
                ) : issues.map((issue) => <span data-state="todo" key={issue}>{issue}</span>)}
              </div>

              {message ? <p className="error-text">{message}</p> : null}

              <footer className="wizard-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setStepIndex(Math.max(stepIndex - 1, 0))}
                  disabled={stepIndex === 0 || saving}
                >
                  上一步
                </button>
                {stepIndex < steps.length - 1 ? (
                  <button
                    className="primary-button compact"
                    type="button"
                    onClick={() => setStepIndex(Math.min(stepIndex + 1, steps.length - 1))}
                    disabled={saving}
                  >
                    下一步
                  </button>
                ) : (
                  <button
                    className="primary-button compact"
                    type="button"
                    onClick={() => void saveConfig()}
                    disabled={saving || allIssues.length > 0}
                  >
                    {saving ? '保存中...' : '保存并开始使用'}
                  </button>
                )}
              </footer>
            </section>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}

function VaultStep({ data, onChange }: StepProps) {
  return (
    <div className="wizard-form">
      <TextField
        label="Obsidian Vault 路径"
        placeholder="/Users/you/Documents/Obsidian Vault"
        value={getValue(data, 'vault.path', '')}
        onChange={(value) => onChange('vault.path', value)}
      />
      <div className="field-grid">
        <TextField
          label="论文保存目录"
          placeholder="Thesis"
          value={getValue(data, 'vault.documentDir', 'Thesis')}
          onChange={(value) => onChange('vault.documentDir', value)}
        />
        <TextField
          label="图片目录名"
          placeholder="images"
          value={getValue(data, 'vault.imageDirName', 'images')}
          onChange={(value) => onChange('vault.imageDirName', value)}
        />
      </div>
      <p className="wizard-note">产物会写入 Vault 下的论文目录，上传的 PDF 和任务缓存仍保存在本项目的 `.pipeline/`。</p>
    </div>
  );
}

function MineruStep({ data, onChange }: StepProps) {
  const mode = getValue<string>(data, 'mineru.mode', 'local');

  return (
    <div className="wizard-form">
      <div className="mode-grid compact-modes">
        <ModeCard title="本地服务" desc="连接你电脑上的 MinerU HTTP 服务" active={mode !== 'official'} onClick={() => onChange('mineru.mode', 'local')} />
        <ModeCard title="官方 API" desc="使用 MinerU 官方精准解析接口" active={mode === 'official'} onClick={() => onChange('mineru.mode', 'official')} />
      </div>
      {mode === 'official' ? (
        <div className="field-grid">
          <SelectField
            label="云端模型"
            value={getValue(data, 'mineru.modelVersion', 'vlm')}
            options={[{ value: 'vlm', label: 'VLM 高精度' }, { value: 'pipeline', label: 'Pipeline 常规解析' }]}
            onChange={(value) => onChange('mineru.modelVersion', value)}
          />
          <SecretField
            label="MinerU Token 或环境变量名"
            placeholder="MINERU_OFFICIAL_API_TOKEN"
            value={getValue(data, 'mineru.apiTokenEnv', '')}
            onChange={(value) => onChange('mineru.apiTokenEnv', value)}
          />
        </div>
      ) : (
        <TextField
          label="MinerU API 地址"
          placeholder="http://127.0.0.1:30000"
          value={getValue(data, 'mineru.apiUrl', '')}
          onChange={(value) => onChange('mineru.apiUrl', value)}
        />
      )}
      <div className="field-grid">
        <SelectField
          label="解析后端"
          value={getSupportedMineruBackend(getValue(data, 'mineru.backend', 'pipeline'))}
          options={[{ value: 'pipeline', label: 'Pipeline' }, { value: 'vlm-http-client', label: 'VLM' }]}
          onChange={(value) => onChange('mineru.backend', value)}
        />
        <SelectField
          label="解析方案"
          value={getValue(data, 'mineru.method', 'auto')}
          options={[{ value: 'auto', label: '自动选择' }, { value: 'txt', label: '文字层提取' }, { value: 'ocr', label: '强制 OCR' }]}
          onChange={(value) => onChange('mineru.method', value)}
        />
      </div>
    </div>
  );
}

function AiStep({ data, onChange }: StepProps) {
  const mode = getWorkflowMode(data) as Exclude<WorkflowMode, 'custom'>;
  const serviceId = getAiServiceId(data);
  const service = aiServicePresets[serviceId];
  const translationEnabled = getValue(data, 'translation.enabled', true);
  const readingEnabled = getValue(data, 'readingAssets.enabled', true);
  const needsAiConfig = translationEnabled || readingEnabled;

  return (
    <div className="wizard-form">
      <div className="mode-grid workflow-grid">
        {workflowModes.map((item) => (
          <ModeCard
            active={mode === item.mode}
            desc={item.desc}
            key={item.mode}
            title={item.title}
            onClick={() => applyWorkflowMode(item.mode, data, onChange)}
          />
        ))}
      </div>
      {needsAiConfig ? (
        <>
          <div className="field-grid">
            <SelectField
              label="AI 服务"
              value={serviceId}
              options={aiServiceOptions}
              onChange={(value) => applyAiService(value, onChange)}
            />
            <TextField
              label="模型"
              placeholder={service.modelPlaceholder}
              value={getValue(data, 'translation.model', '')}
              onChange={(value) => onChange('translation.model', value)}
            />
          </div>
          <TextField
            label="Base URL"
            placeholder={service.baseUrlPlaceholder}
            value={getValue(data, 'translation.baseUrl', '')}
            onChange={(value) => onChange('translation.baseUrl', value)}
          />
          {service.provider === 'openai-compatible' ? (
            <div className="field-grid">
              <SecretField
                label={service.apiKeyLabel}
                placeholder="sk-..."
                value={getValue(data, 'translation.apiKey', '')}
                onChange={(value) => onChange('translation.apiKey', value)}
              />
              <TextField
                label="或环境变量名"
                placeholder={service.apiKeyEnvPlaceholder}
                value={getValue(data, 'translation.apiKeyEnv', '')}
                onChange={(value) => onChange('translation.apiKeyEnv', value)}
              />
            </div>
          ) : null}
        </>
      ) : (
        <p className="wizard-note">当前模式不会调用 AI 服务，适合先验证 PDF 解析和 Obsidian 导出。</p>
      )}
    </div>
  );
}

function OutputStep({ data, onChange }: StepProps) {
  const providers = getValue<string[]>(data, 'metadata.online.providers', []);

  return (
    <div className="wizard-form">
      <div className="toggle-grid">
        <ToggleField label="在线补全元数据" checked={getValue(data, 'metadata.online.enabled', false)} onChange={(value) => onChange('metadata.online.enabled', value)} />
        <ToggleField label="生成阅读材料" checked={getValue(data, 'readingAssets.enabled', true)} onChange={(value) => onChange('readingAssets.enabled', value)} />
        <ToggleField label="自动双链" checked={getValue(data, 'obsidian.autoLink.enabled', true)} onChange={(value) => onChange('obsidian.autoLink.enabled', value)} />
        <ToggleField label="生成 Bases 数据库" checked={getValue(data, 'obsidian.database.enabled', true)} onChange={(value) => onChange('obsidian.database.enabled', value)} />
      </div>
      {getValue(data, 'metadata.online.enabled', false) ? (
        <div className="checkbox-row">
          <label><input type="checkbox" checked={providers.includes('crossref')} onChange={(event) => onChange('metadata.online.providers', updateProvider(providers, 'crossref', event.target.checked))} />CrossRef</label>
          <label><input type="checkbox" checked={providers.includes('openalex')} onChange={(event) => onChange('metadata.online.providers', updateProvider(providers, 'openalex', event.target.checked))} />OpenAlex</label>
        </div>
      ) : null}
      <div className="wizard-summary">
        {getEnabledCapabilityLabels(data).map((item) => <span key={item}>{item}</span>)}
      </div>
    </div>
  );
}

function getStepIssues(data: ConfigData, step: WizardStep): string[] {
  const issues: string[] = [];
  if (step === 'vault') {
    if (!getValue(data, 'vault.path', '').trim()) issues.push('填写 Obsidian Vault 路径');
    if (!getValue(data, 'vault.documentDir', '').trim()) issues.push('填写论文保存目录');
  }

  if (step === 'mineru') {
    const mode = getValue<string>(data, 'mineru.mode', 'local');
    if (mode === 'official') {
      if (!getValue(data, 'mineru.apiTokenEnv', '').trim()) issues.push('填写 MinerU Token 或环境变量名');
    } else if (!getValue(data, 'mineru.apiUrl', '').trim()) {
      issues.push('填写 MinerU API 地址');
    }
  }

  if (step === 'ai') {
    const needsAi = getValue(data, 'translation.enabled', true) || getValue(data, 'readingAssets.enabled', true);
    const provider = getValue(data, 'translation.provider', 'openai-compatible');
    if (needsAi && !getValue(data, 'translation.model', '').trim()) issues.push('填写 AI 模型名称');
    if (needsAi && !getValue(data, 'translation.baseUrl', '').trim()) issues.push('填写 AI 服务 Base URL');
    if (needsAi && provider === 'openai-compatible') {
      const apiKey = getValue(data, 'translation.apiKey', '').trim();
      const apiKeyEnv = getValue(data, 'translation.apiKeyEnv', '').trim();
      if (!apiKey && !apiKeyEnv) issues.push('填写 AI 服务 API Key 或环境变量名');
    }
  }

  if (step === 'output' && getValue(data, 'metadata.online.enabled', false)) {
    if (getValue<string[]>(data, 'metadata.online.providers', []).length === 0) issues.push('至少选择一个元数据来源');
  }

  return issues;
}

function normalizeWizardData(data: ConfigData): ConfigData {
  let next = structuredClone(data);
  const mode = getValue<string>(next, 'mineru.mode', 'local');
  next = setNestedValue(next, 'mineru.mode', mode === 'official' ? 'official' : 'local');
  next = setNestedValue(next, 'mineru.backend', getSupportedMineruBackend(getValue<string>(next, 'mineru.backend', 'pipeline')));
  next = setNestedValue(next, 'metadata.online.providers', getValue<string[]>(next, 'metadata.online.providers', []).filter((item) => item === 'crossref' || item === 'openalex'));
  return next;
}
