import * as React from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, ExternalLink, ListChecks, ServerCog } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { useAgentsSummaryQuery, useAgentRuntimeRunsQuery } from "@/lib/query/agents";
import { useChannelsSummaryQuery } from "@/lib/query/channels";
import { useSystemHealthQuery } from "@/lib/query/dashboard";
import { useOpenClawConfigSummaryQuery, useSkillsSummaryQuery, useSystemDiagnosticsQuery } from "@/lib/query/platform-read";
import { useRecoveryDaemonServiceQuery, useRecoveryEventsQuery, useRecoveryStatusQuery } from "@/lib/query/recovery";

import { EvidenceRow, Panel, PanelHead, SectionNotice, StatTile, ToneBadge } from "../_shared";

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
function boolText(value: boolean | null | undefined): string {
  if (value == null) return "未知";
  return value ? "是" : "否";
}
function LoadingBlocks() {
  return <div className="grid gap-[18px]" role="status" aria-busy="true"><Skeleton className="h-[118px] w-full" /><Skeleton className="h-[240px] w-full" /></div>;
}
function InlineError({ title, error }: { title: string; error: unknown }) {
  return <ErrorState title={title} description={error instanceof Error ? error.message : "请求失败"} />;
}

export function OpenClawConfigView() {
  const config = useOpenClawConfigSummaryQuery();
  const diagnostics = useSystemDiagnosticsQuery();
  if (config.isLoading || diagnostics.isLoading) return <LoadingBlocks />;
  if (config.error) return <InlineError title="无法加载 OpenClaw 配置摘要" error={config.error} />;
  const data = config.data;
  const diag = diagnostics.data;
  const mcpServers = Object.entries(data?.mcp?.servers ?? {});
  const commandCount = Object.keys(data?.commands ?? {}).length;
  return <div className="grid gap-[18px]">
    <SectionNotice>配置页先展示 OpenClaw 真实配置摘要。保存 / diff / backup / validate 需要后端确认流，未接入前不提供假写入。</SectionNotice>
    <div className="grid gap-3 md:grid-cols-4"><StatTile label="默认模型" value={data?.defaults.model ?? "—"} sub="OpenClaw default" /><StatTile label="并发" value={data?.defaults.maxConcurrent ?? "—"} sub="maxConcurrent" /><StatTile label="MCP servers" value={mcpServers.length} sub="config.mcp.servers" /><StatTile label="commands" value={commandCount} sub="slash commands" /></div>
    <div className="grid gap-[18px] lg:grid-cols-2"><Panel><PanelHead title="路径与运行边界" sub="来自 /api/config 与 /api/system/diagnostics。" /><div className="py-1.5"><EvidenceRow label="workspace" value={data?.defaults.workspace ?? "—"} /><EvidenceRow label="repo root" value={data?.defaults.repoRoot ?? "—"} /><EvidenceRow label="openclaw root" value={diag?.config.openclawRoot ?? "—"} /><EvidenceRow label="config file" value={diag?.config.openclawConfigFile ?? "—"} /><EvidenceRow label="checked" value={fmtDate(data?.checkedAt)} /></div></Panel><Panel><PanelHead title="模型与压缩" sub="仅展示配置，不覆盖模型网关职责。" /><div className="py-1.5"><EvidenceRow label="fallback" value={(data?.defaults.modelFallback ?? []).join(" / ") || "—"} /><EvidenceRow label="subagent model" value={data?.defaults.subagentModel ?? "—"} /><EvidenceRow label="context tokens" value={data?.defaults.contextTokens ?? "—"} /><EvidenceRow label="compaction" value={`${data?.compaction.mode ?? "—"} · ${data?.compaction.model ?? "—"}`} /><EvidenceRow label="reserved floor" value={data?.compaction.reserveTokensFloor ?? "—"} /></div></Panel></div>
    <Panel><PanelHead title="MCP 与命令证据" sub="Top entries；完整编辑留给 OpenClaw 配置写入流。" action={<Badge variant="mute">read-only</Badge>} /><div className="divide-y divide-line">{mcpServers.slice(0, 12).map(([name, server]) => <EvidenceRow key={name} label={name} value={JSON.stringify(server).slice(0, 96)} />)}{mcpServers.length === 0 && <EvidenceRow label="MCP servers" value="无" />}</div></Panel>
  </div>;
}

