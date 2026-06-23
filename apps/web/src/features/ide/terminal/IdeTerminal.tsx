import * as React from "react";
import { Terminal as XtermTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Plus, TerminalSquare, X } from "lucide-react";

import "@xterm/xterm/css/xterm.css";

import { apiRequest } from "@/lib/api/client";
import { useTerminalSessionsQuery } from "@/lib/query/terminal";
import { Button } from "@/design/ui/button";
import { cn } from "@/design/lib/utils";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";
import type { TerminalSessionDescriptor } from "@/features/cli-agents/types";

/**
 * IDE terminal panel — xterm.js frontend over the node-pty backend
 * (`apps/api/modules/terminal`).
 *
 * Transport contract (see `apps/api/modules/terminal/routes.ts`):
 *  - GET  /api/terminal/sessions                    roster (persisted)
 *  - GET  /api/terminal/sessions/:id/stream         SSE output stream;
 *        opening it spawns/attaches the PTY (attachStreamClient). Events are
 *        SSE with `event: terminal` and a JSON payload. Output event shape:
 *        `{ type: "output", sid, seq, data, emittedAtMs }`. Other events:
 *        `session`, `reset`, `clear`, `closed`, `error`.
 *  - POST /api/terminal/sessions/:id/input          `{ data }` → term.write
 *  - POST /api/terminal/sessions/:id/resize         `{ cols, rows }` → term.resize
 *
 * xterm is created once per active session (useEffect keyed on sessionId) and
 * disposed on cleanup/session switch. Input/resize are best-effort POSTs.
 */

const STREAM_BASE = "/api/terminal/sessions";

type StreamEvent =
  | { type: "session"; sid: string; instanceId: string; outputSeq: number }
  | { type: "output"; sid: string; seq: number; data: string }
  | { type: "reset"; sid: string; instanceId: string; reason?: string }
  | { type: "clear"; sid: string }
  | { type: "closed"; sid: string; reason?: string }
  | { type: "error"; message?: string }
  | { type: string; sid?: string };

interface IdeTerminalProps {
  /** Optional className for the outer panel. */
  className?: string;
}

