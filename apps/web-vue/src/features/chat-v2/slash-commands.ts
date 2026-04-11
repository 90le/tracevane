export type StudioSlashCommandCategory = 'session' | 'model' | 'agents' | 'tools';

export type StudioSlashCommandLocalAction =
  | 'new'
  | 'reset'
  | 'clear'
  | 'stop'
  | 'help'
  | 'status'
  | 'tools'
  | 'skill'
  | 'allowlist'
  | 'bash'
  | 'tasks'
  | 'queue'
  | 'tts'
  | 'approve'
  | 'context'
  | 'whoami'
  | 'session'
  | 'acp'
  | 'debug'
  | 'focus'
  | 'unfocus'
  | 'compact'
  | 'model'
  | 'think'
  | 'reasoning'
  | 'verbose'
  | 'fast'
  | 'usage'
  | 'elevated'
  | 'exec'
  | 'exportSession'
  | 'activation'
  | 'send'
  | 'restart'
  | 'models'
  | 'config'
  | 'plugins'
  | 'mcp'
  | 'subagents'
  | 'agents'
  | 'kill'
  | 'forwardSlash'
  | 'steer'
  | 'redirect';

export type StudioSlashCommandDef = {
  key: string;
  name: string;
  aliases?: string[];
  description: {
    zh: string;
    en: string;
  };
  args?: string;
  category: StudioSlashCommandCategory;
  executeMode: 'local' | 'send' | 'hybrid';
  localAction?: StudioSlashCommandLocalAction;
  argOptions?: string[];
};

export type ParsedStudioSlashCommand = {
  command: StudioSlashCommandDef;
  args: string;
};

export type StudioSlashArgOptionsOverrides = Record<string, string[]>;
export type StudioSlashArgOptionDetail = {
  value: string;
  label: string;
  description: string;
};

const CATEGORY_ORDER: StudioSlashCommandCategory[] = ['session', 'model', 'tools', 'agents'];

const CATEGORY_LABELS: Record<StudioSlashCommandCategory, { zh: string; en: string }> = {
  session: {
    zh: '会话',
    en: 'Session',
  },
  model: {
    zh: '模型',
    en: 'Model',
  },
  tools: {
    zh: '工具',
    en: 'Tools',
  },
  agents: {
    zh: '代理',
    en: 'Agents',
  },
};

