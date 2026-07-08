import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { TracevaneServerConfig } from "../../../../../types/api.js";
import type { LspDiagnostic } from "../../../../../types/lsp.js";
import { createExternalLanguageServerGateway } from "../external/externalLanguageServerGateway.js";
import type { ExternalLanguageServerProfile } from "../external/externalLanguageServerTypes.js";
import { findJavaWorkspaceMarker, type JavaWorkspaceMarker } from "./javaWorkspace.js";
import { toolchainProviderStatusSnapshot } from "./toolchainProviderStatus.js";

const execFileAsync = promisify(execFile);

export interface JavaJdtlsDiagnosticsInput {
  config: TracevaneServerConfig;
  rootRealPath: string;
  absolutePath: string;
  content: string;
  version: number;
  profile?: ExternalLanguageServerProfile;
  probe?: (profile: ExternalLanguageServerProfile, cwd: string) => Promise<JavaJdtlsProbeResult>;
}

export interface JavaJdtlsProbeResult {
  ok: boolean;
  status: "configured" | "missingBinary" | "unsupportedVersion" | "unavailable";
  versionSummary: string | null;
  reason: string | null;
}

export interface JavaJdtlsDiagnosticsResult {
  diagnostics: unknown[];
  skipped: boolean;
  status: "configured" | "notConfigured" | "missingWorkspaceConfig" | "missingBinary" | "unsupportedVersion" | "disabledByTrust" | "unavailable";
  marker: JavaWorkspaceMarker | null;
  versionSummary: string | null;
  reason: string | null;
}

interface RawJavaJdtlsConfig {
  javaCommand?: unknown;
  jdtlsHome?: unknown;
  launcherJar?: unknown;
  configurationDirectory?: unknown;
  dataRoot?: unknown;
}

interface ResolvedJdtlsRuntime {
  profile: ExternalLanguageServerProfile;
  dataDirectory: string;
  versionProbeProfile: ExternalLanguageServerProfile;
}

const JAVA_PROVIDER_ID = "java-jdtls";
const JAVA_VERSION_OUTPUT_LIMIT = 500;

export function createJavaJdtlsProfile(overrides: Partial<ExternalLanguageServerProfile> = {}): ExternalLanguageServerProfile {
  return {
    ...overrides,
    id: overrides.id ?? JAVA_PROVIDER_ID,
    label: overrides.label ?? "Java / Eclipse JDT LS",
    command: overrides.command ?? "java",
    args: overrides.args ?? [],
    languages: overrides.languages ?? ["java"],
    capabilities: { diagnostics: true, ...(overrides.capabilities ?? {}) },
    budgets: overrides.budgets ?? { initializeMs: 20_000, requestMs: 12_000, shutdownMs: 2_000 },
  };
}

export async function diagnoseWithJavaJdtls(input: JavaJdtlsDiagnosticsInput): Promise<JavaJdtlsDiagnosticsResult> {
  const candidate = toolchainProviderStatusSnapshot(input.config).candidates.find((item) => item.providerId === "java");
  if (!candidate || candidate.status !== "configured" || !candidate.configured) {
    return {
      diagnostics: [],
      skipped: true,
      status: candidate?.status ?? "notConfigured",
      marker: null,
      versionSummary: null,
      reason: candidate?.config?.rejectedReason ?? "Java / Eclipse JDT LS provider is not trusted and configured.",
    };
  }

  const marker = findJavaWorkspaceMarker(input.rootRealPath, input.absolutePath);
  if (!marker) {
    return {
      diagnostics: [],
      skipped: true,
      status: "missingWorkspaceConfig",
      marker: null,
      versionSummary: null,
      reason: "No pom.xml, Gradle build/settings file, or .project marker was found between the file and workspace root.",
    };
  }

  const runtime = input.profile
    ? { profile: input.profile, dataDirectory: marker.directory, versionProbeProfile: input.profile }
    : resolveJdtlsRuntime(input.config, input.rootRealPath, marker.directory);
  if (!runtime) {
    return {
      diagnostics: [],
      skipped: true,
      status: "missingBinary",
      marker,
      versionSummary: null,
      reason: "JDT LS launcher jar, platform configuration directory, or Java command is not configured in the trusted server-side profile.",
    };
  }

  const probe = input.probe ?? probeJavaJdtlsVersion;
  const probeResult = await probe(runtime.versionProbeProfile, marker.directory);
  if (!probeResult.ok) {
    return {
      diagnostics: [],
      skipped: true,
      status: probeResult.status,
      marker,
      versionSummary: probeResult.versionSummary,
      reason: probeResult.reason,
    };
  }

  fs.mkdirSync(runtime.dataDirectory, { recursive: true });
  const uri = pathToFileUri(input.absolutePath);
  const gateway = createExternalLanguageServerGateway({
    rootPath: marker.directory,
    profiles: [runtime.profile],
  });
  await gateway.start(runtime.profile.id);
  try {
    gateway.notify(runtime.profile.id, "textDocument/didOpen", {
      textDocument: { uri, languageId: "java", version: input.version, text: input.content },
    });
    const diagnostics = await gateway.waitForDiagnostics(runtime.profile.id, uri, 12_000);
    return {
      diagnostics,
      skipped: false,
      status: "configured",
      marker,
      versionSummary: probeResult.versionSummary,
      reason: null,
    };
  } catch (error) {
    const reason = (error as { reason?: unknown } | null)?.reason;
    return {
      diagnostics: [],
      skipped: true,
      status: reason === "missing_binary" ? "missingBinary" : "unavailable",
      marker,
      versionSummary: probeResult.versionSummary,
      reason: error instanceof Error ? bounded(error.message, JAVA_VERSION_OUTPUT_LIMIT) : String(error),
    };
  } finally {
    await gateway.stop(runtime.profile.id).catch(() => undefined);
  }
}

