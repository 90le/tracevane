import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import type http from "node:http";
import path from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

import type { TracevaneServerConfig } from "../../../../types/api.js";
import type {
  DebugBreakpointLocation,
  DebugControlAction,
  DebugControlSessionRequest,
  DebugCreateSessionRequest,
  DebugEvaluateMode,
  DebugEvaluatePayload,
  DebugEvaluateRequest,
  DebugLaunchProfile,
  DebugLifecycleEventKind,
  DebugGatewayClientEvent,
  DebugGatewayServerEvent,
  DebugSourceLocation,
  DebugScope,
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
const NODE_INSPECTOR_PROFILE_ID = "node-inspector-lite";
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
  {
    id: NODE_INSPECTOR_PROFILE_ID,
    label: "Node Inspector Lite",
    kind: "node-inspector",
    description: "Minimal real Node inspector protocol profile that launches a guarded local Node program and captures paused stack proof.",
    requiresProgram: true,
    allowArgs: true,
    allowEnv: true,
    maxArgs: 16,
    maxEnv: 32,
    programExtensions: [".js", ".cjs", ".mjs"],
  },
];

export interface DebugService {
  getStatus(): DebugStatusPayload;
  listSessions(): DebugSessionsPayload;
  createSession(request: DebugCreateSessionRequest): Promise<DebugSessionPayload>;
  controlSession(request: DebugControlSessionRequest): DebugSessionPayload;
  evaluateSession(request: DebugEvaluateRequest): DebugEvaluatePayload;
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
        "node-inspector-lite-profile",
        "node-inspector-launch-proof",
        "debug-control-commands",
        "debug-scopes",
        "debug-console-evaluate-proof",
        "debug-watch-expressions-proof",
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

