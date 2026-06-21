import * as React from "react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiJson } from "./api-client";
import { useShell } from "./shell-context";

type AnyRecord = Record<string, unknown>;
type ChatView = "messages" | "runs" | "queue" | "diagnostics";

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
  if (/(idle|completed|ok|ready|connected|success|true|writable)/.test(text)) return "ok";
  if (/(error|failed|aborted|blocked|down|false|not_writable)/.test(text)) return "bad";
  if (/(running|streaming|queued|pending|archived|truncated|warning|warn)/.test(text)) return "warn";
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

function metricValue(value: unknown): string {
  const number = typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return String(number);
}

function sessionTitle(session: AnyRecord): string {
  return textAt(session, ["label"], textAt(session, ["derivedTitle"], textAt(session, ["sessionId"], "session")));
}

function roleLabel(role: unknown): string {
  const value = String(role || "unknown");
  if (value === "user") return "用户";
  if (value === "assistant") return "Agent";
  if (value === "tool") return "工具";
  if (value === "system") return "系统";
  return value;
}

export function ChatWorkbenchPage() {
  const shell = useShell();
  const [view, setView] = useState<ChatView>("messages");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const bootstrap = useQuery({
    queryKey: ["chat-workbench", "bootstrap", selectedKey],
    queryFn: () => apiJson(`/api/chat/bootstrap?${new URLSearchParams({
      recentLimit: "40",
      historyLimit: "30",
      ...(selectedKey ? { sessionKey: selectedKey } : {}),
    })}`),
    retry: false,
  });

  const sessions = listAt(bootstrap.data, ["sessions"]).map(asRecord);
  const selectedSessionKey = textAt(bootstrap.data, ["selectedSessionKey"], "");
  const effectiveSelectedKey = selectedKey || selectedSessionKey;
  const selectedSession = sessions.find((session) => textAt(session, ["key"], "") === effectiveSelectedKey) || asRecord(recordAt(bootstrap.data, ["history"]).session);
  const history = recordAt(bootstrap.data, ["history"]);
  const runtime = recordAt(history, ["runtime"]);
  const diagnostics = asRecord(bootstrap.data).diagnostics ? asRecord(bootstrap.data).diagnostics : recordAt(history, ["diagnostics"]);
  const observability = recordAt(history, ["observability"]);
  const usage = recordAt(observability, ["usage"]);
  const queueItems = listAt(bootstrap.data, ["queue", "items"]).map(asRecord);
  const messages = listAt(history, ["messages"]).map(asRecord);
  const overlays = listAt(history, ["overlays"]).map(asRecord);
  const toolCards = listAt(observability, ["toolCards"]).map(asRecord);
  const timeline = listAt(observability, ["timeline"]).map(asRecord);
  const controls = recordAt(bootstrap.data, ["controls"]);
  const controlState = recordAt(controls, ["controls"]);
  const runningSessions = sessions.filter((session) => /running|streaming/.test(textAt(session, ["runtime", "state"], "").toLowerCase()));
  const writableSessions = sessions.filter((session) => asRecord(session.permissions).canSend === true);

  useEffect(() => {
    if (!selectedKey && selectedSessionKey) setSelectedKey(selectedSessionKey);
  }, [selectedKey, selectedSessionKey]);

  useEffect(() => {
    shell.refreshIcons();
  }, [shell, view, bootstrap.data, selectedKey]);

  const renderMessage = (message: AnyRecord) => {
    const role = textAt(message, ["role"], "unknown");
    const toolCalls = listAt(message, ["toolCalls"]).map(asRecord);
    return (
      <article key={textAt(message, ["id"], Math.random().toString(36))} className={`chat-work-message ${role === "user" ? "me" : ""}`}>
        <div className="chat-work-who">{roleLabel(role)} · {formatTime(textAt(message, ["createdAt"], ""))}</div>
        <div className="chat-work-bubble">{textAt(message, ["text"], message.omitted ? "内容已省略。" : "无文本内容。")}</div>
        {toolCalls.length ? <div className="chat-work-tools">
          {toolCalls.map((tool) => (
            <div key={textAt(tool, ["toolCallId", "name"], "tool")} className="chat-work-tool">
              <span><i data-lucide="wrench" />{textAt(tool, ["name"], "tool")}</span>
              <StatusTag value={textAt(tool, ["status"], "unknown")} />
            </div>
          ))}
        </div> : null}
      </article>
    );
  };

  const renderCenter = () => {
    if (view === "runs") {
      return (
        <div className="chat-work-panel-list">
          {overlays.length ? overlays.map((overlay) => (
            <div key={textAt(overlay, ["runId"], "run")} className="chat-work-evidence-row">
              <span className="rico r-primary"><i data-lucide="activity" /></span>
              <span><strong>{textAt(overlay, ["runId"], "run")}</strong><small>{textAt(overlay, ["previewText"], "no preview")} · {formatTime(textAt(overlay, ["updatedAt"], ""))}</small></span>
              <StatusTag value={textAt(overlay, ["lifecycle"], "unknown")} />
            </div>
          )) : <div className="statebox empty"><span className="si"><i data-lucide="activity" /></span><strong>暂无运行 overlay</strong><span>正在运行的 Agent 任务会在这里显示 lifecycle、工具和预览。</span></div>}
        </div>
      );
    }
    if (view === "queue") {
      return (
        <div className="chat-work-panel-list">
          {queueItems.length ? queueItems.map((item) => (
            <div key={textAt(item, ["id"], "queued")} className="chat-work-evidence-row">
              <span className="rico r-primary"><i data-lucide="list-checks" /></span>
              <span><strong>{textAt(item, ["previewText"], "queued message")}</strong><small>{formatTime(textAt(item, ["updatedAt"], ""))}</small></span>
              <StatusTag value={textAt(item, ["status"], "queued")} />
            </div>
          )) : <div className="statebox empty"><span className="si"><i data-lucide="list-checks" /></span><strong>队列为空</strong><span>本轮不提供发送或重放按钮，只展示当前队列状态。</span></div>}
        </div>
      );
    }
    if (view === "diagnostics") {
      return (
        <div className="chat-work-diagnostics">
          {[
            ["Gateway", textAt(diagnostics, ["gatewayReachable"], "-")],
            ["Transport", textAt(diagnostics, ["transport"], "-")],
            ["Auth", textAt(diagnostics, ["authMode"], "-")],
            ["History", textAt(diagnostics, ["truncationMode"], "-")],
            ["Raw frames", textAt(diagnostics, ["rawGatewayFramesExposed"], "-")],
            ["Same origin", textAt(diagnostics, ["sameOriginRequired"], "-")],
          ].map(([label, value]) => (
            <div key={label} className="chat-work-diagnostic"><span>{label}</span><strong>{value}</strong></div>
          ))}
          {listAt(diagnostics, ["notes"]).map((note, index) => <p key={index} className="platform-boundary">{String(note)}</p>)}
        </div>
      );
    }
    return (
      <div className="chat-work-messages">
        <QueryNotice query={bootstrap} label="Chat bootstrap" />
        {!bootstrap.isLoading && !bootstrap.isError && messages.length ? messages.map(renderMessage) : null}
        {!bootstrap.isLoading && !bootstrap.isError && messages.length === 0 ? <div className="statebox empty"><span className="si"><i data-lucide="messages-square" /></span><strong>当前会话暂无可展示消息</strong><span>会话、runtime、队列和诊断仍来自真实 Chat bootstrap。</span></div> : null}
      </div>
    );
  };

  return (
    <div id="stage" className="page-stage" role="main" aria-live="polite" tabIndex={-1}>
      <div className="wrap chat-workbench-page">
        <div className="page-head">
          <div className="htitle">
            <h2>会话任务</h2>
            <p>Tracevane Agent 工作台：会话、运行、队列、诊断和证据，不是通用聊天窗口。</p>
          </div>
          <div className="toolbar">
            <button className="btn-ghost" onClick={() => void bootstrap.refetch()}><i data-lucide="refresh-cw" />刷新</button>
          </div>
        </div>

        <section className="hero chat-work-hero">
          <div className="hero-top">
            <span className={`ready-chip ${asRecord(diagnostics).gatewayReachable === true ? "ok" : "warn"}`}><i data-lucide="messages-square" />Chat · {textAt(runtime, ["state"], "idle")}</span>
            <span className="hero-time">selected · {effectiveSelectedKey ? `${effectiveSelectedKey.slice(0, 42)}...` : "none"}</span>
          </div>
          <h1>会话是 Agent 任务控制面，所有执行都必须留下证据。</h1>
          <p className="hero-sub">本页只读接入 Chat bootstrap。发送、取消、重置、删除和控制策略后续必须进入确认流和运行证据闭环。</p>
          <div className="hero-stats chat-work-stats">
            <div className="hero-stat"><span className="lab"><i data-lucide="messages-square" />Sessions</span><span className="val">{sessions.length}</span><span className="trend flat"><i data-lucide="minus" />{runningSessions.length} running</span></div>
            <div className="hero-stat"><span className="lab"><i data-lucide="send-horizontal" />Writable</span><span className="val">{writableSessions.length}</span><span className="trend flat"><i data-lucide="minus" />send locked</span></div>
            <div className="hero-stat"><span className="lab"><i data-lucide="list-checks" />Queue</span><span className="val">{queueItems.length}</span><span className="trend flat"><i data-lucide="minus" />blocked/queued</span></div>
            <div className="hero-stat"><span className="lab"><i data-lucide="activity" />Tokens</span><span className="val">{metricValue(numberAt(usage, ["totalTokens"]))}</span><span className="trend flat"><i data-lucide="minus" />current history</span></div>
          </div>
        </section>

        <section className="chat-work-shell">
          <aside className="chat-work-sessions">
            <div className="panel-head"><div className="htitle"><h3>会话</h3><span className="sub">最近 Tracevane Agent sessions。</span></div><StatusTag value={`${sessions.length} sessions`} /></div>
            <div className="chat-work-session-list">
              <QueryNotice query={bootstrap} label="Sessions" />
              {!bootstrap.isLoading && !bootstrap.isError ? sessions.map((session) => {
                const key = textAt(session, ["key"], "");
                const sessionRuntime = recordAt(session, ["runtime"]);
                return (
                  <button key={key} className={`chat-work-session ${key === effectiveSelectedKey ? "on" : ""}`} onClick={() => setSelectedKey(key)}>
                    <span><strong>{sessionTitle(session)}</strong><small>{textAt(session, ["agentId"], "-")} · {textAt(session, ["source", "channel"], "-")}</small></span>
                    <StatusTag value={textAt(sessionRuntime, ["state"], "unknown")} />
                  </button>
                );
              }) : null}
            </div>
          </aside>

          <main className="chat-work-main">
            <div className="viewbar chat-work-viewbar" role="tablist" aria-label="会话任务视图">
              {[
                ["messages", "messages-square", "消息"],
                ["runs", "activity", "运行"],
                ["queue", "list-checks", "队列"],
                ["diagnostics", "radar", "诊断"],
              ].map(([id, icon, label]) => (
                <button key={id} className={view === id ? "on" : ""} role="tab" aria-selected={view === id} onClick={() => setView(id as ChatView)}>
                  <i data-lucide={icon} />{label}
                </button>
              ))}
            </div>
            {renderCenter()}
            <div className="chat-work-composer">
              <textarea readOnly value="发送入口暂时锁定。后续会接入会话可写性、重复请求、abort/reset、证据和回滚确认。" aria-label="只读发送说明" />
              <div className="composer-foot">
                <span className="tag mute">read-only first pass</span>
                <span className="filler" />
                <button className="btn-primary" disabled><i data-lucide="send-horizontal" />发送</button>
              </div>
            </div>
          </main>

          <aside className="chat-work-inspector">
            <div className="panel-head"><div className="htitle"><h3>证据 / 控制</h3><span className="sub">只读 runtime、controls、tools。</span></div><StatusTag value={textAt(runtime, ["state"], "unknown")} /></div>
            <div className="chat-work-inspect-body">
              <div className="chat-work-kv"><span>Agent</span><strong>{textAt(selectedSession, ["agentId"], "-")}</strong></div>
              <div className="chat-work-kv"><span>Writable</span><strong>{textAt(runtime, ["sessionWritable"], "-")}</strong></div>
              <div className="chat-work-kv"><span>Active run</span><strong>{textAt(runtime, ["activeRunId"], "none")}</strong></div>
              <div className="chat-work-kv"><span>Host exec</span><strong>{textAt(controlState, ["allowHostManagementExec"], "-")}</strong></div>
              <div className="section-label">工具调用</div>
              {toolCards.length ? toolCards.slice(0, 8).map((tool) => (
                <div key={textAt(tool, ["toolCallId", "name"], "tool")} className="chat-work-evidence-row compact">
                  <span className="rico r-primary"><i data-lucide="wrench" /></span>
                  <span><strong>{textAt(tool, ["name"], "tool")}</strong><small>{textAt(tool, ["resultPreview"], textAt(tool, ["argsPreview"], "-"))}</small></span>
                  <StatusTag value={textAt(tool, ["status"], "unknown")} />
                </div>
              )) : <div className="statebox empty"><span className="si"><i data-lucide="wrench" /></span><strong>暂无工具卡</strong><span>工具证据会随运行投影出现。</span></div>}
              <div className="section-label">Timeline</div>
              {timeline.slice(0, 8).map((item) => (
                <div key={textAt(item, ["id"], "event")} className="chat-work-timeline">
                  <strong>{textAt(item, ["title"], "event")}</strong>
                  <span>{textAt(item, ["detail"], "-")} · {formatTime(textAt(item, ["emittedAt"], ""))}</span>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