const ARG_OPTION_DETAILS: Record<string, Record<string, {
  label: { zh: string; en: string };
  description: { zh: string; en: string };
}>> = {
  tools: {
    compact: {
      label: { zh: '精简', en: 'Compact' },
      description: { zh: '使用更紧凑的工具列表展示。', en: 'Show tools in a more compact list.' },
    },
    verbose: {
      label: { zh: '详细', en: 'Verbose' },
      description: { zh: '显示更完整的工具明细与说明。', en: 'Show a more detailed tool inventory.' },
    },
  },
  queue: {
    steer: {
      label: { zh: '转向', en: 'Steer' },
      description: { zh: '活动运行时，后续消息优先转给当前运行。', en: 'While a run is active, steer follow-ups into the current run.' },
    },
    interrupt: {
      label: { zh: '中断', en: 'Interrupt' },
      description: { zh: '新消息会打断当前运行并优先处理新的请求。', en: 'Interrupt the active run and prioritize the new message.' },
    },
    followup: {
      label: { zh: '跟进', en: 'Follow-up' },
      description: { zh: '把后续消息排进 follow-up 队列，等待当前运行结束。', en: 'Queue follow-ups until the active run settles.' },
    },
    collect: {
      label: { zh: '收集', en: 'Collect' },
      description: { zh: '在 debounce 窗口内收集多条消息再统一处理。', en: 'Collect multiple messages during the debounce window.' },
    },
    'steer-backlog': {
      label: { zh: '转向积压', en: 'Steer+Backlog' },
      description: { zh: '优先转向当前运行，并保留后续 backlog。', en: 'Steer into the current run while preserving a backlog.' },
    },
  },
  tts: {
    on: {
      label: { zh: '开启', en: 'On' },
      description: { zh: '开启文本转语音输出。', en: 'Enable text-to-speech output.' },
    },
    off: {
      label: { zh: '关闭', en: 'Off' },
      description: { zh: '关闭文本转语音输出。', en: 'Disable text-to-speech output.' },
    },
    status: {
      label: { zh: '状态', en: 'Status' },
      description: { zh: '查看当前 TTS 状态。', en: 'Show the current TTS status.' },
    },
    provider: {
      label: { zh: '提供方', en: 'Provider' },
      description: { zh: '查看或切换 TTS 提供方。', en: 'Inspect or change the TTS provider.' },
    },
    limit: {
      label: { zh: '限制', en: 'Limit' },
      description: { zh: '查看或调整 TTS 限制。', en: 'Inspect or adjust TTS limits.' },
    },
    summary: {
      label: { zh: '摘要', en: 'Summary' },
      description: { zh: '输出当前 TTS 摘要。', en: 'Show a summary of current TTS settings.' },
    },
    audio: {
      label: { zh: '音频', en: 'Audio' },
      description: { zh: '控制音频输出相关行为。', en: 'Control audio output behavior.' },
    },
    help: {
      label: { zh: '帮助', en: 'Help' },
      description: { zh: '查看 TTS 命令帮助。', en: 'Show TTS command help.' },
    },
  },
  usage: {
    off: {
      label: { zh: '关闭', en: 'Off' },
      description: { zh: '关闭 usage footer。', en: 'Hide the usage footer.' },
    },
    tokens: {
      label: { zh: 'Token', en: 'Tokens' },
      description: { zh: '显示 token 使用概览。', en: 'Show token usage summary.' },
    },
    full: {
      label: { zh: '完整', en: 'Full' },
      description: { zh: '显示更完整的 usage 摘要。', en: 'Show a fuller usage summary.' },
    },
    cost: {
      label: { zh: '成本', en: 'Cost' },
      description: { zh: '聚焦成本与计费视图。', en: 'Focus on cost and billing view.' },
    },
  },
  think: {
    off: {
      label: { zh: '关闭', en: 'Off' },
      description: { zh: '关闭额外 thinking。', en: 'Disable extra thinking.' },
    },
    minimal: {
      label: { zh: '极低', en: 'Minimal' },
      description: { zh: '只保留最轻量的 thinking。', en: 'Use the lightest thinking mode.' },
    },
    low: {
      label: { zh: '低', en: 'Low' },
      description: { zh: '更快响应，适合简单问题。', en: 'Faster responses for simpler tasks.' },
    },
    medium: {
      label: { zh: '中', en: 'Medium' },
      description: { zh: '平衡速度与思考深度。', en: 'Balance speed and depth.' },
    },
    high: {
      label: { zh: '高', en: 'High' },
      description: { zh: '更深的思考深度，响应更慢但通常更充分。', en: 'Deeper thinking with slower but usually richer responses.' },
    },
    xhigh: {
      label: { zh: '极高', en: 'Extra High' },
      description: { zh: '用于复杂任务的最高 thinking 深度。', en: 'Use the deepest thinking level for complex tasks.' },
    },
  },
  verbose: {
    off: {
      label: { zh: '关闭', en: 'Off' },
      description: { zh: '保持较短回复。', en: 'Keep responses concise.' },
    },
    on: {
      label: { zh: '开启', en: 'On' },
      description: { zh: '输出更多过程与背景。', en: 'Include more process and context.' },
    },
    full: {
      label: { zh: '完整', en: 'Full' },
      description: { zh: '尽可能完整地展开说明。', en: 'Use the fullest verbose output.' },
    },
  },
  fast: {
    status: {
      label: { zh: '状态', en: 'Status' },
      description: { zh: '查看当前 fast mode 状态。', en: 'Show the current fast mode state.' },
    },
    off: {
      label: { zh: '关闭', en: 'Off' },
      description: { zh: '关闭 fast mode。', en: 'Disable fast mode.' },
    },
    on: {
      label: { zh: '开启', en: 'On' },
      description: { zh: '优先更快完成响应。', en: 'Prefer faster completion.' },
    },
  },
  reasoning: {
    off: {
      label: { zh: '隐藏', en: 'Hide' },
      description: { zh: '隐藏 reasoning 可见性。', en: 'Hide reasoning visibility.' },
    },
    on: {
      label: { zh: '显示', en: 'Show' },
      description: { zh: '显示 reasoning 可见性。', en: 'Show reasoning visibility.' },
    },
    stream: {
      label: { zh: '流式', en: 'Stream' },
      description: { zh: '以流式方式显示 reasoning。', en: 'Show reasoning as a live stream.' },
    },
  },
  elevated: {
    off: {
      label: { zh: '关闭', en: 'Off' },
      description: { zh: '关闭 elevated mode。', en: 'Disable elevated mode.' },
    },
    on: {
      label: { zh: '开启', en: 'On' },
      description: { zh: '开启 elevated mode。', en: 'Enable elevated mode.' },
    },
    ask: {
      label: { zh: '询问', en: 'Ask' },
      description: { zh: '仅在需要时请求 elevated。', en: 'Ask before enabling elevated mode.' },
    },
    full: {
      label: { zh: '完全', en: 'Full' },
      description: { zh: '为当前会话完全开启 elevated。', en: 'Fully enable elevated mode for this session.' },
    },
  },
  exec: {
    'host=auto': {
      label: { zh: 'Host 自动', en: 'Host Auto' },
      description: {
        zh: '让 OpenClaw 按当前环境自动选择 exec host。',
        en: 'Let OpenClaw choose the exec host automatically for this session.',
      },
    },
    'host=sandbox': {
      label: { zh: 'Host 沙盒', en: 'Host Sandbox' },
      description: {
        zh: '优先在沙盒里执行命令。',
        en: 'Prefer running commands inside the sandbox.',
      },
    },
    'host=gateway': {
      label: { zh: 'Host 网关', en: 'Host Gateway' },
      description: {
        zh: '让网关侧直接执行命令。',
        en: 'Run commands directly from the gateway host.',
      },
    },
    'host=node': {
      label: { zh: 'Host 节点', en: 'Host Node' },
      description: {
        zh: '绑定到特定节点执行命令。',
        en: 'Pin execution to a specific node.',
      },
    },
    'security=deny': {
      label: { zh: '安全 拒绝', en: 'Security Deny' },
      description: {
        zh: '默认拒绝高风险 exec。',
        en: 'Deny risky exec requests by default.',
      },
    },
    'security=allowlist': {
      label: { zh: '安全 白名单', en: 'Security Allowlist' },
      description: {
        zh: '仅放行命中 allowlist 的 exec。',
        en: 'Only allow exec requests that match the allowlist.',
      },
    },
    'security=full': {
      label: { zh: '安全 完全', en: 'Security Full' },
      description: {
        zh: '完全开放 exec 安全策略。',
        en: 'Fully open the exec security policy.',
      },
    },
    'ask=off': {
      label: { zh: '询问 关闭', en: 'Ask Off' },
      description: {
        zh: '关闭额外询问。',
        en: 'Disable extra approval prompts.',
      },
    },
    'ask=on-miss': {
      label: { zh: '询问 未命中', en: 'Ask On Miss' },
      description: {
        zh: '仅在未命中 allowlist 时询问。',
        en: 'Only ask when the allowlist does not match.',
      },
    },
    'ask=always': {
      label: { zh: '询问 总是', en: 'Ask Always' },
      description: {
        zh: '每次 exec 都要求确认。',
        en: 'Always require approval for exec.',
      },
    },
    'node=<id>': {
      label: { zh: '节点 绑定', en: 'Node Binding' },
      description: {
        zh: '在 host=node 时指定节点 id 或名称。',
        en: 'Specify the node id or name when host=node.',
      },
    },
  },
};