export function OpenClawAgentsView() {
  const agents = useAgentsSummaryQuery();
  const runs = useAgentRuntimeRunsQuery();
  if (agents.isLoading || runs.isLoading) return <LoadingBlocks />;
  if (agents.error) return <InlineError title="无法加载 Agents 摘要" error={agents.error} />;
  const data = agents.data;
  return <div className="grid gap-[18px]"><SectionNotice>Agent 人格与运行证据来自 OpenClaw Agents API；CLI 会话控制仍在 CLI 代理 / IDE 所属页面。</SectionNotice><div className="grid gap-3 md:grid-cols-4"><StatTile label="Agents" value={data?.count ?? 0} sub={`默认 ${data?.defaultAgentId ?? "—"}`} /><StatTile label="可用模型" value={data?.availableModels.length ?? 0} sub="OpenClaw roster" /><StatTile label="运行中" value={runs.data?.totals.running ?? "—"} sub="Agent runs" /><StatTile label="失败" value={runs.data?.totals.failed ?? "—"} sub="Agent runs" /></div><Panel><PanelHead title="Agent roster" sub="展示身份、默认模型与启用状态。" /><div className="divide-y divide-line">{(data?.agents ?? []).map((agent) => <EvidenceRow key={agent.id} label={`${agent.name} · ${agent.id}`} value={`${agent.enabled ? "enabled" : "disabled"} · ${agent.model || "—"}`} />)}{(data?.agents ?? []).length === 0 && <EvidenceRow label="Agents" value="无" />}</div></Panel></div>;
}

export function OpenClawSkillsView() {
  const skills = useSkillsSummaryQuery();
  if (skills.isLoading) return <LoadingBlocks />;
  if (skills.error) return <InlineError title="无法加载 Skills 摘要" error={skills.error} />;
  const data = skills.data;
  return <div className="grid gap-[18px]"><SectionNotice>Skills 展示安装、启用与依赖证据；安装/删除/密钥写入需要 OpenClaw 技能管理确认流。</SectionNotice><div className="grid gap-3 md:grid-cols-4"><StatTile label="total" value={data?.counts.total ?? 0} sub="skills" /><StatTile label="ready" value={data?.counts.ready ?? 0} sub={`${data?.counts.enabled ?? 0} enabled`} /><StatTile label="needs setup" value={data?.counts.needsSetup ?? 0} sub="缺失依赖" /><StatTile label="blocked" value={data?.counts.blocked ?? 0} sub="allowlist / policy" /></div><Panel><PanelHead title="技能清单" sub="前 20 个；按后端返回顺序。" action={<Badge variant={data?.stale ? "warn" : "ok"}>{data?.stale ? "stale" : "fresh"}</Badge>} /><div className="divide-y divide-line">{(data?.skills ?? []).slice(0, 20).map((skill) => <EvidenceRow key={skill.slug} label={`${skill.emoji ?? ""} ${skill.name} · ${skill.slug}`} value={`${skill.status} · ${skill.sourceCategory}`} />)}{(data?.skills ?? []).length === 0 && <EvidenceRow label="Skills" value="无" />}</div></Panel></div>;
}

export function OpenClawChannelsView() {
  const channels = useChannelsSummaryQuery();
  if (channels.isLoading) return <LoadingBlocks />;
  if (channels.error) return <InlineError title="无法加载 Channels 摘要" error={channels.error} />;
  const data = channels.data;
  return <div className="grid gap-[18px]"><SectionNotice tone="warn">这里是 OpenClaw 原生 Channel 配置摘要；Tracevane IM 投递、队列、会话和 Bot 密钥仍在 IM 渠道域管理。</SectionNotice><div className="grid gap-3 md:grid-cols-4"><StatTile label="channels" value={data?.counts.channels ?? 0} sub="OpenClaw native" /><StatTile label="accounts" value={data?.counts.accounts ?? 0} sub="channel accounts" /><StatTile label="profiles" value={data?.counts.profiles ?? 0} sub="routing profiles" /><StatTile label="pairing" value={data?.counts.pairingPending ?? 0} sub="pending" /></div><Panel><PanelHead title="Channel accounts" sub="按平台聚合的账号与策略。" /><div className="divide-y divide-line">{(data?.channels ?? []).map((channel) => <EvidenceRow key={channel.type} label={`${channel.type} · ${channel.enabled ? "enabled" : "disabled"}`} value={`${channel.accountCount} account · ${channel.bindingCount} binding · dm=${channel.dmPolicy ?? "—"}`} />)}{(data?.channels ?? []).length === 0 && <EvidenceRow label="Channels" value="无" />}</div></Panel></div>;
}

