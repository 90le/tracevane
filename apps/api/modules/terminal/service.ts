import { createRequire } from "node:module";
import { exec, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import { runOwnedCommand } from "../../core/owned-command.js";
import { resolveFilesServiceDirectoryPath, resolveFilesServiceExistingFilePath } from "../files/service.js";
import { isRecoverableTerminalStatus } from "../../../../types/terminal.js";
import type { SkillsService } from "../skills/service.js";
import { buildTerminalActionCatalog } from "./action-catalog.js";
import {
  buildTerminalRecentOutputSummary,
  type TerminalRecentOutputSummaryEvent,
} from "./terminal-session-summary.js";
import { createTerminalSessionDescriptorStore } from "./terminal-session-descriptor-store.js";
import { createTerminalSessionLedger } from "./terminal-session-ledger.js";
import type {
  TerminalActionCatalogResponse,
  TerminalBinaryId,
  TerminalBinaryStatus,
  TerminalEndPayload,
  TerminalEndResponse,
  TerminalEndBatchResponse,
  TerminalGatewayAckResponse,
  TerminalGatewayAttachPayload,
  TerminalGatewayAttachResponse,
  TerminalGatewayClearPayload,
  TerminalGatewayDetachPayload,
  TerminalGatewayEvent,
  TerminalGatewayHeartbeatPayload,
  TerminalGatewayInputPayload,
  TerminalGatewayOutputEvent,
  TerminalGatewayResizePayload,
  TerminalInstallAttemptLog,
  TerminalInstallRequestId,
  TerminalInstallResponse,
  TerminalInstallResult,
  TerminalInstallTarget,
  TerminalInstallStreamEvent,
  TerminalProfileCatalogResponse,
  TerminalProfileDescriptor,
  TerminalSessionDescriptor,
  TerminalSessionLedgerEvent,
  TerminalSessionSummaryResponse,
  TerminalStatusPayload,
  TerminalTargetKind,
} from "../../../../types/terminal.js";

const require = createRequire(import.meta.url);
const execAsync = promisify(exec);

interface WhichModule {
  sync(
    command: string,
    options?: {
      all?: boolean;
      nothrow?: boolean;
      path?: string;
      pathExt?: string;
    },
  ): string | string[] | null;
}

const whichModule = require("which") as WhichModule;

type PtyModule = typeof import("@homebridge/node-pty-prebuilt-multiarch");
type PtyInstance = ReturnType<PtyModule["spawn"]>;

interface TerminalSocket extends WebSocket {
  _terminalSessionId?: string | null;
  _terminalSession?: TerminalSession | null;
  _lastAliveAt?: number;
}

interface TerminalGatewaySubscriber {
  connId: string;
  emit: (event: TerminalGatewayEvent) => boolean;
  lastLeaseAt: number;
  suppressOutput: boolean;
}

interface TerminalStreamSubscriber {
  streamId: string;
  emit: (event: TerminalGatewayEvent) => boolean;
}

interface TerminalSession {
  id: string;
  instanceId: string;
  term: PtyInstance;
  clients: Set<TerminalSocket>;
  gatewaySubscribers: Map<string, TerminalGatewaySubscriber>;
  streamSubscribers: Map<string, TerminalStreamSubscriber>;
  backlog: Array<{ seq: number; data: string; emittedAtMs: number }>;
  gatewayOutputQueue: {
    data: string;
    seq: number;
    emittedAtMs: number;
  } | null;
  gatewayOutputFlushTimer: NodeJS.Immediate | null;
  bufferSize: number;
  outputSeq: number;
  clearedThroughSeq: number;
  cleanupTimer: NodeJS.Timeout | null;
  descriptorPersistTimer: NodeJS.Timeout | null;
  closed: boolean;
  lastCols: number;
  lastRows: number;
  title: string;
  shell: string;
  cwd: string;
  rootId: string | null;
  workspaceId: string | null;
  profileId: string | null;
  targetKind: TerminalTargetKind;
  pinned: boolean;
  source: "manual" | "system-handoff" | "linked_context";
  sourceModule: string;
  sourceAction: string;
  originRoute: string;
  handoffContext: TerminalSessionDescriptor["handoffContext"];
  recentSummaryEvents: TerminalRecentOutputSummaryEvent[];
  createdAt: string;
  lastActivityAt: string;
  lastAttachedAt: string | null;
  durableBackend: "pty" | "tmux";
  tmuxSessionName: string | null;
  endRequested: boolean;
  exitPromise: Promise<void>;
  resolveExit: () => void;
}

type TerminalSessionLaunchMetadata = Partial<TerminalGatewayAttachPayload>;

type TerminalLaunchMetadata = Required<
  Pick<TerminalSession, "cwd" | "targetKind" | "pinned" | "rootId" | "workspaceId">
> & {
  profileId: string | null;
  shell: string;
  cols: number;
  rows: number;
  durableBackend: "pty" | "tmux";
  tmuxSessionName: string | null;
  command: string;
  args: string[];
};

interface TerminalCliSpec {
  id: TerminalBinaryId;
  label: string;
  binary: string;
  packageName: string | null;
  category: "agent" | "marketplace" | "shell";
  installMode: "package-manager" | "script" | "none";
  installCommand?: string;
  verifyArgs?: string[];
}

interface TerminalPackageManager {
  id: string;
  binary: string;
  installCommand: (pkg: string) => string;
}

interface TerminalGatewayRuntime {
  connId: string;
  emit: (event: TerminalGatewayEvent) => boolean;
}

interface TerminalStreamRuntime {
  streamId: string;
  emit: (event: TerminalGatewayEvent) => boolean;
}

type TerminalControlPayload = {
  type?: unknown;
  cols?: unknown;
  rows?: unknown;
};

const TERMINAL_SESSION_GRACE_MS = 30 * 60 * 1000;
const TERMINAL_BUFFER_LIMIT = 256 * 1024;
const TERMINAL_INSTALL_TIMEOUT_MS = 8 * 60 * 1000;
const TERMINAL_BINARY_VERIFY_TIMEOUT_MS = 2_500;
const TERMINAL_SESSION_STOP_TIMEOUT_MS = 5_000;
const TERMINAL_SESSION_KILL_ATTEMPTS = 5;
const TERMINAL_GATEWAY_LEASE_MS = 35_000;
const TERMINAL_GATEWAY_SWEEP_INTERVAL_MS = 10_000;
const TERMINAL_DESCRIPTOR_ACTIVITY_FLUSH_MS = 1_500;
const TERMINAL_OUTPUT_LEDGER_FLUSH_MS = 250;
const TERMINAL_OUTPUT_LEDGER_BATCH_LIMIT = 64;
const TERMINAL_STATUS_CACHE_TTL_MS = 30_000;
const TERMINAL_RECENT_SUMMARY_EVENT_LIMIT = 512;
const TERMINAL_GATEWAY_OUTPUT_BATCH_LIMIT = 16 * 1024;
const TERMINAL_CONTROL_BATCH_LIMIT = 32;
const TERMINAL_CONTROL_BATCH_MAX_LENGTH = 4096;
const WS_PING_INTERVAL = 20_000;
const WS_IDLE_TIMEOUT = 90_000;
const DEFAULT_TERMINAL_NATIVE_WORKER_BUDGET = "1";
const DEFAULT_TERMINAL_COLS = 120;
const DEFAULT_TERMINAL_ROWS = 30;
const TMUX_SESSION_PREFIX = "tracevane-";
let cachedTmuxAvailability: boolean | null = null;

function normalizeTmuxSessionName(sessionId: string): string {
  const normalized = String(sessionId || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "-")
    .slice(0, 80);
  return `${TMUX_SESSION_PREFIX}${normalized || crypto.randomUUID()}`.slice(0, 120);
}

function isTmuxAvailable(): boolean {
  if (cachedTmuxAvailability !== null) return cachedTmuxAvailability;
  if (process.platform === "win32") {
    cachedTmuxAvailability = false;
    return cachedTmuxAvailability;
  }
  const result = spawnSync("tmux", ["-V"], {
    encoding: "utf8",
    stdio: "ignore",
  });
  cachedTmuxAvailability = result.status === 0;
  return cachedTmuxAvailability;
}

function hasTmuxSession(sessionName: string | null | undefined): boolean {
  if (!sessionName || !isTmuxAvailable()) return false;
  const result = spawnSync("tmux", ["has-session", "-t", sessionName], {
    encoding: "utf8",
    stdio: "ignore",
  });
  return result.status === 0;
}

function killTmuxSession(sessionName: string | null | undefined): boolean {
  if (!sessionName || !isTmuxAvailable()) return true;
  const result = spawnSync("tmux", ["kill-session", "-t", sessionName], {
    encoding: "utf8",
    stdio: "ignore",
  });
  return result.status === 0 || !hasTmuxSession(sessionName);
}

function shouldUseDurableTmux(metadata: TerminalSessionLaunchMetadata): boolean {
  return metadata.pinned === true && isTmuxAvailable();
}
const ALLOWED_TERMINAL_SHELLS = new Set([
  "bash",
  "sh",
  "zsh",
  "fish",
  "pwsh",
  "powershell",
  "cmd",
]);
const KNOWN_TERMINAL_PROFILE_IDS = new Set([
  "local-shell",
  "shell-bash",
  "shell-sh",
  "shell-zsh",
  "shell-fish",
  "shell-pwsh",
  "shell-powershell",
  "shell-cmd",
  "agent-codex",
  "agent-claude",
  "agent-opencode",
  "marketplace-clawhub",
  "marketplace-skillhub",
  "remote-ssh",
]);

const TERMINAL_CLI_SPECS: Record<TerminalBinaryId, TerminalCliSpec> = {
  claude: {
    id: "claude",
    label: "Claude CLI",
    binary: "claude",
    packageName: "@anthropic-ai/claude-code",
    category: "agent",
    installMode: "package-manager",
  },
  codex: {
    id: "codex",
    label: "Codex CLI",
    binary: "codex",
    packageName: "@openai/codex",
    category: "agent",
    installMode: "package-manager",
  },
  opencode: {
    id: "opencode",
    label: "OpenCode CLI",
    binary: "opencode",
    packageName: "opencode-ai",
    category: "agent",
    installMode: "package-manager",
  },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    binary: "gemini",
    packageName: "@google/gemini-cli",
    category: "agent",
    installMode: "package-manager",
  },
  clawhub: {
    id: "clawhub",
    label: "ClawHub CLI",
    binary: "clawhub",
    packageName: "clawhub",
    category: "marketplace",
    installMode: "package-manager",
    verifyArgs: ["--cli-version"],
  },
  skillhub: {
    id: "skillhub",
    label: "SkillHub CLI",
    binary: "skillhub",
    packageName: null,
    category: "marketplace",
    installMode: "script",
    installCommand:
      "curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh | bash -s -- --cli-only",
    verifyArgs: ["--help"],
  },
  bash: {
    id: "bash",
    label: "Bash",
    binary: "bash",
    packageName: null,
    category: "shell",
    installMode: "none",
    verifyArgs: ["--version"],
  },
  sh: {
    id: "sh",
    label: "Sh",
    binary: "sh",
    packageName: null,
    category: "shell",
    installMode: "none",
    verifyArgs: ["-c", "echo sh"],
  },
  zsh: {
    id: "zsh",
    label: "Zsh",
    binary: "zsh",
    packageName: null,
    category: "shell",
    installMode: "none",
    verifyArgs: ["--version"],
  },
  fish: {
    id: "fish",
    label: "Fish",
    binary: "fish",
    packageName: null,
    category: "shell",
    installMode: "none",
    verifyArgs: ["--version"],
  },
  pwsh: {
    id: "pwsh",
    label: "PowerShell",
    binary: "pwsh",
    packageName: null,
    category: "shell",
    installMode: "none",
    verifyArgs: ["--version"],
  },
  powershell: {
    id: "powershell",
    label: "Windows PowerShell",
    binary: "powershell",
    packageName: null,
    category: "shell",
    installMode: "none",
    verifyArgs: [
      "-NoProfile",
      "-Command",
      "$PSVersionTable.PSVersion.ToString()",
    ],
  },
  cmd: {
    id: "cmd",
    label: "Command Prompt",
    binary: "cmd",
    packageName: null,
    category: "shell",
    installMode: "none",
    verifyArgs: ["/c", "ver"],
  },
};

const TERMINAL_PACKAGE_MANAGERS: TerminalPackageManager[] = [
  {
    id: "npm",
    binary: "npm",
    installCommand: (pkg) => `npm install -g ${pkg}`,
  },
  {
    id: "pnpm",
    binary: "pnpm",
    installCommand: (pkg) => `pnpm add -g ${pkg}`,
  },
  {
    id: "yarn",
    binary: "yarn",
    installCommand: (pkg) => `yarn global add ${pkg}`,
  },
  {
    id: "bun",
    binary: "bun",
    installCommand: (pkg) => `bun add -g ${pkg}`,
  },
];

