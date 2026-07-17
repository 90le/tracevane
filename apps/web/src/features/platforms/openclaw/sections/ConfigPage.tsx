import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { MetricRail, MetricTile } from "@/design/ui/metric";
import { SectionNav } from "@/design/ui/section-nav";
import { toast } from "@/design/ui/sonner";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";
import { useOpenClawConfigSummaryQuery, usePatchOpenClawConfigMutation, useSystemDiagnosticsQuery } from "@/lib/query/platform-read";
import { BoundaryBadge, Panel, PanelHead, ReadOnlyStrip, RefreshButton, WorkbenchToolbar, fmtDate } from "../components";
import type { ConfigPatchPayload, ConfigSummaryPayload } from "../../../../../../../types/config";

type ConfigSection = "defaults" | "models" | "runtime" | "security" | "gateway" | "messages" | "extensions" | "browserLogging";

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
  sessionResetMode: string;
  sessionResetAtHour: string;
  sessionResetIdleMinutes: string;
  commandsNative: string;
  commandsNativeSkills: string;
  commandsText: boolean;
  commandsBash: boolean;
  commandsConfig: boolean;
  commandsMcp: boolean;
  commandsPlugins: boolean;
  commandsDebug: boolean;
  commandsRestart: boolean;
  commandsOwnerDisplay: string;
  commandsBashForegroundMs: string;
  hooksInternalEnabled: boolean;
  mcpSessionIdleTtlMs: string;
  skillsWatch: boolean;
  skillsWatchDebounceMs: string;
  skillsNodeManager: string;
  skillsPreferBrew: boolean;
  skillsAllowUploadedArchives: boolean;
  skillsMaxSkillsInPrompt: string;
  skillsMaxSkillsPromptChars: string;
  acpEnabled: boolean;
  acpDispatchEnabled: boolean;
  acpBackend: string;
  acpDefaultAgent: string;
  acpMaxConcurrentSessions: string;
  pluginsEnabled: boolean;
  pluginsMemorySlot: string;
  pluginsContextEngineSlot: string;
  browserEnabled: boolean;
  browserEvaluateEnabled: boolean;
  browserDefaultProfile: string;
  browserCdpUrl: string;
  browserHeadless: boolean;
  browserNoSandbox: boolean;
  browserAttachOnly: boolean;
  browserSnapshotMode: string;
  browserTabCleanupEnabled: boolean;
  browserTabCleanupIdleMinutes: string;
  browserTabCleanupMaxTabsPerSession: string;
  loggingLevel: string;
  loggingConsoleLevel: string;
  loggingConsoleStyle: string;
  loggingRedactSensitive: string;
  loggingMaxFileBytes: string;
  loggingFile: string;
}

const CONFIG_SECTION_IDS = new Set<ConfigSection>(["defaults", "models", "runtime", "security", "gateway", "messages", "extensions", "browserLogging"]);

const CONFIG_SECTIONS: Array<{ id: ConfigSection; title: string; desc: string }> = [
  { id: "defaults", title: "基础", desc: "目录、并发、超时" },
  { id: "models", title: "模型", desc: "主模型与备用模型" },
  { id: "runtime", title: "策略", desc: "上下文、压缩、流式" },
  { id: "security", title: "安全", desc: "沙箱、工具、审批" },
  { id: "gateway", title: "网关", desc: "端口、认证、控制台" },
  { id: "messages", title: "会话消息", desc: "队列、ack、DM" },
  { id: "extensions", title: "扩展", desc: "命令 / MCP / 技能 / 插件 / ACP" },
  { id: "browserLogging", title: "浏览日志", desc: "Browser / Logging" },
];

