import * as React from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "./api-client";
import { useShell } from "./shell-context";

type AnyRecord = Record<string, unknown>;

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

function formatCompact(value: unknown): string {
  const number = typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return String(number);
}

function stateTone(value: unknown): "ok" | "warn" | "bad" | "info" {
  const text = String(value ?? "").toLowerCase();
  if (/(ready|online|healthy|ok|active|running|connected|true|clean|idle|enabled)/.test(text)) return "ok";
  if (/(failed|error|offline|down|missing|false|invalid|lost|stopped)/.test(text)) return "bad";
  if (/(partial|pending|warn|warning|degraded|queued|not-ready|dirty|detached)/.test(text)) return "warn";
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

function DomainButton({ icon, title, sub, status, route }: { icon: string; title: string; sub: string; status: unknown; route: string }) {
  const navigate = useNavigate();
  return (
    <button className="dashboard-domain-card" onClick={() => navigate(route)}>
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <span><strong>{title}</strong><small>{sub}</small></span>
      <StatusTag value={status} />
    </button>
  );
}

function EvidenceRow({ icon, title, sub, status, route }: { icon: string; title: string; sub: string; status: unknown; route: string }) {
  const navigate = useNavigate();
  return (
    <button className="dashboard-evidence-row" onClick={() => navigate(route)}>
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <span><strong>{title}</strong><small>{sub}</small></span>
      <StatusTag value={status} />
    </button>
  );
}

export function DashboardPage() {
  const shell = useShell();
  const dashboard = useQuery({ queryKey: ["dashboard", "summary"], queryFn: () => apiJson("/api/dashboard/summary"), retry: false });
  const systemHealth = useQuery({ queryKey: ["dashboard", "system-health"], queryFn: () => apiJson("/api/system/health"), retry: false });
  const gateway = useQuery({ queryKey: ["dashboard", "gateway"], queryFn: () => apiJson("/api/model-gateway/status"), retry: false });
  const chat = useQuery({ queryKey: ["dashboard", "chat"], queryFn: () => apiJson("/api/chat/bootstrap?recentLimit=12&historyLimit=1"), retry: false });
  const channels = useQuery({ queryKey: ["dashboard", "channels"], queryFn: () => apiJson("/api/channel-connectors/status"), retry: false });
  const channelSessions = useQuery({ queryKey: ["dashboard", "channel-sessions"], queryFn: () => apiJson("/api/channel-connectors/agent-sessions"), retry: false });
  const terminal = useQuery({ queryKey: ["dashboard", "terminal"], queryFn: () => apiJson("/api/terminal/status"), retry: false });
  const recovery = useQuery({ queryKey: ["dashboard", "recovery"], queryFn: () => apiJson("/api/openclaw-recovery/status"), retry: false });

  useEffect(() => {
    shell.refreshIcons();
  }, [shell, dashboard.data, systemHealth.data, gateway.data, chat.data, channels.data, channelSessions.data, terminal.data, recovery.data]);

  const dashboardCounts = recordAt(dashboard.data, ["counts"]);
  const gatewayHealth = recordAt(gateway.data, ["healthSummary"]);
  const gatewayUsage = recordAt(gateway.data, ["runtime", "usageSummary", "totals"]);
  const chatSessions = listAt(chat.data, ["sessions"]).map(asRecord);
  const chatRunning = chatSessions.filter((session) => /running|streaming/.test(textAt(session, ["runtime", "state"], "").toLowerCase())).length;
  const channelRuntime = recordAt(channels.data, ["runtime"]);
  const channelPending = recordAt(channelRuntime, ["pendingAgentRuns"]);
  const channelActive = listAt(channelSessions.data, ["activeSessions"]).length;
  const agentBinaries = listAt(terminal.data, ["binaries"]).map(asRecord).filter((binary) => binary.category === "agent");
  const installedCli = agentBinaries.filter((binary) => binary.installed === true).length;
  const recoveryEvents = listAt(recovery.data, ["recentEvents"]).map(asRecord);
  const recoveryBackups = listAt(recovery.data, ["backups"]).map(asRecord);
  const dashboardReady = asRecord(dashboard.data).summaryReady === true;
  const serviceStatus = textAt(systemHealth.data, ["serviceState"], textAt(systemHealth.data, ["gateway"], "unknown"));
  const overallState = serviceStatus === "active" && textAt(systemHealth.data, ["gateway"], "") === "online"
    ? (numberAt(gatewayHealth, ["degradedProviders"]) > 0 ? "degraded" : "ready")
    : serviceStatus;

  return (
    <div id="stage" className="page-stage" role="main" aria-live="polite" tabIndex={-1}>
      <div className="wrap dashboard-page">
        <div className="page-head">
          <div className="htitle">
            <h2>仪表盘</h2>
            <p>Tracevane 运行态驾驶舱：任务、网关、渠道、终端、恢复和证据。</p>
          </div>
          <div className="toolbar">
            <button className="btn-ghost" onClick={() => {
              void dashboard.refetch(); void systemHealth.refetch(); void gateway.refetch(); void chat.refetch(); void channels.refetch(); void channelSessions.refetch(); void terminal.refetch(); void recovery.refetch();
            }}><i data-lucide="refresh-cw" />刷新</button>
          </div>
        </div>

        <section className="hero dashboard-hero">
          <div className="hero-top">
            <span className={`ready-chip ${stateTone(overallState) === "ok" ? "ok" : "warn"}`}><i data-lucide="layout-dashboard" />Tracevane · {overallState}</span>
            <span className="hero-time">summary {dashboardReady ? "ready" : "warming"} · {formatTime(textAt(dashboard.data, ["checkedAt"], ""))}</span>
          </div>
          <h1>一个屏幕看清 Agent 工作是否能继续推进。</h1>
          <p className="hero-sub">这里只聚合 Tracevane 主线运行状态。OpenClaw 仍是平台支撑，不作为主工作流入口。</p>
          <div className="hero-stats dashboard-stats">
            <Metric icon="messages-square" label="会话任务" value={chatSessions.length} sub={`${chatRunning} running`} />
            <Metric icon="route" label="模型网关" value={numberAt(gatewayHealth, ["okProviders"])} sub={`${numberAt(gatewayHealth, ["degradedProviders"])} degraded`} />
            <Metric icon="radio-tower" label="IM Agent" value={channelActive} sub={`${numberAt(channelPending, ["count"])} pending`} />
            <Metric icon="terminal" label="CLI" value={installedCli} sub={`${agentBinaries.length} tracked`} />
          </div>
        </section>

        <div className="dashboard-grid">
          <section className="panel dashboard-panel">
            <div className="panel-head"><div className="htitle"><h3>主线工作域</h3><span className="sub">点击进入真实功能页。</span></div><StatusTag value={dashboardReady ? "ready" : "warming"} /></div>
            <div className="panel-body dashboard-domain-grid">
              <DomainButton icon="messages-square" title="会话任务" sub={`${chatSessions.length} recent sessions`} status={chatRunning ? "running" : "idle"} route="/chat" />
              <DomainButton icon="square-terminal" title="工作区 IDE" sub="files / git / preview / terminal" status="ready" route="/ide" />
              <DomainButton icon="bot" title="CLI Agents" sub={`${installedCli}/${agentBinaries.length} agent CLIs installed`} status={installedCli === agentBinaries.length ? "ready" : "partial"} route="/cli-agents" />
              <DomainButton icon="route" title="模型网关" sub={`${formatCompact(numberAt(gatewayUsage, ["requests"]))} requests`} status={numberAt(gatewayHealth, ["degradedProviders"]) > 0 ? "degraded" : "ready"} route="/model-gateway" />
              <DomainButton icon="radio-tower" title="IM 渠道" sub={`${numberAt(channelRuntime, ["feishuConnections"])} feishu · ${numberAt(channelRuntime, ["octoConnections"])} octo`} status={channelRuntime.reachable ? "ready" : "warn"} route="/im-channels" />
              <DomainButton icon="shield-check" title="审批" sub="risk and approval queue" status="planned" route="/approvals" />
            </div>
          </section>

          <section className="panel dashboard-panel">
            <div className="panel-head"><div className="htitle"><h3>需要关注</h3><span className="sub">只读证据，不直接执行修复动作。</span></div><StatusTag value={`${recoveryEvents.length} events`} /></div>
            <div className="panel-body dashboard-evidence-list">
              <QueryNotice query={dashboard} label="Dashboard summary" />
              <EvidenceRow icon="heart-pulse" title="自愈守护" sub={`${textAt(recovery.data, ["status"], "unknown")} · ${recoveryBackups.length} backups`} status={textAt(recovery.data, ["status"], "unknown")} route="/recovery" />
              <EvidenceRow icon="activity" title="Gateway health" sub={`${numberAt(gatewayHealth, ["okProviders"])} ok providers · ${numberAt(gatewayHealth, ["openCircuits"])} open circuits`} status={numberAt(gatewayHealth, ["degradedProviders"]) > 0 ? "degraded" : "ok"} route="/model-gateway" />
              <EvidenceRow icon="send-horizontal" title="Channel replay" sub={`${numberAt(channelPending, ["count"])} pending · oldest ${formatTime(textAt(channelPending, ["oldestQueuedAt"], ""))}`} status={numberAt(channelPending, ["count"]) > 0 ? "pending" : "ok"} route="/im-channels" />
              <EvidenceRow icon="server" title="System runtime" sub={`pid ${textAt(systemHealth.data, ["pid"], "-")} · ${textAt(systemHealth.data, ["platform"], "-")}/${textAt(systemHealth.data, ["arch"], "-")}`} status={serviceStatus} route="/platforms" />
            </div>
          </section>

          <section className="panel dashboard-panel dashboard-wide">
            <div className="panel-head"><div className="htitle"><h3>运行摘要</h3><span className="sub">来自 Dashboard summary 和核心域 API。</span></div><span className="hero-time">{textAt(dashboard.data, ["server", "version"], "0.1.70")}</span></div>
            <div className="panel-body dashboard-summary-grid">
              <div className="dashboard-summary-cell"><span>Agents</span><strong>{numberAt(dashboardCounts, ["agents"], chatSessions.length ? 1 : 0)}</strong></div>
              <div className="dashboard-summary-cell"><span>Channels</span><strong>{numberAt(dashboardCounts, ["channels"])}</strong></div>
              <div className="dashboard-summary-cell"><span>Bindings</span><strong>{numberAt(dashboardCounts, ["bindings"])}</strong></div>
              <div className="dashboard-summary-cell"><span>Terminal sessions</span><strong>{numberAt(dashboard.data, ["terminalWorkspace", "totalSessions"])}</strong></div>
              <div className="dashboard-summary-cell"><span>Bootstrap</span><strong>{textAt(dashboard.data, ["bootstrap", "ready"], "-")}</strong></div>
              <div className="dashboard-summary-cell"><span>Device trust</span><strong>{numberAt(dashboard.data, ["deviceTrust", "pendingRequests"])}</strong></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
