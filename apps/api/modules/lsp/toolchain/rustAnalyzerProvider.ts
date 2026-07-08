import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { TracevaneServerConfig } from "../../../../../types/api.js";
import type { LspDiagnostic } from "../../../../../types/lsp.js";
import { createExternalLanguageServerGateway } from "../external/externalLanguageServerGateway.js";
import type { ExternalLanguageServerGateway } from "../external/externalLanguageServerGateway.js";
import type { ExternalLanguageServerProfile } from "../external/externalLanguageServerTypes.js";
import { findRustWorkspaceMarker, type RustWorkspaceMarker } from "./rustWorkspace.js";
import { toolchainProviderStatusSnapshot } from "./toolchainProviderStatus.js";

const execFileAsync = promisify(execFile);

export type RustAnalyzerRuntimeStatus = "configured" | "notConfigured" | "missingWorkspaceConfig" | "missingBinary" | "unsupportedVersion" | "disabledByTrust" | "unavailable";

export interface RustAnalyzerBaseInput {
  config: TracevaneServerConfig;
  rootRealPath: string;
  absolutePath: string;
  content: string;
  version: number;
  profile?: ExternalLanguageServerProfile;
  probe?: (profile: ExternalLanguageServerProfile, cwd: string) => Promise<RustAnalyzerProbeResult>;
}

export type RustAnalyzerDiagnosticsInput = RustAnalyzerBaseInput;

export interface RustAnalyzerPositionInput extends RustAnalyzerBaseInput {
  line: number;
  column: number;
}

export interface RustAnalyzerProbeResult {
  ok: boolean;
  status: "configured" | "missingBinary" | "unsupportedVersion" | "unavailable";
  versionSummary: string | null;
  reason: string | null;
}

export interface RustAnalyzerGuardedResult {
  skipped: boolean;
  status: RustAnalyzerRuntimeStatus;
  marker: RustWorkspaceMarker | null;
  versionSummary: string | null;
  reason: string | null;
}

export interface RustAnalyzerDiagnosticsResult extends RustAnalyzerGuardedResult {
  diagnostics: unknown[];
}

export interface RustAnalyzerRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface RustAnalyzerHoverResult extends RustAnalyzerGuardedResult {
  contents: string[];
  range: RustAnalyzerRange | null;
}

export interface RustAnalyzerDefinitionLocation {
  absolutePath: string;
  range: RustAnalyzerRange;
}

export interface RustAnalyzerDefinitionResult extends RustAnalyzerGuardedResult {
  locations: RustAnalyzerDefinitionLocation[];
}

interface RustAnalyzerSession {
  gateway: ExternalLanguageServerGateway;
  profile: ExternalLanguageServerProfile;
  uri: string;
  marker: RustWorkspaceMarker;
  versionSummary: string | null;
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
    capabilities: { diagnostics: true, hover: true, definition: true, ...(overrides.capabilities ?? {}) },
    budgets: overrides.budgets ?? { initializeMs: 10_000, requestMs: 8_000, shutdownMs: 1_500 },
  };
}

export async function diagnoseWithRustAnalyzer(input: RustAnalyzerDiagnosticsInput): Promise<RustAnalyzerDiagnosticsResult> {
  return withRustAnalyzerSession(
    input,
    { diagnostics: [] },
    async ({ gateway, profile, uri }) => {
      const diagnostics = await gateway.waitForDiagnostics(profile.id, uri, 8_000);
      return { diagnostics };
    },
  );
}

export async function hoverWithRustAnalyzer(input: RustAnalyzerPositionInput): Promise<RustAnalyzerHoverResult> {
  return withRustAnalyzerSession(
    input,
    { contents: [], range: null },
    async ({ gateway, profile, uri }) => {
      const result = await gateway.request(profile.id, "textDocument/hover", {
        textDocument: { uri },
        position: lspPosition(input.line, input.column),
      });
      const parsed = parseHoverResult(result);
      return { contents: parsed.contents, range: parsed.range };
    },
  );
}

