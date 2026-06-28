'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { OnboardingWizard, type OnboardingConfigResponse } from './OnboardingWizard';

type TaskStatus = 'queued' | 'running' | 'completed' | 'failed';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
type ArtifactKind = 'original' | 'translated' | 'index' | 'database' | 'summary' | 'terms' | 'qa';
type OutputViewKind = 'translated' | 'reading' | 'metadata' | 'database';
type ReadingKind = 'summary' | 'terms' | 'qa';

type ConfigResponse = OnboardingConfigResponse;

interface LocalTaskStep {
  step: string;
  status: StepStatus;
  message?: string;
}

interface LocalTask {
  id: string;
  fileName: string;
  pdfPath: string;
  status: TaskStatus;
  progress: number;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  result?: {
    slug: string;
    originalNotePath?: string;
    translatedNotePath: string;
    indexNotePath: string;
    databaseNotePath?: string;
    configSummary?: {
      mineruMode: string;
      mineruBackend: string;
      translationEnabled: boolean;
      translationSkipped?: boolean;
      translationProvider?: string;
      translationModel?: string;
      readingAssetsEnabled?: boolean;
    };
  };
  steps: LocalTaskStep[];
  logs: string[];
}

interface ArtifactState {
  kind: ArtifactKind;
  view: OutputViewKind;
  path?: string;
  content?: string;
  error?: string;
}

const stepLabels: Record<string, string> = {
  upload: '读取论文',
  mineru: '提取内容',
  normalize: '整理结构',
  translate: '生成译文',
  obsidian_export: '写入笔记',
  quality_check: '质量检查'
};

const outputViews: Array<{ kind: OutputViewKind; label: string; source: ArtifactKind }> = [
  { kind: 'translated', label: '译文', source: 'translated' },
  { kind: 'reading', label: '阅读材料', source: 'summary' },
  { kind: 'metadata', label: '论文信息', source: 'index' },
  { kind: 'database', label: 'Bases', source: 'database' }
];

const readingViews: Array<{ kind: ReadingKind; label: string; desc: string }> = [
  { kind: 'summary', label: '摘要', desc: '核心观点' },
  { kind: 'terms', label: '术语表', desc: '关键概念' },
  { kind: 'qa', label: '问答', desc: '复习问题' }
];