export const STUDIO_SLASH_COMMANDS: StudioSlashCommandDef[] = [
  {
    key: 'help',
    name: 'help',
    description: {
      zh: '显示可用命令。',
      en: 'Show available commands.',
    },
    category: 'tools',
    executeMode: 'local',
    localAction: 'help',
  },
  {
    key: 'commands',
    name: 'commands',
    description: {
      zh: '列出全部斜杠命令。',
      en: 'List all slash commands.',
    },
    category: 'tools',
    executeMode: 'local',
    localAction: 'help',
  },
  {
    key: 'tools',
    name: 'tools',
    args: '[mode]',
    description: {
      zh: '列出当前可用运行时工具。',
      en: 'List available runtime tools.',
    },
    category: 'tools',
    executeMode: 'local',
    localAction: 'tools',
    argOptions: ['compact', 'verbose'],
  },
  {
    key: 'skill',
    name: 'skill',
    args: '<name> [input]',
    description: {
      zh: '按名称运行一个技能。',
      en: 'Run a skill by name.',
    },
    category: 'tools',
    executeMode: 'hybrid',
    localAction: 'skill',
  },
  {
    key: 'status',
    name: 'status',
    description: {
      zh: '显示当前状态。',
      en: 'Show current status.',
    },
    category: 'tools',
    executeMode: 'local',
    localAction: 'status',
  },
  {
    key: 'tasks',
    name: 'tasks',
    description: {
      zh: '列出当前会话的后台任务。',
      en: 'List background tasks for this session.',
    },
    category: 'tools',
    executeMode: 'local',
    localAction: 'tasks',
  },
  {
    key: 'allowlist',
    name: 'allowlist',
    description: {
      zh: '查看、添加或移除 allowlist 条目。',
      en: 'List/add/remove allowlist entries.',
    },
    category: 'tools',
    executeMode: 'hybrid',
    localAction: 'allowlist',
  },
  {
    key: 'approve',
    name: 'approve',
    description: {
      zh: '批准或拒绝 exec 请求。',
      en: 'Approve or deny exec requests.',
    },
    category: 'tools',
    executeMode: 'local',
    localAction: 'approve',
  },
  {
    key: 'context',
    name: 'context',
    description: {
      zh: '解释上下文是如何构建和使用的。',
      en: 'Explain how context is built and used.',
    },
    category: 'tools',
    executeMode: 'local',
    localAction: 'context',
  },
  {
    key: 'btw',
    name: 'btw',
    description: {
      zh: '提一个旁支问题而不改变后续会话上下文。',
      en: 'Ask a side question without changing future session context.',
    },
    category: 'tools',
    executeMode: 'hybrid',
    localAction: 'forwardSlash',
  },
  {
    key: 'export-session',
    name: 'export-session',
    aliases: ['export'],
    args: '[path]',
    description: {
      zh: '将当前会话导出为包含完整 system prompt 的 HTML 文件。',
      en: 'Export current session to HTML file with full system prompt.',
    },
    category: 'tools',
    executeMode: 'hybrid',
    localAction: 'exportSession',
  },
  {
    key: 'tts',
    name: 'tts',
    args: '[action] [value]',
    description: {
      zh: '控制文本转语音（TTS）。',
      en: 'Control text-to-speech (TTS).',
    },
    category: 'tools',
    executeMode: 'hybrid',
    localAction: 'tts',
    argOptions: ['on', 'off', 'status', 'provider', 'limit', 'summary', 'audio', 'help'],
  },
  {
    key: 'whoami',
    name: 'whoami',
    aliases: ['id'],
    description: {
      zh: '显示当前 sender id。',
      en: 'Show your sender id.',
    },
    category: 'tools',
    executeMode: 'local',
    localAction: 'whoami',
  },
  {
    key: 'session',
    name: 'session',
    args: '[action] [value]',
    description: {
      zh: '管理会话级设置，例如 /session idle。',
      en: 'Manage session-level settings (for example /session idle).',
    },
    category: 'session',
    executeMode: 'local',
    localAction: 'session',
    argOptions: ['idle', 'max-age'],
  },
  {
    key: 'subagents',
    name: 'subagents',
    args: '[action] [target] [value]',
    description: {
      zh: '列出、终止、查看日志、启动或引导当前会话的子代理。',
      en: 'List, kill, log, spawn, or steer subagent runs for this session.',
    },
    category: 'agents',
    executeMode: 'hybrid',
    localAction: 'subagents',
    argOptions: ['list', 'kill', 'log', 'info', 'send', 'steer', 'spawn'],
  },
  {
    key: 'acp',
    name: 'acp',
    args: '[action] [value]',
    description: {
      zh: '管理 ACP 会话和运行时选项。',
      en: 'Manage ACP sessions and runtime options.',
    },
    category: 'tools',
    executeMode: 'hybrid',
    localAction: 'acp',
    argOptions: ['spawn', 'cancel', 'steer', 'close', 'sessions', 'status', 'set-mode', 'set', 'cwd', 'permissions', 'timeout', 'model', 'reset-options', 'doctor', 'install', 'help'],
  },
  {
    key: 'focus',
    name: 'focus',
    args: '[target]',
    description: {
      zh: '把当前线程或会话绑定到一个 session target。',
      en: 'Bind this thread or conversation to a session target.',
    },
    category: 'session',
    executeMode: 'local',
    localAction: 'focus',
  },
  {
    key: 'unfocus',
    name: 'unfocus',
    description: {
      zh: '移除当前线程或会话绑定。',
      en: 'Remove the current thread or conversation binding.',
    },
    category: 'session',
    executeMode: 'local',
    localAction: 'unfocus',
  },
  {
    key: 'agents',
    name: 'agents',
    description: {
      zh: '列出当前会话绑定的代理。',
      en: 'List thread-bound agents for this session.',
    },
    category: 'agents',
    executeMode: 'local',
    localAction: 'agents',
  },
  {
    key: 'kill',
    name: 'kill',
    args: '[target]',
    description: {
      zh: '终止一个正在运行的子代理，或全部终止。',
      en: 'Kill a running subagent (or all).',
    },
    category: 'agents',
    executeMode: 'local',
    localAction: 'kill',
  },
  {
    key: 'steer',
    name: 'steer',
    aliases: ['tell'],
    args: '[id] <message>',
    description: {
      zh: '向当前活动运行注入一条消息。',
      en: 'Inject a message into the active run.',
    },
    category: 'agents',
    executeMode: 'local',
    localAction: 'steer',
  },
  {
    key: 'config',
    name: 'config',
    args: '[action] [path] [value]',
    description: {
      zh: '显示或设置配置值。',
      en: 'Show or set config values.',
    },
    category: 'tools',
    executeMode: 'hybrid',
    localAction: 'config',
    argOptions: ['show', 'get', 'set', 'unset'],
  },
  {
    key: 'mcp',
    name: 'mcp',
    args: '[action] [path] [value]',
    description: {
      zh: '显示或设置 OpenClaw MCP servers。',
      en: 'Show or set OpenClaw MCP servers.',
    },
    category: 'tools',
    executeMode: 'hybrid',
    localAction: 'mcp',
    argOptions: ['show', 'get', 'set', 'unset'],
  },
  {
    key: 'plugins',
    name: 'plugins',
    aliases: ['plugin'],
    args: '[action] [path]',
    description: {
      zh: '列出、查看、启用或禁用插件。',
      en: 'List, show, enable, or disable plugins.',
    },
    category: 'tools',
    executeMode: 'hybrid',
    localAction: 'plugins',
    argOptions: ['list', 'show', 'get', 'enable', 'disable'],
  },
  {
    key: 'debug',
    name: 'debug',
    args: '[action] [path] [value]',
    description: {
      zh: '设置运行时调试覆盖项。',
      en: 'Set runtime debug overrides.',
    },
    category: 'tools',
    executeMode: 'hybrid',
    localAction: 'debug',
    argOptions: ['show', 'reset', 'set', 'unset'],
  },
  {
    key: 'usage',
    name: 'usage',
    args: '[mode]',
    description: {
      zh: '查看 usage footer 或成本摘要。',
      en: 'Usage footer or cost summary.',
    },
    category: 'tools',
    executeMode: 'local',
    localAction: 'usage',
    argOptions: ['off', 'tokens', 'full', 'cost'],
  },
  {
    key: 'stop',
    name: 'stop',
    description: {
      zh: '停止当前运行。',
      en: 'Stop the current run.',
    },
    category: 'session',
    executeMode: 'local',
    localAction: 'stop',
  },
  {
    key: 'restart',
    name: 'restart',
    description: {
      zh: '重启 OpenClaw。',
      en: 'Restart OpenClaw.',
    },
    category: 'tools',
    executeMode: 'hybrid',
    localAction: 'restart',
  },
  {
    key: 'activation',
    name: 'activation',
    args: '[mode]',
    description: {
      zh: '设置群组激活模式。',
      en: 'Set group activation mode.',
    },
    category: 'tools',
    executeMode: 'local',
    localAction: 'activation',
    argOptions: ['mention', 'always'],
  },
  {
    key: 'send',
    name: 'send',
    args: '[mode]',
    description: {
      zh: '设置发送策略。',
      en: 'Set send policy.',
    },
    category: 'tools',
    executeMode: 'local',
    localAction: 'send',
    argOptions: ['on', 'off', 'inherit'],
  },
  {
    key: 'reset',
    name: 'reset',
    description: {
      zh: '重置当前会话。',
      en: 'Reset the current session.',
    },
    category: 'session',
    executeMode: 'local',
    localAction: 'reset',
  },
  {
    key: 'new',
    name: 'new',
    description: {
      zh: '开始一个新的会话。',
      en: 'Start a new session.',
    },
    category: 'session',
    executeMode: 'local',
    localAction: 'new',
  },
  {
    key: 'compact',
    name: 'compact',
    args: '[instructions]',
    description: {
      zh: '压缩当前会话上下文。',
      en: 'Compact the session context.',
    },
    category: 'session',
    executeMode: 'local',
    localAction: 'compact',
  },
  {
    key: 'think',
    name: 'think',
    aliases: ['thinking', 't'],
    args: '[level]',
    description: {
      zh: '设置 thinking level。',
      en: 'Set thinking level.',
    },
    category: 'model',
    executeMode: 'local',
    localAction: 'think',
    argOptions: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'],
  },
  {
    key: 'verbose',
    name: 'verbose',
    aliases: ['v'],
    args: '[mode]',
    description: {
      zh: '切换 verbose mode。',
      en: 'Toggle verbose mode.',
    },
    category: 'model',
    executeMode: 'local',
    localAction: 'verbose',
    argOptions: ['off', 'on', 'full'],
  },
  {
    key: 'fast',
    name: 'fast',
    args: '[mode]',
    description: {
      zh: '切换 fast mode。',
      en: 'Toggle fast mode.',
    },
    category: 'model',
    executeMode: 'local',
    localAction: 'fast',
    argOptions: ['status', 'off', 'on'],
  },
  {
    key: 'reasoning',
    name: 'reasoning',
    aliases: ['reason'],
    args: '[mode]',
    description: {
      zh: '切换 reasoning 可见性。',
      en: 'Toggle reasoning visibility.',
    },
    category: 'model',
    executeMode: 'local',
    localAction: 'reasoning',
    argOptions: ['off', 'on', 'stream'],
  },
  {
    key: 'elevated',
    name: 'elevated',
    aliases: ['elev'],
    args: '[mode]',
    description: {
      zh: '切换 elevated mode。',
      en: 'Toggle elevated mode.',
    },
    category: 'model',
    executeMode: 'local',
    localAction: 'elevated',
    argOptions: ['off', 'on', 'ask', 'full'],
  },
  {
    key: 'exec',
    name: 'exec',
    args: '[host] [security] [ask] [node]',
    description: {
      zh: '设置当前会话的 exec 默认项。',
      en: 'Set exec defaults for this session.',
    },
    category: 'tools',
    executeMode: 'local',
    localAction: 'exec',
    argOptions: [
      'host=auto',
      'host=sandbox',
      'host=gateway',
      'host=node',
      'security=deny',
      'security=allowlist',
      'security=full',
      'ask=off',
      'ask=on-miss',
      'ask=always',
      'node=<id>',
    ],
  },
  {
    key: 'model',
    name: 'model',
    args: '[model]',
    description: {
      zh: '显示或设置当前模型。',
      en: 'Show or set the model.',
    },
    category: 'model',
    executeMode: 'local',
    localAction: 'model',
  },
  {
    key: 'models',
    name: 'models',
    args: '[provider]',
    description: {
      zh: '列出模型 provider 或 provider models。',
      en: 'List model providers or provider models.',
    },
    category: 'model',
    executeMode: 'local',
    localAction: 'models',
  },
  {
    key: 'queue',
    name: 'queue',
    args: '[mode] [debounce] [cap] [drop]',
    description: {
      zh: '调整队列设置。',
      en: 'Adjust queue settings.',
    },
    category: 'model',
    executeMode: 'hybrid',
    localAction: 'queue',
    argOptions: ['steer', 'interrupt', 'followup', 'collect', 'steer-backlog'],
  },
  {
    key: 'bash',
    name: 'bash',
    args: '[command]',
    description: {
      zh: '运行宿主 shell 命令（仅 host）。',
      en: 'Run host shell commands (host-only).',
    },
    category: 'tools',
    executeMode: 'hybrid',
    localAction: 'bash',
  },
  {
    key: 'clear',
    name: 'clear',
    description: {
      zh: '清空当前聊天历史。',
      en: 'Clear chat history.',
    },
    category: 'session',
    executeMode: 'local',
    localAction: 'clear',
  },
  {
    key: 'redirect',
    name: 'redirect',
    args: '[id] <message>',
    description: {
      zh: '中止当前运行并以新消息重启。',
      en: 'Abort and restart with a new message.',
    },
    category: 'agents',
    executeMode: 'local',
    localAction: 'redirect',
  },
];

