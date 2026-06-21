import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "./api-client";
import { useShell } from "./shell-context";

type AnyRecord = Record<string, unknown>;
type ExternalView = "overview" | "connections" | "capabilities" | "auth";

interface ExternalConnection {
  id: string;
  title: string;
  source: string;
  kind: string;
  status: string;
  count: string;
  icon: string;
  detail: string;
  evidence: string[];
}

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

function stateTone(value: unknown): "ok" | "warn" | "bad" | "info" {
  const text = String(value ?? "").toLowerCase();
  if (/(ready|ok|online|connected|configured|enabled|true|healthy|active|installed)/.test(text)) return "ok";
  if (/(failed|error|offline|missing|disabled|false|expired|blocked|stopped)/.test(text)) return "bad";
  if (/(warn|warning|pending|stale|expiring|needs-setup|partial|warming|not-configured)/.test(text)) return "warn";
  return "info";
}

function formatTime(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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

function ExternalTile({ icon, title, value, sub, status }: { icon: string; title: string; value: React.ReactNode; sub: React.ReactNode; status?: unknown }) {
  return (
    <div className="external-tile">
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <div><strong>{title}</strong><span>{sub}</span></div>
      <div className="external-tile-value">
        <b>{value}</b>
        {status !== undefined ? <StatusTag value={status} /> : null}
      </div>
    </div>
  );
}

function ExternalRow({ item, selected, onSelect }: { item: ExternalConnection; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`external-row ${selected ? "is-selected" : ""}`} onClick={onSelect}>
      <span className="rico r-primary"><i data-lucide={item.icon} /></span>
      <span className="external-copy"><strong>{item.title}</strong><small>{item.source}</small></span>
      <span className="cell-mono">{item.kind}</span>
      <span className="cell-mono">{item.count}</span>
      <StatusTag value={item.status} />
    </button>
  );
}

