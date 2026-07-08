import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { TracevaneServerConfig } from "../../../../../types/api.js";
import type { LspDiagnostic } from "../../../../../types/lsp.js";
import { createExternalLanguageServerGateway } from "../external/externalLanguageServerGateway.js";
import type { ExternalLanguageServerGateway } from "../external/externalLanguageServerGateway.js";
import type { ExternalLanguageServerProfile } from "../external/externalLanguageServerTypes.js";
import { toolchainProviderStatusSnapshot } from "./toolchainProviderStatus.js";
import { findGoWorkspaceMarker, type GoWorkspaceMarker } from "./goWorkspace.js";

const execFileAsync = promisify(execFile);

export type GoGoplsRuntimeStatus = "configured" | "notConfigured" | "missingWorkspaceConfig" | "missingBinary" | "unsupportedVersion" | "disabledByTrust" | "unavailable";

export interface GoGoplsBaseInput {
  config: TracevaneServerConfig;
  rootRealPath: string;
  absolutePath: string;
  content: string;
  version: number;
  profile?: ExternalLanguageServerProfile;
  probe?: (profile: ExternalLanguageServerProfile, cwd: string) => Promise<GoGoplsProbeResult>;
}

export type GoGoplsDiagnosticsInput = GoGoplsBaseInput;

export interface GoGoplsPositionInput extends GoGoplsBaseInput {
  line: number;
  column: number;
}

export interface GoGoplsProbeResult {
  ok: boolean;
  status: "configured" | "missingBinary" | "unsupportedVersion" | "unavailable";
  versionSummary: string | null;
  reason: string | null;
}

export interface GoGoplsGuardedResult {
  skipped: boolean;
  status: GoGoplsRuntimeStatus;
  marker: GoWorkspaceMarker | null;
  versionSummary: string | null;
  reason: string | null;
}

export interface GoGoplsDiagnosticsResult extends GoGoplsGuardedResult {
  diagnostics: unknown[];
}

export interface GoGoplsRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface GoGoplsHoverResult extends GoGoplsGuardedResult {
  contents: string[];
  range: GoGoplsRange | null;
}

export interface GoGoplsDefinitionLocation {
  absolutePath: string;
  range: GoGoplsRange;
}

export interface GoGoplsDefinitionResult extends GoGoplsGuardedResult {
  locations: GoGoplsDefinitionLocation[];
}

interface GoGoplsSession {
  gateway: ExternalLanguageServerGateway;
  profile: ExternalLanguageServerProfile;
  uri: string;
  marker: GoWorkspaceMarker;
  versionSummary: string | null;
}

const GOPLS_PROVIDER_ID = "go-gopls";
const GOPLS_VERSION_OUTPUT_LIMIT = 500;

export function createGoGoplsProfile(overrides: Partial<ExternalLanguageServerProfile> = {}): ExternalLanguageServerProfile {
  return {
    ...overrides,
    id: overrides.id ?? GOPLS_PROVIDER_ID,
    label: overrides.label ?? "Go / gopls",
    command: overrides.command ?? "gopls",
    args: overrides.args ?? [],
    languages: overrides.languages ?? ["go"],
    capabilities: { diagnostics: true, hover: true, definition: true, ...(overrides.capabilities ?? {}) },
    budgets: overrides.budgets ?? { initializeMs: 10_000, requestMs: 8_000, shutdownMs: 1_500 },
  };
}

export async function diagnoseWithGoGopls(input: GoGoplsDiagnosticsInput): Promise<GoGoplsDiagnosticsResult> {
  return withGoGoplsSession(
    input,
    { diagnostics: [] },
    async ({ gateway, profile, uri }) => {
      const diagnostics = await gateway.waitForDiagnostics(profile.id, uri, 8_000);
      return { diagnostics };
    },
  );
}

