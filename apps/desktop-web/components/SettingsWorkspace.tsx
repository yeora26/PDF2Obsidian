'use client';

import { useEffect, useState } from 'react';
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
  type WorkflowMode
} from './shared/config-utils';
import { ModeCard, SecretField, SelectField, TextField, ToggleField } from './shared/form-fields';
import { aiServiceOptions, aiServicePresets, applyAiService, getAiServiceId } from './shared/ai-service-presets';

interface ConfigResponse {
  data: ConfigData;
  exists: boolean;
  valid: boolean;
  error?: string;
}

export function SettingsWorkspace() {
  const [config, setConfig] = useState<ConfigResponse | undefined>();
  const [configData, setConfigData] = useState<ConfigData>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const issues = getSettingsIssues(configData);

  useEffect(() => {
    void refreshConfig();
  }, []);

  async function refreshConfig() {
    const response = await fetch('/api/config', { cache: 'no-store' });
    const next = await response.json() as ConfigResponse;
    setConfig(next);
    setConfigData(next.data ?? {});
  }

  async function saveConfig() {
    setBusy(true);
    setMessage(undefined);
    const dataToSave = normalizeSettingsData(configData);
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataToSave })
      });
      const next = await response.json() as ConfigResponse;
      setConfig(next);
      setConfigData(next.data ?? dataToSave);
      setMessage(response.ok ? '设置已保存' : next.error ?? '设置校验失败');
    } finally {
      setBusy(false);
    }
  }

  function updateConfig(path: string, value: unknown) {
    setConfigData((current) => setNestedValue(current, path, value));
  }

  return (
    <main className="settings-page">
      <header className="settings-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>本地设置</h1>
          <p className="topbar-subtitle">设置只保存在当前电脑，用于本地 Web 和 CLI 共用。</p>
        </div>
        <div className="settings-header-actions">
          <span className="status-badge" data-valid={config?.valid && issues.length === 0 ? 'true' : 'false'}>
            {config?.valid && issues.length === 0 ? '可用' : '待完善'}
          </span>
          <a className="ghost-link" href="/">返回工作台</a>
        </div>
      </header>

      <div className="settings-layout">
        <aside className="settings-aside">
          <section className="settings-status-card">
            <h2>{config?.exists ? '配置状态' : '首次配置'}</h2>
            <p>{issues.length === 0 ? '必要信息已填写，可以保存后回到工作台上传 PDF。' : '先补齐必要信息，保存后即可开始处理。'}</p>
            <div className="check-list">
              {issues.length === 0 ? (
                <span data-state="ok">必要信息已完整</span>
              ) : issues.map((issue) => <span data-state="todo" key={issue}>{issue}</span>)}
            </div>
          </section>
        </aside>

        <section className="settings-card">
          <div className="panel-title">
            <h2>处理配置</h2>
            <span>{config?.exists ? '已创建本地配置' : '尚未保存'}</span>
          </div>
          {config?.error ? <p className="error-text">{config.error}</p> : null}
          <ConfigForm data={configData} onChange={updateConfig} />
        </section>
      </div>

      <div className="settings-savebar">
        <p className="hint">{message ?? (issues.length ? `还有 ${issues.length} 项需要完善` : '设置会保存到当前电脑')}</p>
        <button className="primary-button compact" type="button" onClick={saveConfig} disabled={busy}>
          {busy ? '保存中...' : '保存设置'}
        </button>
      </div>
    </main>
  );
}

