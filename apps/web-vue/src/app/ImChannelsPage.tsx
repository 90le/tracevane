import * as React from "react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "./api-client";
import { useShell } from "./shell-context";

type AnyRecord = Record<string, unknown>;
type ImChannelsView = "overview" | "channels" | "bindings" | "sessions" | "logs";

const imQueries = {
  channels: "/api/channels",
  connectorStatus: "/api/channel-connectors/status",
  daemonConfig: "/api/channel-connectors/daemon/config",
  agentSessions: "/api/channel-connectors/agent-sessions",
  daemonLogs: "/api/channel-connectors/daemon/logs",
} as const;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function listAt(value: unknown, path: string[]): unknown[] {
  let current: unknown = value;
  for (const key of path) current = asRecord(current)[key];
  return Array.isArray(current) ? current : [];
}

function recordAt(value: unknown, path: string[]): AnyRecord {
  let current: unknown = value;
  for (const key of path) current = asRecord(current)[key];
  return asRecord(current);
}

function textAt(value: unknown, keys: string[], fallback = "-"): string {
  const record = asRecord(value);
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "string" && direct.trim()) return direct;
    if (typeof direct === "number" || typeof direct === "boolean") return String(direct);
  }
  return fallback;
}

function numberAt(value: unknown, keys: string[], fallback = 0): number {
  const record = asRecord(value);
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  }
  return fallback;
}

function formatTime(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function stateTone(value: unknown): "ok" | "warn" | "bad" | "info" {
  const text = String(value ?? "").toLowerCase();
  if (/(healthy|running|active|ok|ready|success|online|connected|enabled|true)/.test(text)) return "ok";
  if (/(failed|error|invalid|offline|disabled|stopped|false|overdue)/.test(text)) return "bad";
  if (/(degraded|warning|warn|stale|pending|queued|waiting|unknown)/.test(text)) return "warn";
  return "info";
}

function StatusTag({ value }: { value: unknown }) {
  const tone = stateTone(value);
  return <span className={`tag ${tone === "bad" ? "bad" : tone === "warn" ? "warn" : tone === "ok" ? "ok" : "info"}`}>{String(value ?? "unknown")}</span>;
}

function QueryNotice({ query, label }: { query: { isLoading: boolean; isError: boolean; error: unknown }; label: string }) {
  if (query.isLoading) return <div className="statebox"><span className="spinner" /><strong>{label} 加载中</strong></div>;
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "加载失败";
    return <div className="statebox error"><span className="si"><i data-lucide="circle-alert" /></span><strong>{label} 不可用</strong><span>{message}</span></div>;
  }
  return null;
}

function Metric({ icon, label, value, sub }: { icon: string; label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="hero-stat">
      <span className="lab"><i data-lucide={icon} />{label}</span>
      <span className="val">{value}</span>
      <span className="trend flat"><i data-lucide="minus" />{sub}</span>
    </div>
  );
}

function ImRow({ icon, title, sub, status }: { icon: string; title: string; sub: string; status: unknown }) {
  return (
    <div className="route-row im-row">
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <span className="route-copy"><strong>{title}</strong><span>{sub}</span></span>
      <StatusTag value={status} />
    </div>
  );
}

function ImTile({ icon, title, value, sub, status }: { icon: string; title: string; value: React.ReactNode; sub: React.ReactNode; status?: unknown }) {
  return (
    <div className="im-tile">
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <div><strong>{title}</strong><span>{sub}</span></div>
      <div className="im-tile-value">
        <b>{value}</b>
        {status !== undefined ? <StatusTag value={status} /> : null}
      </div>
    </div>
  );
}

