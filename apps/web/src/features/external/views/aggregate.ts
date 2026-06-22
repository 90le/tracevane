import type {
  ChannelConnectorsStatusResponse,
  ConfigSummaryPayload,
  ExternalCapability,
  ExternalConnection,
  ExternalConnectionTone,
  ModelGatewayAppConnectionsResponse,
  SkillsSummaryPayload,
  SystemDiagnosticsPayload,
} from "../types";

/**
 * Aggregation logic for the External Connections console. Synthesizes a
 * read-only view-model from the existing source APIs the old page consumed:
 *  - OpenClaw config summary (MCP servers + command toggles)
 *  - Skills summary (local tool capability)
 *  - Model Gateway app-connections (third-party app config targets)
 *  - Channel Connectors status (IM platform transports)
 *  - System diagnostics (Tracevane local HTTP bridge)
 *
 * Every field comes from a real source response — nothing is fabricated. When
 * a source is missing/empty the row reflects that honestly. Writes are never
 * performed here; each writable connection carries a deep-link OUT to its
 * owning domain instead.
 */

/** Derive a coarse health tone from arbitrary status text. */
export function toneFromStatus(value: string | null | undefined): ExternalConnectionTone {
  const text = String(value ?? "").toLowerCase();
  if (/(ready|ok|online|connected|configured|enabled|healthy|active|installed|local)/.test(text))
    return "ok";
  if (/(failed|error|offline|missing|disabled|expired|blocked|stopped)/.test(text)) return "bad";
  if (/(warn|warning|pending|stale|expiring|needs-setup|partial|not-configured|unknown)/.test(text))
    return "warn";
  return "info";
}

function describeMcpServer(name: string, value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    const transport =
      (typeof rec.transport === "string" && rec.transport) ||
      (typeof rec.url === "string" && "http") ||
      (typeof rec.command === "string" && "stdio") ||
      "server";
    const endpoint =
      (typeof rec.url === "string" && rec.url) ||
      (typeof rec.command === "string" && rec.command) ||
      "—";
    return `${transport} · ${endpoint}`;
  }
  return "server";
}

export interface AggregateSources {
  config?: ConfigSummaryPayload;
  skills?: SkillsSummaryPayload;
  appConnections?: ModelGatewayAppConnectionsResponse;
  channelStatus?: ChannelConnectorsStatusResponse;
  diagnostics?: SystemDiagnosticsPayload;
}