export async function probeJavaJdtlsVersion(profile: ExternalLanguageServerProfile, cwd: string): Promise<JavaJdtlsProbeResult> {
  try {
    const { stdout, stderr } = await execFileAsync(profile.command, ["-version"], {
      cwd,
      timeout: 2_000,
      maxBuffer: 8_192,
      env: { ...process.env, ...(profile.env ?? {}) },
    });
    const output = bounded(`${stdout || ""}${stderr ? `\n${stderr}` : ""}`.trim(), JAVA_VERSION_OUTPUT_LIMIT);
    const version = javaMajorVersion(output);
    if (!version) {
      return { ok: false, status: "unsupportedVersion", versionSummary: output || null, reason: "Java version output did not include a recognizable major version." };
    }
    if (version < 21) {
      return { ok: false, status: "unsupportedVersion", versionSummary: output || null, reason: "Eclipse JDT LS requires Java 21 or newer." };
    }
    return { ok: true, status: "configured", versionSummary: output || null, reason: null };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT") {
      return { ok: false, status: "missingBinary", versionSummary: null, reason: "Java binary is not available from the server-side allowlisted profile." };
    }
    return {
      ok: false,
      status: "unavailable",
      versionSummary: null,
      reason: error instanceof Error ? bounded(error.message, JAVA_VERSION_OUTPUT_LIMIT) : String(error),
    };
  }
}

export function javaExternalDiagnosticToTracevaneDiagnostic(diagnostic: unknown): LspDiagnostic {
  const value = isRecord(diagnostic) ? diagnostic : {};
  const range = isRecord(value.range) ? value.range : {};
  const start = isRecord(range.start) ? range.start : {};
  const end = isRecord(range.end) ? range.end : start;
  const message = typeof value.message === "string" ? value.message : "JDT LS diagnostic";
  return {
    severity: severityFromLsp(value.severity),
    message,
    startLine: numberOr(start.line, 0) + 1,
    startColumn: numberOr(start.character, 0) + 1,
    endLine: numberOr(end.line, numberOr(start.line, 0)) + 1,
    endColumn: numberOr(end.character, numberOr(start.character, 0) + 1) + 1,
    code: typeof value.code === "string" || typeof value.code === "number" ? String(value.code) : null,
    source: typeof value.source === "string" ? value.source : "jdtls",
  };
}

