import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { TracevaneServerConfig } from "../../../../../types/api.js";
import type { LspDiagnostic } from "../../../../../types/lsp.js";
import { createExternalLanguageServerGateway } from "../external/externalLanguageServerGateway.js";
import type { ExternalLanguageServerProfile } from "../external/externalLanguageServerTypes.js";
import { findRustWorkspaceMarker, type RustWorkspaceMarker } from "./rustWorkspace.js";
import { toolchainProviderStatusSnapshot } from "./toolchainProviderStatus.js";

const execFileAsync = promisify(execFile);

export interface RustAnalyzerDiagnosticsInput {
  config: TracevaneServerConfig;
  rootRealPath: string;
  absolutePath: string;
  content: string;
  version: number;
  profile?: ExternalLanguageServerProfile;
  probe?: (profile: ExternalLanguageServerProfile, cwd: string) => Promise<RustAnalyzerProbeResult>;
}

export interface RustAnalyzerProbeResult {
  ok: boolean;
  status: "configured" | "missingBinary" | "unsupportedVersion" | "unavailable";
  versionSummary: string | null;
  reason: string | null;
}

export interface RustAnalyzerDiagnosticsResult {
  diagnostics: unknown[];
  skipped: boolean;
  status: "configured" | "notConfigured" | "missingWorkspaceConfig" | "missingBinary" | "unsupportedVersion" | "disabledByTrust" | "unavailable";
  marker: RustWorkspaceMarker | null;
  versionSummary: string | null;
  reason: string | null;
}

const RUST_ANALYZER_PROVIDER_ID = "rust-analyzer";
const RUST_ANALYZER_VERSION_OUTPUT_LIMIT = 500;

export function createRustAnalyzerProfile(overrides: Partial<ExternalLanguageServerProfile> = {}): ExternalLanguageServerProfile {
  return {
    ...overrides,
    id: overrides.id ?? RUST_ANALYZER_PROVIDER_ID,
    label: overrides.label ?? "Rust / rust-analyzer",
    command: overrides.command ?? "rust-analyzer",
    args: overrides.args ?? [],
    languages: overrides.languages ?? ["rust"],
    capabilities: { diagnostics: true, ...(overrides.capabilities ?? {}) },
    budgets: overrides.budgets ?? { initializeMs: 10_000, requestMs: 8_000, shutdownMs: 1_500 },
  };
}

export async function diagnoseWithRustAnalyzer(input: RustAnalyzerDiagnosticsInput): Promise<RustAnalyzerDiagnosticsResult> {
  const candidate = toolchainProviderStatusSnapshot(input.config).candidates.find((item) => item.providerId === "rust");
  if (!candidate || candidate.status !== "configured" || !candidate.configured) {
    return {
      diagnostics: [],
      skipped: true,
      status: candidate?.status ?? "notConfigured",
      marker: null,
      versionSummary: null,
      reason: candidate?.config?.rejectedReason ?? "Rust / rust-analyzer provider is not trusted and configured.",
    };
  }

  const marker = findRustWorkspaceMarker(input.rootRealPath, input.absolutePath);
  if (!marker) {
    return {
      diagnostics: [],
      skipped: true,
      status: "missingWorkspaceConfig",
      marker: null,
      versionSummary: null,
      reason: "No Cargo.toml or rust-project.json marker was found between the file and workspace root.",
    };
  }

  const profile = input.profile ?? createRustAnalyzerProfile();
  const probe = input.probe ?? probeRustAnalyzerVersion;
  const probeResult = await probe(profile, marker.directory);
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

  const uri = pathToFileUri(input.absolutePath);
  const gateway = createExternalLanguageServerGateway({
    rootPath: marker.directory,
    profiles: [profile],
  });
  await gateway.start(profile.id);
  try {
    gateway.notify(profile.id, "textDocument/didOpen", {
      textDocument: { uri, languageId: "rust", version: input.version, text: input.content },
    });
    const diagnostics = await gateway.waitForDiagnostics(profile.id, uri, 8_000);
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
      reason: error instanceof Error ? bounded(error.message, RUST_ANALYZER_VERSION_OUTPUT_LIMIT) : String(error),
    };
  } finally {
    await gateway.stop(profile.id).catch(() => undefined);
  }
}

export async function probeRustAnalyzerVersion(profile: ExternalLanguageServerProfile, cwd: string): Promise<RustAnalyzerProbeResult> {
  try {
    const { stdout, stderr } = await execFileAsync(profile.command, ["--version"], {
      cwd,
      timeout: 2_000,
      maxBuffer: 8_192,
      env: { ...process.env, ...(profile.env ?? {}) },
    });
    const output = bounded(`${stdout || ""}${stderr ? `\n${stderr}` : ""}`.trim(), RUST_ANALYZER_VERSION_OUTPUT_LIMIT);
    if (!/rust-analyzer/i.test(output)) {
      return { ok: false, status: "unsupportedVersion", versionSummary: output || null, reason: "rust-analyzer version output did not identify rust-analyzer." };
    }
    return { ok: true, status: "configured", versionSummary: output || null, reason: null };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT") {
      return { ok: false, status: "missingBinary", versionSummary: null, reason: "rust-analyzer binary is not available from the server-side allowlisted profile." };
    }
    return {
      ok: false,
      status: "unavailable",
      versionSummary: null,
      reason: error instanceof Error ? bounded(error.message, RUST_ANALYZER_VERSION_OUTPUT_LIMIT) : String(error),
    };
  }
}

export function rustExternalDiagnosticToTracevaneDiagnostic(diagnostic: unknown): LspDiagnostic {
  const value = isRecord(diagnostic) ? diagnostic : {};
  const range = isRecord(value.range) ? value.range : {};
  const start = isRecord(range.start) ? range.start : {};
  const end = isRecord(range.end) ? range.end : start;
  const message = typeof value.message === "string" ? value.message : "rust-analyzer diagnostic";
  return {
    severity: severityFromLsp(value.severity),
    message,
    startLine: numberOr(start.line, 0) + 1,
    startColumn: numberOr(start.character, 0) + 1,
    endLine: numberOr(end.line, numberOr(start.line, 0)) + 1,
    endColumn: numberOr(end.character, numberOr(start.character, 0) + 1) + 1,
    code: typeof value.code === "string" || typeof value.code === "number" ? String(value.code) : null,
    source: typeof value.source === "string" ? value.source : "rust-analyzer",
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
