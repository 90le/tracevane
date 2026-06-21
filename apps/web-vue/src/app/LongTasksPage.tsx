import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "./api-client";
import { useShell } from "./shell-context";

type AnyRecord = Record<string, unknown>;
type LongTaskFilter = "all" | "running" | "planned" | "failed";

interface LongTaskItem {
  id: string;
  title: string;
  source: string;
  kind: string;
  status: string;
  progress: number;
  updatedAt: string;
  detail: string;
  evidence: string[];
  icon: string;
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

function formatTime(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function clampProgress(value: unknown, fallback: number): number {
  const progress = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(progress)) return fallback;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function stateTone(value: unknown): "ok" | "warn" | "bad" | "info" {
  const text = String(value ?? "").toLowerCase();
  if (/(completed|succeeded|ok|ready|healthy|idle|true)/.test(text)) return "ok";
  if (/(failed|error|lost|aborted|blocked|crashed|false)/.test(text)) return "bad";
  if (/(running|streaming|queued|pending|planned|scheduled|repairing|detached|stale)/.test(text)) return "warn";
  return "info";
}

function defaultProgress(status: string): number {
  const normalized = status.toLowerCase();
  if (/(completed|succeeded|ok|healthy|idle)/.test(normalized)) return 100;
  if (/(failed|error|lost|aborted)/.test(normalized)) return 100;
  if (/(queued|pending|planned|scheduled)/.test(normalized)) return 8;
  if (/(running|streaming|repairing|detached)/.test(normalized)) return 55;
  return 0;
}

function statusBucket(status: string): LongTaskFilter {
  const normalized = status.toLowerCase();
  if (/(failed|error|lost|aborted|blocked|crashed)/.test(normalized)) return "failed";
  if (/(queued|pending|planned|scheduled)/.test(normalized)) return "planned";
  if (/(running|streaming|repairing|detached)/.test(normalized)) return "running";
  return "all";
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

function buildTasks(params: {
  chat: unknown;
  channelSessions: unknown;
  terminalSessions: unknown;
  recovery: unknown;
}): LongTaskItem[] {
  const tasks: LongTaskItem[] = [];
  const chatSessions = listAt(params.chat, ["sessions"]).map(asRecord);
  const history = recordAt(params.chat, ["history"]);
  const overlays = listAt(history, ["overlays"]).map(asRecord);
  const queueItems = listAt(params.chat, ["queue", "items"]).map(asRecord);
  const channelActive = listAt(params.channelSessions, ["activeSessions"]).map(asRecord);
  const channelEvents = listAt(params.channelSessions, ["recentEvents"]).map(asRecord);
  const terminals = listAt(params.terminalSessions, ["sessions"]).map(asRecord);
  const recoveryProbe = recordAt(params.recovery, ["probe"]);

  for (const overlay of overlays) {
    const status = textAt(overlay, ["lifecycle", "status"], "running");
    tasks.push({
      id: `overlay:${textAt(overlay, ["runId"], String(tasks.length))}`,
      title: textAt(overlay, ["previewText", "runId"], "Agent run overlay"),
      source: "Chat runtime overlay",
      kind: "Agent run",
      status,
      progress: clampProgress(overlay.progress, defaultProgress(status)),
      updatedAt: textAt(overlay, ["updatedAt", "startedAt"], ""),
      detail: textAt(overlay, ["runId"], "Run overlay from selected chat history."),
      evidence: listAt(overlay, ["toolCalls"]).slice(0, 4).map((tool) => `${textAt(tool, ["name"], "tool")} · ${textAt(tool, ["status"], "unknown")}`),
      icon: "activity",
    });
  }

  for (const session of chatSessions.slice(0, 16)) {
    const runtime = recordAt(session, ["runtime"]);
    const status = textAt(runtime, ["state"], textAt(session, ["status"], "unknown"));
    if (statusBucket(status) === "all" && status !== "unknown") continue;
    tasks.push({
      id: `chat:${textAt(session, ["key"], String(tasks.length))}`,
      title: textAt(session, ["label", "derivedTitle", "sessionId"], "Chat session"),
      source: `${textAt(session, ["agentId"], "agent")} · ${textAt(session, ["source", "channel"], "chat")}`,
      kind: "Chat session",
      status,
      progress: defaultProgress(status),
      updatedAt: textAt(session, ["updatedAt"], ""),
      detail: textAt(session, ["lastMessagePreview"], textAt(session, ["sessionId"], "-")),
      evidence: [
        `session ${textAt(session, ["sessionId"], "-")}`,
        `source ${textAt(session, ["source", "surface"], "-")}`,
        `writable ${textAt(session, ["permissions", "canSend"], "-")}`,
      ],
      icon: "messages-square",
    });
  }

  for (const item of queueItems.slice(0, 12)) {
    const status = textAt(item, ["status"], "queued");
    tasks.push({
      id: `queue:${textAt(item, ["id"], String(tasks.length))}`,
      title: textAt(item, ["previewText", "id"], "Queued message"),
      source: "Chat queue",
      kind: "Queued work",
      status,
      progress: defaultProgress(status),
      updatedAt: textAt(item, ["updatedAt", "createdAt"], ""),
      detail: "等待会话恢复可写或人工处理。",
      evidence: [`queue id ${textAt(item, ["id"], "-")}`, `status ${status}`],
      icon: "timer",
    });
  }

  for (const session of channelActive) {
    const running = numberAt(session, ["running"]);
    const status = running > 0 ? "running" : "idle";
    tasks.push({
      id: `channel:${textAt(session, ["poolKey", "sessionId"], String(tasks.length))}`,
      title: textAt(session, ["sessionId", "poolKey"], "IM Agent session"),
      source: `${textAt(session, ["agent"], "agent")} · ${textAt(session, ["model"], "model")}`,
      kind: "IM Agent",
      status,
      progress: running > 0 ? 65 : 100,
      updatedAt: textAt(session, ["lastUsedAt", "createdAt"], ""),
      detail: textAt(session, ["workDir"], "-"),
      evidence: [
        `binding ${textAt(session, ["bindingId"], "-")}`,
        `running ${running}`,
        `pool ${textAt(session, ["poolKey"], "-")}`,
      ],
      icon: "radio-tower",
    });
  }

  for (const session of terminals.slice(0, 16)) {
    const status = textAt(session, ["status"], "unknown");
    if (statusBucket(status) === "all") continue;
    tasks.push({
      id: `terminal:${textAt(session, ["sessionId"], String(tasks.length))}`,
      title: textAt(session, ["title", "sessionId"], "Terminal session"),
      source: `${textAt(session, ["sourceModule"], "terminal")} · ${textAt(session, ["sourceAction"], "-")}`,
      kind: "Terminal",
      status,
      progress: defaultProgress(status),
      updatedAt: textAt(session, ["lastActiveAt", "createdAt"], ""),
      detail: textAt(session, ["cwd"], "-"),
      evidence: [
        textAt(recordAt(session, ["recentOutputSummary"]), ["tailText"], "no recent output").slice(0, 220),
        `can resume ${textAt(session, ["canResume"], "-")}`,
      ],
      icon: "terminal",
    });
  }

  const recoveryStatus = textAt(params.recovery, ["status"], "unknown");
  if (recoveryStatus !== "unknown") {
    tasks.push({
      id: "recovery:system-guard",
      title: "System Guard recovery monitor",
      source: "Recovery daemon",
      kind: "Recovery",
      status: recoveryStatus === "healthy" ? "idle" : recoveryStatus,
      progress: recoveryStatus === "healthy" ? 100 : defaultProgress(recoveryStatus),
      updatedAt: textAt(params.recovery, ["checkedAt"], ""),
      detail: `Gateway reachable: ${textAt(recoveryProbe, ["gatewayReachable"], "unknown")}`,
      evidence: [
        `next check ${formatTime(textAt(recoveryProbe, ["nextCheckAt"], ""))}`,
        `failure duration ${numberAt(recoveryProbe, ["failureDurationMs"])}ms`,
      ],
      icon: "heart-pulse",
    });
  }

  for (const event of channelEvents.slice(0, 8)) {
    const status = textAt(event, ["error"], "") ? "failed" : textAt(event, ["reason"], "completed");
    if (statusBucket(status) === "all") continue;
    tasks.push({
      id: `channel-event:${textAt(event, ["checkedAt"], String(tasks.length))}:${tasks.length}`,
      title: textAt(event, ["type"], "Channel event"),
      source: `${textAt(event, ["bindingId"], "-")} · ${textAt(event, ["agent"], "-")}`,
      kind: "IM event",
      status,
      progress: defaultProgress(status),
      updatedAt: textAt(event, ["checkedAt"], ""),
      detail: textAt(event, ["error", "reason"], "-"),
      evidence: [`model ${textAt(event, ["model"], "-")}`, `platform ${textAt(event, ["platform"], "-")}`],
      icon: "history",
    });
  }

  return tasks
    .filter((task, index, all) => all.findIndex((candidate) => candidate.id === task.id) === index)
    .sort((left, right) => {
      const rightTime = new Date(right.updatedAt).getTime() || 0;
      const leftTime = new Date(left.updatedAt).getTime() || 0;
      return rightTime - leftTime;
    });
}

export function LongTasksPage() {
  const shell = useShell();
  const [filter, setFilter] = useState<LongTaskFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const chat = useQuery({ queryKey: ["long-tasks", "chat"], queryFn: () => apiJson("/api/chat/bootstrap?recentLimit=40&historyLimit=30"), retry: false });
  const channelSessions = useQuery({ queryKey: ["long-tasks", "channel-sessions"], queryFn: () => apiJson("/api/channel-connectors/agent-sessions"), retry: false });
  const terminalSessions = useQuery({ queryKey: ["long-tasks", "terminal-sessions"], queryFn: () => apiJson("/api/terminal/sessions"), retry: false });
  const recovery = useQuery({ queryKey: ["long-tasks", "recovery"], queryFn: () => apiJson("/api/openclaw-recovery/status"), retry: false });

  const tasks = useMemo(() => buildTasks({
    chat: chat.data,
    channelSessions: channelSessions.data,
    terminalSessions: terminalSessions.data,
    recovery: recovery.data,
  }), [chat.data, channelSessions.data, recovery.data, terminalSessions.data]);

  const visibleTasks = filter === "all" ? tasks : tasks.filter((task) => statusBucket(task.status) === filter);
  const selectedTask = visibleTasks.find((task) => task.id === selectedId) || visibleTasks[0] || tasks[0] || null;
  const runningCount = tasks.filter((task) => statusBucket(task.status) === "running").length;
  const plannedCount = tasks.filter((task) => statusBucket(task.status) === "planned").length;
  const failedCount = tasks.filter((task) => statusBucket(task.status) === "failed").length;

  useEffect(() => {
    if (!selectedId && visibleTasks[0]) setSelectedId(visibleTasks[0].id);
    if (selectedId && visibleTasks.length && !visibleTasks.some((task) => task.id === selectedId)) {
      setSelectedId(visibleTasks[0].id);
    }
  }, [selectedId, visibleTasks]);

  useEffect(() => {
    shell.refreshIcons();
  }, [shell, filter, tasks, selectedId]);

  return (
    <div id="stage" className="page-stage" role="main" aria-live="polite" tabIndex={-1}>
      <div className="wrap long-tasks-page">
        <div className="page-head">
          <div className="htitle">
            <h2>长任务</h2>
            <p>监督长时间 Agent run、IM 异步任务、终端会话和恢复守护；本轮只读，不直接暂停或停止。</p>
          </div>
          <div className="toolbar">
            <button className="btn-ghost" onClick={() => {
              void chat.refetch(); void channelSessions.refetch(); void terminalSessions.refetch(); void recovery.refetch();
            }}><i data-lucide="refresh-cw" />刷新</button>
          </div>
        </div>

        <section className="hero long-task-hero">
          <div className="hero-top">
            <span className={`ready-chip ${failedCount ? "warn" : "ok"}`}><i data-lucide="timer" />Long tasks · {tasks.length}</span>
            <span className="hero-time">chat / IM / terminal / recovery evidence</span>
          </div>
          <h1>长任务不能靠“无输出超时”判断生死。</h1>
          <p className="hero-sub">TUI 静止、子代理 fan-out、后台 session 和恢复巡检都可能长时间没有新文本。本页只聚合结构化状态和最近证据，写动作后续必须进入确认和任务空闲判定。</p>
          <div className="hero-stats long-task-stats">
            <Metric icon="activity" label="运行中" value={runningCount} sub="running / streaming / detached" />
            <Metric icon="timer" label="计划/等待" value={plannedCount} sub="queued / pending / planned" />
            <Metric icon="circle-alert" label="失败风险" value={failedCount} sub="failed / lost / blocked" />
            <Metric icon="folder-check" label="证据源" value="4" sub="Chat / IM / Terminal / Recovery" />
          </div>
        </section>

        <div className="segbar long-task-filter" role="tablist" aria-label="长任务过滤">
          {[
            ["all", "全部", tasks.length],
            ["running", "运行中", runningCount],
            ["planned", "计划", plannedCount],
            ["failed", "失败", failedCount],
          ].map(([id, label, count]) => (
            <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id as LongTaskFilter)} role="tab" aria-selected={filter === id}>
              {label}<span className="tag info">{count}</span>
            </button>
          ))}
        </div>

        <div className="long-task-shell">
          <section className="panel long-task-list-panel">
            <div className="panel-head"><div className="htitle"><h3>任务 / 来源</h3><span className="sub">由现有运行证据合成，不创建新任务。</span></div><StatusTag value={`${visibleTasks.length} shown`} /></div>
            <div className="panel-body long-task-table">
              <QueryNotice query={chat} label="Chat bootstrap" />
              <QueryNotice query={channelSessions} label="Channel sessions" />
              <QueryNotice query={terminalSessions} label="Terminal sessions" />
              <QueryNotice query={recovery} label="Recovery status" />
              {!chat.isLoading && !channelSessions.isLoading && !terminalSessions.isLoading && !recovery.isLoading && visibleTasks.length === 0 ? (
                <div className="statebox empty"><span className="si"><i data-lucide="timer" /></span><strong>没有匹配的长任务</strong><span>切换过滤或刷新运行证据。</span></div>
              ) : null}
              {visibleTasks.map((task) => (
                <button key={task.id} className={`long-task-row ${selectedTask?.id === task.id ? "is-selected" : ""}`} onClick={() => setSelectedId(task.id)}>
                  <span className="rico r-primary"><i data-lucide={task.icon} /></span>
                  <span className="long-task-copy"><strong>{task.title}</strong><small>{task.source}</small></span>
                  <span className="cell-mono">{task.kind}</span>
                  <span className="long-task-progress"><span className="bar" role="progressbar" aria-label={`${task.title} progress`} aria-valuenow={task.progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${task.progress}%` }} /></span><small>{task.progress}%</small></span>
                  <StatusTag value={task.status} />
                </button>
              ))}
            </div>
          </section>

          <aside className="panel long-task-detail-panel">
            <div className="panel-head"><div className="htitle"><h3>详情</h3><span className="sub">只读证据和控制边界。</span></div>{selectedTask ? <StatusTag value={selectedTask.status} /> : null}</div>
            <div className="panel-body long-task-detail">
              {selectedTask ? (
                <>
                  <div className="long-task-detail-title">
                    <span className="rico r-primary"><i data-lucide={selectedTask.icon} /></span>
                    <span><strong>{selectedTask.title}</strong><small>{selectedTask.source} · {selectedTask.kind}</small></span>
                  </div>
                  <div>
                    <div className="section-label">进度</div>
                    <div className="bar long-task-detail-bar" role="progressbar" aria-label="selected long task progress" aria-valuenow={selectedTask.progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${selectedTask.progress}%` }} /></div>
                    <div className="chips"><span className="chip">{selectedTask.progress}%</span><span className="chip">updated {formatTime(selectedTask.updatedAt)}</span></div>
                  </div>
                  <div className="metric-row long-task-metrics">
                    <div className="m"><span>状态</span><strong>{selectedTask.status}</strong></div>
                    <div className="m"><span>来源</span><strong>{selectedTask.kind}</strong></div>
                  </div>
                  <div className="platform-boundary">暂停、停止、重试和清理都会影响活跃 Agent 或可恢复 session。后续开放前必须验证 structured event、进程状态、子代理等待、备份/回滚证据和重复请求防护。</div>
                  <div>
                    <div className="section-label">最近证据</div>
                    <div className="logbox long-task-log">
                      {[selectedTask.detail, ...selectedTask.evidence].filter(Boolean).join("\n") || "没有可展示证据。"}
                    </div>
                  </div>
                </>
              ) : (
                <div className="statebox empty"><span className="si"><i data-lucide="timer" /></span><strong>暂无任务详情</strong><span>现有 API 没有返回长任务证据。</span></div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