  async function createSession(request: DebugCreateSessionRequest): Promise<DebugSessionPayload> {
    const validated = validateCreateRequest(config, request);
    const now = new Date().toISOString();
    const id = `debug-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
    const adapterResult = validated.profile.id === NODE_INSPECTOR_PROFILE_ID
      ? await createNodeInspectorProofResult(validated)
      : createAdapterProofResult(validated);
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
    if (adapterResult.scopes.length) {
      emit({
        type: "scopes",
        sessionId: id,
        frameId: adapterResult.frames[0]?.id ?? 1,
        scopes: adapterResult.scopes,
        timestamp: now,
      });
    }
    return { session };
  }

  function controlSession(request: DebugControlSessionRequest): DebugSessionPayload {
    const sessionId = String(request?.sessionId || "").trim();
    const action = normalizeDebugControlAction(request?.action);
    if (!sessionId) throw new Error("Debug session id is required");
    const existing = sessions.get(sessionId);
    if (!existing) throw new Error("Debug session not found");
    if (["terminated", "terminating", "disconnected", "error"].includes(existing.state)) {
      throw new Error(`Debug session cannot ${action} from ${existing.state}`);
    }
    if (action === "continue") {
      const running = transitionSession(existing, "running", "running", "Debug control continue.", {
        stoppedReason: "continued",
      });
      emit({
        type: "output",
        sessionId,
        category: "console",
        text: `Debug control continue: ${running.name}`,
        timestamp: running.updatedAt,
      });
      return { session: running };
    }
    if (action === "pause") {
      const paused = transitionSession(existing, "stopped", "stopped", "Debug control pause.", {
        stoppedReason: "pause",
        activeLocation: existing.activeLocation ?? null,
      });
      emitStoppedProof(paused, "pause");
      return { session: paused };
    }
    if (existing.state !== "stopped") {
      throw new Error(`Debug session must be stopped before ${action}`);
    }
    const stepped = transitionSession(existing, "stopped", "stopped", `Debug control ${action}.`, {
      stoppedReason: action,
      activeLocation: stepDebugLocation(existing.activeLocation ?? null, action),
    });
    emitStoppedProof(stepped, action);
    return { session: stepped };
  }

  function evaluateSession(request: DebugEvaluateRequest): DebugEvaluatePayload {
    const sessionId = String(request?.sessionId || "").trim();
    if (!sessionId) throw new Error("Debug session id is required");
    const session = sessions.get(sessionId);
    if (!session) throw new Error("Debug session not found");
    if (["terminated", "terminating", "disconnected", "error"].includes(session.state)) {
      throw new Error(`Debug session cannot evaluate from ${session.state}`);
    }
    const expression = normalizeDebugEvaluateExpression(request?.expression);
    const mode = normalizeDebugEvaluateMode(request?.mode);
    const result = createDebugEvaluateResult(session, expression, mode);
    emit({ type: "evaluation", result });
    emit({
      type: "output",
      sessionId,
      category: "console",
      text: `Debug ${mode} proof: ${expression} => ${result.value}`,
      timestamp: result.timestamp,
    });
    return { result };
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
          void createSession(parsed).catch((error) => {
            send(socket, { type: "error", message: error instanceof Error ? error.message : String(error) });
          });
          return;
        }
        if (parsed.type === "stop") {
          stopSession(parsed);
          return;
        }
        if (parsed.type === "control") {
          controlSession(parsed);
          return;
        }
        if (parsed.type === "evaluate") {
          evaluateSession(parsed);
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
    controlSession,
    evaluateSession,
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

  function emitStoppedProof(session: DebugSessionDescriptor, reason: DebugControlAction): void {
    const timestamp = session.updatedAt || new Date().toISOString();
    emit({
      type: "output",
      sessionId: session.id,
      category: "console",
      text: `Debug control ${reason}: ${session.name}`,
      timestamp,
    });
    emit({
      type: "stopped",
      sessionId: session.id,
      reason,
      threadId: 1,
      timestamp,
      ...(session.activeLocation ?? {}),
    });
    if (!session.activeLocation) return;
    emit({
      type: "stackTrace",
      sessionId: session.id,
      threadId: 1,
      frames: [{
        id: 1,
        name: `control:${reason}`,
        source: session.activeLocation,
      }],
      timestamp,
    });
  }
}

type DebugAdapterResult = {
  activeLocation: DebugSourceLocation | null;
  frames: DebugStackFrame[];
  variables: DebugVariable[];
  scopes: DebugScope[];
};

function normalizeDebugControlAction(input: unknown): DebugControlAction {
  if (
    input === "continue"
    || input === "pause"
    || input === "stepOver"
    || input === "stepInto"
    || input === "stepOut"
  ) {
    return input;
  }
  throw new Error("Unsupported debug control action");
}

function normalizeDebugEvaluateMode(input: unknown): DebugEvaluateMode {
  if (input === "watch") return "watch";
  return "evaluate";
}

function normalizeDebugEvaluateExpression(input: unknown): string {
  const expression = String(input ?? "").trim();
  if (!expression) throw new Error("Debug evaluate expression is required");
  if (expression.length > 256) throw new Error("Debug evaluate expression is too long");
  if (!/^[A-Za-z0-9_.$[\] '\"/:,+\-]+$/.test(expression)) {
    throw new Error("Debug evaluate expression contains unsupported characters");
  }
  return expression;
}

function createDebugEvaluateResult(
  session: DebugSessionDescriptor,
  expression: string,
  mode: DebugEvaluateMode,
): DebugEvaluatePayload["result"] {
  const timestamp = new Date().toISOString();
  const value = readDebugExpressionValue(session, expression);
  return {
    id: `eval-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`,
    sessionId: session.id,
    expression,
    mode,
    value: value.value,
    type: value.type,
    variablesReference: 0,
    timestamp,
  };
}

function readDebugExpressionValue(
  session: DebugSessionDescriptor,
  expression: string,
): { value: string; type: string } {
  const normalized = expression.replace(/^["']|["']$/g, "").trim();
  const values: Record<string, { value: string; type: string }> = {
    "session.id": { value: session.id, type: "string" },
    id: { value: session.id, type: "string" },
    "session.name": { value: session.name, type: "string" },
    name: { value: session.name, type: "string" },
    "session.state": { value: session.state, type: "string" },
    state: { value: session.state, type: "string" },
    cwd: { value: session.cwd || ".", type: "string" },
    "session.cwd": { value: session.cwd || ".", type: "string" },
    program: { value: session.program ?? "(none)", type: session.program ? "string" : "null" },
    "session.program": { value: session.program ?? "(none)", type: session.program ? "string" : "null" },
    profileId: { value: session.profileId, type: "string" },
    "session.profileId": { value: session.profileId, type: "string" },
    adapter: { value: session.adapterKind ?? "mock", type: "string" },
    "session.adapterKind": { value: session.adapterKind ?? "mock", type: "string" },
    "args.length": { value: String(session.launchArgs?.length ?? 0), type: "number" },
    args: { value: String(session.launchArgs?.length ?? 0), type: "number" },
    envKeys: { value: session.launchEnvKeys?.join(",") || "(none)", type: "string" },
    "env.keys": { value: session.launchEnvKeys?.join(",") || "(none)", type: "string" },
    lineNumber: { value: String(session.activeLocation?.lineNumber ?? 0), type: "number" },
    "activeLocation.lineNumber": { value: String(session.activeLocation?.lineNumber ?? 0), type: "number" },
    path: { value: session.activeLocation?.path ?? "(none)", type: session.activeLocation?.path ? "string" : "null" },
    "activeLocation.path": { value: session.activeLocation?.path ?? "(none)", type: session.activeLocation?.path ? "string" : "null" },
    stoppedReason: { value: session.stoppedReason ?? "(none)", type: session.stoppedReason ? "string" : "null" },
  };
  return values[normalized] ?? { value: "(not available in safe debug proof)", type: "unavailable" };
}

function stepDebugLocation(
  location: DebugSourceLocation | null,
  action: DebugControlAction,
): DebugSourceLocation | null {
  if (!location) return null;
  if (action === "stepOut") {
    return { ...location, column: Math.max(1, location.column ?? 1) };
  }
  return {
    ...location,
    lineNumber: Math.max(1, location.lineNumber + 1),
    column: Math.max(1, location.column ?? 1),
  };
}

function createDebugScopes(variables: DebugVariable[]): DebugScope[] {
  const byName = new Map(variables.map((variable) => [variable.name, variable]));
  const pick = (names: string[]) => names.map((name) => byName.get(name)).filter((variable): variable is DebugVariable => Boolean(variable));
  const scopes: DebugScope[] = [];
  const local = pick(["program", "cwd", "breakpointCount", "pauseReason"]);
  if (local.length) scopes.push({ name: "Local", variablesReference: 1, variables: local });
  const launch = pick(["args", "envKeys"]);
  if (launch.length) scopes.push({ name: "Launch", variablesReference: 2, variables: launch });
  const adapter = pick(["adapter", "inspector"]);
  if (adapter.length) scopes.push({ name: "Adapter", variablesReference: 3, variables: adapter });
  return scopes;
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
  cwdAbsolutePath: string;
  args: string[];
  env: Record<string, string>;
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
  const env = normalizeLaunchEnv(profile, launch?.env ?? request?.env);
  const envKeys = Object.keys(env).sort((a, b) => a.localeCompare(b));
  return {
    rootId: resolved.root.id,
    workspaceId: String(request?.workspaceId || rootId || "").trim() || null,
    cwd: resolved.relativePath,
    profile,
    profileId,
    name,
    breakpoints,
    program,
    cwdAbsolutePath: resolved.absolutePath,
    args,
    env,
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

function normalizeLaunchEnv(profile: DebugLaunchProfile, input: unknown): Record<string, string> {
  if (input == null) return {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Debug launch env must be an object of string values");
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return {};
  if (!profile.allowEnv) throw new Error(`${profile.label} does not allow launch env`);
  const maxEnv = profile.maxEnv ?? 32;
  if (entries.length > maxEnv) throw new Error(`Debug launch env exceeds max ${maxEnv}`);
  const result: Record<string, string> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid debug launch env key: ${rawKey}`);
    if (typeof rawValue !== "string") throw new Error(`Debug launch env ${key} must be a string`);
    if (rawValue.length > 2048) throw new Error(`Debug launch env ${key} is too long`);
    result[key] = rawValue;
  }
  return result;
}