export function OpenClawBindingsView() {
  const channels = useChannelsSummaryQuery();
  if (channels.isLoading) return <LoadingBlocks />;
  if (channels.error) return <InlineError title="无法加载 Bindings 摘要" error={channels.error} />;
  const bindings = channels.data?.bindings ?? [];
  return <div className="grid gap-[18px]"><SectionNotice>Bindings 是 OpenClaw Channel 到 Agent/ACP 的静态证据。IM 会话级动态路由与投递队列仍在 IM 渠道域。</SectionNotice><div className="grid gap-3 md:grid-cols-3"><StatTile label="bindings" value={bindings.length} sub="channel → agent/acp" /><StatTile label="agents" value={channels.data?.agents.length ?? 0} sub="bindable options" /><StatTile label="checked" value={fmtDate(channels.data?.checkedAt)} /></div><Panel><PanelHead title="绑定清单" sub="显示匹配条件、Agent 与 ACP 后端。" /><div className="divide-y divide-line">{bindings.map((binding) => <EvidenceRow key={binding.id} label={`${binding.channel} · ${binding.accountId ?? "default"} · ${binding.match.peerKind ?? "any"}`} value={`${binding.type} → ${binding.agentId}${binding.acp?.backend ? ` · ${binding.acp.backend}` : ""}`} />)}{bindings.length === 0 && <EvidenceRow label="Bindings" value="无" />}</div></Panel></div>;
}

export function OpenClawServicesView() {
  const health = useSystemHealthQuery();
  const recovery = useRecoveryStatusQuery();
  const daemonService = useRecoveryDaemonServiceQuery();
  if (health.isLoading || recovery.isLoading || daemonService.isLoading) return <LoadingBlocks />;
  if (health.error) return <InlineError title="无法加载服务状态" error={health.error} />;
  const service = daemonService.data ?? recovery.data?.service;
  return <div className="grid gap-[18px]"><SectionNotice>服务页只展示 runtime 与 daemon 证据；启动/停止/安装在守护页强确认流中执行。</SectionNotice><div className="grid gap-3 md:grid-cols-4"><StatTile label="gateway" value={<ToneBadge tone={health.data?.gateway === "online" ? "ok" : "warn"}>{health.data?.gateway ?? "unknown"}</ToneBadge>} sub={`port ${health.data?.gatewayPort ?? "—"}`} /><StatTile label="service" value={health.data?.serviceState ?? "—"} sub={health.data?.serviceSubState ?? "—"} /><StatTile label="daemon" value={recovery.data?.daemon.pid ?? "—"} sub={recovery.data?.daemon.version ?? "—"} /><StatTile label="supervisor" value={service?.supervisor ?? "—"} sub={service?.serviceName ?? "—"} /></div><Panel><PanelHead title="Daemon service" sub="systemd/launchd/scheduled-task snapshot。" action={<Button variant="outline" size="sm" asChild><Link to="/platforms/openclaw/guard">进入守护</Link></Button>} /><div className="py-1.5"><EvidenceRow label="installed" value={boolText(service?.installed)} /><EvidenceRow label="active" value={service?.activeState ?? "—"} /><EvidenceRow label="enabled" value={service?.enabledState ?? "—"} /><EvidenceRow label="config path" value={service?.configPath ?? "—"} /><EvidenceRow label="last checked" value={fmtDate(service?.lastCheckedAt)} /></div></Panel></div>;
}

