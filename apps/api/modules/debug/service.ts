import crypto from "node:crypto";
import fs from "node:fs";
import type http from "node:http";
import path from "node:path";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";

import type { TracevaneServerConfig } from "../../../../types/api.js";
import type {
  DebugBreakpointLocation,
  DebugCreateSessionRequest,
  DebugLifecycleEventKind,
  DebugGatewayClientEvent,
  DebugGatewayServerEvent,
  DebugProfileDescriptor,
  DebugSourceLocation,
  DebugStackFrame,
  DebugVariable,
  DebugSessionDescriptor,
  DebugSessionPayload,
  DebugSessionsPayload,
  DebugStatusPayload,
  DebugStopSessionRequest,
} from "../../../../types/debug.js";
import {
  resolveFilesServiceDirectoryPath,
  resolveFilesServiceExistingFilePath,
} from "../files/service.js";

const DEBUG_WS_PATH = "/ws/debug";
const MOCK_PROFILE_ID = "mock-node";
const NODE_LITE_PROFILE_ID = "node-lite";

const DEBUG_PROFILES: DebugProfileDescriptor[] = [
  {
    id: MOCK_PROFILE_ID,
    label: "Mock Node Debugger",
    kind: "mock",
    description: "Deterministic Debug Adapter skeleton for Tracevane Workbench smoke validation.",
  },
  {
    id: NODE_LITE_PROFILE_ID,
    label: "Node Lite Adapter Proof",
    kind: "adapter-proof",
    description: "Minimal guarded adapter-proof profile that maps program breakpoints to stopped/stack/variables events.",
    requiresProgram: true,
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
        "adapter-proof-profile",
        "stack-trace-events",
        "variables-events",
        "lifecycle-events",
        "session-state-machine",
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
    const adapterResult = createAdapterProofResult(validated);
    const activeLocation = adapterResult.activeLocation;
    const stoppedReason = activeLocation ? "breakpoint" : "entry";
    const message = activeLocation
      ? `${validated.profile.label} stopped at ${activeLocation.path}:${activeLocation.lineNumber}.`
      : `${validated.profile.label} stopped on entry.`;
    let session: DebugSessionDescriptor = {
      id,
      rootId: validated.rootId,
      workspaceId: validated.workspaceId,
      cwd: validated.cwd,
      profileId: validated.profileId,
      name: validated.name,
      state: "created",
      adapterKind: validated.profile.kind,
      program: validated.program?.relativePath ?? null,
      createdAt: now,
      updatedAt: now,
      activeLocation,
      lifecycleEvent: "created",
      stoppedReason: null,
      terminationReason: null,
      lastError: null,
      message: `${validated.profile.label} session created.`,
    };
    sessions.set(id, session);
    emitSessionLifecycle(session, "created", session.message);
    session = transitionSession(session, "initializing", "initialized", `${validated.profile.label} initialized.`);
    session = transitionSession(session, "configured", "configured", `${validated.profile.label} configured.`);
    session = transitionSession(session, "running", "running", `${validated.profile.label} running.`);
    session = transitionSession(session, "stopped", "stopped", message, { stoppedReason });
    emit({
      type: "output",
      sessionId: id,
      category: "console",
      text: activeLocation
        ? `${validated.profile.label} ${session.name} initialized at ${session.cwd || "."}; stopped at ${activeLocation.path}:${activeLocation.lineNumber}`
        : `${validated.profile.label} ${session.name} initialized at ${session.cwd || "."}`,
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
    if (adapterResult.frames.length) {
      emit({
        type: "stackTrace",
        sessionId: id,
        threadId: 1,
        frames: adapterResult.frames,
        timestamp: now,
      });
    }
    if (adapterResult.variables.length) {
      emit({
        type: "variables",
        sessionId: id,
        frameId: adapterResult.frames[0]?.id ?? 1,
        variables: adapterResult.variables,
        timestamp: now,
      });
    }
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
      state: "terminating",
      updatedAt: now,
      lifecycleEvent: "terminating",
      stoppedReason: existing.stoppedReason ?? null,
      message: "Mock debug session terminating.",
    };
    sessions.set(sessionId, session);
    emitSessionLifecycle(session, "terminating", session.message);
    const terminated = transitionSession(session, "terminated", "terminated", "Mock debug session terminated.", {
      stoppedReason: "terminated",
      terminationReason: "terminated",
      activeLocation: null,
    });
    emit({
      type: "output",
      sessionId,
      category: "console",
      text: `Mock debug session ${terminated.name} terminated`,
      timestamp: now,
    });
    emit({ type: "terminated", sessionId, reason: "terminated", timestamp: now });
    return { session: terminated };
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

  function transitionSession(
    current: DebugSessionDescriptor,
    state: DebugSessionDescriptor["state"],
    event: DebugLifecycleEventKind,
    message: string,
    patch: Partial<Pick<DebugSessionDescriptor, "activeLocation" | "lastError" | "stoppedReason" | "terminationReason">> = {},
  ): DebugSessionDescriptor {
    const next: DebugSessionDescriptor = {
      ...current,
      ...patch,
      state,
      lifecycleEvent: event,
      message,
      updatedAt: new Date().toISOString(),
    };
    sessions.set(next.id, next);
    emitSessionLifecycle(next, event, message, patch.terminationReason ?? patch.lastError ?? patch.stoppedReason ?? null);
    return next;
  }

  function emitSessionLifecycle(
    session: DebugSessionDescriptor,
    event: DebugLifecycleEventKind,
    message: string | null | undefined,
    reason: string | null = null,
  ): void {
    const timestamp = session.updatedAt || new Date().toISOString();
    emit({ type: "session", session });
    emit({
      type: "lifecycle",
      sessionId: session.id,
      state: session.state,
      event,
      message: message ?? null,
      reason,
      timestamp,
    });
  }
}

function validateCreateRequest(
  config: TracevaneServerConfig,
  request: DebugCreateSessionRequest,
): {
  rootId: string;
  workspaceId: string | null;
  cwd: string;
  profile: DebugProfileDescriptor;
  profileId: string;
  name: string;
  breakpoints: DebugBreakpointLocation[];
  program: { relativePath: string; absolutePath: string } | null;
} {
  const rootId = String(request?.rootId || "").trim();
  if (!rootId) throw new Error("Debug rootId is required");
  const profileId = String(request?.profileId || MOCK_PROFILE_ID).trim() || MOCK_PROFILE_ID;
  const profile = DEBUG_PROFILES.find((item) => item.id === profileId);
  if (!profile) throw new Error("Unsupported debug profile");
  const resolved = resolveFilesServiceDirectoryPath(config, rootId, request?.cwd || "");
  const program = profile.requiresProgram
    ? resolveDebugProgram(config, resolved.root.id, request?.program)
    : null;
  const name = String(request?.name || profile.label).trim() || profile.label;
  const breakpoints = normalizeBreakpointLocations(config, resolved.root.id, request?.breakpoints);
  return {
    rootId: resolved.root.id,
    workspaceId: String(request?.workspaceId || rootId || "").trim() || null,
    cwd: resolved.relativePath,
    profile,
    profileId,
    name,
    breakpoints,
    program,
  };
}

function resolveDebugProgram(
  config: TracevaneServerConfig,
  rootId: string,
  program: string | null | undefined,
): { relativePath: string; absolutePath: string } {
  const rawProgram = String(program || "").trim();
  if (!rawProgram) throw new Error("Debug program is required for this profile");
  const resolved = resolveFilesServiceExistingFilePath(config, rootId, rawProgram);
  const extension = path.extname(resolved.relativePath).toLowerCase();
  if (![".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx"].includes(extension)) {
    throw new Error("Node Lite adapter proof only accepts JavaScript/TypeScript source files");
  }
  return { relativePath: resolved.relativePath, absolutePath: resolved.absolutePath };
}

function createAdapterProofResult(validated: {
  rootId: string;
  cwd: string;
  profile: DebugProfileDescriptor;
  breakpoints: DebugBreakpointLocation[];
  program: { relativePath: string; absolutePath: string } | null;
}): { activeLocation: DebugSourceLocation | null; frames: DebugStackFrame[]; variables: DebugVariable[] } {
  if (validated.profile.id !== NODE_LITE_PROFILE_ID || !validated.program) {
    const activeLocation = validated.breakpoints.find((breakpoint) => breakpoint.enabled !== false) ?? null;
    return { activeLocation, frames: [], variables: [] };
  }
  const lineCount = safeReadLineCount(validated.program.absolutePath);
  const programBreakpoints = validated.breakpoints.filter((breakpoint) =>
    breakpoint.enabled !== false
    && breakpoint.rootId === validated.rootId
    && breakpoint.path === validated.program?.relativePath,
  );
  const firstBreakpoint = programBreakpoints[0];
  const lineNumber = Math.max(1, Math.min(firstBreakpoint?.lineNumber ?? 1, lineCount));
  const activeLocation: DebugSourceLocation = {
    rootId: validated.rootId,
    path: validated.program.relativePath,
    lineNumber,
    column: firstBreakpoint?.column ?? 1,
  };
  const frame: DebugStackFrame = {
    id: 1,
    name: `adapter-proof:${path.basename(validated.program.relativePath)}`,
    source: activeLocation,
  };
  const variables: DebugVariable[] = [
    { name: "program", value: validated.program.relativePath, type: "string", variablesReference: 0 },
    { name: "cwd", value: validated.cwd || ".", type: "string", variablesReference: 0 },
    { name: "breakpointCount", value: String(programBreakpoints.length), type: "number", variablesReference: 0 },
    { name: "adapter", value: NODE_LITE_PROFILE_ID, type: "string", variablesReference: 0 },
  ];
  return { activeLocation, frames: [frame], variables };
}

function safeReadLineCount(absolutePath: string): number {
  try {
    const content = fs.readFileSync(absolutePath, "utf8");
    return Math.max(1, content.split(/\r\n|\r|\n/).length);
  } catch {
    return 1;
  }
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