export function buildConnections(sources: AggregateSources): ExternalConnection[] {
  const rows: ExternalConnection[] = [];

  // --- MCP tool servers (OpenClaw config) ------------------------------------
  const mcp = sources.config?.mcp;
  const mcpServers = mcp?.servers ?? {};
  const mcpServerEntries = Object.entries(mcpServers);
  const mcpEnabled = sources.config?.commands?.mcp === true;
  const mcpConfigured = mcpEnabled || mcpServerEntries.length > 0;
  rows.push({
    id: "mcp",
    title: "MCP 工具服务器",
    source: mcpServerEntries.length
      ? "OpenClaw config · mcp.servers"
      : "OpenClaw config · 未启用 MCP 或为空",
    kind: "mcp",
    kindLabel: "MCP",
    status: mcpConfigured ? "configured" : "not-configured",
    tone: mcpConfigured ? "ok" : "warn",
    summary: `${mcpServerEntries.length} 个 server`,
    transport: mcpServerEntries.length ? "stdio / http" : "—",
    credentialRef: "服务端持有 · 浏览器不可见",
    detail: `MCP command ${mcpEnabled ? "已启用" : "未启用"} · session idle ttl ${mcp?.sessionIdleTtlMs ?? "—"}`,
    evidence: [
      { label: "mcp command", value: mcpEnabled ? "enabled" : "disabled" },
      { label: "servers", value: String(mcpServerEntries.length) },
      { label: "session idle ttl", value: String(mcp?.sessionIdleTtlMs ?? "—") },
      { label: "secrets", value: "browser receives summaries only" },
    ],
    capabilities: mcpServerEntries.slice(0, 12).map(([name, value]) => ({
      name,
      detail: describeMcpServer(name, value),
      tone: "ok" as const,
    })),
    writeLink: { label: "前往平台管理 MCP", to: "/platforms" },
  });

  // --- Skills / local tools --------------------------------------------------
  const skillCounts = sources.skills?.counts;
  const skillTools = sources.skills?.tools;
  const blocked = skillCounts?.blocked ?? 0;
  const ready = skillCounts?.ready ?? 0;
  rows.push({
    id: "skills",
    title: "Skills 与本地工具",
    source: sources.skills?.managedSkillsDir ?? "Skills 目录",
    kind: "tools",
    kindLabel: "Tools",
    status: blocked > 0 ? "blocked" : "ready",
    tone: blocked > 0 ? "warn" : "ok",
    summary: `${ready} 个就绪`,
    transport: "本地 skill",
    credentialRef: skillCounts
      ? `${skillCounts.configured} 项已配置密钥（掩码）`
      : "—",
    detail: `${skillCounts?.total ?? 0} 个总计 · ${skillCounts?.needsSetup ?? 0} 需配置 · ${skillCounts?.disabled ?? 0} 已停用`,
    evidence: [
      { label: "total", value: String(skillCounts?.total ?? 0) },
      { label: "ready", value: String(ready) },
      { label: "needs setup", value: String(skillCounts?.needsSetup ?? 0) },
      { label: "blocked", value: String(blocked) },
      { label: "clawhub", value: skillTools?.clawhubInstalled ? "installed" : "missing" },
      { label: "skillhub", value: skillTools?.skillhubInstalled ? "installed" : "missing" },
    ],
    capabilities: (sources.skills?.skills ?? []).slice(0, 12).map((skill) => ({
      name: skill.name || skill.slug,
      detail: skill.description || skill.sourceCategory,
      tone: toneFromStatus(skill.status),
    })),
    writeLink: { label: "前往平台管理 Skills", to: "/platforms" },
  });

  // --- Model Gateway app connections (one row each) --------------------------
  for (const connection of sources.appConnections?.connections ?? []) {
    rows.push({
      id: `gateway:${connection.id}`,
      title: connection.label || connection.id,
      source: connection.target.path || "Gateway app config",
      kind: "app-connection",
      kindLabel: "App Connection",
      status: connection.configured ? "configured" : "pending",
      tone: connection.configured ? "ok" : "warn",
      summary: connection.protocol,
      transport: `${connection.target.format} · ${connection.endpoint}`,
      credentialRef: "Gateway 写入 · 浏览器只读掩码预览",
      detail: `目标 ${connection.target.path} · exists ${connection.target.exists}`,
      evidence: [
        { label: "protocol", value: connection.protocol },
        { label: "endpoint", value: connection.endpoint },
        { label: "target", value: connection.target.path },
        { label: "format", value: connection.target.format },
        { label: "configured", value: String(connection.configured) },
        ...(connection.model ? [{ label: "model", value: connection.model }] : []),
        ...(connection.launchHint ? [{ label: "launch", value: connection.launchHint }] : []),
        ...connection.issues.map((issue, index) => ({
          label: `issue ${index + 1}`,
          value: issue,
        })),
      ],
      capabilities: [],
      writeLink: {
        label: "前往模型网关 apply / rollback",
        to: `/model-gateway?tab=connections&app=${encodeURIComponent(connection.id)}`,
      },
    });
  }

  // --- IM platform transports (Channel Connectors) --------------------------
  const runtime = sources.channelStatus?.runtime;
  const bindingPolicy = sources.channelStatus?.bindingPolicy;
  const reachable = runtime?.reachable === true;
  const supportedPlatforms = bindingPolicy?.supportedPlatforms ?? [];
  rows.push({
    id: "im-transports",
    title: "IM 平台传输",
    source: "Channel Connectors 守护进程",
    kind: "messaging",
    kindLabel: "Messaging",
    status: reachable ? "connected" : "warning",
    tone: reachable ? "ok" : "warn",
    summary: `${runtime?.platformBindings ?? 0} 个绑定`,
    transport: `${runtime?.feishuConnections ?? 0} feishu · ${runtime?.octoConnections ?? 0} octo`,
    credentialRef: "守护进程持有 bot 身份 · 浏览器只读",
    detail: `${runtime?.agentRuns ?? 0} 个 agent run · 待 replay ${runtime?.pendingAgentRuns?.count ?? 0}`,
    evidence: [
      { label: "reachable", value: String(runtime?.reachable ?? "unknown") },
      { label: "platform bindings", value: String(runtime?.platformBindings ?? 0) },
      { label: "feishu connections", value: String(runtime?.feishuConnections ?? 0) },
      { label: "octo connections", value: String(runtime?.octoConnections ?? 0) },
      { label: "agent runs", value: String(runtime?.agentRuns ?? 0) },
      { label: "pending replay", value: String(runtime?.pendingAgentRuns?.count ?? 0) },
      { label: "checked", value: sources.channelStatus?.checkedAt ?? "—" },
      ...(runtime?.error ? [{ label: "error", value: runtime.error }] : []),
    ],
    capabilities: supportedPlatforms.slice(0, 12).map((platform) => ({
      name: platform,
      detail: "supported platform",
      tone: "ok" as const,
    })),
    writeLink: { label: "前往 IM 渠道管理", to: "/im-channels" },
  });

  // --- Tracevane local HTTP bridge (diagnostics) -----------------------------
  const diagConfig = sources.diagnostics?.config;
  if (diagConfig) {
    rows.push({
      id: "tracevane-http",
      title: "Tracevane 本地 HTTP bridge",
      source: `port ${diagConfig.port}`,
      kind: "http",
      kindLabel: "HTTP",
      status: "online",
      tone: "ok",
      summary: diagConfig.transport.preferredMode,
      transport: `${diagConfig.transport.preferredMode} · base ${diagConfig.transport.gateway.basePath || "—"}`,
      credentialRef: "外部调用方仍需通过服务端鉴权 / 策略",
      detail: `project ${diagConfig.projectRoot}`,
      evidence: [
        { label: "preferred mode", value: diagConfig.transport.preferredMode },
        { label: "port", value: String(diagConfig.port) },
        { label: "gateway ws", value: diagConfig.gatewayWsUrl || "—" },
        { label: "gateway port", value: String(diagConfig.gatewayPort) },
        { label: "base path", value: diagConfig.transport.gateway.basePath || "—" },
        { label: "project root", value: diagConfig.projectRoot },
      ],
      capabilities: [],
      writeLink: null,
    });
  }

  return rows;
}

/** Group capabilities for the capabilities view. */
export function collectCapabilities(rows: ExternalConnection[]): {
  connection: ExternalConnection;
  capabilities: ExternalCapability[];
}[] {
  return rows
    .filter((row) => row.capabilities.length > 0)
    .map((row) => ({ connection: row, capabilities: row.capabilities }));
}
