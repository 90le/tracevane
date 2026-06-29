import crypto from "node:crypto";
import path from "node:path";

export type WorkspaceIdeProviderKind =
  | "native-workbench"
  | "openvscode-server"
  | "code-server"
  | "theia";

export type WorkspaceIdeProviderSessionStatus =
  | "starting"
  | "ready"
  | "failed"
  | "stopped";

export interface WorkspaceIdeProviderConfigInput {
  kind?: string | null;
  command?: string | null;
  basePort?: string | number | null;
  enabled?: string | boolean | null;
  token?: string | null;
}

export interface WorkspaceIdeProviderConfig {
  kind: WorkspaceIdeProviderKind;
  command: string | null;
  basePort: number;
  enabled: boolean;
  token: string | null;
}

export interface WorkspaceIdeProviderSession {
  id: string;
  kind: WorkspaceIdeProviderKind;
  workspaceRoot: string;
  baseUrl: string;
  status: WorkspaceIdeProviderSessionStatus;
  createdAt: string;
  lastSeenAt?: string;
  failureReason?: string;
}

export interface CreateWorkspaceIdeProviderSessionInput {
  kind: WorkspaceIdeProviderKind;
  workspaceRoot: string;
  port?: number;
  now?: Date;
}

const DEFAULT_PROVIDER_KIND: WorkspaceIdeProviderKind = "native-workbench";
const DEFAULT_PROVIDER_BASE_PORT = 37480;
const PROVIDER_KINDS: readonly WorkspaceIdeProviderKind[] = [
  "native-workbench",
  "openvscode-server",
  "code-server",
  "theia",
];

export function parseWorkspaceIdeProviderConfig(
  input: WorkspaceIdeProviderConfigInput = {},
): WorkspaceIdeProviderConfig {
  const kind = normalizeProviderKind(input.kind);
  return {
    kind,
    command: normalizeOptionalString(input.command),
    basePort: normalizeProviderPort(input.basePort),
    enabled: normalizeBoolean(input.enabled, kind !== "native-workbench"),
    token: normalizeOptionalString(input.token),
  };
}

export function workspaceIdeProviderEnvConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkspaceIdeProviderConfig {
  return parseWorkspaceIdeProviderConfig({
    kind: env.TRACEVANE_IDE_PROVIDER_KIND,
    command: env.TRACEVANE_IDE_PROVIDER_COMMAND,
    basePort: env.TRACEVANE_IDE_PROVIDER_BASE_PORT,
    enabled: env.TRACEVANE_IDE_PROVIDER_ENABLED,
    token: env.TRACEVANE_IDE_PROVIDER_TOKEN,
  });
}

export function buildWorkspaceIdeProviderCommand(
  config: WorkspaceIdeProviderConfig,
  workspaceRoot: string,
  port: number,
): string[] {
  assertSafeWorkspaceRoot(workspaceRoot);
  assertLoopbackProviderPort(port);
  if (!config.enabled || config.kind === "native-workbench") return [];
  if (config.command) {
    return [config.command, "--host", "127.0.0.1", "--port", String(port), workspaceRoot];
  }
  switch (config.kind) {
    case "openvscode-server":
      return [
        "openvscode-server",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--without-connection-token",
        workspaceRoot,
      ];
    case "code-server":
      return [
        "code-server",
        "--bind-addr",
        `127.0.0.1:${port}`,
        "--auth",
        config.token ? "password" : "none",
        workspaceRoot,
      ];
    case "theia":
      return [
        "theia",
        "start",
        workspaceRoot,
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ];
    default:
      return [];
  }
}

export function assertLoopbackProviderUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WorkspaceIdeProviderError(
      "workspace_ide_provider_url_invalid_protocol",
      "IDE provider URL must use http or https.",
    );
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname)) {
    throw new WorkspaceIdeProviderError(
      "workspace_ide_provider_url_not_loopback",
      "IDE provider URL must stay on loopback/internal host for the POC.",
    );
  }
}

export function assertLoopbackProviderPort(port: number): void {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new WorkspaceIdeProviderError(
      "workspace_ide_provider_port_invalid",
      "IDE provider port must be an integer between 1024 and 65535.",
    );
  }
}