function buildConnections(params: {
  config: unknown;
  skills: unknown;
  appConnections: unknown;
  channelStatus: unknown;
  diagnostics: unknown;
}): ExternalConnection[] {
  const rows: ExternalConnection[] = [];
  const mcp = asRecord(asRecord(params.config).mcp);
  const mcpServers = asRecord(mcp.servers);
  const commands = asRecord(asRecord(params.config).commands);
  const skillCounts = asRecord(asRecord(params.skills).counts);
  const skillTools = asRecord(asRecord(params.skills).tools);
  const gatewayConnections = listAt(params.appConnections, ["connections"]).map(asRecord);
  const channelRuntime = recordAt(params.channelStatus, ["runtime"]);
  const bindingPolicy = recordAt(params.channelStatus, ["bindingPolicy"]);
  const diagnosticsConfig = recordAt(params.diagnostics, ["config"]);

  rows.push({
    id: "mcp",
    title: "MCP tool servers",
    source: Object.keys(mcpServers).length ? "OpenClaw config · mcp.servers" : "OpenClaw config · MCP disabled or empty",
    kind: "MCP",
    status: commands.mcp === true || Object.keys(mcpServers).length ? "configured" : "not-configured",
    count: `${Object.keys(mcpServers).length} servers`,
    icon: "plug-zap",
    detail: `session idle ttl ${textAt(mcp, ["sessionIdleTtlMs"], "-")}`,
    evidence: Object.keys(mcpServers).length
      ? Object.entries(mcpServers).slice(0, 8).map(([name, value]) => `${name} · ${textAt(asRecord(value), ["transport", "command", "url"], "server")}`)
      : ["MCP command is not enabled in current config summary.", "No browser-visible credentials are exposed."],
  });

  rows.push({
    id: "skills",
    title: "Skills and local tools",
    source: `${textAt(params.skills, ["managedSkillsDir"], "-")}`,
    kind: "Tools",
    status: numberAt(skillCounts, ["blocked"]) > 0 ? "blocked" : "ready",
    count: `${numberAt(skillCounts, ["ready"])} ready`,
    icon: "wrench",
    detail: `${numberAt(skillCounts, ["total"])} total · ${numberAt(skillCounts, ["needsSetup"])} need setup · ${numberAt(skillCounts, ["disabled"])} disabled`,
    evidence: [
      `clawhub ${skillTools.clawhubInstalled === true ? "installed" : "missing"}`,
      `skillhub ${skillTools.skillhubInstalled === true ? "installed" : "missing"}`,
      `configured ${numberAt(skillCounts, ["configured"])}`,
    ],
  });

  for (const connection of gatewayConnections) {
    const target = recordAt(connection, ["target"]);
    rows.push({
      id: `gateway:${textAt(connection, ["id"], rows.length.toString())}`,
      title: textAt(connection, ["label", "id"], "Gateway app connection"),
      source: textAt(target, ["path"], "Gateway app config"),
      kind: "App Connection",
      status: connection.configured ? "configured" : "pending",
      count: textAt(connection, ["protocol"], "-"),
      icon: "route",
      detail: `${textAt(target, ["format"], "-")} · exists ${textAt(target, ["exists"], "-")}`,
      evidence: [
        `target ${textAt(target, ["path"], "-")}`,
        `protocol ${textAt(connection, ["protocol"], "-")}`,
        "apply/rollback remains locked to Model Gateway flow",
      ],
    });
  }

  rows.push({
    id: "im-platforms",
    title: "IM platform transports",
    source: "Channel Connectors daemon",
    kind: "Messaging",
    status: channelRuntime.reachable === true ? "connected" : "warning",
    count: `${numberAt(channelRuntime, ["platformBindings"])} bindings`,
    icon: "radio-tower",
    detail: `${numberAt(channelRuntime, ["feishuConnections"])} Feishu · ${numberAt(channelRuntime, ["octoConnections"])} Octo · ${numberAt(channelRuntime, ["agentRuns"])} agent runs`,
    evidence: [
      `supported ${listAt(bindingPolicy, ["supportedPlatforms"]).slice(0, 8).join(" / ") || "-"}`,
      `pending ${numberAt(recordAt(channelRuntime, ["pendingAgentRuns"]), ["count"])}`,
      `checked ${formatTime(textAt(params.channelStatus, ["checkedAt"], ""))}`,
    ],
  });

  rows.push({
    id: "tracevane-http",
    title: "Tracevane local HTTP bridge",
    source: `port ${textAt(diagnosticsConfig, ["port"], "-")}`,
    kind: "HTTP",
    status: "online",
    count: textAt(diagnosticsConfig, ["transport", "preferredMode"], "standalone"),
    icon: "globe",
    detail: `base path ${textAt(diagnosticsConfig, ["transport", "gateway", "basePath"], "-")}`,
    evidence: [
      `project ${textAt(diagnosticsConfig, ["projectRoot"], "-")}`,
      `gateway ws ${textAt(diagnosticsConfig, ["gatewayWsUrl"], "-")}`,
      "external callers must still pass server-side auth/policy",
    ],
  });

  return rows;
}

