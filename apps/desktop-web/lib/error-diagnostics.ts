export interface ErrorDiagnosis {
  summary: string;
  suggestions: string[];
}

interface DiagnosisRule {
  patterns: RegExp[];
  summary: string;
  suggestions: string[];
}

const diagnosisRules: DiagnosisRule[] = [
  {
    patterns: [/Cloudflare Workers AI 地址/i, /api\.cloudflare\.com.*<ACCOUNT_ID>/i, /translation\.baseUrl.*占位符/i],
    summary: 'Cloudflare Account ID 或服务地址未配置',
    suggestions: [
      '打开设置页，选择 Cloudflare Workers AI 后填写真实 Account ID。',
      'Base URL 应类似 https://api.cloudflare.com/client/v4/accounts/你的_ACCOUNT_ID/ai/v1。',
      'Base URL 不要包含 /chat/completions，程序会自动拼接接口路径。'
    ]
  },
  {
    patterns: [/OpenAI 兼容服务请求失败：HTTP 404/i, /HTTP 404.*chat\/completions/i],
    summary: 'OpenAI 兼容服务地址或模型不存在',
    suggestions: [
      '检查 Base URL 是否写到服务根路径，不要重复填写 /chat/completions。',
      '确认模型名在当前服务可用，例如 Cloudflare Workers AI 需要使用它支持的模型标识。',
      '如果使用 Cloudflare，确认 Account ID 已替换占位符，并且 Token 具备 Workers AI 调用权限。'
    ]
  },
  {
    patterns: [/OpenAI 兼容服务请求失败：HTTP (?:401|403)/i, /Unauthorized/i, /Forbidden/i],
    summary: 'OpenAI 兼容服务认证失败',
    suggestions: [
      '确认 apiKeyEnv 指向的环境变量已设置，并重新启动本地 Web。',
      '检查 API Key 或 Token 是否仍有效，且具备当前模型的调用权限。',
      '不要把 API Key 直接提交到配置文件或代码仓库。'
    ]
  },
  {
    patterns: [/MinerU .*Token 未配置/i, /MINERU_.*TOKEN/i],
    summary: 'MinerU Token 未配置',
    suggestions: [
      '在终端设置 MINERU_OFFICIAL_API_TOKEN 后重新启动本地 Web。',
      '如果使用官方解析模式，确认设置页里的 MinerU 模式为 official。',
      '不要把 Token 直接提交到 pdf2obsidian.config.yaml。'
    ]
  },
  {
    patterns: [/MinerU 解析服务不可用/i, /ECONNREFUSED/i, /fetch failed/i, /apiUrl/i],
    summary: 'MinerU 解析服务连接失败',
    suggestions: [
      '确认 MinerU 本地服务已经启动，并且设置页里的 API 地址可访问。',
      '如果使用官方 API，可以切换 MinerU 模式并配置 Token。',
      '如果服务在 WSL 或容器中运行，确认端口映射和防火墙规则。'
    ]
  },
  {
    patterns: [/缺少 AI 服务 API Key/i, /Missing translation API key/i, /(?:DEEPSEEK|CLOUDFLARE|OPENAI|OPENROUTER)_API_(?:KEY|TOKEN)/i],
    summary: 'AI 服务 Key 未配置',
    suggestions: [
      '在终端设置配置中 apiKeyEnv 指向的环境变量，然后重新启动本地 Web。',
      '如果暂时不需要翻译，可以在设置页关闭翻译。',
      '如果使用 Ollama，选择 Ollama 本地模型，并确认本地模型服务已启动。'
    ]
  },
  {
    patterns: [/Ollama/i, /11434/i],
    summary: 'Ollama 本地模型不可用',
    suggestions: [
      '确认 Ollama 正在运行，并且 baseUrl 指向 http://127.0.0.1:11434。',
      '确认配置的模型已下载，可以先在终端用 ollama run 测试。',
      '大论文翻译较慢，可以适当调小分块长度。'
    ]
  },
  {
    patterns: [/EACCES/i, /EPERM/i, /permission/i, /权限/i],
    summary: '本地路径没有读写权限',
    suggestions: [
      '确认 Obsidian Vault 路径存在且当前用户可写。',
      '确认 .pipeline 目录没有被系统权限或同步软件锁定。',
      'macOS 首次访问 Documents/Desktop 目录时，可能需要给终端或编辑器授权。'
    ]
  },
  {
    patterns: [/ENOENT/i, /not found/i, /不存在/i],
    summary: '文件或目录不存在',
    suggestions: [
      '检查 Vault 路径、PDF 文件路径和 MinerU 输出目录是否存在。',
      '如果刚移动过项目目录，重新保存一次设置页配置。',
      '删除失败任务后重新上传 PDF。'
    ]
  },
  {
    patterns: [/timed out/i, /超时/i, /pending/i],
    summary: '外部服务处理超时',
    suggestions: [
      '稍后重试，或先用页数更少的 PDF 验证服务是否正常。',
      '官方解析长时间 pending 时，检查套餐、并发限制或服务状态。',
      '本地模型处理大论文时，建议降低并发或切换到远程模型。'
    ]
  },
  {
    patterns: [/配置预检失败/i],
    summary: '配置预检未通过',
    suggestions: [
      '打开设置页按提示补齐缺失项，保存后再重新上传或重试任务。',
      '如果翻译或阅读材料启用，需要配置可用的 AI 服务地址和 Key。',
      '保存配置后必须重新启动本地 Web，新的环境变量才会生效。'
    ]
  },
  {
    patterns: [/Invalid input/i, /配置不合法/i, /不受支持/i],
    summary: '配置项不合法',
    suggestions: [
      '打开设置页重新保存配置，界面会自动过滤不支持的选项。',
      'metadata.online.providers 目前只支持 crossref 和 openalex。',
      '如果手动编辑 YAML，请对照 pdf2obsidian.config.example.yaml。'
    ]
  },
  {
    patterns: [/did not generate any markdown/i, /没有 full\.md/i, /did not include markdown/i],
    summary: 'PDF 解析没有生成 Markdown',
    suggestions: [
      '确认 PDF 不是扫描质量过低或受密码保护的文件。',
      '尝试把 MinerU method 改为 ocr 或 auto。',
      '查看 .pipeline/mineru 下的中间产物，确认 MinerU 是否生成了结果文件。'
    ]
  }
];

export function diagnoseError(error: unknown): ErrorDiagnosis {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.replace(/\s+/g, ' ').trim();
  const matched = diagnosisRules.find((rule) => {
    return rule.patterns.some((pattern) => pattern.test(normalized));
  });

  if (!matched) {
    return {
      summary: normalized || '任务执行失败',
      suggestions: [
        '查看任务日志中的最后几行，定位失败阶段。',
        '确认配置页已保存，并先用一篇简单 PDF 测试。',
        '如果问题稳定复现，请保留 report.json 和 import-result.json 便于排查。'
      ]
    };
  }

  return {
    summary: `${matched.summary}：${normalized}`,
    suggestions: matched.suggestions
  };
}

export function formatDiagnosisForLog(diagnosis: ErrorDiagnosis): string[] {
  return [
    `诊断：${diagnosis.summary}`,
    ...diagnosis.suggestions.map((suggestion) => `建议：${suggestion}`)
  ];
}