export function IdeTerminal({ className }: IdeTerminalProps) {
  const sessionsQuery = useTerminalSessionsQuery();
  const sessions = sessionsQuery.data?.sessions ?? [];

  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(
    null,
  );

  // Pick the first session once loaded, if none chosen.
  React.useEffect(() => {
    if (activeSessionId || sessions.length === 0) return;
    setActiveSessionId(sessions[0].sessionId);
  }, [sessions, activeSessionId]);

  const [creating, setCreating] = React.useState(false);

  async function handleCreate() {
    setCreating(true);
    try {
      // Opening the stream with no existing sid spawns a new PTY session.
      // Use a client-generated id so the path param is unique; the backend
      // getOrCreateSession will create it fresh since it is unknown.
      const newId = `ide-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      // Touch the stream briefly to spawn the session, then let the normal
      // attach flow take over via the active-session effect.
      await fetch(`${STREAM_BASE}/${encodeURIComponent(newId)}/stream`, {
        method: "GET",
        headers: { Accept: "text/event-stream" },
      }).catch(() => {
        // The fetch stays open (SSE); we just need the session to be spawned.
        // Errors are tolerated — the roster refetch will reveal the session.
      });
      await sessionsQuery.refetch();
      setActiveSessionId(newId);
    } finally {
      setCreating(false);
    }
  }

  if (sessionsQuery.isLoading) {
    return <LoadingState title="加载终端会话…" />;
  }
  if (sessionsQuery.isError) {
    return (
      <ErrorState
        title="无法加载终端会话"
        description={(sessionsQuery.error as Error)?.message ?? "请稍后重试"}
        action={
          <Button size="sm" variant="ghost" onClick={() => sessionsQuery.refetch()}>
            重试
          </Button>
        }
      />
    );
  }

  return (
    <div className={cn("grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]", className)}>
      <SessionRoster
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={setActiveSessionId}
        onCreate={handleCreate}
        creating={creating}
      />
      <div className="min-h-0">
        {activeSessionId ? (
          <TerminalView sessionId={activeSessionId} />
        ) : (
          <EmptyState
            title="新建终端会话"
            description="打开一个终端会话以在 IDE 内运行命令。"
            icon={<TerminalSquare />}
            action={
              <Button size="sm" variant="primary" onClick={handleCreate} disabled={creating}>
                <Plus /> 新建
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}

interface SessionRosterProps {
  sessions: TerminalSessionDescriptor[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  creating: boolean;
}

function SessionRoster({
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  creating,
}: SessionRosterProps) {
  return (
    <div className="flex h-8 items-center gap-1 border-b border-line bg-panel px-2">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {sessions.map((s) => (
          <button
            key={s.sessionId}
            type="button"
            onClick={() => onSelect(s.sessionId)}
            className={cn(
              "flex h-6 items-center gap-1 rounded-sm px-2 text-2xs whitespace-nowrap text-muted transition-colors hover:bg-panel-2 hover:text-ink",
              activeSessionId === s.sessionId && "bg-panel-2 text-ink-strong",
            )}
            title={s.cwd || s.sessionId}
          >
            <span className="size-1.5 shrink-0 rounded-full bg-emerald" />
            {s.title || s.sessionId.slice(0, 8)}
          </button>
        ))}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onCreate}
        disabled={creating}
        className="ml-auto h-6 px-2 text-2xs"
      >
        <Plus /> 新建
      </Button>
    </div>
  );
}

/**
 * Renders a single xterm.js Terminal for the given session. The terminal is
 * created on mount (per sessionId) and disposed on unmount/session switch.
 */
function TerminalView({ sessionId }: { sessionId: string }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const termRef = React.useRef<XtermTerminal | null>(null);
  const fitRef = React.useRef<FitAddon | null>(null);
  const lastSeqRef = React.useRef<number>(0);
  const [error, setError] = React.useState<string | null>(null);

  // Create the terminal + attach input/resize/stream. Re-runs only on session
  // change; everything is disposed in cleanup.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setError(null);
    lastSeqRef.current = 0;

    const term = new XtermTerminal({
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available — fall back to canvas renderer silently.
    }
    term.open(container);
    try {
      fit.fit();
    } catch {
      // Container may not be laid out yet; ResizeObserver will retry.
    }

    termRef.current = term;
    fitRef.current = fit;

    // Initial resize report.
    const dims = safeProposeDimensions(fit);
    if (dims) {
      sendResize(sessionId, dims.cols, dims.rows);
    }

    // Input: forward keystrokes to the backend PTY.
    const inputDisposable = term.onData((data) => {
      sendInput(sessionId, data);
    });

    // Resize: observe container size changes.
    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {}
      const d = safeProposeDimensions(fit);
      if (d) {
        sendResize(sessionId, d.cols, d.rows);
      }
    });
    resizeObserver.observe(container);

    // Output: consume the SSE stream.
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `${STREAM_BASE}/${encodeURIComponent(sessionId)}/stream?resume=1&lastSeq=${lastSeqRef.current}`,
          {
            headers: { Accept: "text/event-stream" },
            signal: controller.signal,
          },
        );
        if (!response.ok || !response.body) {
          if (!cancelled) {
            setError(`终端流连接失败 (${response.status})`);
          }
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE frames are separated by blank lines. We only care about
          // `event: terminal` data lines (the backend also sends `ping`).
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const evt = parseSseFrame(frame);
            if (!evt) continue;
            handleStreamEvent(evt, term, lastSeqRef);
          }
        }
      } catch (err) {
        if (!cancelled && (err as Error)?.name !== "AbortError") {
          // Best-effort P1: surface a non-fatal message; user can reopen.
          term.write(`\r\n\x1b[33m[stream disconnected]\x1b[0m\r\n`);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      inputDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  // Reconnect on window focus (best-effort P1).
  React.useEffect(() => {
    const onFocus = () => {
      // The main effect owns the stream; a focus-driven reconnect would need
      // a ref to the fetch loop. For P1 we rely on the session-keyed effect
      // plus the user reselecting the tab if the stream dropped.
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <div className="relative grid h-full min-h-0 grid-rows-[minmax(0,1fr)]">
      <div ref={containerRef} className="min-h-0 overflow-hidden p-1" />
      {error && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-sm border border-red-line bg-red-soft px-2 py-1 text-2xs text-red">
            {error}
            <button
              type="button"
              className="text-red/70 hover:text-red"
              onClick={() => setError(null)}
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stream parsing / transport helpers
// ---------------------------------------------------------------------------

function parseSseFrame(frame: string): StreamEvent | null {
  const lines = frame.split("\n");
  let eventName = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (eventName !== "terminal" || dataLines.length === 0) return null;
  try {
    return JSON.parse(dataLines.join("\n")) as StreamEvent;
  } catch {
    return null;
  }
}

function handleStreamEvent(
  evt: StreamEvent,
  term: XtermTerminal,
  lastSeqRef: React.RefObject<number>,
): void {
  if (evt.type === "output") {
    const out = evt as { data?: string; seq?: number };
    if (typeof out.data === "string") {
      term.write(out.data);
    }
    if (typeof out.seq === "number" && out.seq > lastSeqRef.current) {
      lastSeqRef.current = out.seq;
    }
    return;
  }
  if (evt.type === "reset") {
    term.reset();
    return;
  }
  if (evt.type === "clear") {
    term.clear();
    return;
  }
  if (evt.type === "closed") {
    term.write(`\r\n\x1b[90m[session closed]\x1b[0m\r\n`);
    return;
  }
  if (evt.type === "error") {
    const msg = (evt as { message?: string }).message ?? "unknown";
    term.write(`\r\n\x1b[31m[error: ${msg}]\x1b[0m\r\n`);
  }
}

function safeProposeDimensions(
  fit: FitAddon,
): { cols: number; rows: number } | null {
  try {
    const d = fit.proposeDimensions();
    if (d && d.cols > 0 && d.rows > 0) {
      return { cols: d.cols, rows: d.rows };
    }
  } catch {}
  return null;
}

function sendInput(sessionId: string, data: string): void {
  apiRequest(`${STREAM_BASE}/${encodeURIComponent(sessionId)}/input`, {
    method: "POST",
    body: JSON.stringify({ data }),
  }).catch(() => {
    // Best-effort; dropped keystrokes are tolerable for P1.
  });
}

function sendResize(sessionId: string, cols: number, rows: number): void {
  apiRequest(`${STREAM_BASE}/${encodeURIComponent(sessionId)}/resize`, {
    method: "POST",
    body: JSON.stringify({ cols, rows }),
  }).catch(() => {
    // Best-effort.
  });
}