function ConfigForm({
  data,
  onChange
}: {
  data: ConfigData;
  onChange: (path: string, value: unknown) => void;
}) {
  const providers = getValue<string[]>(data, 'metadata.online.providers', []);
  const mineruMode: string = getValue(data, 'mineru.mode', 'local');
  const serviceId = getAiServiceId(data);
  const service = aiServicePresets[serviceId];
  const translationEnabled = getValue(data, 'translation.enabled', true);
  const metadataOnlineEnabled = getValue(data, 'metadata.online.enabled', false);
  const readingAssetsEnabled = getValue(data, 'readingAssets.enabled', true);
  const needsAiConfig = translationEnabled || readingAssetsEnabled;
  const workflowMode = getWorkflowMode(data);
  const enabledCapabilities = getEnabledCapabilityLabels(data);

  return (
    <div className="settings-form">
      <section className="settings-group">
        <div className="settings-group-title">
          <div>
            <h3>存放位置</h3>
            <p>选择生成笔记要写入的本地知识库位置。</p>
          </div>
        </div>
        <TextField label="Vault 绝对路径" placeholder="/Users/you/Documents/Obsidian Vault" value={getValue(data, 'vault.path', '')} onChange={(value) => onChange('vault.path', value)} />
        <div className="field-grid">
          <TextField label="论文保存目录" placeholder="Thesis" value={getValue(data, 'vault.documentDir', 'Thesis')} onChange={(value) => onChange('vault.documentDir', value)} />
          <TextField label="图片目录名" placeholder="images" value={getValue(data, 'vault.imageDirName', 'images')} onChange={(value) => onChange('vault.imageDirName', value)} />
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group-title">
          <div>
            <h3>处理能力</h3>
            <p>选择你希望每篇论文生成到什么程度，系统会自动调整下面的功能开关。</p>
          </div>
        </div>
        <div className="mode-grid workflow-grid">
          {workflowModes.map((item) => (
            <ModeCard
              active={workflowMode === item.mode}
              desc={item.desc}
              key={item.mode}
              title={item.title}
              onClick={() => applyWorkflowMode(item.mode, data, onChange)}
            />
          ))}
        </div>
        <div className="capability-strip settings-capabilities">
          {enabledCapabilities.map((item) => <span key={item}>{item}</span>)}
        </div>
        {workflowMode === 'custom' ? <p className="muted-note">当前是自定义能力组合，保存后会按下方开关执行。</p> : null}
      </section>

      <section className="settings-group">
        <div className="settings-group-title">
          <div>
            <h3>PDF 解析</h3>
            <p>个人本地使用一般选择"本地服务"。</p>
          </div>
        </div>
        <div className="mode-grid compact-modes">
          <ModeCard title="本地服务" desc="连接你电脑上的 MinerU HTTP 服务" active={mineruMode !== 'official'} onClick={() => onChange('mineru.mode', 'local')} />
          <ModeCard title="MinerU 云端 API" desc="填写 Token 后使用云端解析" active={mineruMode === 'official'} onClick={() => onChange('mineru.mode', 'official')} />
        </div>
        {mineruMode === 'official' ? (
          <div className="field-grid">
            <SelectField label="云端模型" value={getValue(data, 'mineru.modelVersion', 'vlm')} options={[{ value: 'vlm', label: 'VLM 高精度' }, { value: 'pipeline', label: 'Pipeline 常规解析' }]} onChange={(value) => onChange('mineru.modelVersion', value)} />
            <SecretField label="MinerU API Key / Token" placeholder="eyJ... 或 MINERU_OFFICIAL_API_TOKEN" value={getValue(data, 'mineru.apiTokenEnv', '')} onChange={(value) => onChange('mineru.apiTokenEnv', value)} />
          </div>
        ) : (
          <>
            <TextField label="MinerU API 地址" placeholder="http://127.0.0.1:30000" value={getValue(data, 'mineru.apiUrl', '')} onChange={(value) => onChange('mineru.apiUrl', value)} />
            <details className="advanced-fields">
              <summary>高级设置</summary>
              <TextField label="MinerU 命令路径" placeholder="./.venv-mineru/bin/mineru" value={getValue(data, 'mineru.command', '')} onChange={(value) => onChange('mineru.command', value)} />
            </details>
          </>
        )}
        <div className="field-grid">
          <SelectField label="解析后端" value={getSupportedMineruBackend(getValue(data, 'mineru.backend', 'pipeline'))} options={[{ value: 'pipeline', label: 'Pipeline' }, { value: 'vlm-http-client', label: 'VLM' }]} onChange={(value) => onChange('mineru.backend', value)} />
          <SelectField label="解析方案" value={getValue(data, 'mineru.method', 'auto')} options={[{ value: 'auto', label: '自动选择' }, { value: 'txt', label: '文字层提取' }, { value: 'ocr', label: '强制 OCR' }]} onChange={(value) => onChange('mineru.method', value)} />
        </div>
        <div className="toggle-grid">
          <ToggleField label="表格识别" checked={getValue(data, 'mineru.table', true)} onChange={(value) => onChange('mineru.table', value)} />
          <ToggleField label="公式识别" checked={getValue(data, 'mineru.formula', true)} onChange={(value) => onChange('mineru.formula', value)} />
          <ToggleField label="图片分析" checked={getValue(data, 'mineru.imageAnalysis', false)} onChange={(value) => onChange('mineru.imageAnalysis', value)} />
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group-title">
          <div>
            <h3>AI 服务</h3>
            <p>翻译和阅读材料共用这里的 AI 服务；支持 OpenAI 兼容接口和 Ollama 本地模型。</p>
          </div>
        </div>
        <ToggleField label="启用正文翻译" checked={translationEnabled} onChange={(value) => onChange('translation.enabled', value)} />
        {needsAiConfig ? (
          <>
            <div className="field-grid">
              <SelectField label="AI 服务" value={serviceId} options={aiServiceOptions} onChange={(value) => applyAiService(value, onChange)} />
              <TextField label="模型" placeholder={service.modelPlaceholder} value={getValue(data, 'translation.model', '')} onChange={(value) => onChange('translation.model', value)} />
            </div>
            <TextField label="Base URL" placeholder={service.baseUrlPlaceholder} value={getValue(data, 'translation.baseUrl', '')} onChange={(value) => onChange('translation.baseUrl', value)} />
            {service.provider === 'openai-compatible' ? (
              <div className="field-grid">
                <SecretField label={service.apiKeyLabel} placeholder="sk-..." value={getValue(data, 'translation.apiKey', '')} onChange={(value) => onChange('translation.apiKey', value)} />
                <TextField label="或环境变量名" placeholder={service.apiKeyEnvPlaceholder} value={getValue(data, 'translation.apiKeyEnv', '')} onChange={(value) => onChange('translation.apiKeyEnv', value)} />
              </div>
            ) : null}
          </>
        ) : (
          <p className="muted-note">正文翻译和阅读材料都关闭后，不会调用 AI 服务。</p>
        )}
        {!translationEnabled && readingAssetsEnabled ? <p className="cost-note">正文翻译已关闭，但阅读材料仍会调用 AI。</p> : null}
      </section>

      <section className="settings-group">
        <div className="settings-group-title">
          <div>
            <h3>输出增强</h3>
            <p>控制元数据补全、阅读材料、双链和 Bases 数据库。</p>
          </div>
        </div>
        <ToggleField label="在线补全元数据" checked={metadataOnlineEnabled} onChange={(value) => onChange('metadata.online.enabled', value)} />
        {metadataOnlineEnabled ? (
          <div className="checkbox-row">
            <label><input type="checkbox" checked={providers.includes('crossref')} onChange={(event) => onChange('metadata.online.providers', updateProvider(providers, 'crossref', event.target.checked))} />CrossRef</label>
            <label><input type="checkbox" checked={providers.includes('openalex')} onChange={(event) => onChange('metadata.online.providers', updateProvider(providers, 'openalex', event.target.checked))} />OpenAlex</label>
          </div>
        ) : null}
        <div className="toggle-grid">
          <ToggleField label="生成阅读材料" checked={readingAssetsEnabled} onChange={(value) => onChange('readingAssets.enabled', value)} />
          <ToggleField label="自动双链" checked={getValue(data, 'obsidian.autoLink.enabled', true)} onChange={(value) => onChange('obsidian.autoLink.enabled', value)} />
          <ToggleField label="生成 Bases 数据库" checked={getValue(data, 'obsidian.database.enabled', true)} onChange={(value) => onChange('obsidian.database.enabled', value)} />
        </div>
        {readingAssetsEnabled ? <p className="cost-note">阅读材料会额外调用 AI 生成摘要、术语表和问答，可能产生模型服务费用或本地推理耗时。</p> : null}
      </section>
    </div>
  );
}