function resolveJdtlsRuntime(config: TracevaneServerConfig, rootRealPath: string, workspaceDirectory: string): ResolvedJdtlsRuntime | null {
  const raw = getRawJavaJdtlsConfig(config);
  const javaCommand = stringOr(raw?.javaCommand, "java");
  const launcherJar = resolveLauncherJar(raw);
  const configurationDirectory = resolveConfigurationDirectory(raw);
  if (!javaCommand || !launcherJar || !configurationDirectory) return null;
  const dataDirectory = path.join(resolveDataRoot(config, raw), stableWorkspaceId(rootRealPath, workspaceDirectory));
  return {
    dataDirectory,
    versionProbeProfile: createJavaJdtlsProfile({ command: javaCommand, args: [] }),
    profile: createJavaJdtlsProfile({
      command: javaCommand,
      args: [
        "-Declipse.application=org.eclipse.jdt.ls.core.id1",
        "-Dosgi.bundles.defaultStartLevel=4",
        "-Declipse.product=org.eclipse.jdt.ls.core.product",
        "-Dlog.level=ERROR",
        "-Xmx1G",
        "--add-modules=ALL-SYSTEM",
        "--add-opens", "java.base/java.util=ALL-UNNAMED",
        "--add-opens", "java.base/java.lang=ALL-UNNAMED",
        "-jar", launcherJar,
        "-configuration", configurationDirectory,
        "-data", dataDirectory,
      ],
    }),
  };
}

function resolveLauncherJar(raw: RawJavaJdtlsConfig | null): string | null {
  const explicit = stringOr(raw?.launcherJar, "");
  if (explicit && fs.existsSync(explicit) && fs.statSync(explicit).isFile()) return explicit;
  const home = stringOr(raw?.jdtlsHome, "");
  if (!home) return null;
  const pluginsDir = path.join(home, "plugins");
  if (!fs.existsSync(pluginsDir) || !fs.statSync(pluginsDir).isDirectory()) return null;
  const candidates = fs.readdirSync(pluginsDir)
    .filter((name) => /^org\.eclipse\.equinox\.launcher_.*\.jar$/.test(name))
    .sort()
    .reverse();
  return candidates.length > 0 ? path.join(pluginsDir, candidates[0]) : null;
}

function resolveConfigurationDirectory(raw: RawJavaJdtlsConfig | null): string | null {
  const explicit = stringOr(raw?.configurationDirectory, "");
  if (explicit && fs.existsSync(explicit) && fs.statSync(explicit).isDirectory()) return explicit;
  const home = stringOr(raw?.jdtlsHome, "");
  if (!home) return null;
  const configDir = path.join(home, defaultJdtlsConfigDirectoryName());
  return fs.existsSync(configDir) && fs.statSync(configDir).isDirectory() ? configDir : null;
}

function defaultJdtlsConfigDirectoryName(): string {
  if (process.platform === "win32") return "config_win";
  if (process.platform === "darwin") return "config_mac";
  return "config_linux";
}

function resolveDataRoot(config: TracevaneServerConfig, raw: RawJavaJdtlsConfig | null): string {
  const configured = stringOr(raw?.dataRoot, "");
  return configured || path.join(config.openclawRoot || os.tmpdir(), "lsp", "jdtls-workspaces");
}

function stableWorkspaceId(rootRealPath: string, workspaceDirectory: string): string {
  return crypto.createHash("sha256").update(`${path.resolve(rootRealPath)}\n${path.resolve(workspaceDirectory)}`).digest("hex").slice(0, 24);
}

function getRawJavaJdtlsConfig(config: TracevaneServerConfig): RawJavaJdtlsConfig | null {
  try {
    if (!fs.existsSync(config.openclawConfigFile)) return null;
    const parsed = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
    const value = parsed?.lsp?.toolchains?.java?.jdtls;
    return isRecord(value) ? value as RawJavaJdtlsConfig : null;
  } catch {
    return null;
  }
}

function javaMajorVersion(output: string): number | null {
  const quoted = output.match(/version\s+"(\d+)(?:\.(\d+))?/i);
  if (quoted) {
    const first = Number(quoted[1]);
    const second = Number(quoted[2] ?? "0");
    if (first === 1 && second > 0) return second;
    return first;
  }
  const openjdk = output.match(/openjdk\s+(\d+)/i);
  return openjdk ? Number(openjdk[1]) : null;
}

function severityFromLsp(severity: unknown): LspDiagnostic["severity"] {
  if (severity === 1) return "error";
  if (severity === 2) return "warning";
  if (severity === 3) return "info";
  if (severity === 4) return "hint";
  return "warning";
}

function pathToFileUri(filePath: string): string {
  return `file://${filePath.replace(/\\/g, "/").split("/").map((segment, index) => index === 0 ? segment : encodeURIComponent(segment)).join("/")}`;
}

function bounded(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