const joinList = (values: string[] | undefined) => (values ?? []).join("\n");
const splitList = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
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
    sessionResetMode: data?.sessionReset.mode ?? "idle",
    sessionResetAtHour: numberText(data?.sessionReset.atHour),
    sessionResetIdleMinutes: numberText(data?.sessionReset.idleMinutes),
    commandsNative: data?.commands.native ?? "auto",
    commandsNativeSkills: data?.commands.nativeSkills ?? "auto",
    commandsText: data?.commands.text ?? false,
    commandsBash: data?.commands.bash ?? false,
    commandsConfig: data?.commands.config ?? false,
    commandsMcp: data?.commands.mcp ?? false,
    commandsPlugins: data?.commands.plugins ?? false,
    commandsDebug: data?.commands.debug ?? false,
    commandsRestart: data?.commands.restart ?? true,
    commandsOwnerDisplay: data?.commands.ownerDisplay ?? "raw",
    commandsBashForegroundMs: numberText(data?.commands.bashForegroundMs),
    hooksInternalEnabled: data?.hooks.internal.enabled ?? true,
    mcpSessionIdleTtlMs: numberText(data?.mcp?.sessionIdleTtlMs),
    skillsWatch: data?.skills?.load?.watch ?? false,
    skillsWatchDebounceMs: numberText(data?.skills?.load?.watchDebounceMs),
    skillsNodeManager: data?.skills?.install?.nodeManager ?? "",
    skillsPreferBrew: data?.skills?.install?.preferBrew ?? false,
    skillsAllowUploadedArchives: data?.skills?.install?.allowUploadedArchives ?? false,
    skillsMaxSkillsInPrompt: numberText(data?.skills?.limits?.maxSkillsInPrompt),
    skillsMaxSkillsPromptChars: numberText(data?.skills?.limits?.maxSkillsPromptChars),
    acpEnabled: data?.acp?.enabled ?? false,
    acpDispatchEnabled: data?.acp?.dispatch?.enabled ?? false,
    acpBackend: data?.acp?.backend ?? "",
    acpDefaultAgent: data?.acp?.defaultAgent ?? "",
    acpMaxConcurrentSessions: numberText(data?.acp?.maxConcurrentSessions),
    pluginsEnabled: data?.plugins?.enabled ?? true,
    pluginsMemorySlot: data?.plugins?.slots?.memory ?? "",
    pluginsContextEngineSlot: data?.plugins?.slots?.contextEngine ?? "",
    browserEnabled: data?.browser?.enabled ?? false,
    browserEvaluateEnabled: data?.browser?.evaluateEnabled ?? false,
    browserDefaultProfile: data?.browser?.defaultProfile ?? "",
    browserCdpUrl: data?.browser?.cdpUrl ?? "",
    browserHeadless: data?.browser?.headless ?? true,
    browserNoSandbox: data?.browser?.noSandbox ?? false,
    browserAttachOnly: data?.browser?.attachOnly ?? false,
    browserSnapshotMode: data?.browser?.snapshotDefaults?.mode ?? "",
    browserTabCleanupEnabled: data?.browser?.tabCleanup?.enabled ?? false,
    browserTabCleanupIdleMinutes: numberText(data?.browser?.tabCleanup?.idleMinutes),
    browserTabCleanupMaxTabsPerSession: numberText(data?.browser?.tabCleanup?.maxTabsPerSession),
    loggingLevel: data?.logging?.level ?? "info",
    loggingConsoleLevel: data?.logging?.consoleLevel ?? "info",
    loggingConsoleStyle: data?.logging?.consoleStyle ?? "auto",
    loggingRedactSensitive: data?.logging?.redactSensitive ?? "tools",
    loggingMaxFileBytes: numberText(data?.logging?.maxFileBytes),
    loggingFile: data?.logging?.file ?? "",
  };
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
    sessionReset: {
      ...current.sessionReset,
      mode: draft.sessionResetMode.trim(),
      atHour: numberOrNull(draft.sessionResetAtHour),
      idleMinutes: numberOrNull(draft.sessionResetIdleMinutes),
    },
    commands: {
      ...current.commands,
      native: draft.commandsNative.trim(),
      nativeSkills: draft.commandsNativeSkills.trim(),
      text: draft.commandsText,
      bash: draft.commandsBash,
      config: draft.commandsConfig,
      mcp: draft.commandsMcp,
      plugins: draft.commandsPlugins,
      debug: draft.commandsDebug,
      restart: draft.commandsRestart,
      ownerDisplay: draft.commandsOwnerDisplay.trim(),
      bashForegroundMs: numberOrNull(draft.commandsBashForegroundMs),
    },
    hooks: {
      internal: {
        ...current.hooks.internal,
        enabled: draft.hooksInternalEnabled,
      },
    },
    mcp: {
      ...(current.mcp ?? {}),
      sessionIdleTtlMs: numberOrNull(draft.mcpSessionIdleTtlMs),
    },
    skills: {
      ...(current.skills ?? {}),
      load: {
        ...(current.skills?.load ?? {}),
        watch: draft.skillsWatch,
        watchDebounceMs: numberOrNull(draft.skillsWatchDebounceMs),
      },
      install: {
        ...(current.skills?.install ?? {}),
        nodeManager: draft.skillsNodeManager.trim() as "" | "npm" | "pnpm" | "yarn" | "bun",
        preferBrew: draft.skillsPreferBrew,
        allowUploadedArchives: draft.skillsAllowUploadedArchives,
      },
      limits: {
        ...(current.skills?.limits ?? {}),
        maxSkillsInPrompt: numberOrNull(draft.skillsMaxSkillsInPrompt),
        maxSkillsPromptChars: numberOrNull(draft.skillsMaxSkillsPromptChars),
      },
    },
    acp: {
      ...(current.acp ?? {}),
      enabled: draft.acpEnabled,
      dispatch: { enabled: draft.acpDispatchEnabled },
      backend: draft.acpBackend.trim(),
      defaultAgent: draft.acpDefaultAgent.trim(),
      maxConcurrentSessions: positive(draft.acpMaxConcurrentSessions, current.acp?.maxConcurrentSessions || 1),
    },
    plugins: {
      ...(current.plugins ?? {}),
      enabled: draft.pluginsEnabled,
      slots: {
        ...(current.plugins?.slots ?? {}),
        memory: draft.pluginsMemorySlot.trim(),
        contextEngine: draft.pluginsContextEngineSlot.trim(),
      },
    },
    browser: {
      ...(current.browser ?? {}),
      enabled: draft.browserEnabled,
      evaluateEnabled: draft.browserEvaluateEnabled,
      defaultProfile: draft.browserDefaultProfile.trim(),
      cdpUrl: draft.browserCdpUrl.trim(),
      headless: draft.browserHeadless,
      noSandbox: draft.browserNoSandbox,
      attachOnly: draft.browserAttachOnly,
      snapshotDefaults: {
        ...(current.browser?.snapshotDefaults ?? {}),
        mode: draft.browserSnapshotMode.trim(),
      },
      tabCleanup: {
        ...(current.browser?.tabCleanup ?? {}),
        enabled: draft.browserTabCleanupEnabled,
        idleMinutes: numberOrNull(draft.browserTabCleanupIdleMinutes),
        maxTabsPerSession: numberOrNull(draft.browserTabCleanupMaxTabsPerSession),
      },
    },
    logging: {
      ...(current.logging ?? {}),
      level: draft.loggingLevel.trim(),
      consoleLevel: draft.loggingConsoleLevel.trim(),
      consoleStyle: draft.loggingConsoleStyle.trim(),
      redactSensitive: draft.loggingRedactSensitive.trim(),
      maxFileBytes: positive(draft.loggingMaxFileBytes, current.logging?.maxFileBytes || 1048576),
      file: draft.loggingFile.trim(),
    },
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

