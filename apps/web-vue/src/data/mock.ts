import { computed } from 'vue';
import { useLocalePreference } from '../shared/locale';

export function useUiContent() {
  const { text } = useLocalePreference();

  const navGroups = computed(() => [
    {
      title: text('控制台', 'Workspace'),
      items: [
        { to: '/dashboard', icon: 'dashboard', label: text('仪表盘', 'Dashboard') },
        { to: '/agents', icon: 'agents', label: text('Agent 管理', 'Agents') },
        { to: '/dreaming', icon: 'dreaming', label: text('梦境记忆', 'Dreaming') },
        { to: '/chat', icon: 'chat', label: text('会话工作台', 'Chat') },
        { to: '/channels', icon: 'channels', label: text('频道管理', 'Channels') },
        { to: '/cron', icon: 'cron', label: text('定时任务', 'Cron') },
      ],
    },
    {
      title: text('运维', 'Operations'),
      items: [
        { to: '/skills', icon: 'skills', label: text('技能管理', 'Skills') },
        { to: '/terminal', icon: 'terminal', label: text('维护终端', 'Terminal') },
        { to: '/config', icon: 'config', label: text('系统配置', 'Config') },
        { to: '/system', icon: 'system', label: text('系统诊断', 'System') },
      ],
    },
  ]);

  const topStatus = computed(() => [
    { label: text('管理恢复中', 'Mgmt Recovery'), tone: 'accent' },
    { label: text('并行就绪', 'Parallel Ready'), tone: 'sage' },
    { label: text('文档已对齐', 'Docs Aligned'), tone: 'neutral' },
  ]);

  const dashboardMetrics = computed(() => [
    { eyebrow: 'DOMAINS', value: '07', label: text('恢复域', 'Domains'), note: 'config / skills / terminal / channels / cron / agents / chat' },
    { eyebrow: 'ROUTES', value: '10', label: text('一级页面', 'Routes'), note: text('Dashboard + Dreaming + 7 domains + System', 'Dashboard + Dreaming + 7 domains + System') },
    { eyebrow: 'PHASE', value: 'M1', label: text('当前阶段', 'Current phase'), note: 'docs + shell + contracts' },
    { eyebrow: 'STACK', value: 'TS', label: text('统一栈', 'Shared stack'), note: 'plugin / api / vue' },
  ]);

  const dashboardHighlights = computed(() => [
    {
      title: text('恢复批次', 'Recovery Scope'),
      copy: text('当前已把 chat 纳入规划和壳层接入，但 room / workflow 继续后置。', 'Chat is now part of the planned shell, while room / workflow remain deferred.'),
    },
    {
      title: text('实现策略', 'Delivery Strategy'),
      copy: text('先基础层，再领域模块，再聚合 Dashboard / System。', 'Foundation first, domain modules second, Dashboard / System aggregation last.'),
    },
    {
      title: text('协作方式', 'Parallel Workstreams'),
      copy: text('按领域拆给并行子代理，避免多人争抢同一文件。', 'Split by domain so parallel agents do not fight over the same files.'),
    },
  ]);

  const parallelTracks = computed(() => [
    { name: 'Foundation', summary: text('导航壳、共享类型、API core、错误处理', 'App shell, shared types, API core, error handling'), state: 'Ready' },
    { name: 'Config', summary: text('默认模型、sandbox、tools、provider 管理', 'Defaults, sandbox, tools, provider management'), state: text('进行中', 'In Progress') },
    { name: 'Skills', summary: text('技能列表、启停、配置和市场快照', 'Skill listing, toggles, config, marketplace snapshot'), state: text('计划中', 'Planned') },
    { name: 'Terminal', summary: text('PTY、CLI 检测、WebSocket 会话', 'PTY, CLI detection, WebSocket sessions'), state: text('计划中', 'Planned') },
    { name: 'Channels', summary: text('频道、账号、pairing、binding', 'Channels, accounts, pairing, bindings'), state: text('计划中', 'Planned') },
    { name: 'Cron', summary: text('schedule、delivery、手动运行', 'Schedules, delivery, run-now'), state: text('计划中', 'Planned') },
    { name: 'Agents', summary: text('列表、详情、配置、docs 入口', 'Lists, detail, config, docs entry'), state: text('计划中', 'Planned') },
    { name: 'Chat', summary: text('Agent rail、Session rail、Transcript 与 diagnostics 壳层', 'Agent rail, session rail, transcript, and diagnostics shell'), state: text('已接入壳层', 'Shell Ready') },
    { name: 'Dashboard/System', summary: text('聚合摘要、健康与诊断', 'Summary aggregation, health, diagnostics'), state: text('依赖契约', 'Waiting on contracts') },
  ]);

  const agents = computed(() => [
    {
      name: text('小丘', 'Xiaoqiu'),
      id: 'main',
      model: 'gmn/gpt-5.4',
      specialty: text('主调度 / 对外响应', 'Primary orchestration / outward response'),
      workspace: '/workspace',
      sessions: 12,
      status: 'online',
    },
    {
      name: text('小维', 'Xiaowei'),
      id: 'openclaw-ops',
      model: 'gmn/gpt-5.4',
      specialty: text('系统维护 / 运营巡检', 'Operations / maintenance'),
      workspace: '/workspace-ops',
      sessions: 5,
      status: 'ready',
    },
    {
      name: text('像素', 'Pixel'),
      id: 'frontend',
      model: 'gmn/gpt-5.4',
      specialty: text('设计系统 / 界面迭代', 'Design system / UI iteration'),
      workspace: '/workspace-frontend',
      sessions: 3,
      status: 'designing',
    },
    {
      name: text('栈灵', 'Stackling'),
      id: 'backend',
      model: 'gmn/gpt-5.4',
      specialty: text('运行时 / 接口设计', 'Runtime / API design'),
      workspace: '/workspace-backend',
      sessions: 7,
      status: 'ready',
    },
  ]);

  const agentWorkstreams = computed(() => [
    {
      title: text('列表与详情', 'List & Detail'),
      description: text('先恢复 Agent roster、详情摘要和配置入口，不带会话操作台。', 'Restore roster, detail summary, and config entry first, without a full session workbench.'),
    },
    {
      title: text('配置写入', 'Config Writes'),
      description: text('工作区、模型、sandbox、tools 统一走领域模块，不直接在页面拼 JSON。', 'Workspace, model, sandbox, and tools should flow through the domain module instead of ad hoc page-side JSON edits.'),
    },
    {
      title: text('Docs 入口', 'Docs Entry'),
      description: text('为 AGENTS.md / SOUL.md 等文档保留稳定入口，但编辑可后置。', 'Keep stable entry points for AGENTS.md / SOUL.md and related docs; editing can come later.'),
    },
  ]);

  const channelHighlights = computed(() => [
    {
      title: text('频道层级', 'Channel Hierarchy'),
      copy: text('Channel Type -> Account -> Binding 三层结构，避免账号配置散落。', 'Use a three-layer model: Channel Type -> Account -> Binding, instead of scattering account config.'),
    },
    {
      title: text('Pairing', 'Pairing'),
      copy: text('配对请求属于频道域能力，不和系统诊断混放。', 'Pairing is a channel-domain feature and should not be mixed into system diagnostics.'),
    },
    {
      title: text('凭证策略', 'Credential Strategy'),
      copy: text('敏感字段后端统一脱敏，前端只展示安全摘要。', 'Sensitive fields stay masked on the backend; the UI only shows safe summaries.'),
    },
  ]);

  const channelFlows = computed(() => [
    { label: 'Channel', note: text('频道类型开关与默认策略', 'Channel type toggles and default policy') },
    { label: 'Account', note: text('账号配置、enabled、allow-from', 'Account config, enabled flag, allow-from') },
    { label: 'Binding', note: text('将账号绑定到具体 Agent', 'Bind an account to a specific agent') },
    { label: 'Pairing', note: text('在需要的频道上查看和批准配对', 'Review and approve pairing on applicable channels') },
  ]);

  const skillTracks = computed(() => [
    {
      title: text('已安装技能', 'Installed Skills'),
      description: text('先把本地技能列表、状态、来源标识做稳定。', 'Stabilize the local skill list, status, and source markers first.'),
    },
    {
      title: text('技能配置', 'Skill Config'),
      description: text('启停、env、apiKey 等配置统一纳入管理台。', 'Toggles, env, apiKey, and related settings should all live in the management UI.'),
    },
    {
      title: text('市场能力', 'Marketplace'),
      description: text('市场页保留为可选后半段，不阻塞已安装能力落地。', 'Marketplace support stays optional and should not block installed-skill management.'),
    },
  ]);

  const skillPrinciples = computed(() => [
    { title: text('清单优先', 'List First'), description: text('先把清单和状态做准，再扩安装流。', 'Make the list and state correct before expanding install flows.') },
    { title: text('安全配置', 'Safe Config'), description: text('敏感配置展示摘要，不直接明文回显。', 'Sensitive config shows summaries rather than raw secrets.') },
    { title: text('缓存感知', 'Cache Aware'), description: text('市场和列表允许缓存，但要标识 stale。', 'Marketplace and list responses may be cached, but stale state must be explicit.') },
  ]);

  const cronPrinciples = computed(() => [
    {
      title: text('任务结构', 'Task Structure'),
      description: text('schedule、session target、delivery target 明确分离。', 'Separate schedule, session target, and delivery target clearly.'),
    },
    {
      title: text('可操作性', 'Operability'),
      description: text('支持手动运行和启停，不要求首轮进入复杂 workflow。', 'Support run-now and enable/disable without forcing workflow complexity into the first pass.'),
    },
    {
      title: text('目标引用', 'Target Reference'),
      description: text('delivery target 优先使用 binding / session 摘要，不直接靠手输字符串。', 'Prefer bindings and session summaries over raw string entry for delivery targets.'),
    },
  ]);

  const cronTargets = computed(() => [
    { title: 'Schedule', copy: text('支持预设、可视化表达式和 raw cron 三种编辑方式。', 'Supports preset, visual, and raw cron expression editing.') },
    { title: 'Session Target', copy: text('isolated / main / existing-session 明确区分。', 'Clearly distinguishes isolated / main / existing-session.') },
    { title: 'Delivery Target', copy: text('announce 与 silent 模式分开设计。', 'Separates announce and silent delivery modes.') },
  ]);

  const terminalCapabilities = computed(() => [
    {
      title: text('终端连接', 'Terminal Session'),
      description: text('维护终端通过 WebSocket + PTY 建立会话，不混入普通 SSE。', 'The maintenance terminal uses WebSocket + PTY, not regular SSE.'),
    },
    {
      title: text('CLI 检测', 'CLI Detection'),
      description: text('Claude / Codex / 普通终端作为首批入口，状态必须清晰可见。', 'Claude / Codex / shell should be clearly visible as first-class entry points.'),
    },
    {
      title: text('会话续连', 'Session Resume'),
      description: text('允许重连和新建，但不在首轮做复杂 tab 编排。', 'Allow reconnect and new sessions without building complex tab orchestration yet.'),
    },
  ]);

  const terminalConstraints = computed(() => [
    { title: text('高风险', 'High Risk'), description: text('终端属于高风险能力，必须保守处理。', 'Terminal access is high risk and must stay conservative.') },
    { title: text('显式控制', 'Explicit Control'), description: text('连接、结束、安装都需要明确动作。', 'Connect, end, and install flows must all be explicit actions.') },
    { title: text('仅运维', 'Ops Only'), description: text('定位是维护入口，不是通用 IDE 替代。', 'This is an operations entry point, not a general IDE replacement.') },
  ]);

  const systemMilestones = computed(() => [
    { title: 'M1', description: text('文档、导航壳、共享类型和并行拆分就位。', 'Docs, shell, shared types, and parallel workstream boundaries are in place.') },
    { title: 'M2', description: text('六个管理域的最小后端模块恢复。', 'Minimal backend modules for the six management domains are restored.') },
    { title: 'M3', description: text('前端页面从 mock 切到真实 API。', 'Frontend pages move from mocks to real APIs.') },
    { title: 'M4', description: text('集成、错误态、日志和诊断收口。', 'Integration, error states, logging, and diagnostics are tightened.') },
  ]);

  const principles = computed(() => [
    { title: text('领域优先', 'Domain First'), description: text('先保证领域边界，再扩功能。', 'Protect domain boundaries before adding more features.') },
    { title: text('并行安全', 'Parallel Safe'), description: text('按领域拆分文件，方便并行子代理开发。', 'Split by domain so parallel agents can work safely.') },
    { title: text('文档即契约', 'Docs as Contract'), description: text('PRD / Architecture / Plan / Progress 必须同步维护。', 'PRD / Architecture / Plan / Progress must stay in sync.') },
  ]);

  const rawPreview = computed(() => (text(
`{
  "phase": "management-recovery",
  "domains": [
    "config",
    "skills",
    "terminal",
    "channels",
    "cron",
    "agents",
    "chat"
  ]
}`,
`{
  "phase": "management-recovery",
  "domains": [
    "config",
    "skills",
    "terminal",
    "channels",
    "cron",
    "agents",
    "chat"
  ]
}`)));

  return {
    navGroups,
    topStatus,
    dashboardMetrics,
    dashboardHighlights,
    parallelTracks,
    agents,
    agentWorkstreams,
    channelHighlights,
    channelFlows,
    skillTracks,
    skillPrinciples,
    cronPrinciples,
    cronTargets,
    terminalCapabilities,
    terminalConstraints,
    systemMilestones,
    principles,
    rawPreview,
  };
}