function normalizeLower(value: string | undefined | null): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function commandMatchesName(command: StudioSlashCommandDef, name: string): boolean {
  const normalized = normalizeLower(name);
  if (!normalized) {
    return false;
  }
  if (normalizeLower(command.name) === normalized) {
    return true;
  }
  return (command.aliases || []).some((alias) => normalizeLower(alias) === normalized);
}

export function getStudioSlashCommandDescription(
  command: StudioSlashCommandDef,
  locale: 'zh' | 'en',
): string {
  return locale === 'zh' ? command.description.zh : command.description.en;
}

export function getStudioSlashCommandCategoryLabel(
  category: StudioSlashCommandCategory,
  locale: 'zh' | 'en',
): string {
  return locale === 'zh' ? CATEGORY_LABELS[category].zh : CATEGORY_LABELS[category].en;
}

export function getStudioSlashCommandArgOptions(
  command: StudioSlashCommandDef,
  overrideOptions: StudioSlashArgOptionsOverrides = {},
): string[] {
  const candidates = overrideOptions[command.name] || overrideOptions[command.key] || command.argOptions || [];
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const option of candidates) {
    const normalized = typeof option === 'string' ? option.trim() : '';
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    resolved.push(normalized);
  }
  return resolved;
}

export function getStudioSlashCommandArgOptionDetails(
  command: StudioSlashCommandDef,
  locale: 'zh' | 'en',
  overrideOptions: StudioSlashArgOptionsOverrides = {},
): StudioSlashArgOptionDetail[] {
  const values = getStudioSlashCommandArgOptions(command, overrideOptions);
  const overrideSource = overrideOptions[command.name] || overrideOptions[command.key] || [];
  return values.map((value) => {
    const meta = ARG_OPTION_DETAILS[command.name]?.[value] || ARG_OPTION_DETAILS[command.key]?.[value];
    if (meta) {
      return {
        value,
        label: locale === 'zh' ? meta.label.zh : meta.label.en,
        description: locale === 'zh' ? meta.description.zh : meta.description.en,
      };
    }

    if (command.name === 'model' && overrideSource.includes(value)) {
      return {
        value,
        label: value,
        description: locale === 'zh'
          ? '来自当前 OpenClaw 配置的模型候选。'
          : 'Configured model candidate from the current OpenClaw settings.',
      };
    }

    return {
      value,
      label: value,
      description: locale === 'zh'
        ? `将 ${value} 作为 /${command.name} 的参数。`
        : `Use ${value} as the argument for /${command.name}.`,
    };
  });
}