export function OpenClawLogsView() {
  const events = useRecoveryEventsQuery(1, 12);
  const runs = useAgentRuntimeRunsQuery();
  if (events.isLoading || runs.isLoading) return <LoadingBlocks />;
  if (events.error) return <InlineError title="无法加载平台日志" error={events.error} />;
  return <div className="grid gap-[18px]"><SectionNotice>日志页展示人可读事件摘要；原始日志文件/终端输出仍由对应 owner 页面打开。</SectionNotice><div className="grid gap-3 md:grid-cols-4"><StatTile label="events" value={events.data?.pagination.totalEntries ?? 0} sub="recovery event log" /><StatTile label="recent page" value={events.data?.events.length ?? 0} sub="latest loaded" /><StatTile label="agent runs" value={runs.data?.totals.total ?? "—"} sub="all sources" /><StatTile label="failed runs" value={runs.data?.totals.failed ?? "—"} sub="all sources" /></div><Panel><PanelHead title="近期平台事件" sub="按守护事件时间倒序。" /><div className="divide-y divide-line">{(events.data?.events ?? []).map((event) => <div key={event.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><div className="truncate text-base font-semibold text-ink-strong">{event.title}</div><div className="line-clamp-2 text-sm text-muted">{event.summary}</div></div><div className="flex flex-wrap items-center gap-2 sm:justify-end"><Badge variant={event.severity === "error" ? "bad" : event.severity === "warning" ? "warn" : event.severity === "success" ? "ok" : "info"}>{event.severity}</Badge><span className="text-xs text-muted">{fmtDate(event.occurredAt)}</span></div></div>)}{(events.data?.events ?? []).length === 0 && <EvidenceRow label="events" value="无" />}</div></Panel></div>;
}

export function OpenClawDiagnosticsView() {
  const diagnostics = useSystemDiagnosticsQuery();
  if (diagnostics.isLoading) return <LoadingBlocks />;
  if (diagnostics.error) return <InlineError title="无法加载诊断摘要" error={diagnostics.error} />;
  const data = diagnostics.data;
  const commandEntries = Object.entries(data?.commands ?? {});
  return <div className="grid gap-[18px]"><SectionNotice>Diagnostics 聚合 system/doctor/bootstrap/device trust 证据；修复动作进入守护页或具体 owner 域。</SectionNotice><div className="grid gap-3 md:grid-cols-4"><StatTile label="critical" value={data?.status.securityCritical ?? "—"} sub="security" /><StatTile label="warnings" value={data?.status.securityWarn ?? "—"} sub="security" /><StatTile label="bootstrap" value={data?.bootstrap.ready ? "ready" : "not ready"} sub={`${data?.bootstrap.checks.length ?? 0} checks`} /><StatTile label="device trust" value={data?.deviceTrust.helper.paired ? "paired" : "unpaired"} sub={`${data?.deviceTrust.pending.length ?? 0} pending`} /></div><div className="grid gap-[18px] lg:grid-cols-2"><Panel><PanelHead title="诊断命令" sub="后端已执行的命令快照。" action={<ListChecks className="size-4 text-muted" />} /><div className="divide-y divide-line">{commandEntries.map(([key, command]) => <EvidenceRow key={key} label={key} value={`${command.ok ? "ok" : "failed"} · ${command.durationMs}ms`} />)}</div></Panel><Panel><PanelHead title="运行时" sub="Tracevane local HTTP bridge facts。" action={<ServerCog className="size-4 text-muted" />} /><div className="py-1.5"><EvidenceRow label="pid" value={data?.runtime.pid ?? "—"} /><EvidenceRow label="node" value={data?.runtime.nodeVersion ?? "—"} /><EvidenceRow label="host" value={data?.runtime.hostname ?? "—"} /><EvidenceRow label="cwd" value={data?.runtime.cwd ?? "—"} /><EvidenceRow label="gateway ws" value={data?.config.gatewayWsUrl ?? "—"} /></div></Panel></div><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/platforms/openclaw/guard"><Activity />守护诊断与修复</Link></Button><Button variant="ghost" asChild><a href={data?.config.gatewayControlUiBasePath || "#/platforms/openclaw"} target="_blank" rel="noreferrer"><ExternalLink />Control UI evidence</a></Button>{data?.status.securityCritical ? <Badge variant="bad" className="gap-1.5"><AlertTriangle className="size-3.5" />需要处理严重安全项</Badge> : null}</div></div>;
}