function createAdapterProofResult(validated: {
  rootId: string;
  cwd: string;
  profile: DebugLaunchProfile;
  breakpoints: DebugBreakpointLocation[];
  program: { relativePath: string; absolutePath: string } | null;
  args: string[];
  env?: Record<string, string>;
  envKeys: string[];
}): DebugAdapterResult {
  if (validated.profile.id !== NODE_LITE_PROFILE_ID || !validated.program) {
    const activeLocation = validated.breakpoints.find((breakpoint) => breakpoint.enabled !== false) ?? null;
    return { activeLocation, frames: [], variables: [], scopes: [] };
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
  return { activeLocation, frames: [frame], variables, scopes: createDebugScopes(variables) };
}

async function createNodeInspectorProofResult(validated: {
  rootId: string;
  cwd: string;
  cwdAbsolutePath: string;
  profile: DebugLaunchProfile;
  breakpoints: DebugBreakpointLocation[];
  program: { relativePath: string; absolutePath: string } | null;
  args: string[];
  env: Record<string, string>;
  envKeys: string[];
}): Promise<DebugAdapterResult> {
  if (!validated.program) throw new Error("Node inspector program is required");
  const launchInput = { ...validated, program: validated.program };
  const inspectorUrl = await launchNodeInspectorAndCaptureUrl(launchInput);
  const proof = await runNodeInspectorProof(launchInput, inspectorUrl.url).finally(() => {
    inspectorUrl.cleanup();
  });
  return proof;
}

function launchNodeInspectorAndCaptureUrl(validated: {
  cwdAbsolutePath: string;
  program: { absolutePath: string };
  args: string[];
  env: Record<string, string>;
}): Promise<{ url: string; cleanup: () => void }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--inspect-brk=127.0.0.1:0",
      validated.program.absolutePath,
      ...validated.args,
    ], {
      cwd: validated.cwdAbsolutePath,
      env: { ...process.env, ...validated.env },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let settled = false;
    let stderr = "";
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Node inspector did not publish a websocket URL in time: ${stderr.slice(-800)}`));
    }, 10_000);
    const cleanup = () => {
      clearTimeout(timeout);
      if (!child.killed) {
        try { child.kill("SIGKILL"); } catch {}
      }
    };
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      const match = stderr.match(/ws:\/\/127\.0\.0\.1:\d+\/[^\s]+/);
      if (!match || settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ url: match[0], cleanup });
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Node inspector process exited before attach: code=${code ?? "null"} signal=${signal ?? "null"} stderr=${stderr.slice(-800)}`));
    });
  });
}