export function LocalWorkspace() {
  const [config, setConfig] = useState<ConfigResponse | undefined>();
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [artifact, setArtifact] = useState<ArtifactState | undefined>();
  const [activeView, setActiveView] = useState<OutputViewKind>('translated');
  const [readingKind, setReadingKind] = useState<ReadingKind>('summary');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [actionMessage, setActionMessage] = useState<string | undefined>();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);

  const selectedTask = useMemo(() => {
    return tasks.find((task) => task.id === selectedTaskId) ?? tasks[0];
  }, [selectedTaskId, tasks]);
  const selectedTaskHasOutput = Boolean(selectedTask?.result);
  const translationSkipped = selectedTask?.result?.configSummary?.translationSkipped === true;
  const visibleOutputViews = useMemo(() => {
    return outputViews.filter((view) => {
      if (view.kind === 'database' && !selectedTask?.result?.databaseNotePath) return false;
      if (view.kind === 'translated' && translationSkipped) return false;
      return true;
    });
  }, [selectedTask?.result?.databaseNotePath, translationSkipped]);

  useEffect(() => {
    void refreshConfig();
    void refreshTasks();
  }, []);

  useEffect(() => {
    if (!config) return;
    if (config.valid && config.exists) return;

    const completed = window.localStorage.getItem('pdf2obsidian.onboarding.completed') === 'true';
    const dismissed = window.localStorage.getItem('pdf2obsidian.onboarding.dismissed') === 'true';
    if (!completed && !dismissed) {
      setOnboardingOpen(true);
    }
  }, [config]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshTasks();
    }, 1800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedTaskHasOutput) {
      if (translationSkipped) {
        setActiveView('reading');
        setReadingKind('summary');
        if (selectedTask) void loadArtifact(selectedTask.id, 'summary', 'reading');
      } else {
        setActiveView('translated');
        setReadingKind('summary');
        if (selectedTask) void loadArtifact(selectedTask.id, 'translated', 'translated');
      }
    } else {
      setArtifact(undefined);
    }
  }, [selectedTask?.id, selectedTaskHasOutput, translationSkipped]);

  async function refreshConfig() {
    const response = await fetch('/api/config', { cache: 'no-store' });
    setConfig(await response.json() as ConfigResponse);
  }

  async function refreshTasks() {
    const response = await fetch('/api/tasks', { cache: 'no-store' });
    const payload = await response.json() as { tasks: LocalTask[] };
    setTasks(payload.tasks);
    setSelectedTaskId((current) => {
      if (current && payload.tasks.some((task) => task.id === current)) return current;
      return payload.tasks[0]?.id;
    });
  }

  async function uploadPdf(formData: FormData) {
    setBusy(true);
    setMessage(undefined);
    try {
      const response = await fetch('/api/tasks', { method: 'POST', body: formData });
      const payload = await response.json() as { task?: LocalTask; error?: string };
      if (!response.ok || !payload.task) {
        setMessage(payload.error ?? '上传失败');
        return;
      }
      setSelectedTaskId(payload.task.id);
      await refreshTasks();
      setMessage('任务已创建');
    } finally {
      setBusy(false);
    }
  }

  async function importFromUrl() {
    const url = urlInput.trim();
    if (!url) return;
    setUrlBusy(true);
    setMessage(undefined);
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const payload = await response.json() as { task?: LocalTask; error?: string };
      if (!response.ok || !payload.task) {
        setMessage(payload.error ?? '导入失败');
        return;
      }
      setUrlInput('');
      setSelectedTaskId(payload.task.id);
      await refreshTasks();
      setMessage('任务已创建');
    } finally {
      setUrlBusy(false);
    }
  }

  async function loadArtifact(taskId: string, kind: ArtifactKind, view: OutputViewKind) {
    const response = await fetch(`/api/tasks/${taskId}/artifact?kind=${kind}`, { cache: 'no-store' });
    const payload = await response.json() as Omit<ArtifactState, 'kind' | 'view'>;
    setArtifact({ ...payload, kind, view });
  }

  async function selectOutputView(view: OutputViewKind) {
    if (!selectedTask) return;
    const outputView = visibleOutputViews.find((item) => item.kind === view);
    if (!outputView) return;
    setActiveView(view);
    const source = view === 'reading' ? readingKind : outputView.source;
    await loadArtifact(selectedTask.id, source, view);
  }

  async function selectReadingView(kind: ReadingKind) {
    if (!selectedTask) return;
    setReadingKind(kind);
    setActiveView('reading');
    await loadArtifact(selectedTask.id, kind, 'reading');
  }

  async function deleteTask(task: LocalTask) {
    const confirmed = window.confirm('删除后会移除本地任务记录和上传的 PDF，不会删除已经写入 Vault 的笔记产物。确定删除吗？');
    if (!confirmed) return;
    setActionMessage(undefined);
    const response = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      setActionMessage(payload.error ?? '删除失败');
      return;
    }
    setArtifact(undefined);
    await refreshTasks();
    setActionMessage('任务已删除');
  }

  async function retryTask(task: LocalTask) {
    setActionMessage(undefined);
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'retry' })
    });
    const payload = await response.json() as { task?: LocalTask; error?: string };
    if (!response.ok || !payload.task) {
      setActionMessage(payload.error ?? '重试失败');
      return;
    }
    setSelectedTaskId(payload.task.id);
    await refreshTasks();
    setActionMessage('任务已重新开始');
  }

  const hasOutput = selectedTaskHasOutput;
  const taskSummary = getTaskSummary(tasks);
  const activeStep = selectedTask?.steps.find((step) => step.status === 'running')
    ?? selectedTask?.steps.find((step) => step.status === 'failed')
    ?? selectedTask?.steps.find((step) => step.status === 'pending');
  const currentStatusText = selectedTask
    ? activeStep && selectedTask.status !== 'completed' ? `${stepLabels[activeStep.step] ?? activeStep.step} ${formatStepStatus(activeStep.status)}` : undefined
    : undefined;

  return (
    <main className="app-shell" data-with-output={hasOutput ? 'true' : 'false'}>
      <aside className="left-rail">
        <div className="rail-header">
          <div>
            <p className="eyebrow">PDF2Obsidian</p>
            <h1>论文处理工作台</h1>
          </div>
          <div className="rail-actions">
            <button className="icon-link" type="button" onClick={() => {
              window.localStorage.removeItem('pdf2obsidian.onboarding.dismissed');
              setOnboardingOpen(true);
            }}>向导</button>
            <a className="icon-link" href="/settings" title="设置">设置</a>
          </div>
        </div>

        <div className="upload-zone">
          <label className="upload-card">
            <span className="upload-icon">↑</span>
            <div className="upload-text">
              <strong>{busy ? '上传中...' : config?.valid ? '上传或拖入 PDF' : '先完成设置'}</strong>
              <span>{message || (config?.valid ? '选择文件后立即进入处理队列' : '设置 Vault 与解析服务后即可上传')}</span>
            </div>
            <input
              accept="application/pdf,.pdf"
              disabled={busy || !config?.valid}
              name="file"
              type="file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.set('file', file);
                void uploadPdf(formData).finally(() => {
                  event.currentTarget.value = '';
                });
              }}
            />
          </label>

          <div className="url-divider">
            <span>或从链接导入</span>
          </div>

          <div className="url-import">
            <input
              className="url-input"
              disabled={urlBusy || !config?.valid}
              placeholder="arXiv ID、DOI 或 PDF 链接"
              type="text"
              value={urlInput}
              onChange={(event) => setUrlInput(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void importFromUrl();
              }}
            />
            <button
              className="url-submit"
              disabled={urlBusy || !config?.valid || !urlInput.trim()}
              type="button"
              onClick={() => void importFromUrl()}
            >
              {urlBusy ? '导入中' : '导入'}
            </button>
          </div>
        </div>

        {!config?.valid ? (
          <div className="setup-warning">
            <strong>配置未完成</strong>
            {config?.error ? <small>{config.error}</small> : <small>完成首次启动向导后即可上传 PDF。</small>}
            <div className="setup-actions">
              <button type="button" onClick={() => setOnboardingOpen(true)}>打开向导</button>
              <a href="/settings">高级设置</a>
            </div>
          </div>
        ) : null}

        <div className="task-summary">
          <div>
            <strong>{taskSummary.total}</strong>
            <span>全部</span>
          </div>
          <div>
            <strong>{taskSummary.running}</strong>
            <span>处理中</span>
          </div>
          <div>
            <strong>{taskSummary.completed}</strong>
            <span>完成</span>
          </div>
          <div>
            <strong>{taskSummary.failed}</strong>
            <span>失败</span>
          </div>
        </div>

        <div className="rail-section-title">
          <span>任务</span>
          <button type="button" onClick={() => void refreshTasks()}>刷新</button>
        </div>
        {actionMessage ? <p className="rail-message">{actionMessage}</p> : null}

        <div className="task-list">
          {tasks.length === 0 ? <p className="empty">暂无解析任务</p> : null}
          {tasks.map((task) => (
            <div
              className="task-item"
              data-active={selectedTask?.id === task.id ? 'true' : 'false'}
              data-status={task.status}
              key={task.id}
            >
              <button
                className="task-card"
                type="button"
                onClick={() => setSelectedTaskId(task.id)}
              >
                <div className="task-title-row">
                  <span>{task.fileName}</span>
                  <strong>{formatStatus(task.status)}</strong>
                </div>
                <p className="task-meta">{getTaskHint(task)}</p>
                <div className="mini-progress"><span style={{ width: `${task.progress}%` }} /></div>
                {task.error ? <p className="task-error">{task.error}</p> : null}
              </button>
              {canRetryTask(task) || canDeleteTask(task) ? (
                <div className="task-actions">
                  {canRetryTask(task) ? (
                    <button className="mini-action" type="button" onClick={() => void retryTask(task)}>
                      重试
                    </button>
                  ) : null}
                  {canDeleteTask(task) ? (
                    <button className="mini-action danger" type="button" onClick={() => void deleteTask(task)}>
                      删除
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </aside>

      <section className="preview-pane" data-with-output={hasOutput ? 'true' : 'false'}>
        <PaneHeader
          title="原文件"
          subtitle={selectedTask?.fileName ?? '选择或上传 PDF'}
        />
        {selectedTask ? (
          <div className="pdf-viewer">
            <iframe className="pdf-frame" src={getPdfPreviewSrc(selectedTask.id)} title={selectedTask.fileName} />
          </div>
        ) : (
          <div className="empty-pane">
            <strong>从左侧上传一篇 PDF</strong>
            <span>上传后会在这里预览原文件，并在右侧显示生成结果。</span>
          </div>
        )}
      </section>

      {hasOutput ? (
        <section className="output-pane">
          <PaneHeader title="输出结果" subtitle={selectedTask?.result?.slug ?? 'Markdown'}>
            {selectedTask ? <CompactStatus task={selectedTask} text={currentStatusText} /> : null}
          </PaneHeader>
          <div className="artifact-tabs">
            {visibleOutputViews.map((item) => (
              <button
                aria-label={`查看${item.label}`}
                className="tab-button"
                data-active={activeView === item.kind ? 'true' : 'false'}
                key={item.kind}
                type="button"
                onClick={() => void selectOutputView(item.kind)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {artifact?.error ? <p className="error-text">{artifact.error}</p> : null}
          <OutputContent
            artifact={artifact}
            readingKind={readingKind}
            selectedTask={selectedTask}
            view={activeView}
            onReadingChange={(kind) => void selectReadingView(kind)}
          />
        </section>
      ) : null}
      <OnboardingWizard
        config={config}
        open={onboardingOpen}
        onOpenChange={setOnboardingOpen}
        onSaved={async () => {
          await refreshConfig();
          await refreshTasks();
        }}
      />
    </main>
  );
}

function CompactStatus({ task, text }: { task?: LocalTask; text?: string }) {
  if (!task) return null;
  return (
    <div className="compact-status" data-status={task.status}>
      <strong>{formatStatus(task.status)}</strong>
      {text ? <span>{text}</span> : null}
    </div>
  );
}

function PaneHeader({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="pane-header">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {children ? <div className="pane-actions">{children}</div> : null}
    </div>
  );
}

function OutputContent({
  artifact,
  readingKind,
  selectedTask,
  view,
  onReadingChange
}: {
  artifact?: ArtifactState;
  readingKind: ReadingKind;
  selectedTask?: LocalTask;
  view: OutputViewKind;
  onReadingChange: (kind: ReadingKind) => void;
}) {
  if (view === 'reading') {
    return (
      <div className="output-document">
        <div className="reading-switcher">
          {readingViews.map((item) => (
            <button
              className="reading-button"
              data-active={readingKind === item.kind ? 'true' : 'false'}
              key={item.kind}
              type="button"
              onClick={() => onReadingChange(item.kind)}
            >
              <strong>{item.label}</strong>
              <span>{item.desc}</span>
            </button>
          ))}
        </div>
        <MarkdownPreview
          content={artifact?.content}
          emptyTitle="暂无阅读材料"
          emptyText="开启“生成阅读材料”后，任务会额外生成摘要、术语表和问答。"
        />
      </div>
    );
  }

  if (view === 'metadata') {
    return <MetadataView content={artifact?.content} />;
  }


  return (
    <MarkdownPreview
      content={artifact?.content}
      emptyTitle="暂无输出内容"
      emptyText="任务完成后会在这里显示生成内容。"
    />
  );
}

function MetadataView({ content }: { content?: string }) {
  const metadata = useMemo(() => parseFrontmatter(content ?? ''), [content]);
  const rows = createMetadataRows(metadata);

  if (rows.length === 0) {
    return (
      <div className="structured-empty">
        <strong>暂无论文信息</strong>
        <span>任务完成后会在这里展示标题、作者、DOI、来源和关键词。</span>
      </div>
    );
  }

  return (
    <div className="metadata-view">
      <div className="metadata-title">
        <span>论文信息</span>
        <strong>{metadata.translatedTitle ?? metadata.title ?? '未命名论文'}</strong>
      </div>
      <div className="metadata-grid">
        {rows.map((row) => (
          <div className="metadata-row" key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarkdownPreview({
  content,
  emptyText = '任务完成后会在这里显示生成内容。',
  emptyTitle = '暂无输出内容'
}: {
  content?: string;
  emptyText?: string;
  emptyTitle?: string;
}) {
  const displayContent = useMemo(() => stripFrontmatter(content ?? ''), [content]);
  const blocks = useMemo(() => parseMarkdownBlocks(displayContent), [displayContent]);

  if (!displayContent) {
    return (
      <div className="markdown-preview empty-output">
        <strong>{emptyTitle}</strong>
        <span>{emptyText}</span>
      </div>
    );
  }

  return (
    <article className="markdown-preview">
      {blocks.map((block, index) => renderMarkdownBlock(block, index))}
    </article>
  );
}

type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'code'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'table'; text: string };

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith('```')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({ type: 'code', text: code.join('\n') });
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2] ?? ''
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quotes: string[] = [];
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('>')) {
        quotes.push((lines[index] ?? '').trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', text: quotes.join('\n') });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? '').trim();
        if (!/^[-*]\s+/.test(item) && !/^\d+\.\s+/.test(item)) break;
        items.push(item.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    if (trimmed.startsWith('|')) {
      const table: string[] = [];
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('|')) {
        table.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({ type: 'table', text: table.join('\n') });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? '';
      const currentTrimmed = current.trim();
      if (!currentTrimmed) break;
      if (
        currentTrimmed.startsWith('```') ||
        currentTrimmed.startsWith('>') ||
        currentTrimmed.startsWith('|') ||
        /^#{1,3}\s+/.test(currentTrimmed) ||
        /^[-*]\s+/.test(currentTrimmed) ||
        /^\d+\.\s+/.test(currentTrimmed)
      ) {
        break;
      }
      paragraph.push(currentTrimmed);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

function renderMarkdownBlock(block: MarkdownBlock, index: number) {
  if (block.type === 'heading') {
    const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3';
    return <Tag key={index}>{block.text}</Tag>;
  }

  if (block.type === 'list') {
    return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>;
  }

  if (block.type === 'code') {
    return <pre className="md-code" key={index}>{block.text}</pre>;
  }

  if (block.type === 'quote') {
    return <blockquote key={index}>{block.text}</blockquote>;
  }

  if (block.type === 'table') {
    return <pre className="md-table" key={index}>{block.text}</pre>;
  }

  return <p key={index}>{block.text}</p>;
}

interface MetadataRow {
  label: string;
  value: string;
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

function parseFrontmatter(markdown: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown.trimStart());
  if (!match) return {};

  const metadata: Record<string, string> = {};
  let currentKey: string | undefined;
  const listValues: string[] = [];

  function commitList() {
    if (currentKey && listValues.length > 0) {
      metadata[currentKey] = listValues.join('、');
    }
    listValues.length = 0;
  }

  for (const rawLine of (match[1] ?? '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const listItem = /^\s*-\s+(.+)$/.exec(line);
    if (listItem && currentKey) {
      listValues.push(cleanMetadataValue(listItem[1] ?? ''));
      continue;
    }

    const keyValue = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!keyValue) continue;

    commitList();
    currentKey = keyValue[1];
    const value = cleanMetadataValue(keyValue[2] ?? '');
    if (value) {
      metadata[currentKey] = value;
      currentKey = undefined;
    } else {
      metadata[keyValue[1] ?? ''] = '';
    }
  }
  commitList();

  return metadata;
}

function cleanMetadataValue(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '');
}

function createMetadataRows(metadata: Record<string, string>): MetadataRow[] {
  const candidates: Array<[keyof typeof metadata | string, string]> = [
    ['title', '标题'],
    ['paperTitle', '原文标题'],
    ['translatedTitle', '中文标题'],
    ['authors', '作者'],
    ['year', '年份'],
    ['journal', '期刊/会议'],
    ['publisher', '出版社'],
    ['doi', 'DOI'],
    ['metadataSources', '元数据来源'],
    ['keywords', '关键词'],
    ['fieldsOfStudy', '研究领域']
  ];

  return candidates
    .map(([key, label]) => ({ label, value: metadata[key] }))
    .filter((row): row is MetadataRow => Boolean(row.value));
}

function getPdfPreviewSrc(taskId: string): string {
  const params = new URLSearchParams({
    toolbar: '0',
    navpanes: '0',
    scrollbar: '0',
    view: 'FitH',
    zoom: 'page-width'
  });
  return `/api/tasks/${taskId}/pdf#${params.toString()}`;
}

function getTaskCapabilities(task: LocalTask): string[] {
  const capabilities = ['PDF 解析', 'Obsidian 写入'];
  if (task.result?.configSummary?.translationEnabled !== false) {
    capabilities.push('AI 译文');
  }
  if (task.result?.configSummary?.readingAssetsEnabled) {
    capabilities.push('AI 阅读材料');
  }
  if (task.steps.some((step) => step.step === 'quality_check' && step.status === 'completed')) {
    capabilities.push('质量检查');
  }
  if (task.result?.databaseNotePath) {
    capabilities.push('Bases 数据库');
  }
  return capabilities;
}

function getTaskSummary(tasks: LocalTask[]) {
  return {
    total: tasks.length,
    running: tasks.filter((task) => task.status === 'queued' || task.status === 'running').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    failed: tasks.filter((task) => task.status === 'failed').length
  };
}

function canRetryTask(task: LocalTask): boolean {
  return task.status === 'failed';
}

function canDeleteTask(task: LocalTask): boolean {
  return task.status !== 'queued' && task.status !== 'running';
}

function getTaskHint(task: LocalTask): string {
  if (task.error) {
    return task.error;
  }
  if (task.status === 'completed') {
    return '处理完成';
  }
  const activeStep = task.steps.find((step) => step.status === 'running')
    ?? task.steps.find((step) => step.status === 'pending');
  const stepText = activeStep ? stepLabels[activeStep.step] ?? activeStep.step : formatStatus(task.status);
  return `${stepText} · ${formatPercent(task.progress)}${task.updatedAt ? ` · ${formatRelativeTime(task.updatedAt)}` : ''}`;
}

function formatPercent(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function formatRelativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return '刚刚';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

function formatStatus(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    queued: '排队',
    running: '运行中',
    completed: '完成',
    failed: '失败'
  };
  return labels[status];
}

function formatStepStatus(status: StepStatus): string {
  const labels: Record<StepStatus, string> = {
    pending: '等待',
    running: '运行中',
    completed: '完成',
    failed: '失败',
    skipped: '跳过'
  };
  return labels[status];
}