export function ImChannelsPage() {
  const shell = useShell();
  const [view, setView] = useState<ImChannelsView>("overview");

  const channels = useQuery({ queryKey: ["im-channels", "channels"], queryFn: () => apiJson(imQueries.channels), retry: false });
  const connectorStatus = useQuery({ queryKey: ["im-channels", "connector-status"], queryFn: () => apiJson(imQueries.connectorStatus), retry: false });
  const daemonConfig = useQuery({ queryKey: ["im-channels", "daemon-config"], queryFn: () => apiJson(imQueries.daemonConfig), retry: false });
  const agentSessions = useQuery({ queryKey: ["im-channels", "agent-sessions"], queryFn: () => apiJson(imQueries.agentSessions), retry: false });
  const daemonLogs = useQuery({ queryKey: ["im-channels", "daemon-logs"], queryFn: () => apiJson(imQueries.daemonLogs), retry: false });

  useEffect(() => {
    shell.refreshIcons();
  }, [shell, view, channels.data, connectorStatus.data, daemonConfig.data, agentSessions.data, daemonLogs.data]);

  const counts = recordAt(channels.data, ["counts"]);
  const channelRows = listAt(channels.data, ["channels"]).map(asRecord);
  const bindingRows = listAt(channels.data, ["bindings"]).map(asRecord);
  const runtime = recordAt(connectorStatus.data, ["runtime"]);
  const service = recordAt(connectorStatus.data, ["service"]);
  const serviceManager = recordAt(service, ["serviceManager"]);
  const runtimeConfig = recordAt(daemonConfig.data, ["config"]);
  const nativeBindings = listAt(daemonConfig.data, ["config", "projects"]).flatMap((project) =>
    listAt(project, ["platformBindings"]).map((binding) => ({
      project: asRecord(project),
      binding: asRecord(binding),
    })),
  );
  const sessionRows = listAt(agentSessions.data, ["activeSessions"]).map(asRecord);
  const recentSessionEvents = listAt(agentSessions.data, ["recentEvents"]).map(asRecord);
  const logLines = listAt(daemonLogs.data, ["lines"]);
  const pendingRuns = recordAt(runtime, ["pendingAgentRuns"]);
  const feishuConnections = listAt(runtime, ["feishuConnectionDetails"]).map(asRecord);

  const daemonState = runtime.reachable === true || serviceManager.active === true
    ? "running"
    : connectorStatus.isError
      ? "error"
      : "unknown";

  const renderOverview = () => (
    <>
      <section className="hero im-hero">
        <div className="hero-top">
          <span className={`ready-chip ${stateTone(daemonState) === "ok" ? "ok" : "warn"}`}><i data-lucide="radio-tower" />IM 渠道 · {daemonState}</span>
          <span className="hero-time">Channel daemon · {formatTime(textAt(connectorStatus.data, ["checkedAt"], ""))}</span>
        </div>
        <h1>IM 入口只管理消息触发、Agent 绑定、会话和投递证据。</h1>
        <p className="hero-sub">账号平台身份归平台集成；这里是 Tracevane 私聊/群聊触发本地 CLI Agent 的任务控制面。</p>
        <div className="hero-stats im-stats">
          <Metric icon="radio-tower" label="渠道" value={numberAt(counts, ["channels"])} sub={`${numberAt(counts, ["accounts"])} accounts · ${numberAt(counts, ["bindings"])} bindings`} />
          <Metric icon="bot" label="活跃会话" value={sessionRows.length} sub={`${numberAt(agentSessions.data, ["policy", "maxSessions"])} max sessions`} />
          <Metric icon="send-horizontal" label="待 replay" value={numberAt(pendingRuns, ["count"])} sub={`oldest ${formatTime(textAt(pendingRuns, ["oldestQueuedAt"], ""))}`} />
          <Metric icon="activity" label="Daemon" value={textAt(runtime, ["reachable"], "-")} sub={`${textAt(runtime, ["implementation"], "-")} · pid ${textAt(runtime, ["pid"], "-")}`} />
        </div>
      </section>
      <div className="im-overview-grid">
        <section className="panel im-panel">
          <div className="panel-head"><div className="htitle"><h3>连接运行时</h3><span className="sub">Tracevane native daemon、Feishu 长连接和 pending replay。</span></div><StatusTag value={daemonState} /></div>
          <div className="panel-body im-tile-grid">
            <ImTile icon="server" title="Daemon service" value={serviceManager.active === true ? "active" : textAt(serviceManager, ["active"], "unknown")} sub={textAt(service, ["plan", "serviceName"], "tracevane-channel-connectors.service")} status={daemonState} />
            <ImTile icon="plug-zap" title="Management" value={textAt(daemonConfig.data, ["managementEndpoint"], "-")} sub={textAt(runtimeConfig, ["paths", "runtime"], "-")} />
            <ImTile icon="send-horizontal" title="Pending replay" value={numberAt(pendingRuns, ["count"])} sub={`${listAt(pendingRuns, ["records"]).length} records`} status={numberAt(pendingRuns, ["count"]) > 0 ? "pending" : "ok"} />
            <ImTile icon="radio-tower" title="Feishu connections" value={feishuConnections.length} sub={`${numberAt(runtime, ["octoConnections"])} octo · ${numberAt(runtime, ["feishuConnections"])} feishu`} status={feishuConnections.some((item) => item.connected === false) ? "warn" : "ok"} />
          </div>
        </section>
        <section className="panel im-panel">
          <div className="panel-head"><div className="htitle"><h3>最近会话事件</h3><span className="sub">Agent session driver 事件，只读。</span></div><button className="btn-ghost btn-sm" onClick={() => setView("sessions")}><i data-lucide="arrow-right" />会话</button></div>
          <div className="panel-body im-list">
            <QueryNotice query={agentSessions} label="Agent sessions" />
            {!agentSessions.isLoading && !agentSessions.isError ? recentSessionEvents.slice(0, 5).map((event, index) => (
              <ImRow key={`${textAt(event, ["checkedAt"], "event")}-${index}`} icon="activity" title={textAt(event, ["type"], "event")} sub={`${textAt(event, ["agent"], "-")} · ${textAt(event, ["bindingId"], "-")} · ${formatTime(textAt(event, ["checkedAt"], ""))}`} status={textAt(event, ["error"], "") ? "error" : "ok"} />
            )) : null}
            {!agentSessions.isLoading && !agentSessions.isError && recentSessionEvents.length === 0 ? <div className="statebox empty"><span className="si"><i data-lucide="message-square" /></span><strong>暂无 session 事件</strong><span>IM 触发 Agent 后会在这里出现。</span></div> : null}
          </div>
        </section>
      </div>
    </>
  );

  const renderChannels = () => (
    <section className="panel im-panel">
      <div className="panel-head"><div className="htitle"><h3>渠道 / 账号</h3><span className="sub">来自 /api/channels；这里不显示原始密钥。</span></div><StatusTag value={`${channelRows.length} channels`} /></div>
      <div className="panel-body im-table">
        <QueryNotice query={channels} label="Channels" />
        {!channels.isLoading && !channels.isError ? channelRows.map((channel) => (
          <ImRow
            key={textAt(channel, ["type"], "channel")}
            icon="radio-tower"
            title={textAt(channel, ["type"], "channel")}
            sub={`${numberAt(channel, ["accountCount"])} accounts · ${numberAt(channel, ["bindingCount"])} bindings · dm ${textAt(channel, ["dmPolicy"], "-")}`}
            status={channel.enabled ? "enabled" : "disabled"}
          />
        )) : null}
      </div>
    </section>
  );

  const renderBindings = () => (
    <div className="im-stack">
      <section className="panel im-panel">
        <div className="panel-head"><div className="htitle"><h3>Tracevane 绑定</h3><span className="sub">渠道线程到 Agent / ACP 的工作流绑定。</span></div><StatusTag value={`${bindingRows.length} bindings`} /></div>
        <div className="panel-body im-table">
          <QueryNotice query={channels} label="Bindings" />
          {!channels.isLoading && !channels.isError ? bindingRows.map((binding) => (
            <ImRow
              key={textAt(binding, ["id"], "binding")}
              icon="bot"
              title={textAt(binding, ["ref", "id"], "binding")}
              sub={`${textAt(binding, ["channel"], "-")} · ${textAt(binding, ["agentId"], "-")} · ${textAt(binding, ["comment"], "no comment")}`}
              status={textAt(binding, ["type"], "agent")}
            />
          )) : null}
        </div>
      </section>
      <section className="panel im-panel">
        <div className="panel-head"><div className="htitle"><h3>Daemon 原生绑定</h3><span className="sub">平台账号/bot 到 Agent profile 的 native runtime 映射。</span></div><StatusTag value={`${nativeBindings.length} native`} /></div>
        <div className="panel-body im-table">
          <QueryNotice query={daemonConfig} label="Daemon config" />
          {!daemonConfig.isLoading && !daemonConfig.isError ? nativeBindings.map(({ project, binding }) => (
            <ImRow
              key={`${textAt(project, ["id"], "project")}-${textAt(binding, ["id"], "binding")}`}
              icon="plug-zap"
              title={textAt(binding, ["displayName", "id"], "binding")}
              sub={`${textAt(binding, ["platform"], "-")} · ${textAt(project, ["name", "id"], "-")} · ${textAt(binding, ["agent"], "-")}`}
              status={binding.enabled ? "enabled" : "disabled"}
            />
          )) : null}
        </div>
      </section>
    </div>
  );

  const renderSessions = () => (
    <section className="panel im-panel">
      <div className="panel-head"><div className="htitle"><h3>Agent Sessions</h3><span className="sub">只读展示持久 CLI Agent session；kill/reap 属写动作，后续进确认流。</span></div><StatusTag value={`${sessionRows.length} active`} /></div>
      <div className="panel-body im-table">
        <QueryNotice query={agentSessions} label="Agent sessions" />
        {!agentSessions.isLoading && !agentSessions.isError ? sessionRows.map((session) => (
          <ImRow
            key={textAt(session, ["poolKey", "sessionId"], "session")}
            icon="terminal"
            title={textAt(session, ["sessionId"], "session")}
            sub={`${textAt(session, ["agent"], "-")} · ${textAt(session, ["model"], "-")} · turns ${textAt(session, ["turnCount"], "0")} · running ${textAt(session, ["running"], "0")}`}
            status={textAt(session, ["lastError"], "") ? "error" : numberAt(session, ["running"]) > 0 ? "running" : "idle"}
          />
        )) : null}
        {!agentSessions.isLoading && !agentSessions.isError && sessionRows.length === 0 ? <div className="statebox empty"><span className="si"><i data-lucide="terminal" /></span><strong>暂无活跃 session</strong><span>私聊触发 Agent 后会在这里显示持久会话。</span></div> : null}
      </div>
    </section>
  );

  const renderLogs = () => (
    <section className="panel im-panel">
      <div className="panel-head"><div className="htitle"><h3>Daemon 日志</h3><span className="sub">来自 /api/channel-connectors/daemon/logs。</span></div><StatusTag value={daemonLogs.isError ? "error" : `${logLines.length} lines`} /></div>
      <div className="panel-body">
        <QueryNotice query={daemonLogs} label="Daemon logs" />
        {!daemonLogs.isLoading && !daemonLogs.isError ? <pre className="logbox im-log">{logLines.length ? logLines.join("\n") : "No daemon log lines returned."}</pre> : null}
      </div>
    </section>
  );

  const content = {
    overview: renderOverview,
    channels: renderChannels,
    bindings: renderBindings,
    sessions: renderSessions,
    logs: renderLogs,
  }[view];

  return (
    <div id="stage" className="page-stage" role="main" aria-live="polite" tabIndex={-1}>
      <div className="wrap im-channels-page">
        <div className="page-head">
          <div className="htitle">
            <h2>IM 渠道</h2>
            <p>私聊/群聊触发本地 CLI Agent；本页聚焦绑定、会话、投递队列和 daemon 证据。</p>
          </div>
          <div className="toolbar">
            <button className="btn-ghost" onClick={() => { void channels.refetch(); void connectorStatus.refetch(); void agentSessions.refetch(); }}><i data-lucide="refresh-cw" />刷新</button>
          </div>
        </div>
        <div className="viewbar im-viewbar" role="tablist" aria-label="IM 渠道视图">
          {[
            ["overview", "layout-dashboard", "概览"],
            ["channels", "radio-tower", "渠道"],
            ["bindings", "plug-zap", "绑定"],
            ["sessions", "terminal", "会话"],
            ["logs", "scroll-text", "日志"],
          ].map(([id, icon, label]) => (
            <button key={id} className={view === id ? "on" : ""} role="tab" aria-selected={view === id} onClick={() => setView(id as ImChannelsView)}>
              <i data-lucide={icon} />{label}
            </button>
          ))}
        </div>
        {content()}
      </div>
    </div>
  );
}