export function assertSafeWorkspaceRoot(workspaceRoot: string): void {
  const resolved = path.resolve(workspaceRoot);
  if (!path.isAbsolute(resolved)) {
    throw new WorkspaceIdeProviderError(
      "workspace_ide_provider_root_not_absolute",
      "IDE provider workspace root must resolve to an absolute path.",
    );
  }
  if (resolved === path.parse(resolved).root) {
    throw new WorkspaceIdeProviderError(
      "workspace_ide_provider_root_is_filesystem_root",
      "IDE provider workspace root must not be the filesystem root.",
    );
  }
}

export class WorkspaceIdeProviderSessionRegistry {
  readonly #sessions = new Map<string, WorkspaceIdeProviderSession>();
  #nextPort: number;

  constructor(basePort = DEFAULT_PROVIDER_BASE_PORT) {
    assertLoopbackProviderPort(basePort);
    this.#nextPort = basePort;
  }

  createSession(input: CreateWorkspaceIdeProviderSessionInput): WorkspaceIdeProviderSession {
    assertSafeWorkspaceRoot(input.workspaceRoot);
    const port = input.port ?? this.#nextPort++;
    assertLoopbackProviderPort(port);
    const createdAt = (input.now ?? new Date()).toISOString();
    const session: WorkspaceIdeProviderSession = {
      id: `ide_${crypto.randomUUID()}`,
      kind: input.kind,
      workspaceRoot: path.resolve(input.workspaceRoot),
      baseUrl: `http://127.0.0.1:${port}`,
      status: "starting",
      createdAt,
      lastSeenAt: createdAt,
    };
    assertLoopbackProviderUrl(session.baseUrl);
    this.#sessions.set(session.id, session);
    return { ...session };
  }

  listSessions(): WorkspaceIdeProviderSession[] {
    return [...this.#sessions.values()].map((session) => ({ ...session }));
  }

  getSession(id: string): WorkspaceIdeProviderSession | null {
    const session = this.#sessions.get(id);
    return session ? { ...session } : null;
  }

  markReady(id: string, now = new Date()): WorkspaceIdeProviderSession {
    return this.#updateStatus(id, "ready", now);
  }

  markFailed(id: string, failureReason: string, now = new Date()): WorkspaceIdeProviderSession {
    return this.#updateStatus(id, "failed", now, failureReason);
  }

  stopSession(id: string, now = new Date()): WorkspaceIdeProviderSession {
    return this.#updateStatus(id, "stopped", now);
  }

  #updateStatus(
    id: string,
    status: WorkspaceIdeProviderSessionStatus,
    now: Date,
    failureReason?: string,
  ): WorkspaceIdeProviderSession {
    const session = this.#sessions.get(id);
    if (!session) {
      throw new WorkspaceIdeProviderError(
        "workspace_ide_provider_session_not_found",
        `IDE provider session '${id}' was not found.`,
      );
    }
    const updated: WorkspaceIdeProviderSession = {
      ...session,
      status,
      lastSeenAt: now.toISOString(),
      failureReason,
    };
    this.#sessions.set(id, updated);
    return { ...updated };
  }
}

export class WorkspaceIdeProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceIdeProviderError";
  }
}

function normalizeProviderKind(value: string | null | undefined): WorkspaceIdeProviderKind {
  const normalized = normalizeOptionalString(value) as WorkspaceIdeProviderKind | null;
  if (!normalized) return DEFAULT_PROVIDER_KIND;
  if (PROVIDER_KINDS.includes(normalized)) return normalized;
  throw new WorkspaceIdeProviderError(
    "workspace_ide_provider_kind_invalid",
    `Unsupported IDE provider kind '${value}'.`,
  );
}

function normalizeProviderPort(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return DEFAULT_PROVIDER_BASE_PORT;
  const port = typeof value === "number" ? value : Number(value);
  assertLoopbackProviderPort(port);
  return port;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function normalizeBoolean(value: string | boolean | null | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  const normalized = normalizeOptionalString(value);
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(normalized.toLowerCase())) return false;
  throw new WorkspaceIdeProviderError(
    "workspace_ide_provider_enabled_invalid",
    "IDE provider enabled flag must be boolean-like.",
  );
}
