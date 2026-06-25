import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { toast } from "@/design/ui/sonner";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useOpenClawConfigSummaryQuery, usePatchOpenClawConfigMutation, useSystemDiagnosticsQuery } from "@/lib/query/platform-read";
import { BoundaryBadge, JsonSnippet, Panel, PanelHead, ReadOnlyStrip, RefreshButton, ResponsiveTable, SelectableRow, WorkbenchToolbar, fmtDate } from "../components";
import { StatTile } from "../../_shared";
import type { ConfigPatchPayload, ConfigSummaryPayload } from "../../../../../../../types/config";

type ConfigSection = "defaults" | "models" | "runtime" | "security" | "gateway" | "messages" | "extensions" | "browserLogging" | "advanced";

interface ConfigDraft {
  model: string;
  modelFallback: string;
  imageModel: string;
  pdfModel: string;
  subagentModel: string;
  thinking: string;
  verbose: string;
  timeoutSeconds: string;
  maxConcurrent: string;
  subagentMaxConcurrent: string;
  workspace: string;
  repoRoot: string;
  contextTokens: string;
  typingMode: string;
  blockStreaming: string;
  compactionMode: string;
  compactionModel: string;
  reserveTokensFloor: string;
  memoryFlushEnabled: boolean;
  memoryFlushSoftThresholdTokens: string;
  sandboxMode: string;
  sandboxWorkspaceAccess: string;
  sandboxScope: string;
  sandboxSessionToolsVisibility: string;
  sandboxPruneIdleHours: string;
  sandboxPruneMaxAgeDays: string;
  toolsProfile: string;
  toolsElevatedEnabled: boolean;
  execHost: string;
  execMode: string;
  execAsk: string;
  execSecurity: string;
  execTimeoutSec: string;
  fsWorkspaceOnly: boolean;
  approvalSecurity: string;
  approvalAsk: string;
  approvalAskFallback: string;
  approvalAutoAllowSkills: boolean;
  gatewayPort: string;
  gatewayMode: string;
  gatewayBind: string;
  gatewayCustomBindHost: string;
  gatewayAuthMode: string;
  gatewayAllowTailscale: boolean;
  gatewayRateLimitMaxAttempts: string;
  gatewayRateLimitWindowMs: string;
  gatewayRateLimitLockoutMs: string;
  gatewayRateLimitExemptLoopback: boolean;
  controlUiEnabled: boolean;
  controlUiBasePath: string;
  controlUiAllowedOrigins: string;
  controlUiAllowInsecureAuth: boolean;
  sessionDmScope: string;
  threadBindingsEnabled: boolean;
  threadBindingsIdleHours: string;
  threadBindingsMaxAgeHours: string;
  responsePrefix: string;
  ackReaction: string;
  ackReactionScope: string;
  removeAckAfterReply: boolean;
  queueMode: string;
  queueDebounceMs: string;
  queueCap: string;
  queueDrop: string;
  sessionResetJson: string;
  commandsJson: string;
  hooksJson: string;
  mcpJson: string;
  skillsJson: string;
  acpJson: string;
  pluginsJson: string;
  browserJson: string;
  loggingJson: string;
}

const CONFIG_SECTION_IDS = new Set<ConfigSection>(["defaults", "models", "runtime", "security", "gateway", "messages", "extensions", "browserLogging", "advanced"]);

const CONFIG_SECTIONS: Array<{ id: ConfigSection; title: string; desc: string }> = [
  { id: "defaults", title: "基础", desc: "目录、并发、超时" },
  { id: "models", title: "模型", desc: "主模型与备用模型" },
  { id: "runtime", title: "策略", desc: "上下文、压缩、流式" },
  { id: "security", title: "安全", desc: "沙箱、工具、审批" },
  { id: "gateway", title: "网关", desc: "端口、认证、控制台" },
  { id: "messages", title: "会话消息", desc: "队列、ack、DM" },
  { id: "extensions", title: "扩展", desc: "命令 / MCP / 技能 / 插件 / ACP" },
  { id: "browserLogging", title: "浏览日志", desc: "Browser / Logging" },
  { id: "advanced", title: "高级证据", desc: "服务商只读证据" },
];

const joinList = (values: string[] | undefined) => (values ?? []).join("\n");
const splitList = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
const jsonText = (value: unknown) => JSON.stringify(value ?? {}, null, 2);
const text = (value: unknown) => value == null ? "" : String(value);
const numberText = (value: unknown) => Number.isFinite(Number(value)) ? String(Number(value)) : "";

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegative(value: string, fallback = 0): number {
  const parsed = numberOrNull(value);
  return parsed == null ? fallback : Math.max(0, Math.floor(parsed));
}

function positive(value: string, fallback = 1): number {
  const parsed = numberOrNull(value);
  return parsed == null ? fallback : Math.max(1, Math.floor(parsed));
}

