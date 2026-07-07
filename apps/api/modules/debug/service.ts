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
  DebugLaunchProfile,
  DebugLifecycleEventKind,
  DebugGatewayClientEvent,
  DebugGatewayServerEvent,
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
const NODE_LITE_PROGRAM_EXTENSIONS = [".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx"];

const DEBUG_PROFILES: DebugLaunchProfile[] = [
  {
    id: MOCK_PROFILE_ID,
    label: "Mock Node Debugger",
    kind: "mock",
    description: "Deterministic Debug Adapter skeleton for Tracevane Workbench smoke validation.",
    allowArgs: false,
    allowEnv: false,
    maxArgs: 0,
    maxEnv: 0,
  },
  {
    id: NODE_LITE_PROFILE_ID,
    label: "Node Lite Adapter Proof",
    kind: "adapter-proof",
    description: "Minimal guarded adapter-proof profile that maps program breakpoints to stopped/stack/variables events.",
    requiresProgram: true,
    allowArgs: true,
    allowEnv: true,
    maxArgs: 16,
    maxEnv: 32,
    programExtensions: NODE_LITE_PROGRAM_EXTENSIONS,
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
        "launch-profiles",
        "launch-config-validation",
        "launch-args-env-guard",
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
      launchProfileId: validated.profileId,
      launchArgs: validated.args,
      launchEnvKeys: validated.envKeys,
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
        ? `${validated.profile.label} ${session.name} initialized at ${session.cwd || "."}; args=${validated.args.length}; envKeys=${validated.envKeys.length}; stopped at ${activeLocation.path}:${activeLocation.lineNumber}`
        : `${validated.profile.label} ${session.name} initialized at ${session.cwd || "."}; args=${validated.args.length}; envKeys=${validated.envKeys.length}`,
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
  profile: DebugLaunchProfile;
  profileId: string;
  name: string;
  breakpoints: DebugBreakpointLocation[];
  program: { relativePath: string; absolutePath: string } | null;
  args: string[];
  envKeys: string[];
} {
  const rootId = String(request?.rootId || "").trim();
  if (!rootId) throw new Error("Debug rootId is required");
  const launch = request?.launch && typeof request.launch === "object" ? request.launch : null;
  const profileId = String(launch?.profileId || request?.profileId || MOCK_PROFILE_ID).trim() || MOCK_PROFILE_ID;
  const profile = DEBUG_PROFILES.find((item) => item.id === profileId);
  if (!profile) throw new Error("Unsupported debug profile");
  const resolved = resolveFilesServiceDirectoryPath(config, rootId, launch?.cwd ?? request?.cwd ?? "");
  const program = profile.requiresProgram
    ? resolveDebugProgram(config, resolved.root.id, launch?.program ?? request?.program, profile)
    : null;
  const name = String(request?.name || profile.label).trim() || profile.label;
  const breakpoints = normalizeBreakpointLocations(config, resolved.root.id, request?.breakpoints);
  const args = normalizeLaunchArgs(profile, launch?.args ?? request?.args);
  const envKeys = normalizeLaunchEnv(profile, launch?.env ?? request?.env);
  return {
    rootId: resolved.root.id,
    workspaceId: String(request?.workspaceId || rootId || "").trim() || null,
    cwd: resolved.relativePath,
    profile,
    profileId,
    name,
    breakpoints,
    program,
    args,
    envKeys,
  };
}

function resolveDebugProgram(
  config: TracevaneServerConfig,
  rootId: string,
  program: string | null | undefined,
  profile: DebugLaunchProfile,
): { relativePath: string; absolutePath: string } {
  const rawProgram = String(program || "").trim();
  if (!rawProgram) throw new Error("Debug program is required for this profile");
  const resolved = resolveFilesServiceExistingFilePath(config, rootId, rawProgram);
  const extension = path.extname(resolved.relativePath).toLowerCase();
  const allowedExtensions = profile.programExtensions?.length ? profile.programExtensions : NODE_LITE_PROGRAM_EXTENSIONS;
  if (!allowedExtensions.includes(extension)) {
    throw new Error(`${profile.label} only accepts these program extensions: ${allowedExtensions.join(", ")}`);
  }
  return { relativePath: resolved.relativePath, absolutePath: resolved.absolutePath };
}

function normalizeLaunchArgs(profile: DebugLaunchProfile, input: unknown): string[] {
  if (input == null) return [];
  if (Array.isArray(input) && input.length === 0) return [];
  if (!profile.allowArgs) throw new Error(`${profile.label} does not allow launch args`);
  if (!Array.isArray(input)) throw new Error("Debug launch args must be an array of strings");
  const maxArgs = profile.maxArgs ?? 16;
  if (input.length > maxArgs) throw new Error(`Debug launch args exceed max ${maxArgs}`);
  return input.map((item, index) => {
    if (typeof item !== "string") throw new Error(`Debug launch arg ${index + 1} must be a string`);
    const value = item.trim();
    if (!value) throw new Error(`Debug launch arg ${index + 1} must not be empty`);
    if (value.length > 512) throw new Error(`Debug launch arg ${index + 1} is too long`);
    return value;
  });
}

function normalizeLaunchEnv(profile: DebugLaunchProfile, input: unknown): string[] {
  if (input == null) return [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Debug launch env must be an object of string values");
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return [];
  if (!profile.allowEnv) throw new Error(`${profile.label} does not allow launch env`);
  const maxEnv = profile.maxEnv ?? 32;
  if (entries.length > maxEnv) throw new Error(`Debug launch env exceeds max ${maxEnv}`);
  const keys: string[] = [];
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid debug launch env key: ${rawKey}`);
    if (typeof rawValue !== "string") throw new Error(`Debug launch env ${key} must be a string`);
    if (rawValue.length > 2048) throw new Error(`Debug launch env ${key} is too long`);
    keys.push(key);
  }
  return [...new Set(keys)].sort((a, b) => a.localeCompare(b));
}

function createAdapterProofResult(validated: {
  rootId: string;
  cwd: string;
  profile: DebugLaunchProfile;
  breakpoints: DebugBreakpointLocation[];
  program: { relativePath: string; absolutePath: string } | null;
  args: string[];
  envKeys: string[];
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
    { name: "args", value: String(validated.args.length), type: "number", variablesReference: 0 },
    { name: "envKeys", value: validated.envKeys.join(",") || "(none)", type: "string", variablesReference: 0 },
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