function normalizeSettingsData(data: ConfigData): ConfigData {
  let next = structuredClone(data);
  const mode = getValue<string>(next, 'mineru.mode', 'local');
  const backend = getSupportedMineruBackend(getValue<string>(next, 'mineru.backend', 'pipeline'));
  next = setNestedValue(next, 'mineru.mode', mode === 'official' ? 'official' : 'local');
  next = setNestedValue(next, 'mineru.backend', backend);
  return next;
}

function getSettingsIssues(data: ConfigData): string[] {
  const issues: string[] = [];
  const mineruMode = getValue<string>(data, 'mineru.mode', 'local');
  const translationEnabled = getValue(data, 'translation.enabled', true);
  const readingAssetsEnabled = getValue(data, 'readingAssets.enabled', true);
  const translationProvider = getValue<string>(data, 'translation.provider', 'openai-compatible');
  const needsAiConfig = translationEnabled || readingAssetsEnabled;

  if (!getValue(data, 'vault.path', '').trim()) {
    issues.push('填写 Obsidian Vault 路径');
  }

  if (mineruMode === 'official') {
    if (!getValue(data, 'mineru.apiTokenEnv', '').trim()) {
      issues.push('填写 MinerU 云端 API Key');
    }
  } else if (!getValue(data, 'mineru.apiUrl', '').trim()) {
    issues.push('填写 MinerU 本地服务地址');
  }

  if (needsAiConfig) {
    if (!getValue(data, 'translation.model', '').trim()) {
      issues.push('填写 AI 模型');
    }
    if (!getValue(data, 'translation.baseUrl', '').trim()) {
      issues.push('填写 AI 服务地址');
    }
    if (
      translationProvider === 'openai-compatible' &&
      !getValue(data, 'translation.apiKey', '').trim() &&
      !getValue(data, 'translation.apiKeyEnv', '').trim()
    ) {
      issues.push('填写 AI 服务 API Key 或环境变量名');
    }
  }

  return issues;
}
