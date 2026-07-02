import * as React from "react";
import { AlertTriangle, Maximize2, Split, X } from "lucide-react";

import { Button } from "@/design/ui/button";
import { cn } from "@/design/lib/utils";
import {
  createTerminalWebSocketUrl,
  createWorkbenchTerminalSession,
  endWorkbenchTerminalSession,
  parseTerminalEvent,
} from "./terminalClient";
import { XtermHost, type XtermDimensions, type XtermHostHandle } from "./XtermHost";

export type TerminalPaneStatus = "idle" | "creating" | "connecting" | "running" | "closed" | "error";

export function TerminalPaneView({
  rootId,
  cwd,
  paneId,
  terminalId,
  title,
  active,
  onFocus,
  onSplitRight,
  onSplitDown,
  onClose,
}: {
  rootId: string;
  cwd: string;
  paneId: string;
  terminalId: string;
  title: string;
  active: boolean;
  onFocus: (paneId: string) => void;
  onSplitRight: (paneId: string) => void;
  onSplitDown: (paneId: string) => void;
  onClose: (paneId: string) => void;
}) {
  const xtermRef = React.useRef<XtermHostHandle | null>(null);
  const socketRef = React.useRef<WebSocket | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  const dimensionsRef = React.useRef<XtermDimensions>({ cols: 80, rows: 24 });
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<TerminalPaneStatus>("idle");
  const [message, setMessage] = React.useState("准备启动本地 Shell");

  const closeSocket = React.useCallback(() => {
    const socket = socketRef.current;
    socketRef.current = null;
    if (!socket) return;
    try {
      socket.close();
    } catch {
      // ignore close races
    }
  }, []);

  const killSession = React.useCallback(async (sid: string | null) => {
    if (!sid) return;
    try {
      await endWorkbenchTerminalSession(sid);
    } catch {
      // Cleanup on unmount must not throw into React.
    }
  }, []);

  const attachSocket = React.useCallback((sid: string) => {
    closeSocket();
    setStatus("connecting");
    setMessage("正在连接终端输出流…");
    const socket = new WebSocket(createTerminalWebSocketUrl(sid, { rootId, cwd }));
    socketRef.current = socket;
    socket.addEventListener("open", () => {
      setStatus("running");
      setMessage("终端运行中");
      socket.send(JSON.stringify({ type: "resize", ...dimensionsRef.current }));
      if (active) xtermRef.current?.focus();
    });
    socket.addEventListener("message", (event) => {
      const payload = parseTerminalEvent(event);
      if (!payload) return;
      if (payload.type === "output") {
        xtermRef.current?.write(payload.data);
        return;
      }
      if (payload.type === "session") {
        setStatus("running");
        setMessage("终端运行中");
        return;
      }
      if (payload.type === "closed") {
        setStatus("closed");
        setMessage(payload.reason === "session_ended" ? "终端已关闭" : "终端进程已退出");
        return;
      }
      if (payload.type === "error") {
        setStatus("error");
        setMessage(payload.message);
      }
    });
    socket.addEventListener("close", () => {
      if (socketRef.current === socket) socketRef.current = null;
      setStatus((current) => (current === "closed" || current === "error" ? current : "closed"));
      setMessage((current) => current || "终端连接已断开");
    });
    socket.addEventListener("error", () => {
      setStatus("error");
      setMessage("终端 WebSocket 连接失败");
    });
  }, [active, closeSocket, cwd, rootId]);

  const startSession = React.useCallback(async () => {
    if (!rootId) return;
    setStatus("creating");
    setMessage("正在创建受 workspace 限制的 PTY session…");
    try {
      const descriptor = await createWorkbenchTerminalSession({
        rootId,
        cwd,
        ...dimensionsRef.current,
      });
      sessionIdRef.current = descriptor.sessionId;
      setSessionId(descriptor.sessionId);
      attachSocket(descriptor.sessionId);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "创建终端失败");
    }
  }, [attachSocket, cwd, rootId]);

  React.useEffect(() => {
    if (sessionId || status === "creating" || status === "connecting" || status === "running") return;
    void startSession();
  }, [sessionId, startSession, status]);

  React.useEffect(() => {
    if (active) xtermRef.current?.focus();
  }, [active]);

  React.useEffect(() => () => {
    const sid = sessionIdRef.current;
    closeSocket();
    void killSession(sid);
  }, [closeSocket, killSession]);

  const handleInput = React.useCallback((data: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(data);
  }, []);

  const handleResize = React.useCallback((dimensions: XtermDimensions) => {
    dimensionsRef.current = dimensions;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "resize", ...dimensions }));
  }, []);

  const closePane = React.useCallback(async () => {
    const sid = sessionIdRef.current;
    closeSocket();
    setStatus("closed");
    setMessage("终端已关闭");
    await killSession(sid);
    onClose(paneId);
  }, [closeSocket, killSession, onClose, paneId]);

  return (
    <section
      className={cn(
        "group/pane grid min-h-[150px] min-w-[220px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden border bg-panel text-ink",
        active ? "border-primary-line shadow-[inset_0_0_0_1px_var(--primary-line)]" : "border-line",
      )}
      data-ide-terminal-pane
      data-terminal-pane-id={paneId}
      data-terminal-id={terminalId}
      data-active-terminal-pane={active ? "true" : "false"}
      onPointerDown={() => onFocus(paneId)}
    >
      <header className="flex min-h-8 items-center gap-1 border-b border-line bg-panel-2 px-2 text-xs">
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-ink-strong outline-none focus-visible:shadow-[var(--ring)]"
          onClick={() => onFocus(paneId)}
        >
          {title}
          <span className="ml-2 rounded bg-panel px-1 font-mono text-2xs text-muted">{status}</span>
        </button>
        <Button variant="ghost" size="icon" onClick={() => onSplitRight(paneId)} aria-label="向右拆分终端" title="Split Right">
          <Split />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onSplitDown(paneId)} aria-label="向下拆分终端" title="Split Down">
          <Maximize2 />
        </Button>
        <Button variant="ghost" size="icon" onClick={closePane} aria-label="关闭终端 Pane" title="Close/Kill Pane">
          <X />
        </Button>
      </header>
      <div className="relative min-h-0" data-ide-terminal-pane-body>
        {status === "error" ? (
          <div className="absolute inset-x-3 top-3 z-10 flex items-start gap-2 rounded-md border border-red/40 bg-red-soft p-2 text-xs text-ink-strong" role="status">
            <AlertTriangle className="mt-0.5 size-4 text-red" />
            <div>
              <div className="font-medium">终端不可用</div>
              <div className="text-muted">{message}</div>
            </div>
          </div>
        ) : null}
        <XtermHost ref={xtermRef} onInput={handleInput} onResize={handleResize} />
      </div>
    </section>
  );
}