async function runNodeInspectorProof(
  validated: {
    rootId: string;
    cwd: string;
    program: { relativePath: string; absolutePath: string };
    breakpoints: DebugBreakpointLocation[];
    args: string[];
    envKeys: string[];
  },
  inspectorUrl: string,
): Promise<DebugAdapterResult> {
  const socket = new WebSocket(inspectorUrl);
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const pausedEvents: JsonRecord[] = [];
  const waiters: Array<() => void> = [];

  const waitForPaused = (timeoutMs: number): Promise<JsonRecord> => new Promise((resolve, reject) => {
    const existing = pausedEvents.shift();
    if (existing) {
      resolve(existing);
      return;
    }
    const timeout = setTimeout(() => {
      const index = waiters.indexOf(check);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error("Node inspector did not pause in time"));
    }, timeoutMs);
    const check = () => {
      const event = pausedEvents.shift();
      if (!event) return;
      const index = waiters.indexOf(check);
      if (index >= 0) waiters.splice(index, 1);
      clearTimeout(timeout);
      resolve(event);
    };
    waiters.push(check);
  });

  const sendProtocol = (method: string, params: JsonRecord = {}): Promise<unknown> => {
    const id = nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(payload, (error) => {
        if (!error) return;
        pending.delete(id);
        reject(error);
      });
    });
  };

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Node inspector websocket did not open in time")), 10_000);
    socket.once("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  socket.on("message", (data) => {
    let parsed: JsonRecord | null = null;
    try {
      parsed = JSON.parse(String(data)) as JsonRecord;
    } catch {
      return;
    }
    const id = typeof parsed.id === "number" ? parsed.id : null;
    if (id !== null && pending.has(id)) {
      const entry = pending.get(id)!;
      pending.delete(id);
      if (parsed.error) {
        entry.reject(new Error(String((parsed.error as JsonRecord).message || "Node inspector protocol error")));
      } else {
        entry.resolve(parsed.result);
      }
      return;
    }
    if (parsed.method === "Debugger.paused") {
      pausedEvents.push((parsed.params && typeof parsed.params === "object" ? parsed.params : {}) as JsonRecord);
      for (const waiter of [...waiters]) waiter();
    }
  });

  try {
    await sendProtocol("Runtime.enable");
    await sendProtocol("Debugger.enable");
    for (const breakpoint of validated.breakpoints) {
      if (breakpoint.enabled === false || breakpoint.path !== validated.program.relativePath) continue;
      await sendProtocol("Debugger.setBreakpointByUrl", {
        url: pathToFileURL(validated.program.absolutePath).href,
        lineNumber: Math.max(0, breakpoint.lineNumber - 1),
        columnNumber: Math.max(0, (breakpoint.column ?? 1) - 1),
      }).catch(() => undefined);
    }
    await sendProtocol("Runtime.runIfWaitingForDebugger");
    let paused = await waitForPaused(10_000);
    if (hasProgramBreakpoint(validated) && !pausedMatchesProgramBreakpoint(validated, paused)) {
      await sendProtocol("Debugger.resume").catch(() => undefined);
      paused = await waitForPaused(10_000);
    }
    const frames = nodeInspectorFramesToDebugFrames(validated.rootId, validated.program, paused);
    const activeLocation = frames[0]?.source ?? {
      rootId: validated.rootId,
      path: validated.program.relativePath,
      lineNumber: 1,
      column: 1,
    };
    const variables: DebugVariable[] = [
      { name: "adapter", value: NODE_INSPECTOR_PROFILE_ID, type: "string", variablesReference: 0 },
      { name: "inspector", value: "connected", type: "string", variablesReference: 0 },
      { name: "pauseReason", value: String(paused.reason || "unknown"), type: "string", variablesReference: 0 },
      { name: "program", value: validated.program.relativePath, type: "string", variablesReference: 0 },
      { name: "args", value: String(validated.args.length), type: "number", variablesReference: 0 },
      { name: "envKeys", value: validated.envKeys.join(",") || "(none)", type: "string", variablesReference: 0 },
    ];
    return { activeLocation, frames, variables, scopes: createDebugScopes(variables) };
  } finally {
    for (const entry of pending.values()) entry.reject(new Error("Node inspector websocket closed"));
    pending.clear();
    try { socket.close(); } catch {}
  }
}