function modelOptionsFromConfig(data: ConfigSummaryPayload | undefined, currentValues: string[] = []): SelectOption[] {
  const ids = new Set<string>();
  for (const value of currentValues) {
    const next = value.trim();
    if (next) ids.add(next);
  }
  if (data?.defaults.model) ids.add(data.defaults.model);
  if (data?.defaults.subagentModel) ids.add(data.defaults.subagentModel);
  if (data?.defaults.imageModel) ids.add(data.defaults.imageModel);
  if (data?.defaults.pdfModel) ids.add(data.defaults.pdfModel);
  if (data?.compaction.model) ids.add(data.compaction.model);
  for (const value of data?.defaults.modelFallback ?? []) {
    if (value) ids.add(value);
  }
  for (const provider of data?.providers ?? []) {
    for (const model of provider.models ?? []) {
      if (model.id) ids.add(model.id);
    }
  }
  return [opt("", "继承默认 / 不单独配置"), ...Array.from(ids).sort((a, b) => a.localeCompare(b)).map((id) => opt(id, id))];
}

function ModelListField({ label, value, onChange, options, helper }: { label: string; value: string; onChange: (value: string) => void; options: SelectOption[]; helper?: string }) {
  const values = splitList(value);
  const addable = options.filter((option) => optionValue(option) && !values.includes(optionValue(option)));
  const remove = (target: string) => onChange(values.filter((item) => item !== target).join("\n"));
  const add = (target: string) => {
    if (!target || values.includes(target)) return;
    onChange([...values, target].join("\n"));
  };
  return <div className="grid gap-1.5 border-b border-line px-4 py-3 last:border-b-0 md:col-span-2"><span className="text-sm font-medium text-ink-strong">{label}</span><select value="" onChange={(event) => add(event.target.value)} className="min-w-0 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm text-ink-strong outline-none focus:shadow-[var(--ring)]"><option value="">添加备用模型…</option>{addable.map((option) => <option key={optionValue(option)} value={optionValue(option)}>{optionLabel(option)}</option>)}</select><div className="flex min-h-8 flex-wrap gap-2">{values.length ? values.map((item) => <button key={item} type="button" onClick={() => remove(item)} className="rounded-full border border-line bg-panel-2 px-2.5 py-1 text-xs text-ink-strong hover:border-danger hover:text-danger" title="点击移除">{item} ×</button>) : <span className="text-xs text-muted">未配置备用模型</span>}</div>{helper ? <span className="text-xs text-muted">{helper}</span> : null}</div>;
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-0 overflow-hidden rounded-sm border border-line md:grid-cols-2">{children}</div>;
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
const BOOLEAN_AUTO_OPTIONS = [opt("auto", "自动"), opt("on", "开启"), opt("off", "关闭")];
const OWNER_DISPLAY_OPTIONS = [opt("raw", "原样显示"), opt("hash", "哈希脱敏"), opt("hidden", "隐藏")];
const NODE_MANAGER_OPTIONS = [opt("", "自动选择"), opt("npm", "npm"), opt("pnpm", "pnpm"), opt("yarn", "yarn"), opt("bun", "bun")];
const BROWSER_SNAPSHOT_OPTIONS = [opt("", "跟随默认"), opt("efficient", "高效快照"), opt("full", "完整快照")];
const LOG_LEVEL_OPTIONS = [opt("trace", "Trace 追踪"), opt("debug", "Debug 调试"), opt("info", "Info 常规"), opt("warn", "Warn 警告"), opt("error", "Error 错误")];
const CONSOLE_STYLE_OPTIONS = [opt("auto", "自动"), opt("pretty", "美化"), opt("plain", "纯文本")];
const REDACTION_OPTIONS = [opt("off", "关闭脱敏"), opt("tools", "工具参数脱敏"), opt("all", "全部敏感字段脱敏")];


function renderSection(section: ConfigSection, draft: ConfigDraft, setField: (key: keyof ConfigDraft) => (value: string) => void, setBool: (key: keyof ConfigDraft) => (value: boolean) => void, data: ConfigSummaryPayload | undefined) {
  if (section === "defaults") return <Panel><PanelHead title="基础设置" sub="OpenClaw 默认工作目录、并发和运行超时。" /><FieldGrid><TextField label="默认工作目录" value={draft.workspace} onChange={setField("workspace")} helper="默认启动目录" /><TextField label="仓库根目录" value={draft.repoRoot} onChange={setField("repoRoot")} helper="默认仓库根目录" /><TextField label="最大并发" type="number" value={draft.maxConcurrent} onChange={setField("maxConcurrent")} /><TextField label="运行超时秒" type="number" value={draft.timeoutSeconds} onChange={setField("timeoutSeconds")} /><TextField label="子代理并发" type="number" value={draft.subagentMaxConcurrent} onChange={setField("subagentMaxConcurrent")} /><TextField label="上下文上限" type="number" value={draft.contextTokens} onChange={setField("contextTokens")} helper="留空交给 OpenClaw 默认处理" /></FieldGrid></Panel>;
  if (section === "models") {
    const modelOptions = modelOptionsFromConfig(data, [draft.model, draft.subagentModel, draft.imageModel, draft.pdfModel, draft.compactionModel, ...splitList(draft.modelFallback)]);
    return <Panel><PanelHead title="模型设置" sub="主模型、备用模型和特殊任务模型。" /><FieldGrid><SelectField label="默认模型" value={draft.model} onChange={setField("model")} options={modelOptions} helper="从当前可用模型列表选择；留空则交给 OpenClaw 默认。" /><SelectField label="子代理模型" value={draft.subagentModel} onChange={setField("subagentModel")} options={modelOptions} /><SelectField label="图片模型" value={draft.imageModel} onChange={setField("imageModel")} options={modelOptions} /><SelectField label="PDF 模型" value={draft.pdfModel} onChange={setField("pdfModel")} options={modelOptions} /><SelectField label="压缩模型" value={draft.compactionModel} onChange={setField("compactionModel")} options={modelOptions} /><ModelListField label="备用模型" value={draft.modelFallback} onChange={setField("modelFallback")} options={modelOptions} helper="通过下拉添加；点击标签移除，避免手写错误模型 ID。" /></FieldGrid><div className="border-t border-line px-4 py-3 text-xs text-muted">服务商和密钥仍由模型网关管理；这里只设置 OpenClaw 默认使用哪个模型。</div></Panel>;
  }
  if (section === "runtime") return <Panel><PanelHead title="运行策略" sub="思考等级、压缩、流式和输入策略。" /><FieldGrid><TextField label="思考等级" value={draft.thinking} onChange={setField("thinking")} /><TextField label="详细程度" value={draft.verbose} onChange={setField("verbose")} /><TextField label="输入模式" value={draft.typingMode} onChange={setField("typingMode")} /><TextField label="流式输出策略" value={draft.blockStreaming} onChange={setField("blockStreaming")} /><SelectField label="上下文压缩模式" value={draft.compactionMode} onChange={setField("compactionMode")} options={COMPACTION_OPTIONS} /><TextField label="保留 token 下限" type="number" value={draft.reserveTokensFloor} onChange={setField("reserveTokensFloor")} /><TextField label="记忆刷新阈值" type="number" value={draft.memoryFlushSoftThresholdTokens} onChange={setField("memoryFlushSoftThresholdTokens")} /><ToggleField label="启用记忆刷新" checked={draft.memoryFlushEnabled} onChange={setBool("memoryFlushEnabled")} /></FieldGrid></Panel>;
  if (section === "security") return <Panel><PanelHead title="安全与工具" sub="沙箱、工具执行和审批默认策略。" /><FieldGrid><SelectField label="沙箱模式" value={draft.sandboxMode} onChange={setField("sandboxMode")} options={SANDBOX_MODE_OPTIONS} /><SelectField label="工作区权限" value={draft.sandboxWorkspaceAccess} onChange={setField("sandboxWorkspaceAccess")} options={WORKSPACE_ACCESS_OPTIONS} /><TextField label="沙箱作用域" value={draft.sandboxScope} onChange={setField("sandboxScope")} /><TextField label="会话工具可见性" value={draft.sandboxSessionToolsVisibility} onChange={setField("sandboxSessionToolsVisibility")} /><TextField label="沙箱空闲清理小时" type="number" value={draft.sandboxPruneIdleHours} onChange={setField("sandboxPruneIdleHours")} /><TextField label="沙箱最大保留天数" type="number" value={draft.sandboxPruneMaxAgeDays} onChange={setField("sandboxPruneMaxAgeDays")} /><TextField label="工具配置档" value={draft.toolsProfile} onChange={setField("toolsProfile")} /><TextField label="执行主机" value={draft.execHost} onChange={setField("execHost")} /><TextField label="执行模式" value={draft.execMode} onChange={setField("execMode")} helper="设置后会覆盖 ask/security" /><SelectField label="执行询问策略" value={draft.execAsk} onChange={setField("execAsk")} options={EXEC_ASK_OPTIONS} /><SelectField label="执行安全级别" value={draft.execSecurity} onChange={setField("execSecurity")} options={SECURITY_OPTIONS} /><TextField label="执行超时秒" type="number" value={draft.execTimeoutSec} onChange={setField("execTimeoutSec")} /><SelectField label="审批安全级别" value={draft.approvalSecurity} onChange={setField("approvalSecurity")} options={SECURITY_OPTIONS} /><SelectField label="审批询问策略" value={draft.approvalAsk} onChange={setField("approvalAsk")} options={EXEC_ASK_OPTIONS} /><SelectField label="审批失败策略" value={draft.approvalAskFallback} onChange={setField("approvalAskFallback")} options={APPROVAL_FALLBACK_OPTIONS} /><ToggleField label="允许提权工具" checked={draft.toolsElevatedEnabled} onChange={setBool("toolsElevatedEnabled")} /><ToggleField label="文件系统仅限工作区" checked={draft.fsWorkspaceOnly} onChange={setBool("fsWorkspaceOnly")} /><ToggleField label="技能自动审批" checked={draft.approvalAutoAllowSkills} onChange={setBool("approvalAutoAllowSkills")} /></FieldGrid></Panel>;
  if (section === "gateway") return <Panel><PanelHead title="网关与控制台" sub="OpenClaw 网关监听、认证、限流和控制台。" /><FieldGrid><TextField label="端口" type="number" value={draft.gatewayPort} onChange={setField("gatewayPort")} /><SelectField label="运行模式" value={draft.gatewayMode} onChange={setField("gatewayMode")} options={GATEWAY_MODE_OPTIONS} /><SelectField label="监听范围" value={draft.gatewayBind} onChange={setField("gatewayBind")} options={GATEWAY_BIND_OPTIONS} /><TextField label="自定义监听主机" value={draft.gatewayCustomBindHost} onChange={setField("gatewayCustomBindHost")} /><SelectField label="认证模式" value={draft.gatewayAuthMode} onChange={setField("gatewayAuthMode")} options={AUTH_MODE_OPTIONS} /><TextField label="限流最大尝试" type="number" value={draft.gatewayRateLimitMaxAttempts} onChange={setField("gatewayRateLimitMaxAttempts")} /><TextField label="限流窗口毫秒" type="number" value={draft.gatewayRateLimitWindowMs} onChange={setField("gatewayRateLimitWindowMs")} /><TextField label="锁定时长毫秒" type="number" value={draft.gatewayRateLimitLockoutMs} onChange={setField("gatewayRateLimitLockoutMs")} /><TextField label="控制台路径" value={draft.controlUiBasePath} onChange={setField("controlUiBasePath")} /><TextField label="允许来源" value={draft.controlUiAllowedOrigins} onChange={setField("controlUiAllowedOrigins")} multiline helper="每行一个 origin" /><ToggleField label="允许 Tailscale" checked={draft.gatewayAllowTailscale} onChange={setBool("gatewayAllowTailscale")} /><ToggleField label="本机免限流" checked={draft.gatewayRateLimitExemptLoopback} onChange={setBool("gatewayRateLimitExemptLoopback")} /><ToggleField label="启用控制台" checked={draft.controlUiEnabled} onChange={setBool("controlUiEnabled")} /><ToggleField label="允许不安全认证" checked={draft.controlUiAllowInsecureAuth} onChange={setBool("controlUiAllowInsecureAuth")} /></FieldGrid></Panel>;
  if (section === "messages") return <Panel><PanelHead title="会话与消息" sub="私聊范围、线程绑定、确认反馈和队列策略。" /><FieldGrid><SelectField label="私聊会话范围" value={draft.sessionDmScope} onChange={setField("sessionDmScope")} options={DM_SCOPE_OPTIONS} /><TextField label="线程空闲小时" type="number" value={draft.threadBindingsIdleHours} onChange={setField("threadBindingsIdleHours")} /><TextField label="线程最大保留小时" type="number" value={draft.threadBindingsMaxAgeHours} onChange={setField("threadBindingsMaxAgeHours")} /><TextField label="回复前缀" value={draft.responsePrefix} onChange={setField("responsePrefix")} /><TextField label="确认表情" value={draft.ackReaction} onChange={setField("ackReaction")} /><SelectField label="确认表情范围" value={draft.ackReactionScope} onChange={setField("ackReactionScope")} options={ACK_SCOPE_OPTIONS} /><SelectField label="队列模式" value={draft.queueMode} onChange={setField("queueMode")} options={QUEUE_MODE_OPTIONS} /><TextField label="队列合并延迟毫秒" type="number" value={draft.queueDebounceMs} onChange={setField("queueDebounceMs")} /><TextField label="队列容量" type="number" value={draft.queueCap} onChange={setField("queueCap")} /><SelectField label="超限策略" value={draft.queueDrop} onChange={setField("queueDrop")} options={QUEUE_DROP_OPTIONS} /><ToggleField label="启用线程绑定" checked={draft.threadBindingsEnabled} onChange={setBool("threadBindingsEnabled")} /><ToggleField label="回复后移除确认" checked={draft.removeAckAfterReply} onChange={setBool("removeAckAfterReply")} /></FieldGrid></Panel>;
  if (section === "extensions") return <Panel><PanelHead title="扩展与命令" sub="常用扩展能力改为开关和下拉；MCP server、插件 entries 等复杂对象交给对应管理域，不在这里开放裸编辑。" /><FieldGrid><SelectField label="原生命令" value={draft.commandsNative} onChange={setField("commandsNative")} options={BOOLEAN_AUTO_OPTIONS} /><SelectField label="内置技能命令" value={draft.commandsNativeSkills} onChange={setField("commandsNativeSkills")} options={BOOLEAN_AUTO_OPTIONS} /><ToggleField label="启用文本命令" checked={draft.commandsText} onChange={setBool("commandsText")} helper="让不支持原生命令菜单的渠道解析 /command 文本。" /><ToggleField label="允许 /bash 主机命令" checked={draft.commandsBash} onChange={setBool("commandsBash")} helper="仍受工具权限与审批策略约束。" /><ToggleField label="允许聊天命令改配置" checked={draft.commandsConfig} onChange={setBool("commandsConfig")} /><ToggleField label="允许聊天命令管理 MCP" checked={draft.commandsMcp} onChange={setBool("commandsMcp")} /><ToggleField label="允许聊天命令切换插件" checked={draft.commandsPlugins} onChange={setBool("commandsPlugins")} /><ToggleField label="允许 debug 命令" checked={draft.commandsDebug} onChange={setBool("commandsDebug")} /><ToggleField label="允许命令重启" checked={draft.commandsRestart} onChange={setBool("commandsRestart")} /><SelectField label="操作者显示" value={draft.commandsOwnerDisplay} onChange={setField("commandsOwnerDisplay")} options={OWNER_DISPLAY_OPTIONS} /><TextField label="/bash 前台等待毫秒" type="number" value={draft.commandsBashForegroundMs} onChange={setField("commandsBashForegroundMs")} helper="0 表示立即后台；留空跟随默认。" /><ToggleField label="启用内部钩子" checked={draft.hooksInternalEnabled} onChange={setBool("hooksInternalEnabled")} /><TextField label="MCP 会话空闲 TTL 毫秒" type="number" value={draft.mcpSessionIdleTtlMs} onChange={setField("mcpSessionIdleTtlMs")} helper="这里只设置 TTL；MCP server 明细在外部连接域维护。" /><ToggleField label="监听技能目录变化" checked={draft.skillsWatch} onChange={setBool("skillsWatch")} /><TextField label="技能监听防抖毫秒" type="number" value={draft.skillsWatchDebounceMs} onChange={setField("skillsWatchDebounceMs")} /><SelectField label="技能安装 Node 管理器" value={draft.skillsNodeManager} onChange={setField("skillsNodeManager")} options={NODE_MANAGER_OPTIONS} /><ToggleField label="技能安装优先 Homebrew" checked={draft.skillsPreferBrew} onChange={setBool("skillsPreferBrew")} /><ToggleField label="允许上传技能压缩包" checked={draft.skillsAllowUploadedArchives} onChange={setBool("skillsAllowUploadedArchives")} /><TextField label="提示词最多注入技能数" type="number" value={draft.skillsMaxSkillsInPrompt} onChange={setField("skillsMaxSkillsInPrompt")} /><TextField label="技能提示词最大字符" type="number" value={draft.skillsMaxSkillsPromptChars} onChange={setField("skillsMaxSkillsPromptChars")} /><ToggleField label="启用 ACP" checked={draft.acpEnabled} onChange={setBool("acpEnabled")} /><ToggleField label="启用 ACP 调度" checked={draft.acpDispatchEnabled} onChange={setBool("acpDispatchEnabled")} /><TextField label="ACP 后端" value={draft.acpBackend} onChange={setField("acpBackend")} helper="例如 acpx；留空跟随宿主默认。" /><TextField label="ACP 默认 Agent" value={draft.acpDefaultAgent} onChange={setField("acpDefaultAgent")} /><TextField label="ACP 最大并发会话" type="number" value={draft.acpMaxConcurrentSessions} onChange={setField("acpMaxConcurrentSessions")} /><ToggleField label="启用插件系统" checked={draft.pluginsEnabled} onChange={setBool("pluginsEnabled")} /><TextField label="Memory 插槽" value={draft.pluginsMemorySlot} onChange={setField("pluginsMemorySlot")} helper="填写插件 id，或 none 显式关闭。" /><TextField label="Context Engine 插槽" value={draft.pluginsContextEngineSlot} onChange={setField("pluginsContextEngineSlot")} /></FieldGrid></Panel>;
  if (section === "browserLogging") return <Panel><PanelHead title="浏览器与日志" sub="浏览器自动化和日志策略改为明确控件；复杂 profile 矩阵和 SSRF 白名单后续应进入专门子页。" /><FieldGrid><ToggleField label="启用 Browser" checked={draft.browserEnabled} onChange={setBool("browserEnabled")} /><ToggleField label="启用 Evaluate" checked={draft.browserEvaluateEnabled} onChange={setBool("browserEvaluateEnabled")} /><TextField label="默认 Profile" value={draft.browserDefaultProfile} onChange={setField("browserDefaultProfile")} /><TextField label="远程 CDP 地址" value={draft.browserCdpUrl} onChange={setField("browserCdpUrl")} helper="留空使用本地派生端口。" /><ToggleField label="无头模式" checked={draft.browserHeadless} onChange={setBool("browserHeadless")} /><ToggleField label="禁用 Chrome 沙箱" checked={draft.browserNoSandbox} onChange={setBool("browserNoSandbox")} /><ToggleField label="仅附着现有会话" checked={draft.browserAttachOnly} onChange={setBool("browserAttachOnly")} /><SelectField label="默认快照模式" value={draft.browserSnapshotMode} onChange={setField("browserSnapshotMode")} options={BROWSER_SNAPSHOT_OPTIONS} /><ToggleField label="启用标签页自动清理" checked={draft.browserTabCleanupEnabled} onChange={setBool("browserTabCleanupEnabled")} /><TextField label="标签空闲清理分钟" type="number" value={draft.browserTabCleanupIdleMinutes} onChange={setField("browserTabCleanupIdleMinutes")} /><TextField label="每会话最大标签数" type="number" value={draft.browserTabCleanupMaxTabsPerSession} onChange={setField("browserTabCleanupMaxTabsPerSession")} /><SelectField label="日志级别" value={draft.loggingLevel} onChange={setField("loggingLevel")} options={LOG_LEVEL_OPTIONS} /><SelectField label="控制台日志级别" value={draft.loggingConsoleLevel} onChange={setField("loggingConsoleLevel")} options={LOG_LEVEL_OPTIONS} /><SelectField label="控制台样式" value={draft.loggingConsoleStyle} onChange={setField("loggingConsoleStyle")} options={CONSOLE_STYLE_OPTIONS} /><SelectField label="敏感字段脱敏" value={draft.loggingRedactSensitive} onChange={setField("loggingRedactSensitive")} options={REDACTION_OPTIONS} /><TextField label="日志文件路径" value={draft.loggingFile} onChange={setField("loggingFile")} /><TextField label="日志文件最大字节" type="number" value={draft.loggingMaxFileBytes} onChange={setField("loggingMaxFileBytes")} /></FieldGrid></Panel>;
  return null;
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
  if (config.isLoading) return <LoadingState title="正在加载 OpenClaw 配置…" />;
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
    <ReadOnlyStrip>配置页按 Settings 子页面分层：基础、模型、策略、安全、网关、会话消息、扩展、浏览日志；常用项使用下拉、开关和数字控件，复杂对象回到各自 owner 域。</ReadOnlyStrip>
    <MetricRail>
      <MetricTile label="当前子页" value={activeMeta.title} hint={activeMeta.desc} />
      <MetricTile label="默认模型" value={data?.defaults.model ?? "—"} hint="OpenClaw 默认" />
      <MetricTile label="网关端口" value={data?.gateway.port ?? "—"} hint={`${data?.gateway.mode ?? "—"} / ${data?.gateway.bind ?? "—"}`} />
      <MetricTile label="安全" value={data?.sandbox.mode ?? "—"} hint={data?.tools.execSecurity ?? "—"} />
    </MetricRail>
    <Panel>
      <WorkbenchToolbar title="OpenClaw 配置" description="分组设置工作台，避免一个巨型表单和无保护覆盖。"><RefreshButton loading={config.isFetching} onClick={() => { void config.refetch(); void diagnostics.refetch(); }} /><BoundaryBadge /><Badge variant={dirty ? "warn" : "mute"}>{dirty ? "有未保存修改" : `已检查 ${fmtDate(data?.checkedAt)}`}</Badge></WorkbenchToolbar>
      <div className="px-3 py-2">
        <SectionNav ariaLabel="OpenClaw 配置子页面" items={CONFIG_SECTIONS.map((section) => ({ id: section.id, label: section.title }))} value={activeSection} onChange={(id) => setActiveSection(id as ConfigSection)} />
      </div>
    </Panel>
    <div className="grid gap-[18px]">
      {renderSection(activeSection, draft, setField, setBool, data)}
      <Panel><div className="flex flex-wrap items-center gap-2 px-4 py-3"><Button size="sm" onClick={save} disabled={!dirty || patchConfig.isPending}>{patchConfig.isPending ? "保存中…" : "保存当前配置"}</Button><Button variant="ghost" size="sm" onClick={() => setDraft(currentDraft)} disabled={!dirty || patchConfig.isPending}>重置</Button>{savedAt ? <span className="text-xs text-muted">最近保存：{fmtDate(savedAt)}</span> : null}</div></Panel>
    </div>
  </div>;
}
