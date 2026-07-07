import crypto from "node:crypto";
import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";

import type { TracevaneServerConfig } from "../../../../types/api.js";
import type {
  DebugBreakpointLocation,
  DebugCreateSessionRequest,
  DebugSourceLocation,
  DebugGatewayClientEvent,
  DebugGatewayServerEvent,
  DebugProfileDescriptor,
  DebugSessionDescriptor,
  DebugSessionPayload,
  DebugSessionsPayload,
  DebugStatusPayload,
  DebugStopSessionRequest,
} from "../../../../types/debug.js";
import { resolveFilesServiceDirectoryPath } from "../files/service.js";

const DEBUG_WS_PATH = "/ws/debug";
const MOCK_PROFILE_ID = "mock-node";

const DEBUG_PROFILES: DebugProfileDescriptor[] = [
  {
    id: MOCK_PROFILE_ID,
    label: "Mock Node Debugger",
    kind: "mock",
    description: "Deterministic Debug Adapter skeleton for Tracevane Workbench smoke validation.",
  },
];

export interface DebugService {
  getStatus(): DebugStatusPayload;
  listSessions(): DebugSessionsPayload;
  createSession(request: DebugCreateSessionRequest): DebugSessionPayload;
  stopSession(request: DebugStopSessionRequest): DebugSessionPayload;
  handleUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): boolean;
  dispose(): void;
}

interface DebugSocket extends WebSocket {
  _debugSocketId?: string;
}

