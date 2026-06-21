import * as React from "react";
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { apiJson } from "./api-client";
import { openClawPlatformSections } from "./route-manifest";
import { useShell } from "./shell-context";

type AnyRecord = Record<string, unknown>;

const adminQueries = {
  health: "/api/system/health",
  diagnostics: "/api/system/diagnostics",
  bootstrap: "/api/system/bootstrap",
  runtime: "/api/system/runtime-summary",
  config: "/api/config",
  agents: "/api/agents",
  channels: "/api/channels",
  skills: "/api/skills",
  gatewayService: "/api/model-gateway/daemon-service",
  connectorsService: "/api/channel-connectors/daemon/service",
  recoveryStatus: "/api/openclaw-recovery/status",
  recoveryEvents: "/api/openclaw-recovery/events?limit=8",
  recoveryBackups: "/api/openclaw-recovery/backups?page=1&pageSize=6",
} as const;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function listAt(value: unknown, keys: string[]): unknown[] {
  const record = asRecord(value);
  for (const key of keys) {
    const direct = record[key];
    if (Array.isArray(direct)) return direct;
    const nested = asRecord(direct);
    for (const nestedKey of keys) {
      if (Array.isArray(nested[nestedKey])) return nested[nestedKey] as unknown[];
    }
  }
  return [];
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

function countAt(value: unknown, keys: string[]): number {
  const list = listAt(value, keys);
  if (list.length) return list.length;
  const record = asRecord(value);
  for (const key of keys) {
    const direct = record[key];
    if (direct && typeof direct === "object" && !Array.isArray(direct)) return Object.keys(direct).length;
  }
  return 0;
}

function recordAt(value: unknown, path: string[]): AnyRecord {
  let current: unknown = value;
  for (const key of path) {
    current = asRecord(current)[key];
  }
  return asRecord(current);
}

function formatTime(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function jsonPreview(value: unknown, maxLength = 1400): string {
  const text = JSON.stringify(value ?? {}, null, 2);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function stateTone(value: unknown): "ok" | "warn" | "bad" | "info" {
  const text = String(value ?? "").toLowerCase();
  if (/(healthy|running|active|ok|valid|success|succeeded|online|true)/.test(text)) return "ok";
  if (/(failed|error|invalid|offline|false|stopped)/.test(text)) return "bad";
  if (/(degraded|warning|warn|stale|repairing|pending)/.test(text)) return "warn";
  return "info";
}

function StatusTag({ value }: { value: unknown }) {
  const tone = stateTone(value);
  return <span className={`tag ${tone === "bad" ? "bad" : tone === "warn" ? "warn" : tone === "ok" ? "ok" : "info"}`}>{String(value ?? "unknown")}</span>;
}

function QueryNotice({ query, label }: { query: { isLoading: boolean; isError: boolean; error: unknown }; label: string }) {
  if (query.isLoading) {
    return <div className="statebox"><span className="spinner" /><strong>{label} 加载中</strong></div>;
  }
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

function RuntimeRow({ icon, title, sub, status }: { icon: string; title: string; sub: string; status: unknown }) {
  return (
    <div className="route-row openclaw-row">
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <span className="route-copy"><strong>{title}</strong><span>{sub}</span></span>
      <StatusTag value={status} />
    </div>
  );
}

function SummaryTile({ icon, title, value, sub, status }: { icon: string; title: string; value: React.ReactNode; sub: React.ReactNode; status?: unknown }) {
  return (
    <div className="openclaw-tile">
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <div>
        <strong>{title}</strong>
        <span>{sub}</span>
      </div>
      <div className="openclaw-tile-value">
        <b>{value}</b>
        {status !== undefined ? <StatusTag value={status} /> : null}
      </div>
    </div>
  );
}

function GuardedAction({ icon, title, sub, status, onClick, disabled = false, busy = false }: { icon: string; title: string; sub: string; status: string; onClick?: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <div className={`openclaw-action ${disabled ? "is-locked" : ""}`}>
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <span className="route-copy"><strong>{title}</strong><span>{sub}</span></span>
      <StatusTag value={status} />
      <button className={disabled ? "btn-ghost btn-sm" : "btn-primary btn-sm"} onClick={onClick} disabled={disabled || busy}>
        <i data-lucide={disabled ? "lock" : "play"} />
        {busy ? "运行中" : disabled ? "待确认流" : "执行"}
      </button>
    </div>
  );
}

function UnknownList({ items, empty, icon = "box" }: { items: unknown[]; empty: string; icon?: string }) {
  if (!items.length) {
    return <div className="statebox empty"><span className="si"><i data-lucide={icon} /></span><strong>{empty}</strong><span>后端没有返回可展示条目。</span></div>;
  }
  return (
    <div className="openclaw-list">
      {items.slice(0, 12).map((item, index) => {
        const record = asRecord(item);
        const title = textAt(record, ["name", "id", "slug", "type", "label"], `item-${index + 1}`);
        const sub = textAt(record, ["description", "summary", "status", "version", "path"], jsonPreview(record, 120));
        return <RuntimeRow key={`${title}-${index}`} icon={icon} title={title} sub={sub} status={record.status || record.enabled || "loaded"} />;
      })}
    </div>
  );
}

export function OpenClawPlatformPage() {
  const shell = useShell();
  const navigate = useNavigate();
  const params = useParams();
  const queryClient = useQueryClient();
  const requestedSection = params.section || "overview";
  const selected = openClawPlatformSections.some((section) => section.path === requestedSection)
    ? requestedSection
    : "overview";

  const health = useQuery({ queryKey: ["platform-openclaw", "health"], queryFn: () => apiJson(adminQueries.health), retry: false });
  const diagnostics = useQuery({ queryKey: ["platform-openclaw", "diagnostics"], queryFn: () => apiJson(adminQueries.diagnostics), retry: false });
  const bootstrap = useQuery({ queryKey: ["platform-openclaw", "bootstrap"], queryFn: () => apiJson(adminQueries.bootstrap), retry: false });
  const runtime = useQuery({ queryKey: ["platform-openclaw", "runtime"], queryFn: () => apiJson(adminQueries.runtime), retry: false });
  const config = useQuery({ queryKey: ["platform-openclaw", "config"], queryFn: () => apiJson(adminQueries.config), retry: false });
  const agents = useQuery({ queryKey: ["platform-openclaw", "agents"], queryFn: () => apiJson(adminQueries.agents), retry: false });
  const channels = useQuery({ queryKey: ["platform-openclaw", "channels"], queryFn: () => apiJson(adminQueries.channels), retry: false });
  const skills = useQuery({ queryKey: ["platform-openclaw", "skills"], queryFn: () => apiJson(adminQueries.skills), retry: false });
  const gatewayService = useQuery({ queryKey: ["platform-openclaw", "gateway-service"], queryFn: () => apiJson(adminQueries.gatewayService), retry: false });
  const connectorsService = useQuery({ queryKey: ["platform-openclaw", "connectors-service"], queryFn: () => apiJson(adminQueries.connectorsService), retry: false });
  const recoveryStatus = useQuery({ queryKey: ["platform-openclaw", "recovery-status"], queryFn: () => apiJson(adminQueries.recoveryStatus), retry: false });
  const recoveryEvents = useQuery({ queryKey: ["platform-openclaw", "recovery-events"], queryFn: () => apiJson(adminQueries.recoveryEvents), retry: false });
  const recoveryBackups = useQuery({ queryKey: ["platform-openclaw", "recovery-backups"], queryFn: () => apiJson(adminQueries.recoveryBackups), retry: false });

  const probeRecovery = useMutation({
    mutationFn: () => apiJson("/api/openclaw-recovery/run", {
      method: "POST",
      body: {
        action: "probe",
        trigger: "manual",
        reason: "platform-openclaw manual probe",
      },
    }),
    onSuccess: () => {
      shell.toast("OpenClaw 运行时探测完成", "ok");
      void queryClient.invalidateQueries({ queryKey: ["platform-openclaw"] });
    },
    onError: (error) => {
      shell.toast(error instanceof Error ? error.message : "探测失败", "warn");
    },
  });

  useEffect(() => {
    shell.refreshIcons();
  }, [selected, shell, health.data, diagnostics.data, bootstrap.data, runtime.data, config.data, agents.data, channels.data, skills.data, gatewayService.data, connectorsService.data, recoveryStatus.data, recoveryEvents.data, recoveryBackups.data]);

  const metrics = useMemo(() => ({
    agents: countAt(agents.data, ["agents", "items", "list"]),
    channels: countAt(channels.data, ["channels", "catalog", "items", "configured"]),
    skills: countAt(skills.data, ["skills", "items", "installed"]),
    backups: countAt(recoveryBackups.data, ["backups", "items"]),
  }), [agents.data, channels.data, recoveryBackups.data, skills.data]);

  const runtimeState = textAt(recoveryStatus.data, ["state", "status"], textAt(health.data, ["ok"], "unknown"));
  const healthVersion = textAt(health.data, ["version"], "unknown");
  const configSummary = useMemo(() => {
    const configData = asRecord(config.data);
    const agentsDefaults = recordAt(config.data, ["agents", "defaults"]);
    const toolsExec = recordAt(config.data, ["tools", "exec"]);
    const pluginsEntries = recordAt(config.data, ["plugins", "entries"]);
    const channels = recordAt(config.data, ["channels"]);
    return {
      topLevel: Object.keys(configData).length,
      agentDefaultKeys: Object.keys(agentsDefaults).length,
      toolsExecKeys: Object.keys(toolsExec).length,
      pluginEntries: Object.keys(pluginsEntries).length,
      channelGroups: Object.keys(channels).length,
      toolsSecurity: textAt(toolsExec, ["security"], "未返回"),
      toolsAsk: textAt(toolsExec, ["ask"], "未返回"),
    };
  }, [config.data]);

  const renderOverview = () => (
    <>
      <section className="hero openclaw-hero">
        <div className="hero-top">
          <span className={`ready-chip ${stateTone(runtimeState) === "ok" ? "ok" : "warn"}`}><i data-lucide="server" />OpenClaw 平台</span>
          <span className="hero-time">Tracevane {healthVersion} · existing API only</span>
        </div>
        <h1>OpenClaw 管理只放在运行时子域，主工作流保持任务优先。</h1>
        <p className="hero-sub">这里承载配置、扩展、Agent/渠道、服务和自愈诊断。通用 OpenClaw CRUD 不再分散到主导航里。</p>
        <div className="hero-stats openclaw-stats">
          <Metric icon="bot" label="Agents" value={metrics.agents} sub="来自 /api/agents" />
          <Metric icon="radio-tower" label="Channels" value={metrics.channels} sub="来自 /api/channels" />
          <Metric icon="sparkles" label="Skills" value={metrics.skills} sub="来自 /api/skills" />
          <Metric icon="history" label="Backups" value={metrics.backups} sub="自愈备份" />
        </div>
      </section>
      <section className="panel openclaw-panel">
        <div className="panel-head"><div className="htitle"><h3>运行时读模型</h3><span className="sub">当前页面已经消费真实后端 API，失败会显式降级展示。</span></div><button className="btn-ghost btn-sm" onClick={() => probeRecovery.mutate()} disabled={probeRecovery.isPending}><i data-lucide="scan-search" />{probeRecovery.isPending ? "探测中" : "探测 OpenClaw"}</button></div>
        <div className="panel-body openclaw-status-grid">
          <RuntimeRow icon="heart-pulse" title="Tracevane API" sub={`version ${healthVersion}`} status={health.isError ? "error" : health.isLoading ? "loading" : "ok"} />
          <RuntimeRow icon="file-cog" title="OpenClaw 配置" sub={`${Object.keys(asRecord(config.data)).length} 个顶层区块`} status={config.isError ? "error" : "loaded"} />
          <RuntimeRow icon="wrench" title="自愈守护" sub={textAt(recoveryStatus.data, ["serviceName", "endpoint"], "status endpoint")} status={runtimeState} />
          <RuntimeRow icon="terminal" title="Runtime Summary" sub={textAt(runtime.data, ["checkedAt", "updatedAt"], "runtime summary")} status={runtime.isError ? "error" : "loaded"} />
        </div>
      </section>
    </>
  );

  const renderConfig = () => (
    <section className="panel openclaw-panel">
      <div className="panel-head"><div className="htitle"><h3>OpenClaw 配置</h3><span className="sub">配置页先给结构化摘要和安全审计入口；写入必须走 schema 校验、预览和回滚证据。</span></div><StatusTag value={config.isError ? "error" : "read-only"} /></div>
      <div className="panel-body openclaw-config-body">
        <QueryNotice query={config} label="配置" />
        {!config.isLoading && !config.isError ? (
          <>
            <div className="openclaw-tile-grid">
              <SummaryTile icon="file-cog" title="顶层配置区块" value={configSummary.topLevel} sub="OpenClaw config summary" status="read-only" />
              <SummaryTile icon="bot" title="Agent defaults" value={configSummary.agentDefaultKeys} sub="只展示 key 数量，不在这里直接写入" />
              <SummaryTile icon="terminal" title="工具执行策略" value={configSummary.toolsExecKeys} sub={`security=${configSummary.toolsSecurity} · ask=${configSummary.toolsAsk}`} />
              <SummaryTile icon="sparkles" title="插件条目" value={configSummary.pluginEntries} sub="OpenClaw generic plugin CRUD 继续委托 Control UI" />
              <SummaryTile icon="radio-tower" title="渠道配置组" value={configSummary.channelGroups} sub="Tracevane IM 任务流仍在 IM 渠道页" />
            </div>
            <div className="openclaw-safety-note">
              <strong>写入策略</strong>
              <span>后续如果开放编辑，必须先读取 OpenClaw 当前 schema，展示 diff、备份路径和回滚动作；本页不会直接保存未知字段。</span>
            </div>
            <div className="openclaw-keygrid">
              {Object.keys(asRecord(config.data)).slice(0, 16).map((key) => <span key={key} className="chip">{key}</span>)}
            </div>
            <pre className="logbox openclaw-json">{jsonPreview(config.data)}</pre>
          </>
        ) : null}
      </div>
    </section>
  );

  const renderExtensions = () => {
    const skillItems = listAt(skills.data, ["skills", "items", "installed"]);
    return (
      <section className="panel openclaw-panel">
        <div className="panel-head"><div className="htitle"><h3>扩展 / Skills</h3><span className="sub">旧插件管理不回主导航；OpenClaw 相关扩展集中在这里。</span></div><button className="btn-ghost btn-sm" onClick={() => navigate("/platforms/openclaw/config")}><i data-lucide="file-cog" />配置</button></div>
        <div className="panel-body">
          <QueryNotice query={skills} label="扩展" />
          {!skills.isLoading && !skills.isError ? <UnknownList items={skillItems} empty="暂无扩展条目" icon="sparkles" /> : null}
        </div>
      </section>
    );
  };

  const renderAgentsChannels = () => {
    const agentItems = listAt(agents.data, ["agents", "items", "list"]);
    const channelItems = listAt(channels.data, ["channels", "catalog", "items", "configured"]);
    return (
      <div className="openclaw-stack">
        <section className="panel openclaw-panel">
          <div className="panel-head"><div className="htitle"><h3>Agents</h3><span className="sub">旧 Agent 管理收束为 OpenClaw 平台子页。</span></div><StatusTag value={agents.isError ? "error" : `${agentItems.length} items`} /></div>
          <div className="panel-body"><QueryNotice query={agents} label="Agents" />{!agents.isLoading && !agents.isError ? <UnknownList items={agentItems} empty="暂无 Agent" icon="bot" /> : null}</div>
        </section>
        <section className="panel openclaw-panel">
          <div className="panel-head"><div className="htitle"><h3>Channels</h3><span className="sub">通用渠道配置在这里，Tracevane IM 任务流仍放在 IM 渠道页。</span></div><StatusTag value={channels.isError ? "error" : `${channelItems.length} items`} /></div>
          <div className="panel-body"><QueryNotice query={channels} label="Channels" />{!channels.isLoading && !channels.isError ? <UnknownList items={channelItems} empty="暂无 Channel" icon="radio-tower" /> : null}</div>
        </section>
      </div>
    );
  };

  const renderServices = () => (
    <div className="openclaw-stack">
      <section className="panel openclaw-panel">
        <div className="panel-head"><div className="htitle"><h3>服务</h3><span className="sub">只展示 Tracevane 管理的服务状态；重启等动作保留到确认流。</span></div></div>
        <div className="panel-body openclaw-status-grid">
          <RuntimeRow icon="route" title="Gateway daemon" sub={textAt(gatewayService.data, ["serviceName", "unitName", "daemonEntry"], "model gateway daemon")} status={textAt(gatewayService.data, ["state", "status"], gatewayService.isError ? "error" : "loaded")} />
          <RuntimeRow icon="radio-tower" title="Channel Connectors daemon" sub={textAt(connectorsService.data, ["serviceName", "unitName", "daemonEntry"], "channel connectors daemon")} status={textAt(connectorsService.data, ["state", "status"], connectorsService.isError ? "error" : "loaded")} />
          <RuntimeRow icon="heart-pulse" title="Recovery daemon" sub={textAt(recoveryStatus.data, ["serviceName", "endpoint"], "recovery daemon")} status={runtimeState} />
        </div>
      </section>
      <section className="panel openclaw-panel">
        <div className="panel-head"><div className="htitle"><h3>Runtime Summary</h3><span className="sub">系统聚合摘要原样展示，后续按字段拆成二级详情。</span></div></div>
        <div className="panel-body"><QueryNotice query={runtime} label="Runtime Summary" />{!runtime.isLoading && !runtime.isError ? <pre className="logbox openclaw-json">{jsonPreview(runtime.data)}</pre> : null}</div>
      </section>
    </div>
  );

  const renderRecovery = () => {
    const events = listAt(recoveryEvents.data, ["events", "items"]);
    const backups = listAt(recoveryBackups.data, ["backups", "items"]);
    const policy = asRecord(asRecord(recoveryStatus.data).policy);
    const daemon = asRecord(asRecord(recoveryStatus.data).daemon);
    const probe = asRecord(asRecord(recoveryStatus.data).probe);
    const lastRepair = asRecord(asRecord(recoveryStatus.data).lastRepair);
    return (
      <div className="openclaw-stack">
        <section className="panel openclaw-panel">
          <div className="panel-head"><div className="htitle"><h3>Doctor / Recovery</h3><span className="sub">probe 是安全读动作；repair/config-repair 仍需要明确确认。</span></div><button className="btn-primary btn-sm" onClick={() => probeRecovery.mutate()} disabled={probeRecovery.isPending}><i data-lucide="scan-search" />{probeRecovery.isPending ? "探测中" : "运行 probe"}</button></div>
          <div className="panel-body openclaw-status-grid">
            <RuntimeRow icon="heart-pulse" title="Recovery state" sub={textAt(recoveryStatus.data, ["endpoint", "checkedAt", "updatedAt"], "status")} status={runtimeState} />
            <RuntimeRow icon="history" title="Backups" sub={`${backups.length} recent backups`} status={backups.length ? "available" : "empty"} />
            <RuntimeRow icon="scroll-text" title="Events" sub={`${events.length} recent events`} status={events.length ? "available" : "empty"} />
          </div>
        </section>
        <section className="panel openclaw-panel">
          <div className="panel-head"><div className="htitle"><h3>安全动作</h3><span className="sub">只把确定无破坏的 probe 作为直接动作；repair / restore 需要确认流、diff 和回滚证据。</span></div><StatusTag value="guarded" /></div>
          <div className="panel-body openclaw-action-list">
            <GuardedAction icon="scan-search" title="Probe" sub="轻量检测 Gateway 与 Recovery 状态，不改写配置。" status="safe" onClick={() => probeRecovery.mutate()} busy={probeRecovery.isPending} />
            <GuardedAction icon="file-warning" title="Config repair" sub="会清理不兼容字段；必须先展示 schema、diff 和备份路径。" status="locked" disabled />
            <GuardedAction icon="wrench" title="Full repair" sub="可能重装 CLI、修复服务并重启 Gateway；需要任务空闲检查和人工确认。" status="locked" disabled />
            <GuardedAction icon="rotate-ccw" title="Restore backup" sub="会回滚运行时配置；需要选择备份、预览影响并确认。" status="locked" disabled />
          </div>
        </section>
        <section className="panel openclaw-panel">
          <div className="panel-head"><div className="htitle"><h3>守护策略</h3><span className="sub">当前 Recovery daemon 返回的策略和最后一次修复摘要。</span></div></div>
          <div className="panel-body openclaw-tile-grid">
            <SummaryTile icon="activity" title="Heartbeat" value={formatTime(daemon.heartbeatAt)} sub={`pid=${textAt(daemon, ["pid"], "-")}`} status={runtimeState} />
            <SummaryTile icon="timer" title="下一次 probe" value={formatTime(probe.nextCheckAt)} sub={`timeout=${textAt(policy, ["probeTimeoutMs"], "-")}ms`} />
            <SummaryTile icon="shield-check" title="自动修复阈值" value={`${textAt(policy, ["failureThresholdMs"], "-")}ms`} sub={`cooldown=${textAt(policy, ["repairCooldownMs"], "-")}ms`} />
            <SummaryTile icon="history" title="最近修复" value={textAt(lastRepair, ["finishedAt"], "none")} sub={textAt(lastRepair, ["error"], "没有最近修复错误")} status={lastRepair.ok ?? "idle"} />
          </div>
        </section>
        <section className="panel openclaw-panel">
          <div className="panel-head"><div className="htitle"><h3>最近事件</h3><span className="sub">来自 /api/openclaw-recovery/events</span></div></div>
          <div className="panel-body"><QueryNotice query={recoveryEvents} label="Recovery events" />{!recoveryEvents.isLoading && !recoveryEvents.isError ? <UnknownList items={events} empty="暂无事件" icon="scroll-text" /> : null}</div>
        </section>
      </div>
    );
  };

  const sectionContent = {
    overview: renderOverview,
    config: renderConfig,
    extensions: renderExtensions,
    "agents-channels": renderAgentsChannels,
    services: renderServices,
    recovery: renderRecovery,
  }[selected] || renderOverview;

  return (
    <div id="stage" className="page-stage" role="main" aria-live="polite" tabIndex={-1}>
      <div className="wrap platform-openclaw">
        <div className="page-head">
          <div className="htitle">
            <h2>OpenClaw 平台管理</h2>
            <p>OpenClaw 支撑能力作为二级子域管理；Tracevane 主导航继续服务 AI Agent 任务流。</p>
          </div>
          <div className="toolbar">
            <button className="btn-ghost" onClick={() => void queryClient.invalidateQueries({ queryKey: ["platform-openclaw"] })}><i data-lucide="refresh-cw" />刷新</button>
            <button className="btn-primary" onClick={() => navigate("/recovery")}><i data-lucide="heart-pulse" />自愈守护</button>
          </div>
        </div>
        <div className="viewbar openclaw-subnav" role="tablist" aria-label="OpenClaw 平台二级导航">
          {openClawPlatformSections.map((section) => (
            <button
              key={section.path}
              className={section.path === selected ? "on" : ""}
              role="tab"
              aria-selected={section.path === selected}
              onClick={() => navigate(section.path === "overview" ? "/platforms/openclaw" : `/platforms/openclaw/${section.path}`)}
            >
              <i data-lucide={section.icon} />
              {section.label}
            </button>
          ))}
        </div>
        {sectionContent()}
      </div>
    </div>
  );
}