export function ExternalConnectionsPage() {
  const shell = useShell();
  const [view, setView] = useState<ExternalView>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const config = useQuery({ queryKey: ["external", "config"], queryFn: () => apiJson("/api/config"), retry: false });
  const skills = useQuery({ queryKey: ["external", "skills"], queryFn: () => apiJson("/api/skills"), retry: false });
  const appConnections = useQuery({ queryKey: ["external", "app-connections"], queryFn: () => apiJson("/api/model-gateway/app-connections"), retry: false });
  const channelStatus = useQuery({ queryKey: ["external", "channel-status"], queryFn: () => apiJson("/api/channel-connectors/status"), retry: false });
  const diagnostics = useQuery({ queryKey: ["external", "diagnostics"], queryFn: () => apiJson("/api/system/diagnostics"), retry: false });

  const connections = useMemo(() => buildConnections({
    config: config.data,
    skills: skills.data,
    appConnections: appConnections.data,
    channelStatus: channelStatus.data,
    diagnostics: diagnostics.data,
  }), [appConnections.data, channelStatus.data, config.data, diagnostics.data, skills.data]);
  const selected = connections.find((item) => item.id === selectedId) || connections[0] || null;
  const healthy = connections.filter((item) => stateTone(item.status) === "ok").length;
  const warning = connections.filter((item) => stateTone(item.status) === "warn" || stateTone(item.status) === "bad").length;
  const readySkills = numberAt(recordAt(skills.data, ["counts"]), ["ready"]);

  useEffect(() => {
    if (!selectedId && connections[0]) setSelectedId(connections[0].id);
  }, [connections, selectedId]);

  useEffect(() => {
    shell.refreshIcons();
  }, [shell, view, selectedId, connections]);

  const renderOverview = () => (
    <>
      <section className="hero external-hero">
        <div className="hero-top">
          <span className={`ready-chip ${warning ? "warn" : "ok"}`}><i data-lucide="plug-zap" />外部连接 · {connections.length}</span>
          <span className="hero-time">MCP / tools / app connections / IM transports</span>
        </div>
        <h1>外部连接只暴露能力和健康证据，不把凭据带进浏览器。</h1>
        <p className="hero-sub">这里聚合 MCP、Skills、Gateway App Connections、IM 平台传输和本地 HTTP bridge。新增连接、测试连接、删除连接和 OAuth 更新都必须进入对应主域确认流。</p>
        <div className="hero-stats external-stats">
          <Metric icon="plug-zap" label="连接" value={connections.length} sub={`${healthy} healthy · ${warning} attention`} />
          <Metric icon="wrench" label="工具能力" value={readySkills} sub={`${numberAt(recordAt(skills.data, ["counts"]), ["needsSetup"])} need setup`} />
          <Metric icon="route" label="App Connections" value={listAt(appConnections.data, ["connections"]).length} sub="Gateway-owned apply flow" />
          <Metric icon="radio-tower" label="IM Transports" value={numberAt(recordAt(channelStatus.data, ["runtime"]), ["platformBindings"])} sub={`${numberAt(recordAt(channelStatus.data, ["runtime"]), ["agentRuns"])} agent runs`} />
        </div>
      </section>
      <div className="external-overview-grid">
        <section className="panel external-panel">
          <div className="panel-head"><div className="htitle"><h3>能力摘要</h3><span className="sub">按主产品域归属展示。</span></div><StatusTag value={`${connections.length} connections`} /></div>
          <div className="panel-body external-tile-grid">
            <QueryNotice query={config} label="Config" />
            <QueryNotice query={skills} label="Skills" />
            <ExternalTile icon="plug-zap" title="MCP command" value={textAt(config.data, ["commands", "mcp"], "false")} sub="MCP servers stay server-side" status={textAt(config.data, ["commands", "mcp"], "false")} />
            <ExternalTile icon="wrench" title="Ready skills" value={readySkills} sub={`${numberAt(recordAt(skills.data, ["counts"]), ["total"])} total indexed`} status="ready" />
            <ExternalTile icon="route" title="Gateway apps" value={listAt(appConnections.data, ["connections"]).length} sub="Codex / Claude / OpenCode / OpenClaw" status="configured" />
            <ExternalTile icon="radio-tower" title="Messaging" value={numberAt(recordAt(channelStatus.data, ["runtime"]), ["platformBindings"])} sub="platform account bindings" status={textAt(recordAt(channelStatus.data, ["runtime"]), ["reachable"], "unknown")} />
          </div>
        </section>
        <section className="panel external-panel">
          <div className="panel-head"><div className="htitle"><h3>安全边界</h3><span className="sub">本页只读，不执行连接动作。</span></div><StatusTag value="read-only" /></div>
          <div className="panel-body external-boundary-list">
            <div className="platform-boundary">MCP server、OAuth、App Connection apply/rollback、IM transport smoke 都可能触发外部网络或写配置，必须回到对应主域确认流。</div>
            <ExternalTile icon="key-round" title="Secrets" value="masked" sub="browser receives summaries only" status="guarded" />
            <ExternalTile icon="shield-check" title="Ownership" value="domain" sub="Gateway / IM / Platform own writes" status="guarded" />
          </div>
        </section>
      </div>
    </>
  );

  const renderConnections = () => (
    <div className="external-shell">
      <section className="panel external-list-panel">
        <div className="panel-head"><div className="htitle"><h3>连接 / 来源</h3><span className="sub">真实 API 聚合，不创建新连接。</span></div><StatusTag value={`${connections.length} rows`} /></div>
        <div className="panel-body external-table">
          <QueryNotice query={appConnections} label="App Connections" />
          <QueryNotice query={channelStatus} label="Channel status" />
          {connections.map((item) => <ExternalRow key={item.id} item={item} selected={selected?.id === item.id} onSelect={() => setSelectedId(item.id)} />)}
        </div>
      </section>
      <aside className="panel external-detail-panel">
        <div className="panel-head"><div className="htitle"><h3>详情</h3><span className="sub">连接证据和归属边界。</span></div>{selected ? <StatusTag value={selected.status} /> : null}</div>
        <div className="panel-body external-detail">
          {selected ? (
            <>
              <div className="external-detail-title"><span className="rico r-primary"><i data-lucide={selected.icon} /></span><span><strong>{selected.title}</strong><small>{selected.source} · {selected.kind}</small></span></div>
              <div className="metric-row external-metrics"><div className="m"><span>状态</span><strong>{selected.status}</strong></div><div className="m"><span>能力</span><strong>{selected.count}</strong></div></div>
              <div className="platform-boundary">{selected.detail}</div>
              <div><div className="section-label">证据</div><div className="logbox external-log">{selected.evidence.join("\n")}</div></div>
            </>
          ) : <div className="statebox empty"><span className="si"><i data-lucide="plug-zap" /></span><strong>暂无连接</strong><span>当前 API 没有返回外部连接证据。</span></div>}
        </div>
      </aside>
    </div>
  );

  const renderCapabilities = () => {
    const skillRows = listAt(skills.data, ["skills"]).map(asRecord);
    return (
      <section className="panel external-panel">
        <div className="panel-head"><div className="htitle"><h3>工具能力</h3><span className="sub">Skills 目录摘要；安装/启停仍归平台或 OpenClaw。</span></div><StatusTag value={`${readySkills} ready`} /></div>
        <div className="panel-body external-table">
          <QueryNotice query={skills} label="Skills" />
          {skillRows.slice(0, 18).map((skill) => (
            <div key={textAt(skill, ["slug"], "skill")} className="route-row external-static-row">
              <span className="rico r-primary"><i data-lucide="wrench" /></span>
              <span className="route-copy"><strong>{textAt(skill, ["name", "slug"], "skill")}</strong><span>{textAt(skill, ["description"], textAt(skill, ["sourceCategory"], "-"))}</span></span>
              <StatusTag value={textAt(skill, ["status"], "unknown")} />
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderAuth = () => (
    <section className="panel external-panel">
      <div className="panel-head"><div className="htitle"><h3>授权边界</h3><span className="sub">凭据只展示风险摘要，不展示明文。</span></div><StatusTag value="masked" /></div>
      <div className="panel-body external-auth-grid">
        <ExternalTile icon="key-round" title="Skill API keys" value={numberAt(recordAt(skills.data, ["counts"]), ["configured"])} sub="configured skill entries" status="masked" />
        <ExternalTile icon="route" title="Gateway client configs" value={listAt(appConnections.data, ["connections"]).filter((item) => asRecord(item).configured === true).length} sub="configured app targets" status="server-owned" />
        <ExternalTile icon="radio-tower" title="IM bot identity" value={numberAt(recordAt(channelStatus.data, ["runtime"]), ["feishuConnections"])} sub="Feishu connections" status="server-owned" />
        <ExternalTile icon="server" title="HTTP bridge" value={textAt(diagnostics.data, ["config", "transport", "preferredMode"], "-")} sub={textAt(diagnostics.data, ["config", "gatewayControlUiBasePath"], "-")} status="local" />
        <div className="platform-boundary external-auth-note">如果后续要开放 OAuth 刷新、连接测试、MCP server 增删或 secret 迁移，必须先做后端确认流：掩码预览、影响范围、失败 envelope、回滚/撤销路径和审计记录。</div>
      </div>
    </section>
  );

  return (
    <div id="stage" className="page-stage" role="main" aria-live="polite" tabIndex={-1}>
      <div className="wrap external-page">
        <div className="page-head">
          <div className="htitle">
            <h2>外部连接</h2>
            <p>MCP、工具能力、第三方 App Connection 和消息平台传输的只读证据面。</p>
          </div>
          <div className="toolbar">
            <button className="btn-ghost" onClick={() => {
              void config.refetch(); void skills.refetch(); void appConnections.refetch(); void channelStatus.refetch(); void diagnostics.refetch();
            }}><i data-lucide="refresh-cw" />刷新</button>
          </div>
        </div>

        <div className="segbar external-viewbar" role="tablist" aria-label="外部连接视图">
          {[
            ["overview", "概览"],
            ["connections", "连接"],
            ["capabilities", "能力"],
            ["auth", "授权边界"],
          ].map(([id, label]) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id as ExternalView)} role="tab" aria-selected={view === id}>{label}</button>
          ))}
        </div>

        {view === "overview" ? renderOverview() : null}
        {view === "connections" ? renderConnections() : null}
        {view === "capabilities" ? renderCapabilities() : null}
        {view === "auth" ? renderAuth() : null}
      </div>
    </div>
  );
}