export async function hoverWithGoGopls(input: GoGoplsPositionInput): Promise<GoGoplsHoverResult> {
  return withGoGoplsSession(
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

export async function defineWithGoGopls(input: GoGoplsPositionInput): Promise<GoGoplsDefinitionResult> {
  return withGoGoplsSession(
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

async function withGoGoplsSession<T extends Record<string, unknown>>(
  input: GoGoplsBaseInput,
  empty: T,
  run: (session: GoGoplsSession) => Promise<T>,
): Promise<T & GoGoplsGuardedResult> {
  const candidate = toolchainProviderStatusSnapshot(input.config).candidates.find((item) => item.providerId === "go");
  if (!candidate || candidate.status !== "configured" || !candidate.configured) {
    return {
      ...empty,
      skipped: true,
      status: candidate?.status ?? "notConfigured",
      marker: null,
      versionSummary: null,
      reason: candidate?.config?.rejectedReason ?? "Go / gopls provider is not trusted and configured.",
    };
  }

  const marker = findGoWorkspaceMarker(input.rootRealPath, input.absolutePath);
  if (!marker) {
    return {
      ...empty,
      skipped: true,
      status: "missingWorkspaceConfig",
      marker: null,
      versionSummary: null,
      reason: "No go.work or go.mod marker was found between the file and workspace root.",
    };
  }

  const profile = input.profile ?? createGoGoplsProfile();
  const probe = input.probe ?? probeGoGoplsVersion;
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
      textDocument: { uri, languageId: "go", version: input.version, text: input.content },
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
      reason: error instanceof Error ? bounded(error.message, GOPLS_VERSION_OUTPUT_LIMIT) : String(error),
    };
  } finally {
    await gateway.stop(profile.id).catch(() => undefined);
  }
}

export async function probeGoGoplsVersion(profile: ExternalLanguageServerProfile, cwd: string): Promise<GoGoplsProbeResult> {
  try {
    const { stdout, stderr } = await execFileAsync(profile.command, ["version"], {
      cwd,
      timeout: 2_000,
      maxBuffer: 8_192,
      env: { ...process.env, ...(profile.env ?? {}) },
    });
    const output = bounded(`${stdout || ""}${stderr ? `\n${stderr}` : ""}`.trim(), GOPLS_VERSION_OUTPUT_LIMIT);
    if (!/gopls/i.test(output)) {
      return { ok: false, status: "unsupportedVersion", versionSummary: output || null, reason: "gopls version output did not identify gopls." };
    }
    return { ok: true, status: "configured", versionSummary: output || null, reason: null };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT") {
      return { ok: false, status: "missingBinary", versionSummary: null, reason: "gopls binary is not available from the server-side allowlisted profile." };
    }
    return {
      ok: false,
      status: "unavailable",
      versionSummary: null,
      reason: error instanceof Error ? bounded(error.message, GOPLS_VERSION_OUTPUT_LIMIT) : String(error),
    };
  }
}

export function goExternalDiagnosticToTracevaneDiagnostic(diagnostic: unknown): LspDiagnostic {
  const value = isRecord(diagnostic) ? diagnostic : {};
  const range = isRecord(value.range) ? value.range : {};
  const start = isRecord(range.start) ? range.start : {};
  const end = isRecord(range.end) ? range.end : start;
  const message = typeof value.message === "string" ? value.message : "gopls diagnostic";
  return {
    severity: severityFromLsp(value.severity),
    message,
    startLine: numberOr(start.line, 0) + 1,
    startColumn: numberOr(start.character, 0) + 1,
    endLine: numberOr(end.line, numberOr(start.line, 0)) + 1,
    endColumn: numberOr(end.character, numberOr(start.character, 0) + 1) + 1,
    code: typeof value.code === "string" || typeof value.code === "number" ? String(value.code) : null,
    source: typeof value.source === "string" ? value.source : "gopls",
  };
}

function parseHoverResult(result: unknown): { contents: string[]; range: GoGoplsRange | null } {
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

function parseDefinitionLocations(result: unknown): GoGoplsDefinitionLocation[] {
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

function lspRangeToTracevaneRange(range: unknown): GoGoplsRange | null {
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