function terminalInstallSupported(spec: TerminalCliSpec): boolean {
  if (spec.installMode === "none") return false;
  return spec.installMode !== "script" || process.platform !== "win32";
}

function shellQuote(raw: string): string {
  return `"${String(raw || "").replace(/(["\\$`])/g, "\\$1")}"`;
}

function truncateLog(text: string, maxLength = 16_000): string {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}\n...[truncated]`;
}

function resolveTerminalNativeWorkerBudget(env: NodeJS.ProcessEnv): string {
  const parsed = Number.parseInt(
    String(env.OPENCLAW_TERMINAL_NATIVE_WORKERS || "").trim(),
    10,
  );
  if (Number.isFinite(parsed) && parsed > 0) {
    return String(parsed);
  }
  return DEFAULT_TERMINAL_NATIVE_WORKER_BUDGET;
}

function applyTerminalNativeWorkerBudget(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const budget = resolveTerminalNativeWorkerBudget(env);
  if (!env.RAYON_NUM_THREADS?.trim()) {
    env.RAYON_NUM_THREADS = budget;
  }
  if (!env.TOKIO_WORKER_THREADS?.trim()) {
    env.TOKIO_WORKER_THREADS = budget;
  }
  return env;
}

function isWindowsMountedPath(binPath: string): boolean {
  const normalized = String(binPath || "")
    .trim()
    .toLowerCase();
  return normalized.startsWith("/mnt/c/") || normalized.startsWith("/mnt/d/");
}

function isWindowsWslLauncher(binPath: string): boolean {
  if (process.platform !== "win32") return false;
  const normalized = path.normalize(String(binPath || "")).toLowerCase();
  return normalized.endsWith("\\windows\\system32\\bash.exe") ||
    normalized.includes("\\microsoft\\windowsapps\\bash.exe");
}

function resolveExecutableCandidates(binary: string): string[] {
  try {
    const resolved = whichModule.sync(binary, { all: true, nothrow: true });
    const candidates = Array.isArray(resolved) ? resolved : resolved ? [resolved] : [];
    return candidates
      .map((candidate) => String(candidate || "").trim())
      .filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);
  } catch {
    return [];
  }
}

async function verifyExecutable(
  command: string,
  args: readonly string[],
  timeoutMs = TERMINAL_BINARY_VERIFY_TIMEOUT_MS,
): Promise<{ success: boolean; output: string }> {
  try {
    const result = await runOwnedCommand(command, [...args], {
      timeoutMs,
      maxOutputBytes: 4 * 1024 * 1024,
    });
    return {
      success: result.ok,
      output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
    };
  } catch (error) {
    return {
      success: false,
      output: error instanceof Error ? error.message : String(error),
    };
  }
}

function resolveDefaultTerminalShell(): {
  binaryId: TerminalBinaryId;
  command: string;
} {
  if (process.platform === "win32") {
    for (const binaryId of ["pwsh", "powershell", "cmd"] as const) {
      const resolved = resolveExecutableCandidates(binaryId)[0];
      if (resolved) return { binaryId, command: resolved };
    }
    return {
      binaryId: "cmd",
      command: String(process.env.ComSpec || "cmd.exe").trim() || "cmd.exe",
    };
  }

  const configured = String(process.env.SHELL || "").trim();
  const configuredId = path.basename(configured).toLowerCase() as TerminalBinaryId;
  if (configured && ["bash", "sh", "zsh", "fish"].includes(configuredId)) {
    return { binaryId: configuredId, command: configured };
  }
  for (const binaryId of ["bash", "sh"] as const) {
    const resolved = resolveExecutableCandidates(binaryId)[0];
    if (resolved) return { binaryId, command: resolved };
  }
  return { binaryId: "sh", command: "sh" };
}

function normalizeSessionId(value: string | null | undefined): string {
  if (
    value !== null &&
    value !== undefined &&
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    return crypto.randomUUID();
  }
  const raw = String(value || "").trim();
  if (
    !raw ||
    raw === "[object Object]" ||
    raw === "objectObject" ||
    raw.toLowerCase() === "objectobject"
  ) {
    return crypto.randomUUID();
  }
  const normalized = raw.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 128);
  return normalized || crypto.randomUUID();
}

function normalizeOutputSeq(value: string | number | null | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function normalizeTerminalDimension(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : null;
}

function normalizeSkipReplay(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizeResumeSession(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function createOptionalPty(): PtyModule | null {
  try {
    return require("@homebridge/node-pty-prebuilt-multiarch") as PtyModule;
  } catch {
    return null;
  }
}

async function runCommand(
  command: string,
  timeoutMs = 15_000,
): Promise<{
  success: boolean;
  output: string;
  stderr: string;
  error: string;
}> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    return {
      success: true,
      output: String(stdout || "").trim(),
      stderr: String(stderr || "").trim(),
      error: "",
    };
  } catch (error) {
    const target = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      success: false,
      output: String(target.stdout || "").trim(),
      stderr: String(target.stderr || "").trim(),
      error: String(target.message || "command_failed"),
    };
  }
}

export function buildTerminalEnv(
  config: TracevaneServerConfig,
): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (!env.TERM?.trim() || env.TERM.trim().toLowerCase() === "dumb") {
    env.TERM = "xterm-256color";
  }
  if (!env.COLORTERM?.trim()) {
    env.COLORTERM = "truecolor";
  }
  if (!env.CLICOLOR?.trim()) {
    env.CLICOLOR = "1";
  }
  if (!env.FORCE_COLOR?.trim()) {
    env.FORCE_COLOR = "1";
  }
  delete env.NO_COLOR;
  if (!env.LANG?.trim()) {
    env.LANG = "C.UTF-8";
  }
  if (!env.LC_CTYPE?.trim()) {
    env.LC_CTYPE = "C.UTF-8";
  }
  env.TERM_PROGRAM = "tracevane";
  if (config.version?.trim()) {
    env.TERM_PROGRAM_VERSION = config.version.trim();
  }
  env.OPENCLAW_TERMINAL_CLIENT = "xterm.js";
  env.XTERM_VERSION = `Tracevane ${config.version?.trim() || "terminal"}`;
  try {
    const raw = require("node:fs").readFileSync(
      config.openclawConfigFile,
      "utf-8",
    );
    const parsed = JSON.parse(raw) as Record<string, any>;
    const providers = parsed?.models?.providers || {};
    for (const provider of Object.values(providers) as Array<
      Record<string, any>
    >) {
      if (!provider?.apiKey || String(provider.apiKey).startsWith("${"))
        continue;
      if (provider.api === "anthropic-messages" && !env.ANTHROPIC_API_KEY) {
        env.ANTHROPIC_API_KEY = provider.apiKey;
      } else if (!env.OPENAI_API_KEY) {
        env.OPENAI_API_KEY = provider.apiKey;
      }
    }
  } catch {
    // ignore invalid config here; status endpoints already report separately
  }
  return applyTerminalNativeWorkerBudget(env);
}

function summarizeAttempts(attempts: TerminalInstallAttemptLog[]): string {
  const lines: string[] = [];
  for (const item of attempts) {
    lines.push(`[${item.stage}] $ ${item.command}`);
    if (item.output) lines.push(item.output);
    if (item.stderr) lines.push(item.stderr);
    if (item.error) lines.push(`ERROR: ${item.error}`);
  }
  return truncateLog(lines.join("\n\n"));
}

export interface TerminalService {
  getStatus(): Promise<TerminalStatusPayload>;
  listWorkspaceSessions(): Promise<TerminalSessionSummaryResponse>;
  listPersistedSessions(): Promise<TerminalSessionSummaryResponse>;
  createPersistedSession(
    payload: TerminalGatewayAttachPayload,
  ): Promise<TerminalSessionDescriptor>;
  getPersistedSession(
    sessionId: string,
  ): Promise<TerminalSessionDescriptor | null>;
  renamePersistedSession(
    sessionId: string,
    title: string,
  ): Promise<TerminalSessionDescriptor | null>;
  deletePersistedSession(sessionId: string): Promise<{
    success: boolean;
    sessionId: string;
    reason?: "session_active";
  }>;
  listSessionLedger(sessionId: string): Promise<TerminalSessionLedgerEvent[]>;
  listWorkspaceProfiles(): Promise<TerminalProfileCatalogResponse>;
  listWorkspaceActions(): Promise<TerminalActionCatalogResponse>;
  installCli(
    target: TerminalInstallRequestId,
  ): Promise<TerminalInstallResponse>;
  streamInstallCli(
    target: TerminalInstallRequestId,
    emit: (event: TerminalInstallStreamEvent) => void | Promise<void>,
  ): Promise<TerminalInstallResponse>;
  endSession(payload: TerminalEndPayload): Promise<TerminalEndResponse>;
  endSessions(sessionIds: string[]): Promise<TerminalEndBatchResponse>;
  attachGatewayClient(
    payload: TerminalGatewayAttachPayload,
    runtime: TerminalGatewayRuntime,
  ): TerminalGatewayAttachResponse;
  attachStreamClient(
    payload: TerminalGatewayAttachPayload,
    runtime: TerminalStreamRuntime,
  ): TerminalGatewayAttachResponse;
  detachStreamClient(sessionId: string, streamId: string): void;
  sendHttpInput(sessionId: string, data: string): void;
  resizeHttpSession(sessionId: string, cols: number, rows: number): void;
  sendGatewayInput(
    payload: TerminalGatewayInputPayload,
    runtime: Pick<TerminalGatewayRuntime, "connId">,
  ): TerminalGatewayAckResponse;
  resizeGatewayClient(
    payload: TerminalGatewayResizePayload,
    runtime: Pick<TerminalGatewayRuntime, "connId">,
  ): TerminalGatewayAckResponse;
  heartbeatGatewayClient(
    payload: TerminalGatewayHeartbeatPayload,
    runtime: Pick<TerminalGatewayRuntime, "connId">,
  ): TerminalGatewayAckResponse;
  clearGatewaySession(
    payload: TerminalGatewayClearPayload,
    runtime: Pick<TerminalGatewayRuntime, "connId">,
  ): TerminalGatewayAckResponse;
  detachGatewayClient(
    payload: TerminalGatewayDetachPayload,
    runtime: Pick<TerminalGatewayRuntime, "connId">,
  ): TerminalGatewayAckResponse;
  handleUpgrade(
    req: http.IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): boolean;
  dispose(): Promise<void>;
}

export interface CreateTerminalServiceOptions {
  config: TracevaneServerConfig;
  skills: SkillsService;
  ptyModule?: PtyModule | null;
  sessionStopTimeoutMs?: number;
}

export function createTerminalService(
  options: CreateTerminalServiceOptions,
): TerminalService {
  const pty = options.ptyModule === undefined
    ? createOptionalPty()
    : options.ptyModule;
  const sessionStopTimeoutMs = Math.max(
    50,
    options.sessionStopTimeoutMs ?? TERMINAL_SESSION_STOP_TIMEOUT_MS,
  );
  const wss = new WebSocketServer({ noServer: true });
  const sessions = new Map<string, TerminalSession>();
  const persistenceStateDir = path.join(
    options.config.openclawRoot,
    "terminal",
  );
  const descriptorStore = createTerminalSessionDescriptorStore({
    stateDir: persistenceStateDir,
  });
  const ledger = createTerminalSessionLedger({
    stateDir: persistenceStateDir,
  });
  let realtimeLedgerFlushTimer: NodeJS.Timeout | null = null;
  let pendingRealtimeLedgerEvents: TerminalSessionLedgerEvent[] = [];
  let cachedStatusPayload: TerminalStatusPayload | null = null;
  let cachedStatusPayloadAt = 0;
  let pendingStatusPayload: Promise<TerminalStatusPayload> | null = null;

  const pingTimer = setInterval(() => {
    const now = Date.now();
    wss.clients.forEach((socket: WebSocket) => {
      const ws = socket as TerminalSocket;
      if (now - Number(ws._lastAliveAt || now) > WS_IDLE_TIMEOUT) {
        try {
          ws.terminate();
        } catch {}
        return;
      }
      try {
        ws.ping();
      } catch {}
    });
  }, WS_PING_INTERVAL);
  pingTimer.unref?.();

  const gatewaySweepTimer = setInterval(() => {
    const now = Date.now();
    for (const session of sessions.values()) {
      pruneExpiredGatewaySubscribers(session, now);
    }
  }, TERMINAL_GATEWAY_SWEEP_INTERVAL_MS);
  gatewaySweepTimer.unref?.();

  function getActiveClientCount(session: TerminalSession): number {
    return (
      session.clients.size +
      session.gatewaySubscribers.size +
      session.streamSubscribers.size
    );
  }

  function normalizeTerminalTargetKind(
    value: unknown,
  ): TerminalTargetKind | null {
    const normalized = String(value || "").trim();
    if (
      normalized === "local" ||
      normalized === "ssh" ||
      normalized === "container" ||
      normalized === "kubernetes"
    ) {
      return normalized;
    }
    return null;
  }

  function applySessionMetadata(
    session: TerminalSession,
    metadata: TerminalSessionLaunchMetadata,
  ): void {
    const profileId = String(metadata.profileId || "").trim();
    if (profileId) {
      session.profileId = profileId;
    }

    const targetKind = normalizeTerminalTargetKind(metadata.targetKind);
    if (targetKind) {
      session.targetKind = targetKind;
    }

    const title = String((metadata as TerminalSessionLaunchMetadata & { title?: string | null }).title || "").trim();
    if (title) {
      session.title = title;
    }

    if (typeof metadata.pinned === "boolean") {
      session.pinned = metadata.pinned;
    }
  }

  function clearCleanupTimer(session: TerminalSession): void {
    if (!session.cleanupTimer) return;
    clearTimeout(session.cleanupTimer);
    session.cleanupTimer = null;
  }

  function buildSessionDescriptor(
    session: TerminalSession,
    status: "running" | "detached" | "completed" | "failed" | "lost",
  ): TerminalSessionDescriptor {
    const observerClientIds = Array.from(
      session.gatewaySubscribers.keys(),
    ).sort();
    const controllerClientId = observerClientIds[0] || null;
    const recent = buildTerminalRecentOutputSummary(
      session.recentSummaryEvents,
    );

    return {
      sessionId: session.id,
      title: session.title || `Terminal ${session.id}`,
      profileId: session.profileId,
      shell: session.shell,
      targetKind: session.targetKind,
      rootId: session.rootId,
      workspaceId: session.workspaceId,
      cwd: session.cwd,
      pinned: session.pinned,
      source: session.source,
      sourceModule: session.sourceModule,
      sourceAction: session.sourceAction,
      originRoute: session.originRoute,
      status,
      controllerClientId,
      observerClientIds,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActivityAt,
      lastAttachedAt: session.lastAttachedAt,
      canResume: status === "running" || status === "detached",
      resumeKey: session.id,
      handoffContext: session.handoffContext,
      recentOutputSummary: recent,
      controlState: controllerClientId ? "controller" : "observer",
      observerCount: observerClientIds.length,
      updatedAt: session.lastActivityAt,
      durableBackend: session.durableBackend,
      tmuxSessionName: session.tmuxSessionName,
    };
  }

  function persistSessionDescriptor(session: TerminalSession): void {
    const status = getActiveClientCount(session) > 0 ? "running" : "detached";
    descriptorStore.upsert(buildSessionDescriptor(session, status));
  }

  function buildLedgerEvent(
    session: TerminalSession,
    type: string,
    detail: Record<string, unknown>,
    actorClientId: string | null = null,
  ): TerminalSessionLedgerEvent {
    return {
      eventId: crypto.randomUUID(),
      sessionId: session.id,
      type,
      timestamp: new Date().toISOString(),
      actorClientId,
      detail,
    };
  }

  function rememberRecentSummaryEvent(
    session: TerminalSession,
    event: TerminalRecentOutputSummaryEvent,
  ): void {
    session.recentSummaryEvents.push(event);
    if (
      session.recentSummaryEvents.length <= TERMINAL_RECENT_SUMMARY_EVENT_LIMIT
    ) {
      return;
    }
    session.recentSummaryEvents.splice(
      0,
      session.recentSummaryEvents.length - TERMINAL_RECENT_SUMMARY_EVENT_LIMIT,
    );
  }

  function clearRealtimeLedgerFlushTimer(): void {
    if (!realtimeLedgerFlushTimer) return;
    clearTimeout(realtimeLedgerFlushTimer);
    realtimeLedgerFlushTimer = null;
  }

  function flushRealtimeLedgerQueue(): void {
    clearRealtimeLedgerFlushTimer();
    if (!pendingRealtimeLedgerEvents.length) return;
    const events = pendingRealtimeLedgerEvents;
    pendingRealtimeLedgerEvents = [];
    ledger.appendMany(events);
  }

  function scheduleRealtimeLedgerFlush(): void {
    if (realtimeLedgerFlushTimer) return;
    realtimeLedgerFlushTimer = setTimeout(() => {
      realtimeLedgerFlushTimer = null;
      flushRealtimeLedgerQueue();
    }, TERMINAL_OUTPUT_LEDGER_FLUSH_MS);
    realtimeLedgerFlushTimer.unref?.();
  }

  function enqueueRealtimeLedgerEvent(
    session: TerminalSession,
    type: "input" | "output",
    detail: Record<string, unknown>,
    actorClientId: string | null,
  ): void {
    const event = buildLedgerEvent(session, type, detail, actorClientId);
    pendingRealtimeLedgerEvents.push(event);
    rememberRecentSummaryEvent(session, event);
    if (
      pendingRealtimeLedgerEvents.length >= TERMINAL_OUTPUT_LEDGER_BATCH_LIMIT
    ) {
      flushRealtimeLedgerQueue();
      return;
    }
    scheduleRealtimeLedgerFlush();
  }

  function enqueueOutputLedgerEvent(
    session: TerminalSession,
    data: string,
  ): void {
    enqueueRealtimeLedgerEvent(session, "output", { data }, null);
  }

  function enqueueInputLedgerEvent(
    session: TerminalSession,
    data: string,
    actorClientId: string | null,
  ): void {
    enqueueRealtimeLedgerEvent(session, "input", { data }, actorClientId);
  }

  function clearDescriptorPersistTimer(session: TerminalSession): void {
    if (!session.descriptorPersistTimer) return;
    clearTimeout(session.descriptorPersistTimer);
    session.descriptorPersistTimer = null;
  }

  function scheduleDescriptorPersist(session: TerminalSession): void {
    if (session.closed || session.descriptorPersistTimer) return;
    session.descriptorPersistTimer = setTimeout(() => {
      session.descriptorPersistTimer = null;
      if (!session.closed) {
        persistSessionDescriptor(session);
      }
    }, TERMINAL_DESCRIPTOR_ACTIVITY_FLUSH_MS);
    session.descriptorPersistTimer.unref?.();
  }

  function flushSessionDescriptor(session: TerminalSession): void {
    clearDescriptorPersistTimer(session);
    if (!session.closed) {
      persistSessionDescriptor(session);
    }
  }

  function appendLedgerEvent(
    session: TerminalSession,
    type: string,
    detail: Record<string, unknown>,
    actorClientId: string | null = null,
  ): void {
    if (type !== "output") {
      flushRealtimeLedgerQueue();
    }
    const event = buildLedgerEvent(session, type, detail, actorClientId);
    rememberRecentSummaryEvent(session, event);
    ledger.append(event);
  }

  function markSessionActivity(
    session: TerminalSession,
    options: { persist?: "immediate" | "deferred" | "none" } = {},
  ): void {
    session.lastActivityAt = new Date().toISOString();
    const persistMode = options.persist || "immediate";
    if (persistMode === "immediate") {
      flushSessionDescriptor(session);
      return;
    }
    if (persistMode === "deferred") {
      scheduleDescriptorPersist(session);
    }
  }

  function parseTerminalControlPayloads(
    rawPayload: string,
  ): TerminalControlPayload[] | null {
    const payload = String(rawPayload || "").trim();
    if (
      !payload.startsWith("{") ||
      payload.length > TERMINAL_CONTROL_BATCH_MAX_LENGTH
    ) {
      return null;
    }

    const result: TerminalControlPayload[] = [];
    let index = 0;
    while (index < payload.length) {
      while (/\s/.test(payload[index] || "")) index += 1;
      if (index >= payload.length) break;
      if (payload[index] !== "{") return null;

      const endIndex = findTerminalControlPayloadEnd(payload, index);
      if (endIndex <= index) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload.slice(index, endIndex));
      } catch {
        return null;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      result.push(parsed as TerminalControlPayload);
      if (result.length > TERMINAL_CONTROL_BATCH_LIMIT) return null;
      index = endIndex;
    }
    return result.length ? result : null;
  }

  function findTerminalControlPayloadEnd(
    payload: string,
    startIndex: number,
  ): number {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = startIndex; index < payload.length; index += 1) {
      const char = payload[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) return index + 1;
        if (depth < 0) return -1;
      }
    }
    return -1;
  }

  function isKnownTerminalControlPayload(
    payload: TerminalControlPayload,
  ): boolean {
    return (
      payload.type === "resize" ||
      payload.type === "ping" ||
      payload.type === "clear"
    );
  }

  function consumeTerminalControlPayload(
    session: TerminalSession,
    rawPayload: string,
    options: { actorClientId: string | null; socket?: TerminalSocket } = {
      actorClientId: null,
    },
  ): boolean {
    const payloads = parseTerminalControlPayloads(rawPayload);
    if (!payloads?.length) return false;
    if (!payloads.every(isKnownTerminalControlPayload)) return false;

    for (const data of payloads) {
      if (data.type === "resize") {
        const cols = normalizeTerminalDimension(data.cols);
        const rows = normalizeTerminalDimension(data.rows);
        if (!cols || !rows) {
          markSessionActivity(session, { persist: "deferred" });
          continue;
        }
        session.lastCols = cols;
        session.lastRows = rows;
        markSessionActivity(session, { persist: "deferred" });
        appendLedgerEvent(
          session,
          "resize",
          { cols: session.lastCols, rows: session.lastRows },
          options.actorClientId,
        );
        session.term.resize(session.lastCols, session.lastRows);
        continue;
      }

      if (data.type === "ping") {
        if (options.socket) {
          sendEvent(options.socket, { type: "pong" });
        }
        markSessionActivity(session, { persist: "deferred" });
        continue;
      }

      if (data.type === "clear") {
        clearSessionDisplay(session, options.actorClientId);
      }
    }

    return true;
  }

  function emitGatewayEvent(
    subscriber: TerminalGatewaySubscriber,
    event: TerminalGatewayEvent,
  ): boolean {
    if (subscriber.suppressOutput && event.type === "output") {
      return true;
    }
    try {
      return subscriber.emit(event);
    } catch {
      return false;
    }
  }

  function emitStreamEvent(
    subscriber: TerminalStreamSubscriber,
    event: TerminalGatewayEvent,
  ): boolean {
    try {
      return subscriber.emit(event);
    } catch {
      return false;
    }
  }

  function pruneExpiredGatewaySubscribers(
    session: TerminalSession,
    now = Date.now(),
  ): void {
    let changed = false;
    for (const [connId, subscriber] of Array.from(
      session.gatewaySubscribers.entries(),
    )) {
      if (now - subscriber.lastLeaseAt <= TERMINAL_GATEWAY_LEASE_MS) {
        continue;
      }
      session.gatewaySubscribers.delete(connId);
      changed = true;
    }
    if (changed) {
      persistSessionDescriptor(session);
    }
    if (getActiveClientCount(session) === 0) {
      scheduleCleanup(session);
    }
  }

  function broadcastGatewayEvent(
    session: TerminalSession,
    event: TerminalGatewayEvent,
  ): void {
    pruneExpiredGatewaySubscribers(session);
    let changed = false;
    for (const [connId, subscriber] of Array.from(
      session.gatewaySubscribers.entries(),
    )) {
      if (emitGatewayEvent(subscriber, event)) {
        continue;
      }
      session.gatewaySubscribers.delete(connId);
      changed = true;
    }
    if (changed) {
      persistSessionDescriptor(session);
    }
    if (getActiveClientCount(session) === 0) {
      scheduleCleanup(session);
    }
  }

  function broadcastStreamEvent(
    session: TerminalSession,
    event: TerminalGatewayEvent,
  ): void {
    let changed = false;
    for (const [streamId, subscriber] of Array.from(
      session.streamSubscribers.entries(),
    )) {
      if (emitStreamEvent(subscriber, event)) {
        continue;
      }
      session.streamSubscribers.delete(streamId);
      changed = true;
    }
    if (changed) {
      persistSessionDescriptor(session);
    }
    if (getActiveClientCount(session) === 0) {
      scheduleCleanup(session);
    }
  }

  function detachGatewayConnId(
    connId: string,
    sessionId?: string | null,
  ): void {
    const targetSessionId = String(sessionId || "").trim();
    for (const session of sessions.values()) {
      if (targetSessionId && session.id !== targetSessionId) {
        continue;
      }
      if (!session.gatewaySubscribers.delete(connId)) {
        continue;
      }
      appendLedgerEvent(
        session,
        "detach",
        {
          reason: "gateway_detach",
        },
        connId,
      );
      markSessionActivity(session);
      if (getActiveClientCount(session) === 0) {
        scheduleCleanup(session);
      }
    }
  }

  function detachStreamId(streamId: string, sessionId?: string | null): void {
    const targetSessionId = String(sessionId || "").trim();
    for (const session of sessions.values()) {
      if (targetSessionId && session.id !== targetSessionId) {
        continue;
      }
      if (!session.streamSubscribers.delete(streamId)) {
        continue;
      }
      markSessionActivity(session, { persist: "deferred" });
      if (getActiveClientCount(session) === 0) {
        scheduleCleanup(session);
      }
    }
  }

  function touchGatewaySubscriber(
    session: TerminalSession,
    connId: string,
  ): boolean {
    const subscriber = session.gatewaySubscribers.get(connId);
    if (!subscriber) {
      return false;
    }
    subscriber.lastLeaseAt = Date.now();
    return true;
  }

  function requireGatewaySubscriber(
    session: TerminalSession,
    connId: string,
  ): void {
    if (touchGatewaySubscriber(session, connId)) {
      return;
    }
    throw new Error("terminal_gateway_client_not_attached");
  }

  function registerGatewaySubscriber(
    session: TerminalSession,
    runtime: TerminalGatewayRuntime,
    options: { suppressOutput?: boolean } = {},
  ): void {
    clearCleanupTimer(session);
    const existingSubscriber = session.gatewaySubscribers.get(runtime.connId);
    if (existingSubscriber) {
      existingSubscriber.lastLeaseAt = Date.now();
      existingSubscriber.suppressOutput = options.suppressOutput === true;
      session.lastAttachedAt = new Date().toISOString();
      markSessionActivity(session);
      return;
    }
    detachGatewayConnId(runtime.connId);
    session.lastAttachedAt = new Date().toISOString();
    appendLedgerEvent(
      session,
      "attach",
      {
        reason: "gateway_attach",
      },
      runtime.connId,
    );
    markSessionActivity(session);
    session.gatewaySubscribers.set(runtime.connId, {
      connId: runtime.connId,
      emit: runtime.emit,
      lastLeaseAt: Date.now(),
      suppressOutput: options.suppressOutput === true,
    });
  }

  function registerStreamSubscriber(
    session: TerminalSession,
    runtime: TerminalStreamRuntime,
  ): void {
    clearCleanupTimer(session);
    detachStreamId(runtime.streamId);
    session.lastAttachedAt = new Date().toISOString();
    markSessionActivity(session, { persist: "deferred" });
    session.streamSubscribers.set(runtime.streamId, {
      streamId: runtime.streamId,
      emit: runtime.emit,
    });
  }

  function buildOutputEvent(
    session: TerminalSession,
    chunk: { seq: number; data: string; emittedAtMs: number },
  ): TerminalGatewayOutputEvent {
    return {
      type: "output",
      sid: session.id,
      seq: chunk.seq,
      data: chunk.data,
      emittedAtMs: chunk.emittedAtMs,
    };
  }

  function buildClearEvent(session: TerminalSession): TerminalGatewayEvent {
    return {
      type: "clear",
      sid: session.id,
      instanceId: session.instanceId,
      clearedThroughSeq: session.clearedThroughSeq,
    };
  }

  function broadcastSessionControlEvent(
    session: TerminalSession,
    event: TerminalGatewayEvent,
  ): void {
    for (const client of Array.from(session.clients)) {
      if (client.readyState !== WebSocket.OPEN) {
        session.clients.delete(client);
        continue;
      }
      if (!sendEvent(client, event)) {
        session.clients.delete(client);
      }
    }

    broadcastGatewayEvent(session, event);
    broadcastStreamEvent(session, event);
  }

  function clearSessionDisplay(
    session: TerminalSession,
    actorClientId: string | null,
  ): void {
    clearPendingGatewayOutput(session);
    session.backlog = [];
    session.bufferSize = 0;
    session.clearedThroughSeq = ++session.outputSeq;
    appendLedgerEvent(
      session,
      "clear",
      { outputSeq: session.clearedThroughSeq },
      actorClientId,
    );
    markSessionActivity(session);
    broadcastSessionControlEvent(session, buildClearEvent(session));
  }

  function buildAttachEvents(
    session: TerminalSession,
    params: {
      lastSeq?: string | number | null;
      instanceId?: string | null;
      skipReplay?: boolean | string | null;
    },
  ): TerminalGatewayEvent[] {
    const lastSeq = normalizeOutputSeq(params.lastSeq);
    const instanceId = String(params.instanceId || "").trim();
    const skipReplay = normalizeSkipReplay(params.skipReplay);
    const firstBacklogSeq = session.backlog[0]?.seq || 0;
    const hasBacklogGap =
      !skipReplay &&
      lastSeq > 0 &&
      session.outputSeq > lastSeq &&
      firstBacklogSeq > 0 &&
      lastSeq < firstBacklogSeq - 1;
    const requiresReset =
      lastSeq > session.outputSeq ||
      (instanceId && instanceId !== session.instanceId) ||
      hasBacklogGap;
    const events: TerminalGatewayEvent[] = [
      {
        type: "session",
        sid: session.id,
        instanceId: session.instanceId,
        outputSeq: session.outputSeq,
        descriptor: buildSessionDescriptor(session, "running"),
      },
    ];

    if (requiresReset) {
      events.push({
        type: "reset",
        sid: session.id,
        instanceId: session.instanceId,
        reason:
          hasBacklogGap && !(instanceId && instanceId !== session.instanceId)
            ? "backlog_gap"
            : "session_recreated",
      });
    }

    if (!skipReplay) {
      if (
        session.clearedThroughSeq > 0 &&
        lastSeq < session.clearedThroughSeq
      ) {
        events.push(buildClearEvent(session));
      }
      const replayAfterSeq = Math.max(
        requiresReset ? 0 : lastSeq,
        session.clearedThroughSeq,
      );
      for (const chunk of session.backlog) {
        if (chunk.seq <= replayAfterSeq) continue;
        events.push(buildOutputEvent(session, chunk));
      }
    }
    return events;
  }

  function waitForTerminalExit(
    exitPromise: Promise<void>,
    timeoutMs = sessionStopTimeoutMs,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (exited: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(exited);
      };
      const timeout = setTimeout(() => finish(false), timeoutMs);
      void exitPromise.then(() => finish(true), () => finish(false));
    });
  }

  async function destroySession(sessionId: string): Promise<boolean> {
    const session = sessions.get(sessionId);
    if (!session) return true;
    session.endRequested = true;
    return forceKillTerminalProcess(session);
  }

  async function forceKillTerminalProcess(session: TerminalSession): Promise<boolean> {
    const deadline = Date.now() + sessionStopTimeoutMs;
    const attemptBudgetMs = Math.ceil(
      sessionStopTimeoutMs / TERMINAL_SESSION_KILL_ATTEMPTS,
    );

    for (let attempt = 0; attempt < TERMINAL_SESSION_KILL_ATTEMPTS; attempt += 1) {
      if (session.closed || !sessions.has(session.id)) return true;
      if (session.durableBackend === "tmux") {
        killTmuxSession(session.tmuxSessionName);
      }
      try {
        if (attempt === 0) session.term.kill();
        else session.term.kill("SIGKILL");
      } catch {
        // A failed signal is not proof of exit; the bounded retry loop confirms it.
      }

      const remainingMs = Math.max(0, deadline - Date.now());
      if (remainingMs <= 0) break;
      const exited = await waitForTerminalExit(
        session.exitPromise,
        Math.min(attemptBudgetMs, remainingMs),
      );
      if (exited || session.closed || !sessions.has(session.id)) return true;
    }

    return session.closed || !sessions.has(session.id);
  }

  function scheduleCleanup(session: TerminalSession): void {
    if (getActiveClientCount(session) > 0) return;
    if (session.pinned) {
      clearCleanupTimer(session);
      persistSessionDescriptor(session);
      return;
    }
    clearCleanupTimer(session);
    session.cleanupTimer = setTimeout(() => {
      const current = sessions.get(session.id);
      if (!current || getActiveClientCount(current) > 0) return;
      void destroySession(session.id);
    }, TERMINAL_SESSION_GRACE_MS);
    session.cleanupTimer.unref?.();
  }

  function sendEvent(ws: TerminalSocket, payload: unknown): boolean {
    if (ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function clearGatewayOutputFlushTimer(session: TerminalSession): void {
    if (!session.gatewayOutputFlushTimer) return;
    clearImmediate(session.gatewayOutputFlushTimer);
    session.gatewayOutputFlushTimer = null;
  }

  function clearPendingGatewayOutput(session: TerminalSession): void {
    clearGatewayOutputFlushTimer(session);
    session.gatewayOutputQueue = null;
  }

  function flushGatewayOutput(session: TerminalSession): void {
    clearGatewayOutputFlushTimer(session);
    const queued = session.gatewayOutputQueue;
    session.gatewayOutputQueue = null;
    if (!queued) return;
    broadcastGatewayEvent(session, buildOutputEvent(session, queued));
  }

  function scheduleGatewayOutputFlush(session: TerminalSession): void {
    if (session.gatewayOutputFlushTimer) return;
    session.gatewayOutputFlushTimer = setImmediate(() => {
      session.gatewayOutputFlushTimer = null;
      flushGatewayOutput(session);
    });
    session.gatewayOutputFlushTimer.unref?.();
  }

  function enqueueGatewayOutput(
    session: TerminalSession,
    chunk: { seq: number; data: string; emittedAtMs: number },
  ): void {
    if (session.gatewaySubscribers.size <= 0) return;
    if (!session.gatewayOutputQueue) {
      session.gatewayOutputQueue = { ...chunk };
    } else {
      session.gatewayOutputQueue.data += chunk.data;
      session.gatewayOutputQueue.seq = chunk.seq;
      session.gatewayOutputQueue.emittedAtMs = Math.min(
        session.gatewayOutputQueue.emittedAtMs,
        chunk.emittedAtMs,
      );
    }

    if (
      session.gatewayOutputQueue.data.length >=
      TERMINAL_GATEWAY_OUTPUT_BATCH_LIMIT
    ) {
      flushGatewayOutput(session);
      return;
    }
    scheduleGatewayOutputFlush(session);
  }

  function broadcastChunk(session: TerminalSession, data: string): void {
    if (!data) return;
    markSessionActivity(session, { persist: "deferred" });
    const chunk = { seq: ++session.outputSeq, data, emittedAtMs: Date.now() };
    session.backlog.push(chunk);
    session.bufferSize += data.length;

    while (
      session.bufferSize > TERMINAL_BUFFER_LIMIT &&
      session.backlog.length > 1
    ) {
      const dropped = session.backlog.shift();
      session.bufferSize -= dropped?.data?.length || 0;
    }

    for (const client of Array.from(session.clients)) {
      if (client.readyState !== WebSocket.OPEN) {
        session.clients.delete(client);
        continue;
      }
      if (!sendEvent(client, buildOutputEvent(session, chunk))) {
        session.clients.delete(client);
      }
    }

    enqueueGatewayOutput(session, chunk);
    broadcastStreamEvent(session, buildOutputEvent(session, chunk));
  }

  function replayBacklog(
    session: TerminalSession,
    ws: TerminalSocket,
    lastSeq = 0,
  ): boolean {
    for (const event of buildAttachEvents(session, { lastSeq })) {
      if (!sendEvent(ws, event)) {
        return false;
      }
    }
    return true;
  }

  function normalizeTerminalShell(value: unknown): string | null {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const shellName = path.basename(raw).toLowerCase().replace(/\.exe$/, "");
    if (!ALLOWED_TERMINAL_SHELLS.has(shellName)) {
      throw new Error(`terminal_shell_not_allowed: ${shellName || raw}`);
    }
    return raw;
  }

  function resolveShellForProfile(
    profileId: unknown,
    requestedShell: unknown,
  ): string {
    const requestedProfileId = String(profileId || "").trim();
    const normalizedProfileId = requestedProfileId || "local-shell";
    if (!KNOWN_TERMINAL_PROFILE_IDS.has(normalizedProfileId)) {
      throw new Error(`terminal_profile_not_allowed: ${normalizedProfileId}`);
    }

    const explicitShell = requestedProfileId === "local-shell"
      ? null
      : normalizeTerminalShell(requestedShell);
    if (explicitShell) {
      return resolveExecutableCandidates(explicitShell)[0] || explicitShell;
    }

    const shellByProfileId: Record<string, string> = {
      "shell-bash": "bash",
      "shell-sh": "sh",
      "shell-zsh": "zsh",
      "shell-fish": "fish",
      "shell-pwsh": "pwsh",
      "shell-powershell": "powershell",
      "shell-cmd": "cmd",
    };
    const profileShell = shellByProfileId[normalizedProfileId];
    if (profileShell) {
      return resolveExecutableCandidates(profileShell)[0] || profileShell;
    }

    if (process.platform === "win32") return resolveDefaultTerminalShell().command;
    return normalizeTerminalShell(process.env.SHELL) || resolveDefaultTerminalShell().command;
  }

  function resolveLaunchCwd(metadata: TerminalSessionLaunchMetadata = {}): string {
    const rawRootId = String(metadata.rootId || metadata.workspaceId || "").trim();
    const rawCwd = String(metadata.cwd || "").trim();

    if (rawRootId) {
      if (path.isAbsolute(rawCwd)) {
        throw new Error("Terminal cwd must be relative to the selected workspace root");
      }
      return resolveTerminalWorkspaceCwd(rawRootId, rawCwd || undefined);
    }

    const fallback = options.config.openclawRoot || process.cwd();
    if (!rawCwd) return fallback;
    if (path.isAbsolute(rawCwd)) {
      throw new Error("Terminal cwd must not be an arbitrary absolute path");
    }

    try {
      const candidate = path.resolve(fallback, rawCwd);
      const candidateStat = fs.statSync(candidate);
      if (candidateStat.isDirectory()) return candidate;
    } catch {
      // Invalid launch directories fall through to the configured workspace root.
    }
    return fallback;
  }

  function resolveTerminalWorkspaceCwd(
    rootId: string,
    relativePath: string | undefined,
  ): string {
    try {
      const directory = resolveFilesServiceDirectoryPath(
        options.config,
        rootId,
        relativePath,
      );
      assertResolvedTerminalRoot(directory.root.id, rootId);
      return directory.absolutePath;
    } catch (directoryError) {
      try {
        const file = resolveFilesServiceExistingFilePath(
          options.config,
          rootId,
          relativePath,
        );
        assertResolvedTerminalRoot(file.root.id, rootId);
        return path.dirname(file.absolutePath);
      } catch (fileError) {
        if (
          [directoryError, fileError].some((error) =>
            error instanceof Error && error.message === "Unknown file root"
          )
        ) {
          throw new Error(`Terminal workspace root was not found: ${rootId}`);
        }
        throw directoryError;
      }
    }
  }

  function assertResolvedTerminalRoot(
    resolvedRootId: string | undefined,
    requestedRootId: string,
  ): void {
    if (String(resolvedRootId || "").trim() === requestedRootId) return;
    throw new Error(`Terminal workspace root was not found: ${requestedRootId}`);
  }

  function buildLaunchMetadata(
    sessionId: string,
    metadata: TerminalSessionLaunchMetadata = {},
  ): TerminalLaunchMetadata {
    const cwd = resolveLaunchCwd(metadata);
    const rootId = String(metadata.rootId || metadata.workspaceId || "").trim() || null;
    const workspaceId = String(metadata.workspaceId || metadata.rootId || "").trim() || rootId;
    const shell = resolveShellForProfile(metadata.profileId, metadata.shell);
    const pinned = typeof metadata.pinned === "boolean" ? metadata.pinned : false;
    const tmuxSessionName = pinned && shouldUseDurableTmux({ ...metadata, pinned })
      ? normalizeTmuxSessionName(sessionId)
      : null;
    const useTmux = Boolean(tmuxSessionName);
    return {
      cwd,
      rootId,
      workspaceId,
      profileId: String(metadata.profileId || "").trim() || "local-shell",
      shell,
      targetKind: normalizeTerminalTargetKind(metadata.targetKind) || "local",
      pinned,
      cols: normalizeTerminalDimension(metadata.cols) || DEFAULT_TERMINAL_COLS,
      rows: normalizeTerminalDimension(metadata.rows) || DEFAULT_TERMINAL_ROWS,
      durableBackend: useTmux ? "tmux" : "pty",
      tmuxSessionName,
      command: useTmux ? "tmux" : shell,
      args: useTmux && tmuxSessionName
        ? [
            "-f",
            "/dev/null",
            "new-session",
            "-A",
            "-s",
            tmuxSessionName,
            "-c",
            cwd,
            shell,
            ";",
            "set-option",
            "-t",
            tmuxSessionName,
            "mouse",
            "off",
            ";",
            "set-option",
            "-t",
            tmuxSessionName,
            "status",
            "off",
            ";",
            "set-option",
            "-t",
            tmuxSessionName,
            "set-clipboard",
            "off",
          ]
        : [],
    };
  }

  function createSession(
    sessionId: string,
    metadata: TerminalSessionLaunchMetadata = {},
  ): TerminalSession {
    if (!pty) {
      throw new Error(
        "node-pty is not available; terminal sessions are disabled",
      );
    }

    const launchMetadata = buildLaunchMetadata(sessionId, metadata);
    const shell = launchMetadata.shell;
    const cwd = launchMetadata.cwd;
    const lastActivityAt = new Date().toISOString();
    const term = pty.spawn(launchMetadata.command, launchMetadata.args, {
      name: "xterm-256color",
      cols: launchMetadata.cols,
      rows: launchMetadata.rows,
      cwd,
      env: buildTerminalEnv(options.config),
    });
    let resolveExit = () => {};
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });

    const session: TerminalSession = {
      id: sessionId,
      instanceId: crypto.randomUUID(),
      term,
      clients: new Set(),
      gatewaySubscribers: new Map(),
      streamSubscribers: new Map(),
      backlog: [],
      gatewayOutputQueue: null,
      gatewayOutputFlushTimer: null,
      bufferSize: 0,
      outputSeq: 0,
      clearedThroughSeq: 0,
      cleanupTimer: null,
      descriptorPersistTimer: null,
      closed: false,
      lastCols: launchMetadata.cols,
      lastRows: launchMetadata.rows,
      shell,
      cwd,
      rootId: launchMetadata.rootId,
      workspaceId: launchMetadata.workspaceId,
      profileId: launchMetadata.profileId,
      targetKind: launchMetadata.targetKind,
      pinned: launchMetadata.pinned,
      source: "manual",
      sourceModule: "terminal",
      sourceAction: "terminal.attach",
      originRoute: `/terminal/${sessionId}`,
      handoffContext: null,
      recentSummaryEvents: [],
      createdAt: lastActivityAt,
      lastActivityAt,
      lastAttachedAt: null,
      title: String((metadata as TerminalSessionLaunchMetadata & { title?: string | null }).title || `Terminal ${sessionId}`).trim() || `Terminal ${sessionId}`,
      durableBackend: launchMetadata.durableBackend,
      tmuxSessionName: launchMetadata.tmuxSessionName,
      endRequested: false,
      exitPromise,
      resolveExit,
    };

    term.onData((data) => {
      broadcastChunk(session, data);
      enqueueOutputLedgerEvent(session, data);
    });

    term.onExit((event) => {
      const alreadyClosed = session.closed;
      flushGatewayOutput(session);
      const closeReason = session.endRequested ? "session_ended" : "session_exited";
      if (!alreadyClosed) {
        const closedEvent: TerminalGatewayEvent = {
          type: "closed",
          sid: session.id,
          reason: closeReason,
        };
        broadcastGatewayEvent(session, closedEvent);
        broadcastStreamEvent(session, closedEvent);
      }
      if (session.endRequested) {
        appendLedgerEvent(session, "ended", { reason: "session_ended" }, null);
      }
      appendLedgerEvent(
        session,
        "exit",
        {
          code: typeof event?.exitCode === "number" ? event.exitCode : null,
          signal:
            typeof event?.signal === "number" ? String(event.signal) : null,
        },
        null,
      );
      for (const client of Array.from(session.clients)) {
        try {
          client.close();
        } catch {}
      }
      session.clients.clear();
      session.gatewaySubscribers.clear();
      session.streamSubscribers.clear();
      markSessionActivity(session);
      descriptorStore.upsert(buildSessionDescriptor(session, "completed"));
      clearCleanupTimer(session);
      clearDescriptorPersistTimer(session);
      sessions.delete(session.id);
      session.closed = true;
      session.resolveExit();
    });

    sessions.set(session.id, session);
    appendLedgerEvent(session, "created", {
      source: session.source,
      shell: session.shell,
      cwd: session.cwd,
      rootId: session.rootId,
      workspaceId: session.workspaceId,
      profileId: session.profileId,
      targetKind: session.targetKind,
    });
    persistSessionDescriptor(session);
    return session;
  }

  function markPersistedSessionLost(
    sessionId: string,
    reason = "runtime_unavailable",
  ): TerminalSessionDescriptor | null {
    const persisted = descriptorStore.get(sessionId);
    if (!persisted) return null;
    if (!isRecoverableTerminalStatus(persisted.status)) {
      return persisted;
    }

    const nextUpdatedAt = new Date().toISOString();
    ledger.append({
      eventId: crypto.randomUUID(),
      sessionId,
      type: "ended",
      timestamp: nextUpdatedAt,
      actorClientId: null,
      detail: { reason },
    });
    const recentOutputSummary = buildTerminalRecentOutputSummary(
      ledger.listBySession(sessionId),
    );
    const nextDescriptor: TerminalSessionDescriptor = {
      ...persisted,
      status: "lost",
      canResume: false,
      recentOutputSummary,
      updatedAt: nextUpdatedAt,
    };
    descriptorStore.upsert(nextDescriptor);
    return nextDescriptor;
  }

  async function endSessionById(sid: string): Promise<TerminalEndResponse> {
    const existed = sessions.has(sid);
    let ended = existed;
    if (existed) {
      const stopped = await destroySession(sid);
      if (!stopped) {
        return {
          success: false,
          sid,
          ended: false,
        };
      }
      markPersistedSessionEnded(sid);
    } else {
      ended = Boolean(markPersistedSessionEnded(sid));
    }
    return {
      success: true,
      sid,
      ended,
    };
  }

  function markPersistedSessionEnded(
    sessionId: string,
    reason = "session_ended",
  ): TerminalSessionDescriptor | null {
    const persisted = descriptorStore.get(sessionId);
    if (!persisted) return null;

    if (persisted.durableBackend === "tmux") {
      forceKillPersistedTmuxSession(
        persisted.tmuxSessionName || normalizeTmuxSessionName(sessionId),
      );
    }
    if (persisted.status === "completed" && persisted.canResume === false) {
      return persisted;
    }

    const nextUpdatedAt = new Date().toISOString();
    ledger.append({
      eventId: crypto.randomUUID(),
      sessionId,
      type: "ended",
      timestamp: nextUpdatedAt,
      actorClientId: null,
      detail: { reason },
    });

    const nextDescriptor: TerminalSessionDescriptor = {
      ...persisted,
      status: "completed",
      canResume: false,
      resumeKey: null,
      controllerClientId: null,
      observerClientIds: [],
      controlState: "observer",
      observerCount: 0,
      updatedAt: nextUpdatedAt,
      lastActiveAt: nextUpdatedAt,
    };
    descriptorStore.upsert(nextDescriptor);
    return nextDescriptor;
  }

  function forceKillPersistedTmuxSession(
    sessionName: string | null | undefined,
    attempt = 0,
  ): void {
    if (!sessionName) return;
    const killed = killTmuxSession(sessionName);
    if ((killed && !hasTmuxSession(sessionName)) || attempt >= 4) return;
    const retryTimer = setTimeout(() => {
      forceKillPersistedTmuxSession(sessionName, attempt + 1);
    }, 500 * (attempt + 1));
    retryTimer.unref?.();
  }

  function reconcilePersistedDescriptor(
    descriptor: TerminalSessionDescriptor | null,
  ): TerminalSessionDescriptor | null {
    if (!descriptor) return null;
    if (!isRecoverableTerminalStatus(descriptor.status)) {
      return descriptor;
    }
    if (!isPersistedDescriptorWorkspaceSafe(descriptor)) {
      return markPersistedSessionEnded(
        descriptor.sessionId,
        "invalid_workspace_cwd",
      ) || descriptor;
    }
    const runtimeSession = sessions.get(descriptor.sessionId);
    if (runtimeSession && !runtimeSession.closed) {
      return descriptor;
    }
    if (
      descriptor.durableBackend === "tmux" &&
      hasTmuxSession(descriptor.tmuxSessionName || normalizeTmuxSessionName(descriptor.sessionId))
    ) {
      return {
        ...descriptor,
        status: "detached",
        canResume: true,
        resumeKey: descriptor.sessionId,
      };
    }
    return markPersistedSessionLost(descriptor.sessionId) || descriptor;
  }

  function isPersistedDescriptorWorkspaceSafe(
    descriptor: TerminalSessionDescriptor,
  ): boolean {
    const rootId = String(descriptor.rootId || descriptor.workspaceId || "").trim();
    if (!rootId) return true;
    const cwd = String(descriptor.cwd || "").trim();
    try {
      const rootPath = resolveFilesServiceDirectoryPath(
        options.config,
        rootId,
        undefined,
      ).absolutePath;
      if (!cwd) return true;
      if (path.isAbsolute(cwd)) {
        return isSameOrChildPath(rootPath, cwd);
      }
      resolveFilesServiceDirectoryPath(options.config, rootId, cwd);
      return true;
    } catch {
      return false;
    }
  }

  function isSameOrChildPath(parentPath: string, candidatePath: string): boolean {
    const parent = path.resolve(parentPath);
    const candidate = path.resolve(candidatePath);
    if (candidate === parent) return true;
    const relative = path.relative(parent, candidate);
    return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  function getOrCreateSession(
    rawSessionId: string | null,
    options: {
      resumePersisted?: boolean;
      metadata?: TerminalSessionLaunchMetadata;
    } = {},
  ): TerminalSession {
    const sessionId = normalizeSessionId(rawSessionId);
    const existing = sessions.get(sessionId);
    if (existing && !existing.closed) {
      clearCleanupTimer(existing);
      return existing;
    }
    if (rawSessionId) {
      const persisted = descriptorStore.get(sessionId);
      if (persisted) {
        const reconciled = reconcilePersistedDescriptor(persisted);
        if (
          options.resumePersisted &&
          reconciled &&
          isRecoverableTerminalStatus(reconciled.status) &&
          reconciled.canResume
        ) {
          return createSession(sessionId, {
            profileId: options.metadata?.profileId ?? reconciled.profileId,
            title: (options.metadata as TerminalSessionLaunchMetadata & { title?: string | null } | undefined)?.title ?? reconciled.title,
            targetKind: options.metadata?.targetKind ?? reconciled.targetKind,
            rootId: options.metadata?.rootId ?? reconciled.rootId,
            workspaceId: options.metadata?.workspaceId ?? reconciled.workspaceId,
            cwd: options.metadata?.cwd ?? reconciled.cwd,
            shell: options.metadata?.shell ?? reconciled.shell,
            cols: options.metadata?.cols,
            rows: options.metadata?.rows,
            pinned: options.metadata?.pinned ?? reconciled.pinned,
          });
        }
        throw new Error("terminal_session_unavailable");
      }

      if (options.resumePersisted) {
        // Resume is a reattach contract, not a create contract.  A stale
        // workbench layout may still contain a generated terminal id after the
        // backend descriptor was closed/deleted; opening the panel must remove
        // that stale pane instead of spawning a brand-new shell.
        throw new Error("terminal_session_unavailable");
      }
    }
    return createSession(sessionId, options.metadata);
  }

  function attachSocket(
    session: TerminalSession,
    ws: TerminalSocket,
    params: URLSearchParams,
  ): boolean {
    clearCleanupTimer(session);

    for (const client of Array.from(session.clients)) {
      if (client === ws) continue;
      try {
        client.close(1012, "terminal_replaced");
      } catch {}
    }
    session.clients.clear();

    ws._terminalSessionId = session.id;
    ws._terminalSession = session;
    ws._lastAliveAt = Date.now();
    markSessionActivity(session);

    const attachEvents = buildAttachEvents(session, {
      lastSeq: params.get("lastSeq"),
      instanceId: params.get("instanceId"),
      skipReplay: params.get("skipReplay"),
    });
    for (const event of attachEvents) {
      if (!sendEvent(ws, event)) {
        return false;
      }
    }

    session.clients.add(ws);
    return true;
  }

  function requireActiveSession(
    rawSessionId: string | null | undefined,
  ): TerminalSession {
    const sessionId = String(rawSessionId || "").trim();
    if (!sessionId) {
      throw new Error("sid is required");
    }
    const session = sessions.get(sessionId);
    if (!session || session.closed) {
      throw new Error("terminal_session_not_found");
    }
    clearCleanupTimer(session);
    return session;
  }

  function createGatewayAck(
    session: TerminalSession,
    params: {
      lastSeq?: string | number | null;
      instanceId?: string | null;
      skipReplay?: boolean | string | null;
    } = {},
  ): TerminalGatewayAckResponse {
    const events = buildAttachEvents(session, params).filter(
      (event) => event.type !== "session",
    );
    return {
      ok: true,
      sid: session.id,
      instanceId: session.instanceId,
      outputSeq: session.outputSeq,
      leaseTtlMs: TERMINAL_GATEWAY_LEASE_MS,
      events,
    };
  }

  async function checkBinary(
    spec: TerminalCliSpec,
  ): Promise<TerminalBinaryStatus> {
    const candidates = resolveExecutableCandidates(spec.binary);
    const compatibleCandidates = candidates.filter((item) => !isWindowsWslLauncher(item));

    const binaryPath =
      compatibleCandidates.find((item) => !isWindowsMountedPath(item)) || "";
    const hasOnlyWindowsMountedCandidates =
      !binaryPath && compatibleCandidates.some((item) => isWindowsMountedPath(item));
    const hasOnlyUnsupportedCandidates =
      !binaryPath && candidates.length > 0 && compatibleCandidates.length === 0;

    const verifyArgs = spec.verifyArgs || ["--version"];
    async function verifyAt(pathToBinary: string): Promise<{
      success: boolean;
      output: string;
    }> {
      return verifyExecutable(pathToBinary, verifyArgs);
    }

    const verifyFromPath = binaryPath ? await verifyAt(binaryPath) : null;
    const fallbackVerify =
      verifyFromPath?.success || hasOnlyWindowsMountedCandidates || hasOnlyUnsupportedCandidates
        ? null
        : await verifyAt(spec.binary);
    const installed = Boolean(
      binaryPath || verifyFromPath?.success || fallbackVerify?.success,
    );
    const resolvedPath =
      binaryPath || (fallbackVerify?.success ? spec.binary : null);
    const versionOutput = verifyFromPath?.success
      ? verifyFromPath.output
      : fallbackVerify?.output || "";

    return {
      id: spec.id,
      label: spec.label,
      binary: spec.binary,
      installed,
      path: resolvedPath,
      version: installed ? truncateLog(versionOutput, 300) : null,
      packageName: spec.packageName,
      installSupported: terminalInstallSupported(spec),
      category: spec.category,
    };
  }

  async function detectPackageManager(): Promise<TerminalPackageManager | null> {
    for (const manager of TERMINAL_PACKAGE_MANAGERS) {
      const firstPath = resolveExecutableCandidates(manager.binary)
        .find((candidate) => !isWindowsMountedPath(candidate));
      if (firstPath) {
        return manager;
      }
    }
    return null;
  }

  async function installSingleTarget(
    targetId: TerminalBinaryId,
    emit?: (event: TerminalInstallStreamEvent) => void | Promise<void>,
  ): Promise<TerminalInstallResult> {
    const spec = TERMINAL_CLI_SPECS[targetId];
    const before = await checkBinary(spec);
    if (before.installed) {
      await emit?.({
        type: "result",
        cli: targetId,
        success: true,
        message: `${spec.label} already installed`,
      });
      return {
        cli: targetId,
        label: spec.label,
        success: true,
        alreadyInstalled: true,
        packageName: spec.packageName,
        packageManager: null,
        path: before.path,
        command: null,
        output: "",
        stderr: "",
        error: "",
        attempts: [],
      };
    }

    if (!before.installSupported) {
      const error = process.platform === "win32" && spec.installMode === "script"
        ? "install_not_supported_on_windows"
        : "install_not_supported";
      await emit?.({
        type: "result",
        cli: targetId,
        success: false,
        error,
        message: `${spec.label} installation is not supported on this platform`,
      });
      return {
        cli: targetId,
        label: spec.label,
        success: false,
        alreadyInstalled: false,
        packageName: spec.packageName,
        packageManager: null,
        path: null,
        command: null,
        output: "",
        stderr: "",
        error,
        attempts: [],
      };
    }

    const attempts: TerminalInstallAttemptLog[] = [];
    if (spec.installMode === "script" && spec.installCommand) {
      await emit?.({
        type: "attempt",
        cli: targetId,
        stage: "script",
        command: spec.installCommand,
        message: `Running install script for ${spec.label}`,
      });
      const installResult = await runCommand(
        spec.installCommand,
        TERMINAL_INSTALL_TIMEOUT_MS,
      );
      attempts.push({
        stage: "script",
        command: spec.installCommand,
        success: installResult.success,
        output: truncateLog(installResult.output, 8000),
        stderr: truncateLog(installResult.stderr, 8000),
        error: installResult.error,
      });

      const after = await checkBinary(spec);
      await emit?.({
        type: "result",
        cli: targetId,
        success: after.installed,
        output: truncateLog(installResult.output, 8000),
        stderr: truncateLog(installResult.stderr, 8000),
        error: after.installed ? "" : "install_failed",
        message: after.installed
          ? `${spec.label} installed`
          : `${spec.label} install failed`,
      });
      return {
        cli: targetId,
        label: spec.label,
        success: after.installed,
        alreadyInstalled: false,
        packageName: spec.packageName,
        packageManager: "script",
        path: after.path,
        command: spec.installCommand,
        output: summarizeAttempts(attempts),
        stderr: "",
        error: after.installed ? "" : "install_failed",
        attempts,
      };
    }

    const manager = await detectPackageManager();
    if (!manager || !spec.packageName) {
      return {
        cli: targetId,
        label: spec.label,
        success: false,
        alreadyInstalled: false,
        packageName: spec.packageName,
        packageManager: null,
        path: null,
        command: null,
        output: "",
        stderr: "",
        error: "no_package_manager",
        attempts,
      };
    }

    const commands =
      manager.id === "npm"
        ? [
            manager.installCommand(spec.packageName),
            `${manager.installCommand(spec.packageName)} --include=optional --no-audit --no-fund`,
          ]
        : [manager.installCommand(spec.packageName)];

    for (const command of commands) {
      await emit?.({
        type: "attempt",
        cli: targetId,
        stage: `install-${attempts.length + 1}`,
        command,
        message: `Running ${spec.label} install attempt ${attempts.length + 1}`,
      });
      const installResult = await runCommand(
        command,
        TERMINAL_INSTALL_TIMEOUT_MS,
      );
      attempts.push({
        stage: `install-${attempts.length + 1}`,
        command,
        success: installResult.success,
        output: truncateLog(installResult.output, 8000),
        stderr: truncateLog(installResult.stderr, 8000),
        error: installResult.error,
      });

      const after = await checkBinary(spec);
      if (after.installed) {
        await emit?.({
          type: "result",
          cli: targetId,
          success: true,
          output: truncateLog(installResult.output, 8000),
          stderr: truncateLog(installResult.stderr, 8000),
          message: `${spec.label} installed`,
        });
        return {
          cli: targetId,
          label: spec.label,
          success: true,
          alreadyInstalled: false,
          packageName: spec.packageName,
          packageManager: manager.id,
          path: after.path,
          command,
          output: summarizeAttempts(attempts),
          stderr: "",
          error: "",
          attempts,
        };
      }
    }

    await emit?.({
      type: "result",
      cli: targetId,
      success: false,
      error: "install_failed",
      message: `${spec.label} install failed`,
    });
    return {
      cli: targetId,
      label: spec.label,
      success: false,
      alreadyInstalled: false,
      packageName: spec.packageName,
      packageManager: manager.id,
      path: null,
      command: commands.at(-1) || null,
      output: summarizeAttempts(attempts),
      stderr: "",
      error: "install_failed",
      attempts,
    };
  }

  async function runInstallWorkflow(
    target: TerminalInstallRequestId,
    emit?: (event: TerminalInstallStreamEvent) => void | Promise<void>,
  ): Promise<TerminalInstallResponse> {
    const allTargets = Object.values(TERMINAL_CLI_SPECS)
      .filter((spec) => spec.installMode !== "none")
      .map((spec) => spec.id);
    const statusBefore = await buildStatusPayload();
    const selectedTargets =
      target === "all"
        ? allTargets
        : target === "all-missing"
          ? statusBefore.binaries
              .filter((item) => !item.installed && item.installSupported)
              .map((item) => item.id)
          : [target];

    await emit?.({
      type: "start",
      message: `Starting install workflow for ${target}`,
    });

    if (!selectedTargets.length) {
      const response: TerminalInstallResponse = {
        success: true,
        requested: target,
        installedNow: [],
        failed: [],
        message: "All requested CLIs are already installed",
        results: [],
        status: statusBefore,
      };
      await emit?.({
        type: "done",
        message: response.message,
        response,
      });
      return response;
    }

    const results: TerminalInstallResult[] = [];
    for (const cli of selectedTargets) {
      results.push(await installSingleTarget(cli, emit));
    }

    const failed = results.filter((item) => !item.success);
    invalidateStatusPayloadCache();
    const statusAfter = await buildStatusPayload();
    const response: TerminalInstallResponse = {
      success: failed.length === 0,
      requested: target,
      installedNow: results
        .filter((item) => item.success && !item.alreadyInstalled)
        .map((item) => item.label),
      failed: failed.map((item) => ({
        cli: item.cli,
        error: item.error || "install_failed",
      })),
      message:
        failed.length === 0
          ? `Installed: ${
              results
                .filter((item) => item.success && !item.alreadyInstalled)
                .map((item) => item.label)
                .join(", ") || "no changes"
            }`
          : `Install failed for: ${failed.map((item) => item.label).join(", ")}`,
      results,
      status: statusAfter,
    };
    await emit?.({
      type: "done",
      message: response.message,
      response,
    });
    return response;
  }

  async function buildSkillsDependencySummary() {
    let summary;
    try {
      summary = await options.skills.getSummary({ fast: true });
    } catch {
      return {
        needsSetupCount: 0,
        blockedCount: 0,
        missingBinaryCount: 0,
        missingBinaries: [],
        marketplaceCli: {
          clawhubInstalled: false,
          skillhubInstalled: false,
        },
      };
    }
    const needsSetupSkills = summary.skills.filter(
      (skill) => skill.status === "needs-setup",
    );
    const blockedSkills = summary.skills.filter(
      (skill) => skill.status === "blocked",
    );
    const missingBinaries = new Map<string, string[]>();

    for (const skill of needsSetupSkills) {
      for (const binary of skill.missing.bins) {
        const list = missingBinaries.get(binary) || [];
        if (!list.includes(skill.slug)) list.push(skill.slug);
        missingBinaries.set(binary, list);
      }
    }

    return {
      needsSetupCount: needsSetupSkills.length,
      blockedCount: blockedSkills.length,
      missingBinaryCount: missingBinaries.size,
      missingBinaries: Array.from(missingBinaries.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([binary, skills]) => ({ binary, skills })),
      marketplaceCli: {
        clawhubInstalled: summary.tools.clawhubInstalled,
        skillhubInstalled: summary.tools.skillhubInstalled,
      },
    };
  }

  function withLiveTerminalStatusFields(
    payload: TerminalStatusPayload,
  ): TerminalStatusPayload {
    return {
      ...payload,
      ptyAvailable: pty !== null,
      sessionCount: sessions.size,
    };
  }

  function invalidateStatusPayloadCache(): void {
    cachedStatusPayload = null;
    cachedStatusPayloadAt = 0;
    pendingStatusPayload = null;
  }

  async function buildFreshStatusPayload(): Promise<TerminalStatusPayload> {
    const binaries = await Promise.all(
      Object.values(TERMINAL_CLI_SPECS).map((spec) => checkBinary(spec)),
    );
    const skills = await buildSkillsDependencySummary();
    let modelConfig: Record<string, any> = {};
    try {
      if (require("node:fs").existsSync(options.config.openclawConfigFile)) {
        modelConfig = JSON.parse(
          require("node:fs").readFileSync(
            options.config.openclawConfigFile,
            "utf-8",
          ),
        );
      }
    } catch {
      modelConfig = {};
    }
    const model = modelConfig?.agents?.defaults?.model?.primary || "";
    let provider = "";
    if (typeof model === "string" && model.includes("/")) {
      provider = model.split("/")[0];
    }
    const providers = modelConfig?.models?.providers || {};
    if (!provider) {
      for (const [providerId, providerConfig] of Object.entries(
        providers,
      ) as Array<[string, Record<string, any>]>) {
        const models = Array.isArray(providerConfig.models)
          ? providerConfig.models.map((item: any) => item.id || item)
          : [];
        if (models.includes(model)) {
          provider = providerId;
          break;
        }
      }
    }

    return {
      checkedAt: new Date().toISOString(),
      ptyAvailable: pty !== null,
      sessionCount: sessions.size,
      binaries,
      config: {
        model,
        provider,
      },
      installTargets: Object.values(TERMINAL_CLI_SPECS)
        .filter((spec) => terminalInstallSupported(spec))
        .map((spec): TerminalInstallTarget => ({
          id: spec.id,
          label: spec.label,
          packageName: spec.packageName,
          installHint:
            spec.installMode === "script"
              ? spec.installCommand || ""
              : `${TERMINAL_PACKAGE_MANAGERS[0].installCommand(spec.packageName || "")}`,
          category: spec.category,
        })),
      skills,
    };
  }

  async function buildStatusPayload(): Promise<TerminalStatusPayload> {
    const now = Date.now();
    if (
      cachedStatusPayload &&
      now - cachedStatusPayloadAt < TERMINAL_STATUS_CACHE_TTL_MS
    ) {
      return withLiveTerminalStatusFields(cachedStatusPayload);
    }

    pendingStatusPayload ??= buildFreshStatusPayload()
      .then((payload) => {
        cachedStatusPayload = payload;
        cachedStatusPayloadAt = Date.now();
        return payload;
      })
      .finally(() => {
        pendingStatusPayload = null;
      });

    return withLiveTerminalStatusFields(await pendingStatusPayload);
  }

  function buildProfileCatalog(
    status: TerminalStatusPayload,
  ): TerminalProfileCatalogResponse {
    const binaryById = new Map(
      status.binaries.map((binary) => [binary.id, binary]),
    );
    const defaultShell = resolveDefaultTerminalShell();
    const profileSpecs: Array<{
      id: string;
      label: string;
      labelZh: string;
      description: string;
      descriptionZh: string;
      kind: TerminalProfileDescriptor["kind"];
      targetKind: TerminalProfileDescriptor["targetKind"];
      binaryId: TerminalProfileDescriptor["binaryId"];
      command: string;
      pinned: boolean;
      color: string;
    }> = [
      {
        id: "local-shell",
        label: "Default Shell",
        labelZh: "默认终端",
        description: "Open the default local shell resolved from the workspace environment.",
        descriptionZh: "打开工作区环境解析出的默认本地 Shell。",
        kind: "shell",
        targetKind: "local",
        binaryId: defaultShell.binaryId,
        command: defaultShell.command,
        pinned: true,
        color: "slate",
      },
      {
        id: "shell-bash",
        label: "Bash",
        labelZh: "Bash",
        description: "Open Bash as a local terminal shell.",
        descriptionZh: "使用 Bash 创建本地终端。",
        kind: "shell",
        targetKind: "local",
        binaryId: "bash",
        command: "bash",
        pinned: true,
        color: "emerald",
      },
      {
        id: "shell-sh",
        label: "Sh",
        labelZh: "Sh",
        description: "Open POSIX sh as a local terminal shell.",
        descriptionZh: "使用 POSIX sh 创建本地终端。",
        kind: "shell",
        targetKind: "local",
        binaryId: "sh",
        command: "sh",
        pinned: false,
        color: "slate",
      },
      {
        id: "shell-zsh",
        label: "Zsh",
        labelZh: "Zsh",
        description: "Open Zsh as a local terminal shell when installed.",
        descriptionZh: "系统已安装 Zsh 时可使用 Zsh 创建本地终端。",
        kind: "shell",
        targetKind: "local",
        binaryId: "zsh",
        command: "zsh",
        pinned: false,
        color: "violet",
      },
      {
        id: "shell-fish",
        label: "Fish",
        labelZh: "Fish",
        description: "Open Fish as a local terminal shell when installed.",
        descriptionZh: "系统已安装 Fish 时可使用 Fish 创建本地终端。",
        kind: "shell",
        targetKind: "local",
        binaryId: "fish",
        command: "fish",
        pinned: false,
        color: "cyan",
      },
      {
        id: "shell-pwsh",
        label: "PowerShell",
        labelZh: "PowerShell",
        description: "Open PowerShell Core when available.",
        descriptionZh: "系统可用 PowerShell Core 时创建本地终端。",
        kind: "shell",
        targetKind: "local",
        binaryId: "pwsh",
        command: "pwsh",
        pinned: false,
        color: "blue",
      },
      {
        id: "shell-powershell",
        label: "Windows PowerShell",
        labelZh: "Windows PowerShell",
        description: "Open Windows PowerShell when available.",
        descriptionZh: "系统可用 Windows PowerShell 时创建本地终端。",
        kind: "shell",
        targetKind: "local",
        binaryId: "powershell",
        command: "powershell",
        pinned: false,
        color: "blue",
      },
      {
        id: "shell-cmd",
        label: "Command Prompt",
        labelZh: "命令提示符",
        description: "Open cmd.exe when available.",
        descriptionZh: "系统可用 cmd.exe 时创建本地终端。",
        kind: "shell",
        targetKind: "local",
        binaryId: "cmd",
        command: "cmd",
        pinned: false,
        color: "amber",
      },
      {
        id: "agent-codex",
        label: "Codex Agent",
        labelZh: "Codex Agent",
        description: "Launch Codex CLI with the configured default model.",
        descriptionZh: "使用已配置默认模型启动 Codex CLI。",
        kind: "agent",
        targetKind: "local",
        binaryId: "codex",
        command: "codex",
        pinned: true,
        color: "emerald",
      },
      {
        id: "agent-claude",
        label: "Claude Agent",
        labelZh: "Claude Agent",
        description: "Launch Claude CLI with the configured default model.",
        descriptionZh: "使用已配置默认模型启动 Claude CLI。",
        kind: "agent",
        targetKind: "local",
        binaryId: "claude",
        command: "claude",
        pinned: true,
        color: "violet",
      },
      {
        id: "agent-opencode",
        label: "OpenCode Agent",
        labelZh: "OpenCode Agent",
        description: "Launch OpenCode in a dedicated terminal tab.",
        descriptionZh: "在独立终端标签中启动 OpenCode。",
        kind: "agent",
        targetKind: "local",
        binaryId: "opencode",
        command: "opencode",
        pinned: false,
        color: "cyan",
      },
      {
        id: "marketplace-clawhub",
        label: "ClawHub",
        labelZh: "ClawHub",
        description: "Run ClawHub marketplace CLI from the terminal workbench.",
        descriptionZh: "从终端工作台运行 ClawHub 技能市场 CLI。",
        kind: "marketplace",
        targetKind: "local",
        binaryId: "clawhub",
        command: "clawhub",
        pinned: false,
        color: "amber",
      },
      {
        id: "marketplace-skillhub",
        label: "SkillHub",
        labelZh: "SkillHub",
        description:
          "Run SkillHub marketplace CLI from the terminal workbench.",
        descriptionZh: "从终端工作台运行 SkillHub 技能市场 CLI。",
        kind: "marketplace",
        targetKind: "local",
        binaryId: "skillhub",
        command: "skillhub",
        pinned: false,
        color: "blue",
      },
      {
        id: "remote-ssh",
        label: "SSH Terminal",
        labelZh: "SSH 终端",
        description:
          "Reserved remote profile for cloud server terminal targets.",
        descriptionZh: "为云服务器终端目标预留的远程 Profile。",
        kind: "remote",
        targetKind: "ssh",
        binaryId: null,
        command: "ssh",
        pinned: false,
        color: "rose",
      },
    ];

    return {
      profiles: profileSpecs.map((profile) => {
        const binary = profile.binaryId
          ? binaryById.get(profile.binaryId)
          : null;
        const installed = profile.binaryId ? Boolean(binary?.installed) : false;
          return {
            ...profile,
            command: binary?.path || profile.command,
            cwd: options.config.openclawRoot || null,
          installed,
          launchable: profile.targetKind === "local" && installed,
        };
      }),
    };
  }

  function buildSessionSummaryPayload(): TerminalSessionSummaryResponse {
    const summaries = Array.from(sessions.values())
      .filter((session) => !session.closed)
      .map((session) => {
        const hasActiveAttach = getActiveClientCount(session) > 0;
        return buildSessionDescriptor(
          session,
          hasActiveAttach ? "running" : "detached",
        );
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return {
      sessions: summaries,
    };
  }

  wss.on("connection", (socket: WebSocket, req: http.IncomingMessage) => {
    const ws = socket as TerminalSocket;
    ws._lastAliveAt = Date.now();

    if (!pty) {
      sendEvent(ws, {
        type: "error",
        message: "node-pty is not available; terminal is disabled",
      });
      try {
        ws.close();
      } catch {}
      return;
    }

    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const pinnedParam = url.searchParams.get("pinned");
      const attachMetadata: TerminalSessionLaunchMetadata = {
        profileId: url.searchParams.get("profileId"),
        targetKind: url.searchParams.get(
          "targetKind",
        ) as TerminalTargetKind | null,
        rootId: url.searchParams.get("rootId"),
        workspaceId: url.searchParams.get("workspaceId"),
        cwd: url.searchParams.get("cwd"),
        shell: url.searchParams.get("shell"),
        cols: Number(url.searchParams.get("cols") || 0) || null,
        rows: Number(url.searchParams.get("rows") || 0) || null,
        pinned:
          pinnedParam === null
            ? undefined
            : pinnedParam === "1" || pinnedParam === "true",
      };
      const session = getOrCreateSession(url.searchParams.get("sid"), {
        resumePersisted: normalizeResumeSession(url.searchParams.get("resume")),
        metadata: attachMetadata,
      });
      applySessionMetadata(session, attachMetadata);
      if (!attachSocket(session, ws, url.searchParams)) {
        try {
          ws.close();
        } catch {}
        return;
      }

      ws.on("pong", () => {
        ws._lastAliveAt = Date.now();
      });

      ws.on("message", (message: WebSocket.RawData) => {
        ws._lastAliveAt = Date.now();
        markSessionActivity(session, { persist: "deferred" });
        const payload = message.toString();

        if (
          consumeTerminalControlPayload(session, payload, {
            actorClientId: null,
            socket: ws,
          })
        ) {
          return;
        }

        session.term.write(payload);
        enqueueInputLedgerEvent(session, payload, null);
      });

      ws.on("close", () => {
        const bound = ws._terminalSession;
        if (!bound) return;
        bound.clients.delete(ws);
        markSessionActivity(bound);
        ws._terminalSession = null;
        ws._terminalSessionId = null;
        if (getActiveClientCount(bound) === 0) scheduleCleanup(bound);
      });
    } catch (error) {
      sendEvent(ws, {
        type: "error",
        message:
          error instanceof Error ? error.message : "terminal_init_failed",
      });
      try {
        ws.close();
      } catch {}
    }
  });

  return {
    async getStatus(): Promise<TerminalStatusPayload> {
      return buildStatusPayload();
    },

    async listWorkspaceSessions(): Promise<TerminalSessionSummaryResponse> {
      return buildSessionSummaryPayload();
    },

    async listPersistedSessions(): Promise<TerminalSessionSummaryResponse> {
      return {
        sessions: descriptorStore
          .listRecent()
          .map((descriptor) => reconcilePersistedDescriptor(descriptor))
          .filter((descriptor): descriptor is TerminalSessionDescriptor =>
            Boolean(descriptor),
          ),
      };
    },

    async createPersistedSession(
      payload: TerminalGatewayAttachPayload,
    ): Promise<TerminalSessionDescriptor> {
      if (!pty) {
        throw new Error(
          "node-pty is not available; terminal sessions are disabled",
        );
      }
      const session = getOrCreateSession(payload.sid || null, {
        resumePersisted: normalizeResumeSession(payload.resume),
        metadata: payload,
      });
      applySessionMetadata(session, payload);
      persistSessionDescriptor(session);
      return buildSessionDescriptor(session, "detached");
    },

    async getPersistedSession(
      sessionId: string,
    ): Promise<TerminalSessionDescriptor | null> {
      return reconcilePersistedDescriptor(descriptorStore.get(sessionId));
    },

    async renamePersistedSession(
      sessionId: string,
      title: string,
    ): Promise<TerminalSessionDescriptor | null> {
      const normalized = String(sessionId || "").trim();
      const normalizedTitle = String(title || "").trim();
      const runtimeSession = sessions.get(normalized);
      if (runtimeSession && !runtimeSession.closed) {
        runtimeSession.title = normalizedTitle || `Terminal ${runtimeSession.id}`;
        markSessionActivity(runtimeSession);
        persistSessionDescriptor(runtimeSession);
        return descriptorStore.get(normalized);
      }
      return descriptorStore.rename(normalized, normalizedTitle);
    },

    async deletePersistedSession(sessionId: string): Promise<{
      success: boolean;
      sessionId: string;
      reason?: "session_active";
    }> {
      const normalized = String(sessionId || "").trim();
      if (!normalized) {
        return {
          success: false,
          sessionId: normalized,
        };
      }

      const runtimeSession = sessions.get(normalized);
      if (runtimeSession && !runtimeSession.closed) {
        return {
          success: false,
          sessionId: normalized,
          reason: "session_active",
        };
      }

      const persisted = descriptorStore.get(normalized);
      if (persisted) {
        if (persisted.status === "running" || persisted.status === "detached") {
          return {
            success: false,
            sessionId: normalized,
            reason: "session_active",
          };
        }
      }

      const deleted = descriptorStore.remove(normalized);
      return {
        success: deleted,
        sessionId: normalized,
      };
    },

    async listSessionLedger(
      sessionId: string,
    ): Promise<TerminalSessionLedgerEvent[]> {
      flushRealtimeLedgerQueue();
      return ledger.listBySession(sessionId);
    },

    async listWorkspaceProfiles(): Promise<TerminalProfileCatalogResponse> {
      return buildProfileCatalog(await buildStatusPayload());
    },

    async listWorkspaceActions(): Promise<TerminalActionCatalogResponse> {
      return buildTerminalActionCatalog();
    },

    async installCli(
      target: TerminalInstallRequestId,
    ): Promise<TerminalInstallResponse> {
      return runInstallWorkflow(target);
    },

    async streamInstallCli(
      target: TerminalInstallRequestId,
      emit: (event: TerminalInstallStreamEvent) => void | Promise<void>,
    ): Promise<TerminalInstallResponse> {
      return runInstallWorkflow(target, emit);
    },

    async endSession(
      payload: TerminalEndPayload,
    ): Promise<TerminalEndResponse> {
      const sid = String(payload.sid || "").trim();
      if (!sid) {
        throw new Error("sid is required");
      }
      return endSessionById(sid);
    },

    async endSessions(sessionIds: string[]): Promise<TerminalEndBatchResponse> {
      const sids = [...new Set(sessionIds.map((sid) => String(sid || "").trim()).filter(Boolean))];
      const results = await Promise.all(sids.map((sid) => endSessionById(sid)));
      return {
        success: true,
        total: results.length,
        ended: results.filter((result) => result.ended).length,
        results,
      };
    },

    attachGatewayClient(
      payload: TerminalGatewayAttachPayload,
      runtime: TerminalGatewayRuntime,
    ): TerminalGatewayAttachResponse {
      if (!pty) {
        throw new Error(
          "node-pty is not available; terminal sessions are disabled",
        );
      }
      const session = getOrCreateSession(payload.sid || null, {
        resumePersisted: normalizeResumeSession(payload.resume),
        metadata: payload,
      });
      applySessionMetadata(session, payload);
      if (payload.handoffContext) {
        session.source = "system-handoff";
        session.sourceModule = payload.handoffContext.fromModule || "system";
        session.sourceAction =
          payload.handoffContext.triggerType || "system-handoff";
        session.originRoute =
          payload.handoffContext.fromRoute || `/terminal/${session.id}`;
        session.handoffContext = payload.handoffContext;
      }
      registerGatewaySubscriber(session, runtime, {
        suppressOutput: payload.outputMode === "http-stream",
      });
      persistSessionDescriptor(session);
      return {
        sid: session.id,
        descriptor: buildSessionDescriptor(session, "running"),
        leaseTtlMs: TERMINAL_GATEWAY_LEASE_MS,
        events: buildAttachEvents(session, payload),
      };
    },

    attachStreamClient(
      payload: TerminalGatewayAttachPayload,
      runtime: TerminalStreamRuntime,
    ): TerminalGatewayAttachResponse {
      if (!pty) {
        throw new Error(
          "node-pty is not available; terminal sessions are disabled",
        );
      }
      const session = requireActiveSession(payload.sid);
      applySessionMetadata(session, payload);
      registerStreamSubscriber(session, runtime);
      persistSessionDescriptor(session);
      return {
        sid: session.id,
        descriptor: buildSessionDescriptor(session, "running"),
        leaseTtlMs: TERMINAL_GATEWAY_LEASE_MS,
        events: buildAttachEvents(session, payload),
      };
    },

    detachStreamClient(sessionId: string, streamId: string): void {
      detachStreamId(streamId, sessionId);
    },

    sendHttpInput(sessionId: string, data: string): void {
      if (!pty) {
        throw new Error(
          "node-pty is not available; terminal sessions are disabled",
        );
      }
      const session = requireActiveSession(sessionId);
      const inputData = String(data || "");
      if (
        consumeTerminalControlPayload(session, inputData, {
          actorClientId: null,
        })
      ) {
        return;
      }
      session.term.write(inputData);
      markSessionActivity(session, { persist: "deferred" });
      enqueueInputLedgerEvent(session, inputData, null);
    },

    resizeHttpSession(sessionId: string, cols: number, rows: number): void {
      if (!pty) {
        throw new Error(
          "node-pty is not available; terminal sessions are disabled",
        );
      }
      const session = requireActiveSession(sessionId);
      const normalizedCols = normalizeTerminalDimension(cols);
      const normalizedRows = normalizeTerminalDimension(rows);
      if (!normalizedCols || !normalizedRows) {
        return;
      }
      markSessionActivity(session);
      session.lastCols = normalizedCols;
      session.lastRows = normalizedRows;
      appendLedgerEvent(
        session,
        "resize",
        { cols: session.lastCols, rows: session.lastRows },
        null,
      );
      session.term.resize(session.lastCols, session.lastRows);
    },

    sendGatewayInput(
      payload: TerminalGatewayInputPayload,
      runtime: Pick<TerminalGatewayRuntime, "connId">,
    ): TerminalGatewayAckResponse {
      const session = requireActiveSession(payload.sid);
      requireGatewaySubscriber(session, runtime.connId);
      const inputData = String(payload.data || "");
      if (
        consumeTerminalControlPayload(session, inputData, {
          actorClientId: runtime.connId,
        })
      ) {
        if (payload.ackMode === "none") {
          return {
            ok: true,
            sid: session.id,
            instanceId: session.instanceId,
            outputSeq: session.outputSeq,
            leaseTtlMs: TERMINAL_GATEWAY_LEASE_MS,
          };
        }
        return createGatewayAck(session, payload);
      }
      session.term.write(inputData);
      markSessionActivity(session, { persist: "deferred" });
      enqueueInputLedgerEvent(session, inputData, runtime.connId);
      if (payload.ackMode === "none") {
        return {
          ok: true,
          sid: session.id,
          instanceId: session.instanceId,
          outputSeq: session.outputSeq,
          leaseTtlMs: TERMINAL_GATEWAY_LEASE_MS,
        };
      }
      return createGatewayAck(session, payload);
    },

    resizeGatewayClient(
      payload: TerminalGatewayResizePayload,
      runtime: Pick<TerminalGatewayRuntime, "connId">,
    ): TerminalGatewayAckResponse {
      const session = requireActiveSession(payload.sid);
      requireGatewaySubscriber(session, runtime.connId);
      const cols = normalizeTerminalDimension(payload.cols);
      const rows = normalizeTerminalDimension(payload.rows);
      if (!cols || !rows) {
        return createGatewayAck(session, payload);
      }
      markSessionActivity(session);
      session.lastCols = cols;
      session.lastRows = rows;
      appendLedgerEvent(
        session,
        "resize",
        { cols: session.lastCols, rows: session.lastRows },
        runtime.connId,
      );
      session.term.resize(session.lastCols, session.lastRows);
      return createGatewayAck(session, payload);
    },

    heartbeatGatewayClient(
      payload: TerminalGatewayHeartbeatPayload,
      runtime: Pick<TerminalGatewayRuntime, "connId">,
    ): TerminalGatewayAckResponse {
      const session = requireActiveSession(payload.sid);
      requireGatewaySubscriber(session, runtime.connId);
      markSessionActivity(session);
      return createGatewayAck(session, payload);
    },

    clearGatewaySession(
      payload: TerminalGatewayClearPayload,
      runtime: Pick<TerminalGatewayRuntime, "connId">,
    ): TerminalGatewayAckResponse {
      const session = requireActiveSession(payload.sid);
      requireGatewaySubscriber(session, runtime.connId);
      clearSessionDisplay(session, runtime.connId);
      return createGatewayAck(session, payload);
    },

    detachGatewayClient(
      payload: TerminalGatewayDetachPayload,
      runtime: Pick<TerminalGatewayRuntime, "connId">,
    ): TerminalGatewayAckResponse {
      const targetSessionId = String(payload.sid || "").trim();
      detachGatewayConnId(runtime.connId, targetSessionId || null);
      if (targetSessionId) {
        const session = sessions.get(targetSessionId);
        if (session && !session.closed) {
          persistSessionDescriptor(session);
        }
      }
      return {
        ok: true,
        sid: targetSessionId || "",
      };
    },

    handleUpgrade(
      req: http.IncomingMessage,
      socket: Duplex,
      head: Buffer,
    ): boolean {
      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "127.0.0.1"}`,
      );
      if (url.pathname !== "/ws/terminal") return false;
      wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        wss.emit("connection", ws, req);
      });
      return true;
    },

    async dispose(): Promise<void> {
      clearInterval(pingTimer);
      clearInterval(gatewaySweepTimer);
      flushRealtimeLedgerQueue();
      const sessionIds = Array.from(sessions.keys());
      const exits = sessionIds.map((sessionId) => destroySession(sessionId));
      try {
        wss.close();
      } catch {}
      if (exits.length === 0) return;
      const outcomes = await Promise.allSettled(exits);
      const retainedSessionIds = outcomes.flatMap((outcome, index) =>
        outcome.status === "fulfilled" && outcome.value
          ? []
          : [sessionIds[index]!]
      );
      if (retainedSessionIds.length > 0) {
        throw new Error(
          `Terminal cleanup failed; sessions did not exit: ${retainedSessionIds.join(", ")}`,
        );
      }
    },
  };
}