type JsonRecord = Record<string, unknown>;

function hasProgramBreakpoint(validated: {
  program: { relativePath: string };
  breakpoints: DebugBreakpointLocation[];
}): boolean {
  return validated.breakpoints.some((breakpoint) =>
    breakpoint.enabled !== false && breakpoint.path === validated.program.relativePath,
  );
}

function pausedMatchesProgramBreakpoint(
  validated: {
    program: { relativePath: string };
    breakpoints: DebugBreakpointLocation[];
  },
  paused: JsonRecord,
): boolean {
  const topFrame = Array.isArray(paused.callFrames) ? paused.callFrames[0] : null;
  if (!topFrame || typeof topFrame !== "object") return false;
  const location = (topFrame as JsonRecord).location && typeof (topFrame as JsonRecord).location === "object"
    ? (topFrame as JsonRecord).location as JsonRecord
    : {};
  const pausedLine = Math.max(1, Number(location.lineNumber ?? 0) + 1);
  return validated.breakpoints.some((breakpoint) =>
    breakpoint.enabled !== false
    && breakpoint.path === validated.program.relativePath
    && breakpoint.lineNumber === pausedLine,
  );
}

function nodeInspectorFramesToDebugFrames(
  rootId: string,
  program: { relativePath: string; absolutePath: string },
  paused: JsonRecord,
): DebugStackFrame[] {
  const callFrames = Array.isArray(paused.callFrames) ? paused.callFrames : [];
  const frames = callFrames.slice(0, 10).map((rawFrame, index): DebugStackFrame | null => {
    if (!rawFrame || typeof rawFrame !== "object") return null;
    const frame = rawFrame as JsonRecord;
    const location = frame.location && typeof frame.location === "object" ? frame.location as JsonRecord : {};
    const scriptUrl = String((frame as { url?: unknown }).url || "");
    const sourcePath = nodeInspectorUrlToRelativePath(scriptUrl, program);
    return {
      id: index + 1,
      name: String(frame.functionName || "(anonymous)"),
      source: {
        rootId,
        path: sourcePath,
        lineNumber: Math.max(1, Number(location.lineNumber ?? 0) + 1),
        column: Math.max(1, Number(location.columnNumber ?? 0) + 1),
      },
    };
  }).filter((frame): frame is DebugStackFrame => Boolean(frame));
  return frames.length ? frames : [{
    id: 1,
    name: `node-inspector:${path.basename(program.relativePath)}`,
    source: { rootId, path: program.relativePath, lineNumber: 1, column: 1 },
  }];
}

function nodeInspectorUrlToRelativePath(url: string, program: { relativePath: string; absolutePath: string }): string {
  if (!url) return program.relativePath;
  try {
    const filePath = fileURLToPath(url);
    return path.resolve(filePath) === path.resolve(program.absolutePath)
      ? program.relativePath
      : program.relativePath;
  } catch {
    return program.relativePath;
  }
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