export function createDebugService(config: TracevaneServerConfig): DebugService {
  const wss = new WebSocketServer({ noServer: true });
  const sockets = new Set<DebugSocket>();
  const sessions = new Map<string, DebugSessionDescriptor>();

  function status(): DebugStatusPayload {
    return {
      ok: true,
      provider: "mock",
      websocketPath: DEBUG_WS_PATH,
      supportedProfiles: DEBUG_PROFILES,
      features: [
        "mock-session",
        "session-list",
        "output-events",
        "stopped-events",
        "terminate-events",
        "breakpoint-locations",
        "stopped-source-location",
      ],
    };
  }

  function emit(event: DebugGatewayServerEvent): void {
    const payload = JSON.stringify(event);
    for (const socket of sockets) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      socket.send(payload);
    }
  }

  function send(socket: WebSocket, event: DebugGatewayServerEvent): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(event));
  }

  function createSession(request: DebugCreateSessionRequest): DebugSessionPayload {
    const validated = validateCreateRequest(config, request);
    const now = new Date().toISOString();
    const id = `debug-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
    const activeLocation = validated.breakpoints.find((breakpoint) => breakpoint.enabled !== false) ?? null;
    const stoppedReason = activeLocation ? "breakpoint" : "entry";
    const message = activeLocation
      ? `Mock debug session stopped at ${activeLocation.path}:${activeLocation.lineNumber}.`
      : "Mock debug session stopped on entry.";
    const session: DebugSessionDescriptor = {
      id,
      rootId: validated.rootId,
      workspaceId: validated.workspaceId,
      cwd: validated.cwd,
      profileId: validated.profileId,
      name: validated.name,
      state: "stopped",
      createdAt: now,
      updatedAt: now,
      stoppedReason,
      message,
      activeLocation,
    };
    sessions.set(id, session);
    emit({ type: "session", session });
    emit({
      type: "output",
      sessionId: id,
      category: "console",
      text: activeLocation
        ? `Mock debug session ${session.name} initialized at ${session.cwd || "."}; stopped at ${activeLocation.path}:${activeLocation.lineNumber}`
        : `Mock debug session ${session.name} initialized at ${session.cwd || "."}`,
      timestamp: now,
    });
    emit({
      type: "stopped",
      sessionId: id,
      reason: stoppedReason,
      threadId: 1,
      timestamp: now,
      ...(activeLocation ?? {}),
    });
    return { session };
  }

  function stopSession(request: DebugStopSessionRequest): DebugSessionPayload {
    const sessionId = String(request?.sessionId || "").trim();
    if (!sessionId) throw new Error("Debug session id is required");
    const existing = sessions.get(sessionId);
    if (!existing) throw new Error("Debug session not found");
    const now = new Date().toISOString();
    const session: DebugSessionDescriptor = {
      ...existing,
      state: "terminated",
      updatedAt: now,
      stoppedReason: "terminated",
      message: "Mock debug session terminated.",
    };
    sessions.set(sessionId, session);
    emit({ type: "session", session });
    emit({
      type: "output",
      sessionId,
      category: "console",
      text: `Mock debug session ${session.name} terminated`,
      timestamp: now,
    });
    emit({ type: "terminated", sessionId, reason: "terminated", timestamp: now });
    return { session };
  }

  wss.on("connection", (socket: DebugSocket) => {
    socket._debugSocketId = crypto.randomUUID();
    sockets.add(socket);
    send(socket, {
      type: "ready",
      provider: "mock",
      websocketPath: DEBUG_WS_PATH,
      message: "Tracevane Debug Gateway skeleton ready",
    });
    send(socket, { type: "status", ...status() });
    send(socket, { type: "sessions", sessions: [...sessions.values()] });

    socket.on("message", (data) => {
      let parsed: DebugGatewayClientEvent | null = null;
      try {
        parsed = JSON.parse(String(data || ""));
      } catch {
        send(socket, { type: "error", message: "Invalid Debug gateway message JSON" });
        return;
      }
      if (!parsed || typeof parsed.type !== "string") {
        send(socket, { type: "error", message: "Unsupported Debug gateway message" });
        return;
      }
      try {
        if (parsed.type === "create") {
          createSession(parsed);
          return;
        }
        if (parsed.type === "stop") {
          stopSession(parsed);
          return;
        }
        if (parsed.type === "list") {
          send(socket, { type: "sessions", sessions: [...sessions.values()] });
          return;
        }
        send(socket, { type: "error", message: "Unsupported Debug gateway message type" });
      } catch (error) {
        send(socket, { type: "error", message: error instanceof Error ? error.message : String(error) });
      }
    });

    socket.on("close", () => {
      sockets.delete(socket);
    });
  });

  return {
    getStatus: status,
    listSessions() {
      return { sessions: [...sessions.values()] };
    },
    createSession,
    stopSession,
    handleUpgrade(req, socket, head) {
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      if (url.pathname !== DEBUG_WS_PATH) return false;
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
      return true;
    },
    dispose() {
      for (const socket of sockets) {
        try { socket.close(1001, "debug service disposed"); } catch {}
      }
      sockets.clear();
      wss.close();
    },
  };
}

function validateCreateRequest(
  config: TracevaneServerConfig,
  request: DebugCreateSessionRequest,
): { rootId: string; workspaceId: string | null; cwd: string; profileId: string; name: string; breakpoints: DebugBreakpointLocation[] } {
  const rootId = String(request?.rootId || "").trim();
  if (!rootId) throw new Error("Debug rootId is required");
  const profileId = String(request?.profileId || MOCK_PROFILE_ID).trim() || MOCK_PROFILE_ID;
  if (profileId !== MOCK_PROFILE_ID) throw new Error("Unsupported debug profile");
  const resolved = resolveFilesServiceDirectoryPath(config, rootId, request?.cwd || "");
  const name = String(request?.name || DEBUG_PROFILES[0].label).trim() || DEBUG_PROFILES[0].label;
  const breakpoints = normalizeBreakpointLocations(config, resolved.root.id, request?.breakpoints);
  return {
    rootId: resolved.root.id,
    workspaceId: String(request?.workspaceId || rootId || "").trim() || null,
    cwd: resolved.relativePath,
    profileId,
    name,
    breakpoints,
  };
}

function normalizeBreakpointLocations(
  config: TracevaneServerConfig,
  rootId: string,
  input: DebugCreateSessionRequest["breakpoints"],
): DebugBreakpointLocation[] {
  if (!Array.isArray(input)) return [];
  const result: DebugBreakpointLocation[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    const normalized = normalizeBreakpointLocation(config, rootId, item);
    if (!normalized) continue;
    const key = `${normalized.rootId}:${normalized.path}:${normalized.lineNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result.slice(0, 500);
}

function normalizeBreakpointLocation(
  config: TracevaneServerConfig,
  rootId: string,
  input: DebugBreakpointLocation | undefined,
): DebugBreakpointLocation | null {
  const path = String(input?.path || "").trim().replace(/^\/+/, "");
  const lineNumber = Math.floor(Number(input?.lineNumber));
  if (!path || !Number.isFinite(lineNumber) || lineNumber < 1) return null;
  const directoryPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  resolveFilesServiceDirectoryPath(config, rootId, directoryPath);
  return {
    rootId,
    path,
    lineNumber,
    column: input?.column && Number(input.column) > 0 ? Math.floor(Number(input.column)) : 1,
    enabled: input?.enabled !== false,
  };
}