export function filterStudioSlashCommandArgOptionDetails(
  command: StudioSlashCommandDef,
  filter: string,
  locale: 'zh' | 'en',
  overrideOptions: StudioSlashArgOptionsOverrides = {},
): StudioSlashArgOptionDetail[] {
  const normalizedFilter = normalizeLower(filter);
  const details = getStudioSlashCommandArgOptionDetails(command, locale, overrideOptions);
  if (!normalizedFilter) {
    return details;
  }
  return details.filter((item) => {
    const haystacks = [item.value, item.label, item.description].map((value) => normalizeLower(value));
    return haystacks.some((value) => value.includes(normalizedFilter));
  });
}

export function getStudioSlashCommandCompletions(filter: string): StudioSlashCommandDef[] {
  const normalizedFilter = normalizeLower(filter);
  const commands = normalizedFilter
    ? STUDIO_SLASH_COMMANDS.filter((command) => {
      if (normalizeLower(command.name).startsWith(normalizedFilter)) {
        return true;
      }
      if ((command.aliases || []).some((alias) => normalizeLower(alias).startsWith(normalizedFilter))) {
        return true;
      }
      return normalizeLower(command.description.en).includes(normalizedFilter)
        || normalizeLower(command.description.zh).includes(normalizedFilter);
    })
    : STUDIO_SLASH_COMMANDS;

  return [...commands].sort((left: StudioSlashCommandDef, right: StudioSlashCommandDef) => {
    if (normalizedFilter) {
      const leftStartsWith = (
        normalizeLower(left.name).startsWith(normalizedFilter)
        || (left.aliases || []).some((alias: string) => normalizeLower(alias).startsWith(normalizedFilter))
      ) ? 0 : 1;
      const rightStartsWith = (
        normalizeLower(right.name).startsWith(normalizedFilter)
        || (right.aliases || []).some((alias: string) => normalizeLower(alias).startsWith(normalizedFilter))
      ) ? 0 : 1;
      if (leftStartsWith !== rightStartsWith) {
        return leftStartsWith - rightStartsWith;
      }
    }

    const leftCategoryIndex = CATEGORY_ORDER.indexOf(left.category);
    const rightCategoryIndex = CATEGORY_ORDER.indexOf(right.category);
    if (leftCategoryIndex !== rightCategoryIndex) {
      return leftCategoryIndex - rightCategoryIndex;
    }

    return left.name.localeCompare(right.name);
  });
}

export function parseStudioSlashCommand(text: string): ParsedStudioSlashCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }

  const body = trimmed.slice(1);
  const firstSeparator = body.search(/[\s:]/u);
  const rawName = firstSeparator === -1 ? body : body.slice(0, firstSeparator);
  let remainder = firstSeparator === -1 ? '' : body.slice(firstSeparator);
  if (remainder.startsWith(':')) {
    remainder = remainder.slice(1);
  }
  const args = remainder.trimStart();
  const command = STUDIO_SLASH_COMMANDS.find((entry) => commandMatchesName(entry, rawName));
  if (!command) {
    return null;
  }
  return {
    command,
    args,
  };
}
