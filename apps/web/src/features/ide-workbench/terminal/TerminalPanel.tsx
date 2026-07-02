import * as React from "react";
import { AlertTriangle, RotateCw, Terminal as TerminalIcon } from "lucide-react";

import { Button } from "@/design/ui/button";
import { cn } from "@/design/lib/utils";
import {
  createTerminalWebSocketUrl,
  createWorkbenchTerminalSession,
  endWorkbenchTerminalSession,
  parseTerminalEvent,
} from "./terminalClient";
import { TerminalTabs } from "./TerminalTabs";
import { XtermHost, type XtermDimensions, type XtermHostHandle } from "./XtermHost";

export function TerminalPanel({
  rootId,
  cwd,
  active,
}: {
  rootId: string;
  cwd: string;
  active: boolean;
}) {
  const xtermRef = React.useRef<XtermHostHandle | null>(null);
  const socketRef = React.useRef<WebSocket | null>(null);
  const dimensionsRef = React.useRef<XtermDimensions>({ cols: 80, rows: 24 });
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<"idle" | "creating" | "connecting" | "running" | "closed" | "error">("idle");
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
      xtermRef.current?.focus();
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
  }, [closeSocket, cwd, rootId]);

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
      setSessionId(descriptor.sessionId);
      attachSocket(descriptor.sessionId);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "创建终端失败");
    }
  }, [attachSocket, cwd, rootId]);

  React.useEffect(() => {
    if (!active || sessionId || status === "creating" || status === "connecting" || status === "running") return;
    void startSession();
  }, [active, sessionId, startSession, status]);

  React.useEffect(() => () => closeSocket(), [closeSocket]);

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

  const closeSession = React.useCallback(async () => {
    const sid = sessionId;
    if (!sid) return;
    closeSocket();
    setStatus("closed");
    setMessage("正在关闭终端…");
    try {
      await endWorkbenchTerminalSession(sid);
      setMessage("终端已关闭");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "关闭终端失败");
    }
  }, [closeSocket, sessionId]);

  const restart = React.useCallback(() => {
    closeSocket();
    setSessionId(null);
    xtermRef.current?.clear();
    setStatus("idle");
    setMessage("准备重新启动本地 Shell");
    void startSession();
  }, [closeSocket, startSession]);

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] bg-panel text-ink" data-ide-terminal-panel>
      <TerminalTabs sessionId={sessionId} status={status} onClose={closeSession} />
      <div className="flex min-h-8 items-center gap-2 border-b border-line bg-panel px-2 text-xs text-muted" data-ide-terminal-status>
        <TerminalIcon className="size-3.5 text-primary" />
        <span className="truncate">cwd: /{cwd || ""}</span>
        <span className={cn("ml-auto truncate", status === "error" && "text-red")}>{message}</span>
        <Button variant="ghost" size="sm" onClick={restart} disabled={status === "creating" || status === "connecting"}>
          <RotateCw />
          重启
        </Button>
      </div>
      <div className="relative min-h-0">
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
    </div>
  );
}