function draftFromConfig(data: ConfigSummaryPayload | undefined): ConfigDraft {
  return {
    model: data?.defaults.model ?? "",
    modelFallback: joinList(data?.defaults.modelFallback),
    imageModel: data?.defaults.imageModel ?? "",
    pdfModel: data?.defaults.pdfModel ?? "",
    subagentModel: data?.defaults.subagentModel ?? "",
    thinking: data?.defaults.thinking ?? "",
    verbose: data?.defaults.verbose ?? "",
    timeoutSeconds: numberText(data?.defaults.timeoutSeconds),
    maxConcurrent: numberText(data?.defaults.maxConcurrent),
    subagentMaxConcurrent: numberText(data?.defaults.subagentMaxConcurrent),
    workspace: data?.defaults.workspace ?? "",
    repoRoot: data?.defaults.repoRoot ?? "",
    contextTokens: numberText(data?.defaults.contextTokens),
    typingMode: data?.defaults.typingMode ?? "",
    blockStreaming: data?.defaults.blockStreaming ?? "",
    compactionMode: data?.compaction.mode ?? "safeguard",
    compactionModel: data?.compaction.model ?? "",
    reserveTokensFloor: numberText(data?.compaction.reserveTokensFloor),
    memoryFlushEnabled: data?.compaction.memoryFlush.enabled ?? true,
    memoryFlushSoftThresholdTokens: numberText(data?.compaction.memoryFlush.softThresholdTokens),
    sandboxMode: data?.sandbox.mode ?? "off",
    sandboxWorkspaceAccess: data?.sandbox.workspaceAccess ?? "rw",
    sandboxScope: data?.sandbox.scope ?? "session",
    sandboxSessionToolsVisibility: data?.sandbox.sessionToolsVisibility ?? "spawned",
    sandboxPruneIdleHours: numberText(data?.sandbox.prune.idleHours),
    sandboxPruneMaxAgeDays: numberText(data?.sandbox.prune.maxAgeDays),
    toolsProfile: data?.tools.profile ?? "full",
    toolsElevatedEnabled: data?.tools.elevatedEnabled ?? true,
    execHost: data?.tools.execHost ?? "auto",
    execMode: data?.tools.execMode ?? "",
    execAsk: data?.tools.execAsk ?? "off",
    execSecurity: data?.tools.execSecurity ?? "full",
    execTimeoutSec: numberText(data?.tools.execTimeoutSec),
    fsWorkspaceOnly: data?.tools.fsWorkspaceOnly ?? false,
    approvalSecurity: data?.execApprovals.defaults.security ?? "deny",
    approvalAsk: data?.execApprovals.defaults.ask ?? "on-miss",
    approvalAskFallback: data?.execApprovals.defaults.askFallback ?? "deny",
    approvalAutoAllowSkills: data?.execApprovals.defaults.autoAllowSkills ?? false,
    gatewayPort: numberText(data?.gateway.port),
    gatewayMode: data?.gateway.mode ?? "local",
    gatewayBind: data?.gateway.bind ?? "loopback",
    gatewayCustomBindHost: data?.gateway.customBindHost ?? "",
    gatewayAuthMode: data?.gateway.auth.mode ?? "token",
    gatewayAllowTailscale: data?.gateway.auth.allowTailscale ?? false,
    gatewayRateLimitMaxAttempts: numberText(data?.gateway.auth.rateLimit.maxAttempts),
    gatewayRateLimitWindowMs: numberText(data?.gateway.auth.rateLimit.windowMs),
    gatewayRateLimitLockoutMs: numberText(data?.gateway.auth.rateLimit.lockoutMs),
    gatewayRateLimitExemptLoopback: data?.gateway.auth.rateLimit.exemptLoopback ?? true,
    controlUiEnabled: data?.gateway.controlUi.enabled ?? true,
    controlUiBasePath: data?.gateway.controlUi.basePath ?? "",
    controlUiAllowedOrigins: joinList(data?.gateway.controlUi.allowedOrigins),
    controlUiAllowInsecureAuth: data?.gateway.controlUi.allowInsecureAuth ?? false,
    sessionDmScope: data?.session.dmScope ?? "per-channel-peer",
    threadBindingsEnabled: data?.session.threadBindings.enabled ?? false,
    threadBindingsIdleHours: numberText(data?.session.threadBindings.idleHours),
    threadBindingsMaxAgeHours: numberText(data?.session.threadBindings.maxAgeHours),
    responsePrefix: data?.messages.responsePrefix ?? "",
    ackReaction: data?.messages.ackReaction ?? "",
    ackReactionScope: data?.messages.ackReactionScope ?? "group-mentions",
    removeAckAfterReply: data?.messages.removeAckAfterReply ?? false,
    queueMode: data?.messages.queue.mode ?? "collect",
    queueDebounceMs: numberText(data?.messages.queue.debounceMs),
    queueCap: numberText(data?.messages.queue.cap),
    queueDrop: data?.messages.queue.drop ?? "summarize",
    sessionResetJson: jsonText(data?.sessionReset ?? {}),
    commandsJson: jsonText(data?.commands ?? {}),
    hooksJson: jsonText(data?.hooks ?? {}),
    mcpJson: jsonText(data?.mcp ?? {}),
    skillsJson: jsonText(data?.skills ?? {}),
    acpJson: jsonText(data?.acp ?? {}),
    pluginsJson: jsonText(data?.plugins ?? {}),
    browserJson: jsonText(data?.browser ?? {}),
    loggingJson: jsonText(data?.logging ?? {}),
  };
}

