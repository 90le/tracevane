import * as React from "react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "./api-client";
import { useShell } from "./shell-context";

type AnyRecord = Record<string, unknown>;
type CliAgentsView = "overview" | "agents" | "cli" | "sessions" | "channels";

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

function formatCompact(value: unknown): string {
  const number = typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return String(number);
}

function formatTime(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function stateTone(value: unknown): "ok" | "warn" | "bad" | "info" {
  const text = String(value ?? "").toLowerCase();
  if (/(enabled|installed|running|active|ok|ready|connected|clean|idle|true)/.test(text)) return "ok";
  if (/(failed|error|missing|lost|offline|disabled|stopped|false)/.test(text)) return "bad";
  if (/(warn|warning|pending|detached|queued|archived|degraded|dirty)/.test(text)) return "warn";
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

function AgentRow({ icon, title, sub, status, meta }: { icon: string; title: string; sub: string; status: unknown; meta?: React.ReactNode }) {
  return (
    <div className="route-row cli-agent-row">
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <span className="route-copy"><strong>{title}</strong><span>{sub}</span></span>
      {meta ? <span className="cli-agent-meta">{meta}</span> : null}
      <StatusTag value={status} />
    </div>
  );
}

function AgentTile({ icon, title, value, sub, status }: { icon: string; title: string; value: React.ReactNode; sub: React.ReactNode; status?: unknown }) {
  return (
    <div className="cli-agent-tile">
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <div><strong>{title}</strong><span>{sub}</span></div>
      <div className="cli-agent-tile-value">
        <b>{value}</b>
        {status !== undefined ? <StatusTag value={status} /> : null}
      </div>
    </div>
  );
}

export function CliAgentsPage() {
  const shell = useShell();
  const [view, setView] = useState<CliAgentsView>("overview");

  const agents = useQuery({ queryKey: ["cli-agents", "agents"], queryFn: () => apiJson("/api/agents"), retry: false });
  const terminalStatus = useQuery({ queryKey: ["cli-agents", "terminal-status"], queryFn: () => apiJson("/api/terminal/status"), retry: false });
  const terminalSessions = useQuery({ queryKey: ["cli-agents", "terminal-sessions"], queryFn: () => apiJson("/api/terminal/sessions"), retry: false });
  const channelSessions = useQuery({ queryKey: ["cli-agents", "channel-sessions"], queryFn: () => apiJson("/api/channel-connectors/agent-sessions"), retry: false });
  const gatewayStatus = useQuery({ queryKey: ["cli-agents", "gateway-status"], queryFn: () => apiJson("/api/model-gateway/status"), retry: false });
  const chatBootstrap = useQuery({ queryKey: ["cli-agents", "chat-bootstrap"], queryFn: () => apiJson("/api/chat/bootstrap?recentLimit=20&historyLimit=1"), retry: false });

  useEffect(() => {
    shell.refreshIcons();
  }, [shell, view, agents.data, terminalStatus.data, terminalSessions.data, channelSessions.data, gatewayStatus.data, chatBootstrap.data]);

  const agentRows = listAt(agents.data, ["agents"]).map(asRecord);
  const terminalBinaries = listAt(terminalStatus.data, ["binaries"]).map(asRecord);
  const agentBinaries = terminalBinaries.filter((binary) => binary.category === "agent");
  const terminalRows = listAt(terminalSessions.data, ["sessions"]).map(asRecord);
  const channelActiveRows = listAt(channelSessions.data, ["activeSessions"]).map(asRecord);
  const channelEvents = listAt(channelSessions.data, ["recentEvents"]).map(asRecord);
  const chatRows = listAt(chatBootstrap.data, ["sessions"]).map(asRecord);
  const channelPolicy = recordAt(channelSessions.data, ["policy"]);
  const gatewayHealth = recordAt(gatewayStatus.data, ["healthSummary"]);
  const installedAgents = agentBinaries.filter((binary) => binary.installed === true).length;
  const enabledAgents = agentRows.filter((agent) => agent.enabled === true).length;
  const activeTerminalCount = terminalRows.filter((session) => /running|detached/.test(textAt(session, ["status"], "").toLowerCase())).length;
  const degradedProviders = numberAt(gatewayHealth, ["degradedProviders"]);

  const renderOverview = () => (
    <>
      <section className="hero cli-agent-hero">
        <div className="hero-top">
          <span className={`ready-chip ${installedAgents >= 3 ? "ok" : "warn"}`}><i data-lucide="bot" />CLI Agents · {installedAgents}/3 installed</span>
          <span className="hero-time">Terminal pty · {String(asRecord(terminalStatus.data).ptyAvailable ?? "-")}</span>
        </div>
        <h1>CLI Agents 是运行视角，不复制平台配置和模型网关。</h1>
        <p className="hero-sub">本页聚合 persona agent、Codex/Claude/OpenCode CLI、Terminal session、IM 异步运行证据和 Gateway 健康；模型绑定仍由模型网关管理。</p>
        <div className="hero-stats cli-agent-stats">
          <Metric icon="users" label="Agents" value={agentRows.length} sub={`${enabledAgents} enabled`} />
          <Metric icon="terminal" label="CLI" value={installedAgents} sub={`${agentBinaries.length} tracked binaries`} />
          <Metric icon="messages-square" label="Chat sessions" value={chatRows.length} sub={`${textAt(chatBootstrap.data, ["selectedSessionKey"], "none").slice(0, 18)}...`} />
          <Metric icon="activity" label="IM runs" value={channelActiveRows.length} sub={`${numberAt(channelPolicy, ["maxSessions"])} max sessions`} />
        </div>
      </section>
      <div className="cli-agent-overview-grid">
        <section className="panel cli-agent-panel">
          <div className="panel-head"><div className="htitle"><h3>运行入口</h3><span className="sub">本地 Agent persona、CLI 二进制和模型网关健康。</span></div><StatusTag value={degradedProviders > 0 ? "degraded" : "ok"} /></div>
          <div className="panel-body cli-agent-tile-grid">
            <AgentTile icon="bot" title="Enabled agents" value={enabledAgents} sub={`${agentRows.length} configured persona agents`} status={enabledAgents > 0 ? "enabled" : "missing"} />
            <AgentTile icon="terminal" title="Agent CLIs" value={installedAgents} sub={agentBinaries.map((item) => textAt(item, ["id"], "")).filter(Boolean).join(" / ") || "-"} status={installedAgents >= 3 ? "installed" : "missing"} />
            <AgentTile icon="route" title="Gateway health" value={numberAt(gatewayHealth, ["okProviders"])} sub={`${degradedProviders} degraded providers`} status={degradedProviders > 0 ? "warn" : "ok"} />
            <AgentTile icon="radio-tower" title="Channel sessions" value={channelActiveRows.length} sub={`${numberAt(channelPolicy, ["idleTimeoutMs"])}ms idle timeout`} status={channelActiveRows.length > 0 ? "running" : "idle"} />
          </div>
        </section>
        <section className="panel cli-agent-panel">
          <div className="panel-head"><div className="htitle"><h3>最近 IM Agent 事件</h3><span className="sub">来自 Channel Connectors session driver。</span></div><button className="btn-ghost btn-sm" onClick={() => setView("channels")}><i data-lucide="arrow-right" />证据</button></div>
          <div className="panel-body cli-agent-list">
            <QueryNotice query={channelSessions} label="Channel agent sessions" />
            {!channelSessions.isLoading && !channelSessions.isError ? channelEvents.slice(0, 5).map((event, index) => (
              <AgentRow key={`${textAt(event, ["checkedAt"], "event")}-${index}`} icon="activity" title={textAt(event, ["type"], "event")} sub={`${textAt(event, ["agent"], "-")} · ${textAt(event, ["model"], "-")} · ${formatTime(textAt(event, ["checkedAt"], ""))}`} status={textAt(event, ["error"], "") ? "error" : textAt(event, ["reason"], "ok")} />
            )) : null}
          </div>
        </section>
      </div>
    </>
  );

  const renderAgents = () => (
    <section className="panel cli-agent-panel">
      <div className="panel-head"><div className="htitle"><h3>Persona Agents</h3><span className="sub">来自 /api/agents；这里不编辑 persona、权限或文档。</span></div><StatusTag value={`${agentRows.length} agents`} /></div>
      <div className="panel-body cli-agent-table">
        <QueryNotice query={agents} label="Agents" />
        {!agents.isLoading && !agents.isError ? agentRows.map((agent) => (
          <AgentRow
            key={textAt(agent, ["id"], "agent")}
            icon="bot"
            title={`${textAt(agent, ["name"], "Agent")} · ${textAt(agent, ["id"], "-")}`}
            sub={`${textAt(agent, ["identity", "role"], "-")} · ${textAt(agent, ["workspace"], "-")}`}
            meta={<span>{formatCompact(numberAt(agent, ["totalTokens"]))} tokens</span>}
            status={agent.enabled ? "enabled" : "disabled"}
          />
        )) : null}
      </div>
    </section>
  );

  const renderCli = () => (
    <section className="panel cli-agent-panel">
      <div className="panel-head"><div className="htitle"><h3>Codex / Claude / OpenCode</h3><span className="sub">CLI 安装和版本状态；install/launch 属写动作，不在本页直连。</span></div><StatusTag value={`${installedAgents} installed`} /></div>
      <div className="panel-body cli-agent-table">
        <QueryNotice query={terminalStatus} label="Terminal status" />
        {!terminalStatus.isLoading && !terminalStatus.isError ? agentBinaries.map((binary) => (
          <AgentRow
            key={textAt(binary, ["id"], "binary")}
            icon="terminal"
            title={textAt(binary, ["label", "id"], "CLI")}
            sub={`${textAt(binary, ["binary"], "-")} · ${textAt(binary, ["version"], "no version")} · ${textAt(binary, ["path"], "not on PATH")}`}
            status={binary.installed ? "installed" : "missing"}
          />
        )) : null}
      </div>
    </section>
  );

  const renderSessions = () => (
    <div className="cli-agent-stack">
      <section className="panel cli-agent-panel">
        <div className="panel-head"><div className="htitle"><h3>Terminal Sessions</h3><span className="sub">持久终端 session 摘要；resume/end 后续进入确认流。</span></div><StatusTag value={`${terminalRows.length} sessions`} /></div>
        <div className="panel-body cli-agent-table">
          <QueryNotice query={terminalSessions} label="Terminal sessions" />
          {!terminalSessions.isLoading && !terminalSessions.isError ? terminalRows.slice(0, 12).map((session) => (
            <AgentRow
              key={textAt(session, ["sessionId"], "session")}
              icon="square-terminal"
              title={textAt(session, ["title", "sessionId"], "session")}
              sub={`${textAt(session, ["cwd"], "-")} · ${formatTime(textAt(session, ["lastActiveAt"], ""))}`}
              status={textAt(session, ["status"], "unknown")}
            />
          )) : null}
          {!terminalSessions.isLoading && !terminalSessions.isError && terminalRows.length === 0 ? <div className="statebox empty"><span className="si"><i data-lucide="terminal" /></span><strong>暂无终端 session</strong><span>启动终端后会显示在这里。</span></div> : null}
        </div>
      </section>
      <section className="panel cli-agent-panel">
        <div className="panel-head"><div className="htitle"><h3>Chat Sessions</h3><span className="sub">Tracevane chat bootstrap 的最近会话。</span></div><StatusTag value={`${chatRows.length} sessions`} /></div>
        <div className="panel-body cli-agent-table">
          <QueryNotice query={chatBootstrap} label="Chat bootstrap" />
          {!chatBootstrap.isLoading && !chatBootstrap.isError ? chatRows.slice(0, 10).map((session) => {
            const runtime = recordAt(session, ["runtime"]);
            return (
              <AgentRow
                key={textAt(session, ["key"], "chat")}
                icon="messages-square"
                title={textAt(session, ["label", "derivedTitle", "sessionId"], "chat session")}
                sub={`${textAt(session, ["agentId"], "-")} · ${textAt(session, ["source", "channel"], "-")} · ${formatTime(textAt(session, ["updatedAt"], ""))}`}
                status={textAt(runtime, ["state"], "unknown")}
              />
            );
          }) : null}
        </div>
      </section>
    </div>
  );

  const renderChannels = () => (
    <section className="panel cli-agent-panel">
      <div className="panel-head"><div className="htitle"><h3>IM Agent Driver</h3><span className="sub">异步子任务/长任务证据；kill/reap 不在这里直接执行。</span></div><StatusTag value={`${channelActiveRows.length} active`} /></div>
      <div className="panel-body cli-agent-table">
        <QueryNotice query={channelSessions} label="Channel agent sessions" />
        {!channelSessions.isLoading && !channelSessions.isError ? (
          channelActiveRows.length ? channelActiveRows.map((session) => (
            <AgentRow
              key={textAt(session, ["poolKey", "sessionId"], "channel-session")}
              icon="activity"
              title={textAt(session, ["sessionId"], "channel session")}
              sub={`${textAt(session, ["agent"], "-")} · ${textAt(session, ["model"], "-")} · ${textAt(session, ["workDir"], "-")}`}
              status={numberAt(session, ["running"]) > 0 ? "running" : "idle"}
            />
          )) : channelEvents.slice(0, 12).map((event, index) => (
            <AgentRow
              key={`${textAt(event, ["checkedAt"], "event")}-${index}`}
              icon="history"
              title={textAt(event, ["type"], "event")}
              sub={`${textAt(event, ["bindingId"], "-")} · ${textAt(event, ["agent"], "-")} · ${formatTime(textAt(event, ["checkedAt"], ""))}`}
              status={textAt(event, ["reason"], textAt(event, ["error"], "ok"))}
            />
          ))
        ) : null}
      </div>
    </section>
  );

  const content = {
    overview: renderOverview,
    agents: renderAgents,
    cli: renderCli,
    sessions: renderSessions,
    channels: renderChannels,
  }[view];

  return (
    <div id="stage" className="page-stage" role="main" aria-live="polite" tabIndex={-1}>
      <div className="wrap cli-agents-page">
        <div className="page-head">
          <div className="htitle">
            <h2>CLI Agents</h2>
            <p>只读管理运行入口和证据，不复制模型网关、IM 渠道和平台配置。</p>
          </div>
          <div className="toolbar">
            <button className="btn-ghost" onClick={() => { void agents.refetch(); void terminalStatus.refetch(); void terminalSessions.refetch(); void channelSessions.refetch(); void chatBootstrap.refetch(); }}><i data-lucide="refresh-cw" />刷新</button>
          </div>
        </div>
        <div className="viewbar cli-agent-viewbar" role="tablist" aria-label="CLI Agents 视图">
          {[
            ["overview", "layout-dashboard", "概览"],
            ["agents", "bot", "Agents"],
            ["cli", "terminal", "CLI"],
            ["sessions", "messages-square", "会话"],
            ["channels", "radio-tower", "IM 证据"],
          ].map(([id, icon, label]) => (
            <button key={id} className={view === id ? "on" : ""} role="tab" aria-selected={view === id} onClick={() => setView(id as CliAgentsView)}>
              <i data-lucide={icon} />{label}
            </button>
          ))}
        </div>
        {content()}
      </div>
    </div>
  );
}
