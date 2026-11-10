'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { OnboardingWizard, type OnboardingConfigResponse } from './OnboardingWizard';
import { AlertIcon, FileTextIcon, LogoIcon, RefreshIcon, SettingsIcon, UploadIcon, WandIcon } from './shared/icons';

type TaskStatus = 'queued' | 'running' | 'completed' | 'failed';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
type ArtifactKind = 'original' | 'translated' | 'index' | 'database' | 'summary' | 'terms' | 'qa';
type OutputViewKind = 'translated' | 'reading' | 'metadata' | 'database';
type ReadingKind = 'summary' | 'terms' | 'qa';
type TaskFilter = 'all' | 'active' | 'completed' | 'failed';
type ToastTone = 'info' | 'success' | 'error';

interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

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
    qualityStatus?: 'completed' | 'needs_review';
    qualityWarningCount?: number;
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

const taskFilters: Array<{ kind: TaskFilter; label: string }> = [
  { kind: 'all', label: '全部' },
  { kind: 'active', label: '处理中' },
  { kind: 'completed', label: '完成' },
  { kind: 'failed', label: '失败' }
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
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');

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

  const pushToast = useCallback((text: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, tone === 'error' ? 6000 : 3200);
  }, []);

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

  async function uploadPdfs(files: File[]) {
    const pdfs = files.filter(isPdfFile);
    if (pdfs.length === 0) {
      pushToast('只支持 PDF 文件', 'error');
      return;
    }
    if (!config?.valid) {
      pushToast('请先完成配置，再导入论文', 'error');
      return;
    }
    setBusy(true);
    let created = 0;
    try {
      for (const file of pdfs) {
        const formData = new FormData();
        formData.set('file', file);
        const response = await fetch('/api/tasks', { method: 'POST', body: formData });
        const payload = await response.json() as { task?: LocalTask; error?: string };
        if (!response.ok || !payload.task) {
          pushToast(`${file.name}：${payload.error ?? '上传失败'}`, 'error');
          continue;
        }
        created += 1;
        setSelectedTaskId(payload.task.id);
      }
      await refreshTasks();
      if (created > 0) {
        setTaskFilter('all');
        pushToast(created === 1 ? '任务已创建，开始处理' : `已创建 ${created} 个任务`, 'success');
      }
      if (pdfs.length < files.length) {
        pushToast(`已忽略 ${files.length - pdfs.length} 个非 PDF 文件`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function importFromUrl() {
    const url = urlInput.trim();
    if (!url) return;
    setUrlBusy(true);
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const payload = await response.json() as { task?: LocalTask; error?: string };
      if (!response.ok || !payload.task) {
        pushToast(payload.error ?? '导入失败', 'error');
        return;
      }
      setUrlInput('');
      setSelectedTaskId(payload.task.id);
      setTaskFilter('all');
      await refreshTasks();
      pushToast('任务已创建，开始处理', 'success');
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
    const response = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      pushToast(payload.error ?? '删除失败', 'error');
      return;
    }
    setArtifact(undefined);
    await refreshTasks();
    pushToast('任务已删除', 'success');
  }

  async function retryTask(task: LocalTask) {
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'retry' })
    });
    const payload = await response.json() as { task?: LocalTask; error?: string };
    if (!response.ok || !payload.task) {
      pushToast(payload.error ?? '重试失败', 'error');
      return;
    }
    setSelectedTaskId(payload.task.id);
    await refreshTasks();
    pushToast('任务已重新开始', 'success');
  }

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
    function onDragEnter(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setDragActive(true);
    }
    function onDragOver(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    }
    function onDragLeave(event: DragEvent) {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragActive(false);
    }
    function onDrop(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragActive(false);
      void uploadPdfs(Array.from(event.dataTransfer?.files ?? []));
    }
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  });

  const filteredTasks = tasks.filter((task) => matchesTaskFilter(task, taskFilter));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (onboardingOpen || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
      if (typing) {
        if (event.key === 'Escape') (target as HTMLElement).blur();
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        urlInputRef.current?.focus();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (filteredTasks.length === 0) return;
        event.preventDefault();
        const index = filteredTasks.findIndex((task) => task.id === selectedTask?.id);
        const next = event.key === 'ArrowDown'
          ? Math.min(filteredTasks.length - 1, index + 1)
          : Math.max(0, index < 0 ? 0 : index - 1);
        const nextTask = filteredTasks[next];
        if (!nextTask) return;
        setSelectedTaskId(nextTask.id);
        document.querySelector(`[data-task-id="${nextTask.id}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const hasOutput = selectedTaskHasOutput;
  const taskSummary = getTaskSummary(tasks);
  const configMissing = Boolean(config && !config.valid);
  const openOnboarding = () => {
    window.localStorage.removeItem('pdf2obsidian.onboarding.dismissed');
    setOnboardingOpen(true);
  };
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
          <div className="brand">
            <span className="brand-mark"><LogoIcon /></span>
            <div>
              <h1>PDF2Obsidian</h1>
              <p>论文处理工作台</p>
            </div>
          </div>
          <div className="rail-actions">
            <button aria-label="打开首次启动向导" className="icon-button" title="首次启动向导" type="button" onClick={openOnboarding}>
              <WandIcon />
            </button>
            <a aria-label="设置" className="icon-button" href="/settings" title="设置">
              <SettingsIcon />
            </a>
          </div>
        </div>

        <div className="upload-zone">
          <label className="upload-card">
            <span className="upload-icon"><UploadIcon /></span>
            <div className="upload-text">
              <strong>{busy ? '上传中…' : config?.valid ? '上传或拖入 PDF' : '先完成设置'}</strong>
              <span>{config?.valid ? '可多选，也可拖到窗口任意位置' : '设置 Vault 与解析服务后即可上传'}</span>
            </div>
            <input
              accept="application/pdf,.pdf"
              disabled={busy || !config?.valid}
              multiple
              name="file"
              type="file"
              onChange={(event) => {
                const input = event.currentTarget;
                const files = Array.from(input.files ?? []);
                if (files.length === 0) return;
                void uploadPdfs(files).finally(() => {
                  input.value = '';
                });
              }}
            />
          </label>

          <div className="url-divider">
            <span>或从链接导入</span>
            <kbd title="按 / 聚焦链接输入框">/</kbd>
          </div>

          <div className="url-import">
            <input
              className="url-input"
              ref={urlInputRef}
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

        <div className="rail-section-title">
          <span>任务</span>
          <button aria-label="刷新任务列表" className="icon-button small" title="刷新" type="button" onClick={() => void refreshTasks()}>
            <RefreshIcon />
          </button>
        </div>
        <div aria-label="按状态筛选任务" className="task-filter" role="tablist">
          {taskFilters.map((filter) => (
            <button
              aria-selected={taskFilter === filter.kind}
              data-active={taskFilter === filter.kind ? 'true' : 'false'}
              key={filter.kind}
              role="tab"
              type="button"
              onClick={() => setTaskFilter(filter.kind)}
            >
              {filter.label}
              <span>{taskSummary[filter.kind]}</span>
            </button>
          ))}
        </div>

        <div className="task-list">
          {tasks.length === 0 ? <p className="empty">还没有任务，导入一篇论文开始吧</p> : null}
          {tasks.length > 0 && filteredTasks.length === 0 ? <p className="empty">没有符合筛选条件的任务</p> : null}
          {filteredTasks.map((task) => (
            <div
              className="task-item"
              data-active={selectedTask?.id === task.id ? 'true' : 'false'}
              data-status={task.status}
              data-task-id={task.id}
              key={task.id}
            >
              <button
                className="task-card"
                type="button"
                onClick={() => setSelectedTaskId(task.id)}
              >
                <div className="task-title-row">
                  <span title={task.fileName}>{task.fileName}</span>
                  <strong className="task-status" data-status={task.status}>{formatStatus(task.status)}</strong>
                </div>
                {task.status !== 'completed' && task.steps.length > 0 ? <StepTrack steps={task.steps} /> : null}
                <p className="task-meta">{getTaskHint(task)}</p>
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
        {configMissing && selectedTask ? (
          <div className="setup-banner">
            <AlertIcon />
            <span>配置未完成，暂时不能导入新论文。</span>
            <button type="button" onClick={openOnboarding}>打开向导</button>
          </div>
        ) : null}
        {selectedTask ? (
          <div className="pdf-viewer">
            <iframe className="pdf-frame" src={getPdfPreviewSrc(selectedTask.id)} title={selectedTask.fileName} />
          </div>
        ) : configMissing ? (
          <div className="empty-pane">
            <span className="empty-icon" data-tone="warn"><AlertIcon /></span>
            <strong>还差一步：完成本地配置</strong>
            <span>{config?.error ?? '设置 Obsidian Vault 位置和 PDF 解析服务后，就可以开始导入论文。'}</span>
            <div className="empty-actions">
              <button className="button-primary" type="button" onClick={openOnboarding}>打开向导</button>
              <a className="button-secondary" href="/settings">高级设置</a>
            </div>
          </div>
        ) : (
          <div className="empty-pane">
            <span className="empty-icon"><FileTextIcon /></span>
            <strong>从左侧导入第一篇论文</strong>
            <span>上传 PDF，或粘贴 arXiv ID、DOI、PDF 链接。原文会在这里预览，译文和阅读材料显示在右侧。</span>
            <ol className="empty-steps">
              <li><b>1</b>导入 PDF</li>
              <li><b>2</b>解析与翻译</li>
              <li><b>3</b>写入 Obsidian</li>
            </ol>
          </div>
        )}
      </section>

      {hasOutput ? (
        <section className="output-pane">
          <PaneHeader title="输出结果" subtitle={selectedTask?.result?.slug ?? 'Markdown'}>
            {selectedTask ? <CompactStatus task={selectedTask} text={currentStatusText} /> : null}
          </PaneHeader>
          <div className="artifact-tabs">
            <div className="segmented" role="tablist">
            {visibleOutputViews.map((item) => (
              <button
                aria-label={`查看${item.label}`}
                aria-selected={activeView === item.kind}
                className="tab-button"
                role="tab"
                data-active={activeView === item.kind ? 'true' : 'false'}
                key={item.kind}
                type="button"
                onClick={() => void selectOutputView(item.kind)}
              >
                {item.label}
              </button>
            ))}
            </div>
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
      {dragActive ? (
        <div className="drop-overlay" aria-hidden="true">
          <div>
            <span className="empty-icon"><UploadIcon /></span>
            <strong>{config?.valid ? '松开即可导入 PDF' : '请先完成配置'}</strong>
            <span>{config?.valid ? '支持一次拖入多个文件' : '配置完成后才能导入论文'}</span>
          </div>
        </div>
      ) : null}
      <div className="toast-stack" aria-live="polite" role="status">
        {toasts.map((toast) => (
          <div className="toast" data-tone={toast.tone} key={toast.id}>{toast.text}</div>
        ))}
      </div>
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

function StepTrack({ steps }: { steps: LocalTaskStep[] }) {
  return (
    <div className="step-track" aria-label="处理阶段">
      {steps.map((step) => (
        <span
          data-status={step.status}
          key={step.step}
          title={`${stepLabels[step.step] ?? step.step}：${formatStepStatus(step.status)}`}
        />
      ))}
    </div>
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

function getTaskSummary(tasks: LocalTask[]): Record<TaskFilter, number> {
  return {
    all: tasks.length,
    active: tasks.filter((task) => task.status === 'queued' || task.status === 'running').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    failed: tasks.filter((task) => task.status === 'failed').length
  };
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function matchesTaskFilter(task: LocalTask, filter: TaskFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return task.status === 'queued' || task.status === 'running';
  return task.status === filter;
}

function canRetryTask(task: LocalTask): boolean {
  return task.status === 'failed';
}

function canDeleteTask(task: LocalTask): boolean {
  return task.status !== 'queued' && task.status !== 'running';
}

function getTaskHint(task: LocalTask): string {
  const time = task.updatedAt ? ` · ${formatRelativeTime(task.updatedAt)}` : '';
  if (task.status === 'failed') {
    const failedStep = task.steps.find((step) => step.status === 'failed');
    return `${failedStep ? `失败于${stepLabels[failedStep.step] ?? failedStep.step}` : '处理失败'}${time}`;
  }
  if (task.status === 'completed') {
    return task.result?.qualityStatus === 'needs_review'
      ? `处理完成，需复核：${task.result.qualityWarningCount ?? 0} 条警告，详见论文目录中的质量报告`
      : '处理完成';
  }
  const activeStep = task.steps.find((step) => step.status === 'running')
    ?? task.steps.find((step) => step.status === 'pending');
  const stepText = activeStep ? stepLabels[activeStep.step] ?? activeStep.step : formatStatus(task.status);
  return `${stepText} · ${formatPercent(task.progress)}${time}`;
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