function parseJsonField<T extends Record<string, unknown>>(value: string, label: string): T {
  const trimmed = value.trim();
  if (!trimmed) return {} as T;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} 必须是 JSON 对象`);
  return parsed as T;
}

function draftToPatch(draft: ConfigDraft, current: ConfigSummaryPayload): ConfigPatchPayload {
  return {
    defaults: {
      ...current.defaults,
      model: draft.model.trim(),
      modelFallback: splitList(draft.modelFallback),
      imageModel: draft.imageModel.trim(),
      pdfModel: draft.pdfModel.trim(),
      subagentModel: draft.subagentModel.trim(),
      thinking: draft.thinking.trim(),
      verbose: draft.verbose.trim(),
      timeoutSeconds: positive(draft.timeoutSeconds, current.defaults.timeoutSeconds || 600),
      maxConcurrent: positive(draft.maxConcurrent, current.defaults.maxConcurrent || 8),
      subagentMaxConcurrent: positive(draft.subagentMaxConcurrent, current.defaults.subagentMaxConcurrent || 16),
      workspace: draft.workspace.trim(),
      repoRoot: draft.repoRoot.trim(),
      contextTokens: numberOrNull(draft.contextTokens),
      typingMode: draft.typingMode.trim(),
      blockStreaming: draft.blockStreaming.trim(),
    },
    compaction: {
      ...current.compaction,
      mode: draft.compactionMode.trim() || current.compaction.mode,
      model: draft.compactionModel.trim(),
      reserveTokensFloor: nonNegative(draft.reserveTokensFloor, current.compaction.reserveTokensFloor || 0),
      memoryFlush: {
        enabled: draft.memoryFlushEnabled,
        softThresholdTokens: nonNegative(draft.memoryFlushSoftThresholdTokens, current.compaction.memoryFlush.softThresholdTokens || 0),
      },
    },
    sandbox: {
      ...current.sandbox,
      mode: draft.sandboxMode.trim(),
      workspaceAccess: draft.sandboxWorkspaceAccess.trim(),
      scope: draft.sandboxScope.trim(),
      sessionToolsVisibility: draft.sandboxSessionToolsVisibility.trim(),
      prune: {
        idleHours: nonNegative(draft.sandboxPruneIdleHours, current.sandbox.prune.idleHours || 24),
        maxAgeDays: positive(draft.sandboxPruneMaxAgeDays, current.sandbox.prune.maxAgeDays || 7),
      },
    },
    tools: {
      ...current.tools,
      profile: draft.toolsProfile.trim(),
      elevatedEnabled: draft.toolsElevatedEnabled,
      execHost: draft.execHost.trim(),
      execMode: draft.execMode.trim(),
      execAsk: draft.execAsk.trim(),
      execSecurity: draft.execSecurity.trim(),
      execTimeoutSec: positive(draft.execTimeoutSec, current.tools.execTimeoutSec || 45),
      fsWorkspaceOnly: draft.fsWorkspaceOnly,
    },
    execApprovals: {
      defaults: {
        security: draft.approvalSecurity.trim(),
        ask: draft.approvalAsk.trim(),
        askFallback: draft.approvalAskFallback.trim(),
        autoAllowSkills: draft.approvalAutoAllowSkills,
      },
      agents: current.execApprovals.agents,
    },
    gateway: {
      ...current.gateway,
      port: positive(draft.gatewayPort, current.gateway.port || 31879),
      mode: draft.gatewayMode.trim(),
      bind: draft.gatewayBind.trim(),
      customBindHost: draft.gatewayCustomBindHost.trim(),
      auth: {
        ...current.gateway.auth,
        mode: draft.gatewayAuthMode.trim(),
        allowTailscale: draft.gatewayAllowTailscale,
        rateLimit: {
          maxAttempts: positive(draft.gatewayRateLimitMaxAttempts, current.gateway.auth.rateLimit.maxAttempts || 10),
          windowMs: positive(draft.gatewayRateLimitWindowMs, current.gateway.auth.rateLimit.windowMs || 60000),
          lockoutMs: nonNegative(draft.gatewayRateLimitLockoutMs, current.gateway.auth.rateLimit.lockoutMs || 0),
          exemptLoopback: draft.gatewayRateLimitExemptLoopback,
        },
      },
      controlUi: {
        ...current.gateway.controlUi,
        enabled: draft.controlUiEnabled,
        basePath: draft.controlUiBasePath.trim(),
        allowedOrigins: splitList(draft.controlUiAllowedOrigins),
        allowInsecureAuth: draft.controlUiAllowInsecureAuth,
      },
    },
    session: {
      ...current.session,
      dmScope: draft.sessionDmScope.trim(),
      threadBindings: {
        enabled: draft.threadBindingsEnabled,
        idleHours: nonNegative(draft.threadBindingsIdleHours, current.session.threadBindings.idleHours || 24),
        maxAgeHours: nonNegative(draft.threadBindingsMaxAgeHours, current.session.threadBindings.maxAgeHours || 0),
      },
    },
    messages: {
      ...current.messages,
      responsePrefix: draft.responsePrefix,
      ackReaction: draft.ackReaction.trim(),
      ackReactionScope: draft.ackReactionScope.trim(),
      removeAckAfterReply: draft.removeAckAfterReply,
      queue: {
        ...current.messages.queue,
        mode: draft.queueMode.trim(),
        debounceMs: nonNegative(draft.queueDebounceMs, current.messages.queue.debounceMs || 1000),
        cap: positive(draft.queueCap, current.messages.queue.cap || 20),
        drop: draft.queueDrop.trim(),
      },
    },
    providers: current.providers.map((provider) => ({
      id: provider.id,
      api: provider.api,
      baseUrl: provider.baseUrl,
      models: provider.models.map((model) => ({ ...model })),
      extra: provider.extra,
    })),
    sessionReset: parseJsonField(draft.sessionResetJson, "会话重置 JSON"),
    commands: parseJsonField(draft.commandsJson, "命令 JSON"),
    hooks: parseJsonField(draft.hooksJson, "钩子 JSON"),
    mcp: parseJsonField(draft.mcpJson, "MCP JSON"),
    skills: parseJsonField(draft.skillsJson, "技能 JSON"),
    acp: parseJsonField(draft.acpJson, "ACP JSON"),
    plugins: parseJsonField(draft.pluginsJson, "插件 JSON"),
    browser: parseJsonField(draft.browserJson, "浏览器 JSON"),
    logging: parseJsonField(draft.loggingJson, "日志 JSON"),
  } as ConfigPatchPayload;
}

function TextField({ label, value, onChange, helper, type = "text", multiline = false }: { label: string; value: string; onChange: (value: string) => void; helper?: string; type?: string; multiline?: boolean }) {
  const inputClass = "min-w-0 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong outline-none focus:shadow-[var(--ring)]";
  return <label className="grid gap-1.5 border-b border-line px-4 py-3 last:border-b-0"><span className="text-sm font-medium text-ink-strong">{label}</span>{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className={`${inputClass} resize-y`} /> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} />}{helper ? <span className="text-xs text-muted">{helper}</span> : null}</label>;
}

type SelectOption = string | { value: string; label: string; hint?: string };
const opt = (value: string, label: string, hint?: string): SelectOption => ({ value, label, hint });
const optionValue = (option: SelectOption) => typeof option === "string" ? option : option.value;
const optionLabel = (option: SelectOption) => typeof option === "string" ? (option || "继承默认") : option.label;

function SelectField({ label, value, onChange, options, helper }: { label: string; value: string; onChange: (value: string) => void; options: SelectOption[]; helper?: string }) {
  const selected = options.find((option) => optionValue(option) === value);
  const selectedHint = selected && typeof selected !== "string" ? selected.hint : undefined;
  return <label className="grid gap-1.5 border-b border-line px-4 py-3 last:border-b-0"><span className="text-sm font-medium text-ink-strong">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong outline-none focus:shadow-[var(--ring)]">{options.map((option) => <option key={optionValue(option)} value={optionValue(option)}>{optionLabel(option)}</option>)}</select>{helper || selectedHint ? <span className="text-xs text-muted">{helper ?? selectedHint}</span> : null}</label>;
}

function ToggleField({ label, checked, onChange, helper }: { label: string; checked: boolean; onChange: (value: boolean) => void; helper?: string }) {
  return <label className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"><span className="grid gap-1"><span className="text-sm font-medium text-ink-strong">{label}</span>{helper ? <span className="text-xs text-muted">{helper}</span> : null}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" /></label>;
}

function SectionNav({ active, onChange }: { active: ConfigSection; onChange: (section: ConfigSection) => void }) {
  return <nav aria-label="OpenClaw 配置子页面" className="grid gap-1 border-b border-line p-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-9">{CONFIG_SECTIONS.map((section) => <button key={section.id} type="button" onClick={() => onChange(section.id)} aria-current={active === section.id ? "page" : undefined} className={`rounded-sm px-3 py-2 text-left transition ${active === section.id ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-panel-2 hover:text-ink-strong"}`}><span className="block text-sm font-semibold">{section.title}</span><span className="block truncate text-xs opacity-80">{section.desc}</span></button>)}</nav>;
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-0 overflow-hidden rounded-sm border border-line md:grid-cols-2">{children}</div>;
}

function ConfigEmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-line px-4 py-3 text-xs text-muted">{children}</div>;
}

const COMPACTION_OPTIONS = [opt("safeguard", "保护模式：接近上限时压缩", "推荐默认，避免上下文溢出。"), opt("auto", "自动压缩", "更积极地自动整理上下文。"), opt("off", "关闭压缩", "不建议长会话使用。")];
const SANDBOX_MODE_OPTIONS = [opt("off", "关闭沙箱", "最高兼容，最低隔离。"), opt("workspace-write", "仅允许工作区写入", "推荐：限制写入范围。"), opt("read-only", "只读沙箱", "适合审计或只读任务。")];
const WORKSPACE_ACCESS_OPTIONS = [opt("rw", "可读写工作区"), opt("ro", "只读工作区")];
const EXEC_ASK_OPTIONS = [opt("off", "不询问"), opt("on-miss", "未命中规则时询问"), opt("always", "每次都询问")];
const SECURITY_OPTIONS = [opt("full", "完整权限"), opt("workspace", "工作区权限"), opt("deny", "默认拒绝")];
const APPROVAL_FALLBACK_OPTIONS = [opt("deny", "失败时拒绝"), opt("ask", "失败时询问"), opt("allow", "失败时允许")];
const GATEWAY_MODE_OPTIONS = [opt("local", "本机模式"), opt("tailscale", "Tailscale 模式"), opt("public", "公网模式")];
const GATEWAY_BIND_OPTIONS = [opt("loopback", "仅本机 127.0.0.1"), opt("tailscale", "Tailscale 地址"), opt("custom", "自定义地址"), opt("all", "所有网卡")];
const AUTH_MODE_OPTIONS = [opt("token", "Token 认证"), opt("password", "密码认证"), opt("trusted-proxy", "可信反代"), opt("none", "无认证（仅本机/调试）")];
const DM_SCOPE_OPTIONS = [opt("per-channel-peer", "按渠道 + 私聊对象隔离"), opt("per-peer", "按私聊对象隔离"), opt("global", "全局共享私聊会话")];
const ACK_SCOPE_OPTIONS = [opt("group-mentions", "仅群聊 @ 场景"), opt("all", "全部消息"), opt("none", "不发送确认")];
const QUEUE_MODE_OPTIONS = [opt("collect", "合并收集"), opt("parallel", "并行处理"), opt("serial", "串行排队")];
const QUEUE_DROP_OPTIONS = [opt("summarize", "超限后总结压缩"), opt("drop-oldest", "丢弃最早消息"), opt("reject-new", "拒绝新消息")];


