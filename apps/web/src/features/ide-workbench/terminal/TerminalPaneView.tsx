import * as React from "react";
import { AlertTriangle, ClipboardPaste, Copy, FileInput, FolderInput, ImagePlus, X } from "lucide-react";

import { Button } from "@/design/ui/button";
import { cn } from "@/design/lib/utils";
import { toast } from "@/design/ui/sonner";
import { createDirectory } from "@/lib/api/files";
import { getTerminalSession } from "@/lib/api/terminal";
import { createUploadBatch } from "@/features/file-manager/file-tools/uploadManager";
import {
  collectUploadFilesFromDataTransfer,
  hasUploadFilesInDataTransfer,
} from "@/features/file-manager/file-tools/uploadInputs";
import {
  hasExplorerTransferPayload,
  joinExplorerPath,
  normalizeExplorerPath,
  readExplorerTransferPayload,
} from "@/shared/explorer-core";
import {
  createTerminalWebSocketUrl,
  createWorkbenchTerminalSession,
  endWorkbenchTerminalSession,
  parseTerminalEvent,
} from "./terminalClient";
import { XtermHost, type XtermDimensions, type XtermHostHandle } from "./XtermHost";

export type TerminalPaneStatus = "idle" | "creating" | "connecting" | "running" | "closed" | "error";

const TERMINAL_INSERT_EVENT = "tracevane:ide-terminal-insert-text";
const TERMINAL_CLIPBOARD_UPLOAD_ROOT = ".tracevane/tmp/terminal-paste";
const TERMINAL_CLIPBOARD_UPLOAD_ROOT_FALLBACK = "tmp/tracevane-terminal-paste";
const TERMINAL_PANE_MENU_WIDTH = 224;
const TERMINAL_PANE_MENU_HEIGHT = 320;
const TERMINAL_PANE_MENU_VIEWPORT_PADDING = 8;

interface TerminalPaneMenuState {
  x: number;
  y: number;
}