export async function defineWithRustAnalyzer(input: RustAnalyzerPositionInput): Promise<RustAnalyzerDefinitionResult> {
  return withRustAnalyzerSession(
    input,
    { locations: [] },
    async ({ gateway, profile, uri }) => {
      const result = await gateway.request(profile.id, "textDocument/definition", {
        textDocument: { uri },
        position: lspPosition(input.line, input.column),
      });
      return { locations: parseDefinitionLocations(result) };
    },
  );
}

async function withRustAnalyzerSession<T extends Record<string, unknown>>(
  input: RustAnalyzerBaseInput,
  empty: T,
  run: (session: RustAnalyzerSession) => Promise<T>,
): Promise<T & RustAnalyzerGuardedResult> {
  const candidate = toolchainProviderStatusSnapshot(input.config).candidates.find((item) => item.providerId === "rust");
  if (!candidate || candidate.status !== "configured" || !candidate.configured) {
    return {
      ...empty,
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
      ...empty,
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
      ...empty,
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
    return {
      ...(await run({ gateway, profile, uri, marker, versionSummary: probeResult.versionSummary })),
      skipped: false,
      status: "configured",
      marker,
      versionSummary: probeResult.versionSummary,
      reason: null,
    };
  } catch (error) {
    const reason = (error as { reason?: unknown } | null)?.reason;
    return {
      ...empty,
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

function parseHoverResult(result: unknown): { contents: string[]; range: RustAnalyzerRange | null } {
  const hover = isRecord(result) ? result : {};
  return {
    contents: hoverContentsToStrings(hover.contents),
    range: lspRangeToTracevaneRange(hover.range),
  };
}

function hoverContentsToStrings(contents: unknown): string[] {
  if (Array.isArray(contents)) return contents.flatMap((item) => hoverContentToString(item));
  return hoverContentToString(contents);
}

function hoverContentToString(content: unknown): string[] {
  if (typeof content === "string") return content ? [content] : [];
  if (isRecord(content)) {
    const value = typeof content.value === "string" ? content.value : "";
    const language = typeof content.language === "string" ? content.language : "";
    if (!value) return [];
    return language ? [`\`\`\`${language}\n${value}\n\`\`\``] : [value];
  }
  return [];
}

function parseDefinitionLocations(result: unknown): RustAnalyzerDefinitionLocation[] {
  const values = Array.isArray(result) ? result : result ? [result] : [];
  return values.flatMap((item) => {
    const value = isRecord(item) ? item : {};
    const uri = typeof value.uri === "string" ? value.uri : typeof value.targetUri === "string" ? value.targetUri : null;
    if (!uri) return [];
    const range = lspRangeToTracevaneRange(value.targetSelectionRange) ?? lspRangeToTracevaneRange(value.range) ?? lspRangeToTracevaneRange(value.targetRange);
    if (!range) return [];
    const absolutePath = fileUriToPath(uri);
    return absolutePath ? [{ absolutePath, range }] : [];
  });
}

function lspRangeToTracevaneRange(range: unknown): RustAnalyzerRange | null {
  if (!isRecord(range)) return null;
  const start = isRecord(range.start) ? range.start : {};
  const end = isRecord(range.end) ? range.end : start;
  return {
    startLine: numberOr(start.line, 0) + 1,
    startColumn: numberOr(start.character, 0) + 1,
    endLine: numberOr(end.line, numberOr(start.line, 0)) + 1,
    endColumn: numberOr(end.character, numberOr(start.character, 0) + 1) + 1,
  };
}

function lspPosition(line: number, column: number): { line: number; character: number } {
  return {
    line: Math.max(0, Math.floor(line) - 1),
    character: Math.max(0, Math.floor(column) - 1),
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

function fileUriToPath(uri: string): string | null {
  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
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
