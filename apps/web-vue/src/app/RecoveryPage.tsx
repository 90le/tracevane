import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "./api-client";
import { useShell } from "./shell-context";

type AnyRecord = Record<string, unknown>;
type RecoveryView = "overview" | "events" | "backups" | "guardrails";

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

function boolText(value: unknown): string {
  return value === true ? "enabled" : value === false ? "disabled" : "unknown";
}

function formatTime(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDuration(ms: unknown): string {
  const value = typeof ms === "number" && Number.isFinite(ms) ? ms : Number(ms || 0);
  if (!Number.isFinite(value) || value <= 0) return "0s";
  if (value >= 60_000) return `${Math.round(value / 60_000)}m`;
  if (value >= 1000) return `${Math.round(value / 1000)}s`;
  return `${Math.round(value)}ms`;
}

function formatBytes(value: unknown): string {
  const bytes = typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function stateTone(value: unknown): "ok" | "warn" | "bad" | "info" {
  const text = String(value ?? "").toLowerCase();
  if (/(healthy|running|active|ok|success|succeeded|reachable|enabled|true|installed|idle)/.test(text)) return "ok";
  if (/(failed|error|unreachable|missing|disabled|false|not-installed|stopped)/.test(text)) return "bad";
  if (/(degraded|warning|warn|repairing|pending|stale|cooldown|unknown)/.test(text)) return "warn";
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

function RecoveryTile({ icon, title, value, sub, status }: { icon: string; title: string; value: React.ReactNode; sub: React.ReactNode; status?: unknown }) {
  return (
    <div className="recovery-tile">
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <div><strong>{title}</strong><span>{sub}</span></div>
      <div className="recovery-tile-value">
        <b>{value}</b>
        {status !== undefined ? <StatusTag value={status} /> : null}
      </div>
    </div>
  );
}

function EvidenceRow({ icon, title, sub, status }: { icon: string; title: string; sub: string; status: unknown }) {
  return (
    <div className="route-row recovery-row">
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <span className="route-copy"><strong>{title}</strong><span>{sub}</span></span>
      <StatusTag value={status} />
    </div>
  );
}

function LockedAction({ icon, title, sub, status }: { icon: string; title: string; sub: string; status: string }) {
  return (
    <div className="recovery-action is-locked">
      <span className="rico r-primary"><i data-lucide={icon} /></span>
      <span className="route-copy"><strong>{title}</strong><span>{sub}</span></span>
      <StatusTag value={status} />
      <span className="btn-ghost btn-sm recovery-lock"><i data-lucide="lock" />待确认流</span>
    </div>
  );
}

export function RecoveryPage() {
  const shell = useShell();
  const [view, setView] = useState<RecoveryView>("overview");

  const status = useQuery({ queryKey: ["recovery", "status"], queryFn: () => apiJson("/api/openclaw-recovery/status"), retry: false });
  const events = useQuery({ queryKey: ["recovery", "events"], queryFn: () => apiJson("/api/openclaw-recovery/events?page=1&pageSize=20"), retry: false });
  const backups = useQuery({ queryKey: ["recovery", "backups"], queryFn: () => apiJson("/api/openclaw-recovery/backups?page=1&pageSize=8"), retry: false });
  const daemonService = useQuery({ queryKey: ["recovery", "daemon-service"], queryFn: () => apiJson("/api/openclaw-recovery/daemon-service"), retry: false });
  const systemHealth = useQuery({ queryKey: ["recovery", "system-health"], queryFn: () => apiJson("/api/system/health"), retry: false });

  useEffect(() => {
    shell.refreshIcons();
  }, [shell, view, status.data, events.data, backups.data, daemonService.data, systemHealth.data]);

  const probe = recordAt(status.data, ["probe"]);
  const daemon = recordAt(status.data, ["daemon"]);
  const policy = recordAt(status.data, ["policy"]);
  const monitor = recordAt(status.data, ["monitor"]);
  const repair = recordAt(status.data, ["repair"]);
  const service = Object.keys(asRecord(daemonService.data)).length ? asRecord(daemonService.data) : recordAt(status.data, ["service"]);
  const lastRepair = asRecord(asRecord(status.data).lastRepair);
  const eventRows = listAt(events.data, ["events"]).map(asRecord);
  const backupRows = listAt(backups.data, ["backups"]).map(asRecord);
  const notes = listAt(status.data, ["notes"]).map(String);
  const backupPagination = recordAt(backups.data, ["pagination"]);
  const eventPagination = recordAt(events.data, ["pagination"]);

  const statusText = textAt(status.data, ["status"], "unknown");
  const repairStatus = textAt(repair, ["status"], textAt(lastRepair, ["ok"], "idle"));
  const daemonState = textAt(service, ["activeState"], textAt(daemon, ["pid"], "unknown"));
  const failureDuration = numberAt(probe, ["failureDurationMs"]);
  const guardScore = useMemo(() => {
    const pieces = [
      policy.enabled === true,
      policy.allowGatewayServiceRepair === true,
      policy.allowCliReinstall === true,
      policy.allowTracevaneWebRebuild === true,
      service.installed === true,
    ];
    return pieces.filter(Boolean).length;
  }, [policy, service]);

  const renderOverview = () => (
    <>
      <section className="hero recovery-hero">
        <div className="hero-top">
          <span className={`ready-chip ${stateTone(statusText) === "ok" ? "ok" : "warn"}`}><i data-lucide="heart-pulse" />System Guard · {statusText}</span>
          <span className="hero-time">checked {formatTime(textAt(status.data, ["checkedAt"], ""))}</span>
        </div>
        <h1>自愈守护只展示能支撑任务恢复的证据。</h1>
        <p className="hero-sub">这里聚合 Recovery 守护、Gateway 探测、备份和策略证据。修复、回滚、服务重启不会直接执行，后续必须进入确认、空闲检查、备份和回滚证据流。</p>
        <div className="hero-stats recovery-stats">
          <Metric icon="activity" label="Gateway probe" value={probe.gatewayReachable === true ? "ok" : probe.gatewayReachable === false ? "fail" : "unknown"} sub={`next ${formatTime(textAt(probe, ["nextCheckAt"], ""))}`} />
          <Metric icon="server" label="Daemon" value={textAt(daemon, ["pid"], "-")} sub={daemonState} />
          <Metric icon="history" label="Backups" value={numberAt(backupPagination, ["totalEntries"], backupRows.length)} sub={`${formatBytes(backupRows.reduce((sum, item) => sum + numberAt(item, ["sizeBytes"]), 0))} shown`} />
          <Metric icon="shield-check" label="Guardrails" value={`${guardScore}/5`} sub={`${formatDuration(numberAt(policy, ["repairCooldownMs"]))} cooldown`} />
        </div>
      </section>

      <div className="recovery-overview-grid">
        <section className="panel recovery-panel">
          <div className="panel-head"><div className="htitle"><h3>恢复链路</h3><span className="sub">任务连续性相关状态，而不是 OpenClaw 通用管理。</span></div><StatusTag value={statusText} /></div>
          <div className="panel-body recovery-tile-grid">
            <QueryNotice query={status} label="Recovery status" />
            <RecoveryTile icon="wifi" title="Gateway reachability" value={probe.gatewayReachable === true ? "reachable" : probe.gatewayReachable === false ? "unreachable" : "unknown"} sub={`${formatDuration(failureDuration)} failure window`} status={probe.gatewayReachable === true ? "ok" : probe.gatewayReachable === false ? "failed" : "unknown"} />
            <RecoveryTile icon="refresh-cw" title="Repair state" value={repairStatus} sub={`last ${formatTime(textAt(lastRepair, ["finishedAt"], ""))}`} status={repairStatus} />
            <RecoveryTile icon="server-cog" title="Recovery service" value={textAt(service, ["serviceName"], "tracevane-recovery.service")} sub={`${textAt(service, ["supervisor"], "unknown")} · ${textAt(service, ["enabledState"], "unknown")}`} status={daemonState} />
            <RecoveryTile icon="monitor-check" title="System runtime" value={textAt(systemHealth.data, ["serviceState", "gateway"], "unknown")} sub={`${textAt(systemHealth.data, ["platform"], "-")}/${textAt(systemHealth.data, ["arch"], "-")}`} status={textAt(systemHealth.data, ["gateway"], "unknown")} />
          </div>
        </section>

        <section className="panel recovery-panel">
          <div className="panel-head"><div className="htitle"><h3>策略边界</h3><span className="sub">当前只读展示，不直接触发修复。</span></div><StatusTag value={boolText(policy.enabled)} /></div>
          <div className="panel-body recovery-policy-list">
            <EvidenceRow icon="clock" title="Probe cadence" sub={`${formatDuration(numberAt(policy, ["checkIntervalMs"]))} interval · ${formatDuration(numberAt(policy, ["probeTimeoutMs"]))} timeout`} status={boolText(policy.enabled)} />
            <EvidenceRow icon="wrench" title="Gateway service repair" sub={`${formatDuration(numberAt(policy, ["gatewayServiceRepairTimeoutMs"]))} timeout`} status={boolText(policy.allowGatewayServiceRepair)} />
            <EvidenceRow icon="package-check" title="CLI package recovery" sub={`${formatDuration(numberAt(policy, ["cliReinstallTimeoutMs"]))} timeout`} status={boolText(policy.allowCliReinstall)} />
            <EvidenceRow icon="archive-restore" title="Backup retention" sub={`${numberAt(policy, ["maxBackups"])} config backups`} status={backupRows.length > 0 ? "ready" : "empty"} />
          </div>
        </section>
      </div>
    </>
  );

  const renderEvents = () => (
    <section className="panel recovery-panel">
      <div className="panel-head"><div className="htitle"><h3>守护事件</h3><span className="sub">最近 Recovery 事件，按后端时间排序。</span></div><StatusTag value={`${numberAt(eventPagination, ["totalEntries"], eventRows.length)} events`} /></div>
      <div className="panel-body recovery-list">
        <QueryNotice query={events} label="Recovery events" />
        {!events.isLoading && !events.isError && eventRows.map((event, index) => (
          <EvidenceRow
            key={`${textAt(event, ["id"], "event")}-${index}`}
            icon={stateTone(textAt(event, ["severity"], "")) === "bad" ? "circle-alert" : "activity"}
            title={textAt(event, ["title", "kind"], "Recovery event")}
            sub={`${textAt(event, ["summary"], "-")} · ${formatTime(textAt(event, ["occurredAt"], ""))}`}
            status={textAt(event, ["severity", "status"], "info")}
          />
        ))}
        {!events.isLoading && !events.isError && eventRows.length === 0 ? <div className="statebox empty"><span className="si"><i data-lucide="activity" /></span><strong>暂无守护事件</strong><span>没有事件不代表不可用，继续以 status/probe/service 为准。</span></div> : null}
      </div>
    </section>
  );

  const renderBackups = () => (
    <section className="panel recovery-panel">
      <div className="panel-head"><div className="htitle"><h3>备份与回滚证据</h3><span className="sub">这里只展示备份；回滚必须先进入确认流。</span></div><StatusTag value={`${numberAt(backupPagination, ["totalEntries"], backupRows.length)} backups`} /></div>
      <div className="panel-body recovery-list">
        <QueryNotice query={backups} label="Recovery backups" />
        {!backups.isLoading && !backups.isError && backupRows.map((backup, index) => (
          <EvidenceRow
            key={`${textAt(backup, ["id"], "backup")}-${index}`}
            icon="archive"
            title={textAt(backup, ["fileName", "id"], "backup")}
            sub={`${textAt(backup, ["reason"], "backup")} · ${formatBytes(numberAt(backup, ["sizeBytes"]))} · ${formatTime(textAt(backup, ["createdAt"], ""))}`}
            status="read-only"
          />
        ))}
        {!backups.isLoading && !backups.isError && backupRows.length === 0 ? <div className="statebox empty"><span className="si"><i data-lucide="archive" /></span><strong>暂无备份</strong><span>没有可回滚备份时，修复动作不能直接放开。</span></div> : null}
      </div>
    </section>
  );

  const renderGuardrails = () => (
    <div className="recovery-guard-grid">
      <section className="panel recovery-panel">
        <div className="panel-head"><div className="htitle"><h3>锁定动作矩阵</h3><span className="sub">避免任务未结束被误判结束，或任务结束后无限等待。</span></div><StatusTag value="read-only" /></div>
        <div className="panel-body recovery-action-list">
          <LockedAction icon="scan-search" title="Probe / diagnostics" sub="需要保留最近事件、探测时间和失败 envelope，避免静默失败。" status="locked" />
          <LockedAction icon="file-cog" title="Config repair" sub="需要 schema/diff 预览、备份路径、任务空闲证据和回滚计划。" status="locked" />
          <LockedAction icon="wrench" title="Full repair" sub="可能重装 CLI 或修复服务，必须先确认不会中断活跃 Agent。" status="locked" />
          <LockedAction icon="undo-2" title="Restore backup" sub="必须选择具体 backup id，并展示影响范围和恢复后校验结果。" status="locked" />
          <LockedAction icon="power" title="Service restart" sub="必须确认 Gateway/Channel/CLI Agent 当前没有活跃任务或可恢复会话。" status="locked" />
        </div>
      </section>
      <section className="panel recovery-panel">
        <div className="panel-head"><div className="htitle"><h3>判定风险</h3><span className="sub">自愈页面必须解释为什么暂时不执行。</span></div><StatusTag value="guarded" /></div>
        <div className="panel-body recovery-risk-list">
          <EvidenceRow icon="hourglass" title="任务仍在运行" sub="TUI 静止、子代理执行、长工具调用都不能等同失败。" status="must-check" />
          <EvidenceRow icon="check-check" title="任务实际已结束" sub="需要 exit/event/session 状态，而不是仅靠无输出超时。" status="must-check" />
          <EvidenceRow icon="layers" title="子任务等待" sub="Claude/Codex/OpenCode 可能主窗口静止但子代理仍在推进。" status="must-check" />
          <EvidenceRow icon="shield-alert" title="修复副作用" sub="配置写入、CLI 重装、服务重启会影响活跃会话和凭据。" status="must-check" />
          {notes.length ? notes.slice(0, 3).map((note, index) => (
            <EvidenceRow key={`${note}-${index}`} icon="notebook-text" title={`Recovery note ${index + 1}`} sub={note} status="note" />
          )) : null}
        </div>
      </section>
    </div>
  );

  return (
    <div id="stage" className="page-stage" role="main" aria-live="polite" tabIndex={-1}>
      <div className="wrap recovery-page">
        <div className="page-head">
          <div className="htitle">
            <h2>自愈守护</h2>
            <p>Tracevane System Guard：只读聚合 Recovery 证据，写入动作等待确认流。</p>
          </div>
          <div className="toolbar">
            <button className="btn-ghost" onClick={() => {
              void status.refetch(); void events.refetch(); void backups.refetch(); void daemonService.refetch(); void systemHealth.refetch();
            }}><i data-lucide="refresh-cw" />刷新</button>
          </div>
        </div>

        <div className="segbar recovery-viewbar" role="tablist" aria-label="Recovery sections">
          {[
            ["overview", "概览"],
            ["events", "事件"],
            ["backups", "备份"],
            ["guardrails", "守护边界"],
          ].map(([id, label]) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id as RecoveryView)} role="tab" aria-selected={view === id}>{label}</button>
          ))}
        </div>

        {view === "overview" ? renderOverview() : null}
        {view === "events" ? renderEvents() : null}
        {view === "backups" ? renderBackups() : null}
        {view === "guardrails" ? renderGuardrails() : null}
      </div>
    </div>
  );
}