function renderSection(section: ConfigSection, draft: ConfigDraft, setField: (key: keyof ConfigDraft) => (value: string) => void, setBool: (key: keyof ConfigDraft) => (value: boolean) => void, data: ConfigSummaryPayload | undefined) {
  if (section === "defaults") return <Panel><PanelHead title="基础设置" sub="OpenClaw 默认工作目录、并发和运行超时。" /><FieldGrid><TextField label="默认工作目录" value={draft.workspace} onChange={setField("workspace")} helper="默认启动目录" /><TextField label="仓库根目录" value={draft.repoRoot} onChange={setField("repoRoot")} helper="默认仓库根目录" /><TextField label="最大并发" type="number" value={draft.maxConcurrent} onChange={setField("maxConcurrent")} /><TextField label="运行超时秒" type="number" value={draft.timeoutSeconds} onChange={setField("timeoutSeconds")} /><TextField label="子代理并发" type="number" value={draft.subagentMaxConcurrent} onChange={setField("subagentMaxConcurrent")} /><TextField label="上下文上限" type="number" value={draft.contextTokens} onChange={setField("contextTokens")} helper="留空交给 OpenClaw 默认处理" /></FieldGrid></Panel>;
  if (section === "models") return <Panel><PanelHead title="模型设置" sub="主模型、备用模型和特殊任务模型。" /><FieldGrid><TextField label="默认模型" value={draft.model} onChange={setField("model")} /><TextField label="子代理模型" value={draft.subagentModel} onChange={setField("subagentModel")} /><TextField label="图片模型" value={draft.imageModel} onChange={setField("imageModel")} /><TextField label="PDF 模型" value={draft.pdfModel} onChange={setField("pdfModel")} /><TextField label="备用模型" value={draft.modelFallback} onChange={setField("modelFallback")} multiline helper="每行一个，或用逗号分隔" /></FieldGrid><div className="border-t border-line px-4 py-3 text-xs text-muted">服务商和密钥仍由模型网关管理；这里只设置 OpenClaw 默认使用哪个模型。</div></Panel>;
  if (section === "runtime") return <Panel><PanelHead title="运行策略" sub="思考等级、压缩、流式和输入策略。" /><FieldGrid><TextField label="思考等级" value={draft.thinking} onChange={setField("thinking")} /><TextField label="详细程度" value={draft.verbose} onChange={setField("verbose")} /><TextField label="输入模式" value={draft.typingMode} onChange={setField("typingMode")} /><TextField label="流式输出策略" value={draft.blockStreaming} onChange={setField("blockStreaming")} /><SelectField label="上下文压缩模式" value={draft.compactionMode} onChange={setField("compactionMode")} options={COMPACTION_OPTIONS} /><TextField label="压缩模型" value={draft.compactionModel} onChange={setField("compactionModel")} /><TextField label="保留 token 下限" type="number" value={draft.reserveTokensFloor} onChange={setField("reserveTokensFloor")} /><TextField label="记忆刷新阈值" type="number" value={draft.memoryFlushSoftThresholdTokens} onChange={setField("memoryFlushSoftThresholdTokens")} /><ToggleField label="启用记忆刷新" checked={draft.memoryFlushEnabled} onChange={setBool("memoryFlushEnabled")} /></FieldGrid></Panel>;
  if (section === "security") return <Panel><PanelHead title="安全与工具" sub="沙箱、工具执行和审批默认策略。" /><FieldGrid><SelectField label="沙箱模式" value={draft.sandboxMode} onChange={setField("sandboxMode")} options={SANDBOX_MODE_OPTIONS} /><SelectField label="工作区权限" value={draft.sandboxWorkspaceAccess} onChange={setField("sandboxWorkspaceAccess")} options={WORKSPACE_ACCESS_OPTIONS} /><TextField label="沙箱作用域" value={draft.sandboxScope} onChange={setField("sandboxScope")} /><TextField label="会话工具可见性" value={draft.sandboxSessionToolsVisibility} onChange={setField("sandboxSessionToolsVisibility")} /><TextField label="沙箱空闲清理小时" type="number" value={draft.sandboxPruneIdleHours} onChange={setField("sandboxPruneIdleHours")} /><TextField label="沙箱最大保留天数" type="number" value={draft.sandboxPruneMaxAgeDays} onChange={setField("sandboxPruneMaxAgeDays")} /><TextField label="工具配置档" value={draft.toolsProfile} onChange={setField("toolsProfile")} /><TextField label="执行主机" value={draft.execHost} onChange={setField("execHost")} /><TextField label="执行模式" value={draft.execMode} onChange={setField("execMode")} helper="设置后会覆盖 ask/security" /><SelectField label="执行询问策略" value={draft.execAsk} onChange={setField("execAsk")} options={EXEC_ASK_OPTIONS} /><SelectField label="执行安全级别" value={draft.execSecurity} onChange={setField("execSecurity")} options={SECURITY_OPTIONS} /><TextField label="执行超时秒" type="number" value={draft.execTimeoutSec} onChange={setField("execTimeoutSec")} /><SelectField label="审批安全级别" value={draft.approvalSecurity} onChange={setField("approvalSecurity")} options={SECURITY_OPTIONS} /><SelectField label="审批询问策略" value={draft.approvalAsk} onChange={setField("approvalAsk")} options={EXEC_ASK_OPTIONS} /><SelectField label="审批失败策略" value={draft.approvalAskFallback} onChange={setField("approvalAskFallback")} options={APPROVAL_FALLBACK_OPTIONS} /><ToggleField label="允许提权工具" checked={draft.toolsElevatedEnabled} onChange={setBool("toolsElevatedEnabled")} /><ToggleField label="文件系统仅限工作区" checked={draft.fsWorkspaceOnly} onChange={setBool("fsWorkspaceOnly")} /><ToggleField label="技能自动审批" checked={draft.approvalAutoAllowSkills} onChange={setBool("approvalAutoAllowSkills")} /></FieldGrid></Panel>;
  if (section === "gateway") return <Panel><PanelHead title="网关与控制台" sub="OpenClaw 网关监听、认证、限流和控制台。" /><FieldGrid><TextField label="端口" type="number" value={draft.gatewayPort} onChange={setField("gatewayPort")} /><SelectField label="运行模式" value={draft.gatewayMode} onChange={setField("gatewayMode")} options={GATEWAY_MODE_OPTIONS} /><SelectField label="监听范围" value={draft.gatewayBind} onChange={setField("gatewayBind")} options={GATEWAY_BIND_OPTIONS} /><TextField label="自定义监听主机" value={draft.gatewayCustomBindHost} onChange={setField("gatewayCustomBindHost")} /><SelectField label="认证模式" value={draft.gatewayAuthMode} onChange={setField("gatewayAuthMode")} options={AUTH_MODE_OPTIONS} /><TextField label="限流最大尝试" type="number" value={draft.gatewayRateLimitMaxAttempts} onChange={setField("gatewayRateLimitMaxAttempts")} /><TextField label="限流窗口毫秒" type="number" value={draft.gatewayRateLimitWindowMs} onChange={setField("gatewayRateLimitWindowMs")} /><TextField label="锁定时长毫秒" type="number" value={draft.gatewayRateLimitLockoutMs} onChange={setField("gatewayRateLimitLockoutMs")} /><TextField label="控制台路径" value={draft.controlUiBasePath} onChange={setField("controlUiBasePath")} /><TextField label="允许来源" value={draft.controlUiAllowedOrigins} onChange={setField("controlUiAllowedOrigins")} multiline helper="每行一个 origin" /><ToggleField label="允许 Tailscale" checked={draft.gatewayAllowTailscale} onChange={setBool("gatewayAllowTailscale")} /><ToggleField label="本机免限流" checked={draft.gatewayRateLimitExemptLoopback} onChange={setBool("gatewayRateLimitExemptLoopback")} /><ToggleField label="启用控制台" checked={draft.controlUiEnabled} onChange={setBool("controlUiEnabled")} /><ToggleField label="允许不安全认证" checked={draft.controlUiAllowInsecureAuth} onChange={setBool("controlUiAllowInsecureAuth")} /></FieldGrid></Panel>;
  if (section === "messages") return <Panel><PanelHead title="会话与消息" sub="私聊范围、线程绑定、确认反馈和队列策略。" /><FieldGrid><SelectField label="私聊会话范围" value={draft.sessionDmScope} onChange={setField("sessionDmScope")} options={DM_SCOPE_OPTIONS} /><TextField label="线程空闲小时" type="number" value={draft.threadBindingsIdleHours} onChange={setField("threadBindingsIdleHours")} /><TextField label="线程最大保留小时" type="number" value={draft.threadBindingsMaxAgeHours} onChange={setField("threadBindingsMaxAgeHours")} /><TextField label="回复前缀" value={draft.responsePrefix} onChange={setField("responsePrefix")} /><TextField label="确认表情" value={draft.ackReaction} onChange={setField("ackReaction")} /><SelectField label="确认表情范围" value={draft.ackReactionScope} onChange={setField("ackReactionScope")} options={ACK_SCOPE_OPTIONS} /><SelectField label="队列模式" value={draft.queueMode} onChange={setField("queueMode")} options={QUEUE_MODE_OPTIONS} /><TextField label="队列合并延迟毫秒" type="number" value={draft.queueDebounceMs} onChange={setField("queueDebounceMs")} /><TextField label="队列容量" type="number" value={draft.queueCap} onChange={setField("queueCap")} /><SelectField label="超限策略" value={draft.queueDrop} onChange={setField("queueDrop")} options={QUEUE_DROP_OPTIONS} /><ToggleField label="启用线程绑定" checked={draft.threadBindingsEnabled} onChange={setBool("threadBindingsEnabled")} /><ToggleField label="回复后移除确认" checked={draft.removeAckAfterReply} onChange={setBool("removeAckAfterReply")} /></FieldGrid></Panel>;
  if (section === "extensions") return <Panel><PanelHead title="扩展与命令" sub="低频扩展对象以受保护 JSON 编辑：保存前会校验必须是对象，并走后端 schema 归一化。" /><FieldGrid><TextField label="命令配置 JSON" value={draft.commandsJson} onChange={setField("commandsJson")} multiline helper="commands：原生命令、/bash、/config、owner 显示等。" /><TextField label="内部钩子 JSON" value={draft.hooksJson} onChange={setField("hooksJson")} multiline helper="hooks.internal：总开关与各 hook 配置。" /><TextField label="MCP 配置 JSON" value={draft.mcpJson} onChange={setField("mcpJson")} multiline helper="mcp：会话 TTL 与 servers；复杂 server 字段需保持合法 JSON。" /><TextField label="技能配置 JSON" value={draft.skillsJson} onChange={setField("skillsJson")} multiline helper="skills：加载路径、watch、安装器、提示词限制等。" /><TextField label="ACP 配置 JSON" value={draft.acpJson} onChange={setField("acpJson")} multiline helper="acp：协议开关、调度、后端、允许 Agent、并发会话。" /><TextField label="插件配置 JSON" value={draft.pluginsJson} onChange={setField("pluginsJson")} multiline helper="plugins：全局开关、白名单、黑名单、加载路径、插槽和 entries。" /><TextField label="会话重置 JSON" value={draft.sessionResetJson} onChange={setField("sessionResetJson")} multiline helper="session.reset：daily/idle、按类型/渠道覆盖。" /></FieldGrid></Panel>;
  if (section === "browserLogging") return <Panel><PanelHead title="浏览器与日志" sub="浏览器自动化和日志策略；复杂 profile / SSRF / 清理策略走受保护 JSON。" /><FieldGrid><TextField label="浏览器配置 JSON" value={draft.browserJson} onChange={setField("browserJson")} multiline helper="browser：CDP、profiles、超时、headless、tabCleanup、ssrfPolicy。" /><TextField label="日志配置 JSON" value={draft.loggingJson} onChange={setField("loggingJson")} multiline helper="logging：level、consoleLevel、file、maxFileBytes、redactSensitive。" /></FieldGrid></Panel>;
  return <Panel><PanelHead title="高级证据" sub="服务商和密钥归模型网关管理；这里仅显示运行证据，避免无保护覆盖。" /><ResponsiveTable columns={["区域", "证据"]} rows={[<SelectableRow key="providers" id="providers" selected={false} onSelect={() => undefined}><td className="px-4 py-3 font-medium text-ink-strong">服务商</td><td className="px-4 py-3"><JsonSnippet value={data?.providers ?? []} /></td></SelectableRow>, <SelectableRow key="mcp" id="mcp" selected={false} onSelect={() => undefined}><td className="px-4 py-3 font-medium text-ink-strong">MCP 服务</td><td className="px-4 py-3"><JsonSnippet value={data?.mcp?.servers ?? {}} /></td></SelectableRow>, <SelectableRow key="commands" id="commands" selected={false} onSelect={() => undefined}><td className="px-4 py-3 font-medium text-ink-strong">命令</td><td className="px-4 py-3"><JsonSnippet value={data?.commands ?? {}} /></td></SelectableRow>]} empty="无高级证据" /></Panel>;
}