export function TerminalPaneView({
  rootId,
  cwd,
  cwdAbsolutePath,
  paneId,
  terminalId,
  title,
  profileId,
  shell,
  createMode = "resume",
  active,
  compact = false,
  showHeader = true,
  onFocus,
  onClose,
}: {
  rootId: string;
  cwd: string;
  cwdAbsolutePath?: string;
  paneId: string;
  terminalId: string;
  title: string;
  profileId?: string | null;
  shell?: string | null;
  createMode?: "create" | "resume";
  active: boolean;
  compact?: boolean;
  showHeader?: boolean;
  onFocus: (paneId: string) => void;
  onClose: (paneId: string) => void;
}) {
  const xtermRef = React.useRef<XtermHostHandle | null>(null);
  const socketRef = React.useRef<WebSocket | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  const dimensionsRef = React.useRef<XtermDimensions>({ cols: 80, rows: 24 });
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<TerminalPaneStatus>("idle");
  const [message, setMessage] = React.useState("准备启动本地 Shell");
  const [backend, setBackend] = React.useState<"pty" | "tmux" | null>(null);
  const [menu, setMenu] = React.useState<TerminalPaneMenuState | null>(null);
  const [selectedText, setSelectedText] = React.useState("");
  const [terminalFocused, setTerminalFocused] = React.useState(false);
  const [closing, setClosing] = React.useState(false);
  const selectedTextRef = React.useRef("");
  const previousTerminalIdRef = React.useRef(terminalId);
  const disposedRef = React.useRef(false);
  const userClosedRef = React.useRef(false);
  const closeRequestedRef = React.useRef(false);

  React.useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
    };
  }, []);

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

  const sendText = React.useCallback((text: string) => {
    const socket = socketRef.current;
    if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(text);
  }, []);

  const updateSelectedText = React.useCallback((selection: string) => {
    selectedTextRef.current = selection;
    setSelectedText(selection);
  }, []);

  const copyTerminalSelectionToClipboard = React.useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const selection = xtermRef.current?.getSelection() || selectedTextRef.current;
    if (!selection) {
      if (!silent) toast.info("终端没有选中文本");
      return false;
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("当前浏览器不支持剪贴板写入");
      await navigator.clipboard.writeText(selection);
      if (!silent) toast.success("已复制终端选中内容", { description: `${selection.length} 个字符` });
      return true;
    } catch (error) {
      if (!silent) {
        toast.error("复制终端内容失败", { description: error instanceof Error ? error.message : String(error) });
      }
      return false;
    }
  }, []);

  const pasteClipboardText = React.useCallback(async () => {
    try {
      if (!navigator.clipboard?.readText) throw new Error("当前浏览器不支持剪贴板读取");
      const text = await navigator.clipboard.readText();
      if (text) sendText(text);
    } catch (error) {
      toast.error("读取剪贴板失败", { description: error instanceof Error ? error.message : String(error) });
    }
  }, [sendText]);


  const killSession = React.useCallback(async (sid: string | null) => {
    if (!sid) return { failed: false };
    try {
      await endWorkbenchTerminalSession(sid, { attempts: 3, queueOnFailure: true });
      return { failed: false };
    } catch {
      return { failed: true };
    }
  }, []);

  const attachSocket = React.useCallback((sid: string) => {
    closeSocket();
    setStatus("connecting");
    setMessage("正在连接终端输出流…");
    const socket = new WebSocket(createTerminalWebSocketUrl(sid, { rootId, cwd, profileId, shell }));
    socketRef.current = socket;
    socket.addEventListener("open", () => {
      if (socketRef.current !== socket) return;
      setStatus("running");
      setMessage("终端运行中");
      socket.send(JSON.stringify({ type: "resize", ...dimensionsRef.current }));
      // Do not auto-steal focus from Explorer/Editor when a socket opens.
    });
    socket.addEventListener("message", (event) => {
      if (socketRef.current !== socket) return;
      const payload = parseTerminalEvent(event);
      if (!payload) return;
      if (payload.type === "output") {
        xtermRef.current?.write(payload.data);
        return;
      }
      if (payload.type === "session") {
        setStatus("running");
        setBackend(payload.descriptor?.durableBackend ?? null);
        setMessage(payload.descriptor?.durableBackend === "tmux"
          ? "终端运行中 · tmux 持久化"
          : "终端运行中 · PTY 持久化");
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
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      setStatus((current) => (current === "closed" || current === "error" ? current : "closed"));
      setMessage((current) => current || "终端连接已断开");
    });
    socket.addEventListener("error", () => {
      if (socketRef.current !== socket) return;
      setStatus("error");
      setMessage("终端 WebSocket 连接失败");
    });
  }, [active, closeSocket, cwd, profileId, rootId, shell]);

  const startSession = React.useCallback(async () => {
    if (!rootId) return;
    setStatus(createMode === "create" ? "creating" : "connecting");
    setMessage(createMode === "create"
      ? "正在创建受工作区限制的 PTY 终端会话…"
      : "正在恢复已存在的终端会话…");
    try {
      if (createMode !== "create") {
        const persisted = await getTerminalSession(terminalId);
        if (disposedRef.current || userClosedRef.current) return;
        if (!persisted?.canResume || (persisted.status !== "running" && persisted.status !== "detached")) {
          setStatus("closed");
          setMessage("终端会话已结束，已从布局移除");
          window.setTimeout(() => onClose(paneId), 0);
          return;
        }
      }
      const descriptor = await createWorkbenchTerminalSession({
        rootId,
        cwd,
        sessionId: terminalId,
        title,
        profileId,
        shell,
        resume: createMode !== "create",
        ...dimensionsRef.current,
      });
      sessionIdRef.current = descriptor.sessionId;
      if (userClosedRef.current) {
        await killSession(descriptor.sessionId);
        return;
      }
      if (disposedRef.current) return;
      setSessionId(descriptor.sessionId);
      setBackend(descriptor.durableBackend ?? null);
      attachSocket(descriptor.sessionId);
    } catch (error) {
      if (createMode !== "create") {
        setStatus("closed");
        setMessage("终端会话不可恢复，已从布局移除");
        window.setTimeout(() => onClose(paneId), 0);
        return;
      }
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "创建终端失败");
    }
  }, [attachSocket, createMode, cwd, killSession, onClose, paneId, profileId, rootId, shell, terminalId, title]);

  React.useEffect(() => {
    if (sessionId || status === "creating" || status === "connecting" || status === "running") return;
    void startSession();
  }, [sessionId, startSession, status]);

  React.useEffect(() => {
    // Prop identity changes must not reuse the previous xterm/socket pair.
    if (previousTerminalIdRef.current === terminalId) return;
    previousTerminalIdRef.current = terminalId;
    userClosedRef.current = false;
    closeSocket();
    setTerminalFocused(false);
    sessionIdRef.current = null;
    setSessionId(null);
    setStatus("idle");
    setMessage("准备启动本地 Shell");
    setBackend(null);
    xtermRef.current?.clear();
    updateSelectedText("");
  }, [closeSocket, terminalId, updateSelectedText]);

  React.useEffect(() => () => {
    // Component unmount means the browser view detached, not that the user ended
    // the terminal. Keep the pinned PTY alive for refresh, route changes, panel
    // placement switches, and later cross-device reattach flows.
    closeSocket();
  }, [closeSocket]);

  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [menu]);

  React.useEffect(() => {
    if (!active) return;
    const handleInsert = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      sendText(String(detail?.text || ""));
    };
    window.addEventListener(TERMINAL_INSERT_EVENT, handleInsert);
    return () => window.removeEventListener(TERMINAL_INSERT_EVENT, handleInsert);
  }, [active, sendText]);

  const handleInput = React.useCallback((data: string) => {
    sendText(data);
  }, [sendText]);

  const handleResize = React.useCallback((dimensions: XtermDimensions) => {
    dimensionsRef.current = dimensions;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "resize", ...dimensions }));
  }, []);

  const selectAll = React.useCallback(() => {
    xtermRef.current?.selectAll();
    updateSelectedText(xtermRef.current?.getSelection() ?? "");
  }, [updateSelectedText]);

  const clearSelection = React.useCallback(() => {
    xtermRef.current?.clearSelection();
    updateSelectedText("");
  }, [updateSelectedText]);

  const closePane = React.useCallback(() => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    setClosing(true);
    setMenu(null);
    userClosedRef.current = true;
    const sid = sessionIdRef.current || terminalId;
    closeSocket();
    setStatus("closed");
    setMessage("终端已关闭");
    onClose(paneId);
    void killSession(sid).then((result) => {
      if (result.failed) {
        toast.warning("终端窗格已从界面强制关闭，后台会继续重试清理残留进程", {
          description: sid ? `终端会话 ${sid} 未即时确认关闭，已加入持久重试队列。` : undefined,
        });
      }
    });
  }, [closeSocket, killSession, onClose, paneId, terminalId]);

  const insertPath = React.useCallback((path: string | undefined) => {
    const normalized = String(path || "").trim();
    if (!normalized) return;
    sendText(`${shellQuotePath(normalized)} `);
  }, [sendText]);

  const handleDrop = React.useCallback((event: React.DragEvent) => {
    const paths = extractTransferPaths(event.dataTransfer);
    if (!paths.length) return;
    event.preventDefault();
    event.stopPropagation();
    sendText(`${paths.map(shellQuotePath).join(" ")} `);
  }, [sendText]);

  const uploadFilesToTerminalTemp = React.useCallback(async (files: File[]) => {
    if (!files.length) return;

    const targetDirectory = terminalClipboardUploadDirectory(terminalId, cwd);
    try {
      await ensureWorkspaceDirectory(rootId, targetDirectory);
      toast.info("正在上传剪贴板文件", {
        description: `上传到终端临时目录：${targetDirectory || "/"}`,
      });
      const batch = createUploadBatch({
        rootId,
        directoryPath: targetDirectory,
        files,
        conflictPolicy: "rename",
      });
      await batch.done;
      const uploadedPaths = batch.jobs
        .filter((job) => job.status === "done" && job.targetPath)
        .map((job) => job.targetPath as string);
      const failed = batch.jobs.filter((job) => job.status === "error" || job.status === "canceled");
      if (!uploadedPaths.length || failed.length) {
        toast.error("终端剪贴板上传未完成", {
          description: failed[0]?.error || "没有可插入的上传路径",
        });
        return;
      }
      const workspaceRootAbsolutePath = inferWorkspaceRootAbsolutePath(cwdAbsolutePath, cwd);
      const shellPaths = uploadedPaths.map((path) =>
        workspaceRootAbsolutePath ? joinAbsoluteWorkspacePath(workspaceRootAbsolutePath, path) : path,
      );
      sendText(`${shellPaths.map(shellQuotePath).join(" ")} `);
      toast.success("已上传并插入终端路径", { description: `${shellPaths.length} 个文件` });
    } catch (error) {
      toast.error("终端剪贴板上传失败", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [cwd, cwdAbsolutePath, rootId, sendText, terminalId]);

  const uploadClipboardFilesToTerminalTemp = React.useCallback(async (dataTransfer: DataTransfer) => {
    const files = await collectUploadFilesFromDataTransfer(dataTransfer);
    await uploadFilesToTerminalTemp(files);
  }, [uploadFilesToTerminalTemp]);

  const pasteClipboardToTerminal = React.useCallback(async () => {
    try {
      const files = await readFilesFromBrowserClipboard({ allowEmpty: true });
      if (files.length) {
        await uploadFilesToTerminalTemp(files);
        return;
      }
    } catch {
      // Some browsers only expose text through readText(), or require a paste
      // event for file payloads. Fall through to text paste rather than sending
      // Ctrl+V into the backend CLI, which would read the backend OS clipboard.
    }
    await pasteClipboardText();
  }, [pasteClipboardText, uploadFilesToTerminalTemp]);

  const uploadReadableClipboardFilesToTerminalTemp = React.useCallback(async () => {
    try {
      const files = await readFilesFromBrowserClipboard();
      if (!files.length) {
        toast.info("剪贴板里没有可上传的文件或图片", {
          description: "这与终端内 CLI 读取系统剪贴板不同；请在浏览器授权后重试。",
        });
        return;
      }
      await uploadFilesToTerminalTemp(files);
    } catch (error) {
      toast.error("读取浏览器剪贴板文件/图片失败", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [uploadFilesToTerminalTemp]);

  const handlePasteCapture = React.useCallback((event: React.ClipboardEvent) => {
    if (!hasUploadFilesInDataTransfer(event.clipboardData)) return;
    event.preventDefault();
    event.stopPropagation();
    void uploadClipboardFilesToTerminalTemp(event.clipboardData);
  }, [uploadClipboardFilesToTerminalTemp]);

  return (
    <section
      className={cn(
        "group/pane grid h-full min-h-0 min-w-0 overflow-hidden border bg-panel text-ink",
        showHeader ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[minmax(0,1fr)]",
        active ? "border-primary-line shadow-[inset_0_0_0_1px_var(--primary-line)]" : "border-line",
      )}
      data-ide-terminal-pane
      data-terminal-pane-id={paneId}
      data-terminal-id={terminalId}
      data-terminal-profile-id={profileId || undefined}
      data-terminal-shell={shell || undefined}
      data-active-terminal-pane={active ? "true" : "false"}
      onPointerDown={(event) => {
        onFocus(paneId);
      }}
      onContextMenuCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onFocus(paneId);
        setMenu(positionTerminalPaneMenu(event.clientX, event.clientY));
      }}
      onDragOver={(event) => {
        if (hasTransferPath(event.dataTransfer)) event.preventDefault();
      }}
      onDrop={handleDrop}
      onPasteCapture={handlePasteCapture}
    >
      <span className="sr-only" data-ide-terminal-pane-status>{status}</span>
      {showHeader ? (
        <header className="flex min-h-8 items-center gap-1 border-b border-line bg-panel-2 px-2 text-xs">
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-ink-strong outline-none focus-visible:shadow-[var(--ring)]"
            onClick={() => onFocus(paneId)}
          >
            {title}
            <span className="ml-2 rounded bg-panel px-1 text-2xs text-muted">{formatPaneStatus(status)}</span>
            {shell ? (
              <span className="ml-1 rounded bg-panel px-1 font-mono text-2xs text-muted" title="Shell / 终端配置" data-ide-terminal-shell>
                {shell}
              </span>
            ) : null}
            {backend ? (
              <span className="ml-1 rounded bg-primary-soft px-1 font-mono text-2xs text-primary" title={backend === "tmux" ? "tmux 后端：可在后端重启后重新 attach" : "PTY 后端：浏览器刷新/断线可重新 attach，后端重启后会结束"} data-ide-terminal-backend>
                {backend}
              </span>
            ) : null}
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={closePane}
            disabled={closing}
            aria-label={closing ? "正在关闭终端窗格" : "强制关闭终端窗格"}
            title={closing ? "正在关闭终端窗格" : "强制关闭终端窗格"}
          >
            <X />
          </Button>
        </header>
      ) : null}
      <div className="relative min-h-0 min-w-0" data-ide-terminal-pane-body>
        {status === "error" ? (
          <div className="absolute inset-x-3 top-3 z-10 flex items-start gap-2 rounded-md border border-red/40 bg-red-soft p-2 text-xs text-ink-strong" role="status">
            <AlertTriangle className="mt-0.5 size-4 text-red" />
            <div>
              <div className="font-medium">终端不可用</div>
              <div className="text-muted">{message}</div>
            </div>
          </div>
        ) : null}
        <XtermHost
          ref={xtermRef}
          acceptInput={active && terminalFocused && status !== "closed" && status !== "error"}
          onInput={handleInput}
          onResize={handleResize}
          onSelectionChange={updateSelectedText}
          onFocusChange={setTerminalFocused}
          onCopyShortcut={() => void copyTerminalSelectionToClipboard()}
          onPasteShortcut={() => void pasteClipboardToTerminal()}
        />
      </div>
      {menu ? (
        <div
          role="menu"
          className="fixed z-50 min-w-52 overflow-y-auto rounded-md border border-line bg-panel p-1 text-sm text-ink shadow-lg"
          style={{
            left: menu.x,
            top: menu.y,
            maxHeight: `calc(100vh - ${menu.y + TERMINAL_PANE_MENU_VIEWPORT_PADDING}px)`,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          data-ide-terminal-pane-context-menu
        >
          <TerminalPaneMenuButton icon={<Copy />} label="复制选中内容" disabled={!selectedText} onClick={() => { void copyTerminalSelectionToClipboard(); setMenu(null); }} />
          <TerminalPaneMenuButton icon={<ClipboardPaste />} label="粘贴剪贴板文本" onClick={() => { void pasteClipboardText(); setMenu(null); }} />
          <TerminalPaneMenuButton icon={<ImagePlus />} label="粘贴文件/图片为路径" onClick={() => { void uploadReadableClipboardFilesToTerminalTemp(); setMenu(null); }} />
          <TerminalPaneMenuButton icon={<FileInput />} label="全选终端内容" onClick={() => { selectAll(); setMenu(null); }} />
          <TerminalPaneMenuButton icon={<FolderInput />} label="插入当前目录路径" onClick={() => { insertPath(cwdAbsolutePath || cwd); setMenu(null); }} />
          <TerminalPaneMenuButton icon={<Copy />} label="复制终端 ID" onClick={() => { void navigator.clipboard?.writeText?.(terminalId); setMenu(null); }} />
          <TerminalPaneMenuButton icon={<X />} label="清空选区" disabled={!selectedText} onClick={() => { clearSelection(); setMenu(null); }} />
          <div className="my-1 border-t border-line" />
          <TerminalPaneMenuButton danger icon={<X />} label={closing ? "正在关闭终端窗格" : "强制关闭终端窗格"} disabled={closing} onClick={() => { setMenu(null); void closePane(); }} />
        </div>
      ) : null}
    </section>
  );
}

function positionTerminalPaneMenu(clientX: number, clientY: number): TerminalPaneMenuState {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || TERMINAL_PANE_MENU_WIDTH;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || TERMINAL_PANE_MENU_HEIGHT;
  const maxX = Math.max(
    TERMINAL_PANE_MENU_VIEWPORT_PADDING,
    viewportWidth - TERMINAL_PANE_MENU_WIDTH - TERMINAL_PANE_MENU_VIEWPORT_PADDING,
  );
  const maxY = Math.max(
    TERMINAL_PANE_MENU_VIEWPORT_PADDING,
    viewportHeight - TERMINAL_PANE_MENU_HEIGHT - TERMINAL_PANE_MENU_VIEWPORT_PADDING,
  );
  return {
    x: Math.max(TERMINAL_PANE_MENU_VIEWPORT_PADDING, Math.min(clientX, maxX)),
    y: Math.max(TERMINAL_PANE_MENU_VIEWPORT_PADDING, Math.min(clientY, maxY)),
  };
}

function formatPaneStatus(status: TerminalPaneStatus): string {
  switch (status) {
    case "idle":
      return "待启动";
    case "creating":
      return "创建中";
    case "connecting":
      return "连接中";
    case "running":
      return "运行中";
    case "closed":
      return "已关闭";
    case "error":
      return "错误";
    default:
      return status;
  }
}

function TerminalPaneMenuButton({
  icon,
  label,
  danger = false,
  disabled = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left outline-none hover:bg-panel-3 focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent [&_svg]:size-3.5",
        danger && "text-red hover:bg-red-soft",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

async function readFilesFromBrowserClipboard(options: { allowEmpty?: boolean } = {}): Promise<File[]> {
  const read = navigator.clipboard && "read" in navigator.clipboard
    ? navigator.clipboard.read.bind(navigator.clipboard)
    : null;
  if (!read) {
    if (options.allowEmpty) return [];
    throw new Error("当前浏览器不支持读取剪贴板文件/图片；可改用 Ctrl/⌘+V 或拖拽文件到终端。 ");
  }
  const items = await read();
  const files: File[] = [];
  let imageIndex = 1;
  let fileIndex = 1;
  for (const item of items) {
    for (const type of item.types) {
      if (!isUploadableClipboardMime(type)) continue;
      const blob = await item.getType(type);
      const name = type.startsWith("image/")
        ? `clipboard-image-${Date.now()}-${imageIndex++}${mimeExtension(type)}`
        : `clipboard-file-${Date.now()}-${fileIndex++}${mimeExtension(type)}`;
      files.push(new File([blob], name, { type, lastModified: Date.now() }));
    }
  }
  return files;
}

function isUploadableClipboardMime(type: string): boolean {
  if (!type) return false;
  if (type.startsWith("image/")) return true;
  return type === "application/pdf" || type === "application/octet-stream" || type.startsWith("video/") || type.startsWith("audio/");
}

function mimeExtension(type: string): string {
  const normalized = type.toLowerCase();
  if (normalized === "image/png") return ".png";
  if (normalized === "image/jpeg") return ".jpg";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/gif") return ".gif";
  if (normalized === "image/svg+xml") return ".svg";
  if (normalized === "application/pdf") return ".pdf";
  if (normalized === "video/mp4") return ".mp4";
  if (normalized === "audio/mpeg") return ".mp3";
  if (normalized === "audio/wav") return ".wav";
  return ".bin";
}

async function ensureWorkspaceDirectory(rootId: string, directoryPath: string): Promise<void> {
  const segments = normalizeExplorerPath(directoryPath).split("/").filter(Boolean);
  let parentPath = "";
  for (const segment of segments) {
    try {
      await createDirectory({ rootId, directoryPath: parentPath, name: segment });
    } catch (error) {
      if (!isDirectoryAlreadyExistsError(error)) throw error;
    }
    parentPath = joinExplorerPath(parentPath, segment);
  }
}

function isDirectoryAlreadyExistsError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return message.includes("already")
    || message.includes("exist")
    || message.includes("eexist")
    || message.includes("file_exists")
    || message.includes("已存在");
}

function terminalClipboardUploadDirectory(terminalId: string, cwd?: string): string {
  const cwdPath = normalizeExplorerPath(cwd);
  const basePath = cwdPath
    ? joinExplorerPath(cwdPath, TERMINAL_CLIPBOARD_UPLOAD_ROOT)
    : TERMINAL_CLIPBOARD_UPLOAD_ROOT_FALLBACK;
  return joinExplorerPath(basePath, sanitizePathSegment(terminalId));
}

function sanitizePathSegment(value: string): string {
  return String(value || "terminal")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "terminal";
}

function inferWorkspaceRootAbsolutePath(cwdAbsolutePath?: string, cwd?: string): string | null {
  const absolute = String(cwdAbsolutePath || "").replace(/\\/g, "/").replace(/\/+$/g, "");
  if (!absolute) return null;
  const relativeCwd = normalizeExplorerPath(cwd);
  if (!relativeCwd) return absolute || "/";
  const suffix = `/${relativeCwd}`;
  if (!absolute.endsWith(suffix)) return null;
  const root = absolute.slice(0, -suffix.length);
  return root || "/";
}

function joinAbsoluteWorkspacePath(rootAbsolutePath: string, relativePath: string): string {
  const root = String(rootAbsolutePath || "").replace(/\\/g, "/").replace(/\/+$/g, "");
  const relative = normalizeExplorerPath(relativePath);
  if (!root || root === "/") return `/${relative}`;
  return relative ? `${root}/${relative}` : root;
}

function hasTransferPath(dataTransfer: DataTransfer): boolean {
  return hasExplorerTransferPayload(dataTransfer) || Array.from(dataTransfer.types || []).some((type) =>
    type === "text/uri-list" || type === "text/plain",
  );
}

function extractTransferPaths(dataTransfer: DataTransfer): string[] {
  const custom = readExplorerTransferPayload(dataTransfer);
  if (custom) {
    const paths = custom.items
      .map((item) => item.absolutePath || item.path || "")
      .map((path) => String(path || "").trim())
      .filter(Boolean);
    if (paths.length) return paths;
  }
  const uriList = dataTransfer.getData("text/uri-list");
  if (uriList) {
    const paths = uriList
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.startsWith("file://") ? decodeURIComponent(line.replace(/^file:\/\//, "")) : line);
    if (paths.length) return paths;
  }
  const text = dataTransfer.getData("text/plain").trim();
  return text ? [text] : [];
}

function shellQuotePath(path: string): string {
  if (!path) return "''";
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(path)) return path;
  return `'${path.replace(/'/g, `'\\''`)}'`;
}