export function ConfigPage() {
  const config = useOpenClawConfigSummaryQuery();
  const diagnostics = useSystemDiagnosticsQuery();
  const patchConfig = usePatchOpenClawConfigMutation();
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionFromUrl = searchParams.get("section") as ConfigSection | null;
  const activeSection = sectionFromUrl && CONFIG_SECTION_IDS.has(sectionFromUrl) ? sectionFromUrl : "defaults";
  const [draft, setDraft] = React.useState<ConfigDraft>(() => draftFromConfig(undefined));
  const [savedAt, setSavedAt] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (config.data && !patchConfig.isPending) setDraft(draftFromConfig(config.data));
  }, [config.data?.checkedAt, patchConfig.isPending]);

  const data = config.data;
  if (config.isLoading) return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[420px] w-full" /></div>;
  if (config.error) return <ErrorState title="无法加载 OpenClaw 配置摘要" description={config.error.message} />;
  const currentDraft = draftFromConfig(data);
  const dirty = JSON.stringify(draft) !== JSON.stringify(currentDraft);
  const setField = (key: keyof ConfigDraft) => (value: string) => setDraft((prev) => ({ ...prev, [key]: value }));
  const setBool = (key: keyof ConfigDraft) => (value: boolean) => setDraft((prev) => ({ ...prev, [key]: value }));
  const setActiveSection = (section: ConfigSection) => {
    const next = new URLSearchParams(searchParams);
    next.set("section", section);
    setSearchParams(next, { replace: true });
  };
  const save = () => {
    if (!data) return;
    let patch: ConfigPatchPayload;
    try {
      patch = draftToPatch(draft, data);
    } catch (error) {
      toast.error("配置格式错误", { description: error instanceof Error ? error.message : String(error) });
      return;
    }
    patchConfig.mutate(patch, {
      onSuccess: (result) => {
        setDraft(draftFromConfig(result.config));
        setSavedAt(new Date().toISOString());
        toast.success("OpenClaw 配置已保存", { description: result.message });
        void config.refetch();
        void diagnostics.refetch();
      },
      onError: (error) => toast.error("保存配置失败", { description: error.message }),
    });
  };
  const activeMeta = CONFIG_SECTIONS.find((section) => section.id === activeSection) ?? CONFIG_SECTIONS[0];
  return <div className="grid gap-[18px]">
    <ReadOnlyStrip>配置页按 Settings 子页面分层：基础、模型、策略、安全、网关、会话消息、扩展、浏览日志和高级证据；不使用左右常驻详情栏，低频 JSON 默认只在对应子页出现。</ReadOnlyStrip>
    <Panel>
      <WorkbenchToolbar title="OpenClaw 配置" description="分组设置工作台，避免一个巨型表单和无保护覆盖。"><RefreshButton loading={config.isFetching} onClick={() => { void config.refetch(); void diagnostics.refetch(); }} /><BoundaryBadge /><Badge variant={dirty ? "warn" : "mute"}>{dirty ? "有未保存修改" : `已检查 ${fmtDate(data?.checkedAt)}`}</Badge></WorkbenchToolbar>
      <SectionNav active={activeSection} onChange={setActiveSection} />
      <div className="grid gap-3 p-3 md:grid-cols-4"><StatTile label="当前子页" value={activeMeta.title} sub={activeMeta.desc} /><StatTile label="默认模型" value={data?.defaults.model ?? "—"} sub="OpenClaw 默认" /><StatTile label="网关端口" value={data?.gateway.port ?? "—"} sub={`${data?.gateway.mode ?? "—"} / ${data?.gateway.bind ?? "—"}`} /><StatTile label="安全" value={data?.sandbox.mode ?? "—"} sub={data?.tools.execSecurity ?? "—"} /></div>
    </Panel>
    <div className="grid gap-[18px]">
      {renderSection(activeSection, draft, setField, setBool, data)}
      {activeSection === "advanced" ? <ConfigEmptyHint>高级证据页当前只展示 服务商 / MCP / 命令 摘要；服务商、密钥和模型路由编辑请回到模型网关，避免平台配置页重复职责。</ConfigEmptyHint> : null}
      <Panel><div className="flex flex-wrap items-center gap-2 px-4 py-3"><Button size="sm" onClick={save} disabled={!dirty || patchConfig.isPending}>{patchConfig.isPending ? "保存中…" : "保存当前配置"}</Button><Button variant="ghost" size="sm" onClick={() => setDraft(currentDraft)} disabled={!dirty || patchConfig.isPending}>重置</Button>{savedAt ? <span className="text-xs text-muted">最近保存：{fmtDate(savedAt)}</span> : null}</div></Panel>
    </div>
  </div>;
}
