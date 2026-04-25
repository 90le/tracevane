export type PluginDiagnosticLevel = "info" | "warn" | "danger";

export interface PluginManifestSummary {
  id: string;
  name: string;
  description: string;
  kind: string;
  path: string;
  version: string;
  skillPaths: string[];
  capabilities: string[];
  configSchema: Record<string, unknown> | null;
  uiHints: Record<string, Record<string, unknown>> | null;
}

export interface PluginEntrySummary {
  id: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
  manifest: PluginManifestSummary | null;
  status: "enabled" | "disabled" | "blocked" | "missing" | "available";
  source: "configured" | "manifest-only";
  capabilities: string[];
  critical: boolean;
  impacts: PluginImpactPreview[];
}

export interface PluginDiagnostic {
  key: string;
  level: PluginDiagnosticLevel;
  title: string;
  detail: string;
}

export interface PluginImpactPreview {
  key: string;
  title: string;
  detail: string;
}

export interface PluginsSummaryPayload {
  checkedAt: string;
  enabled: boolean;
  allow: string[];
  deny: string[];
  loadPaths: string[];
  slots: {
    memory?: string;
    contextEngine?: string;
  };
  entries: PluginEntrySummary[];
  manifests: PluginManifestSummary[];
  installs: Array<{
    id: string;
    source?: string;
    spec?: string;
    installPath?: string;
    version?: string;
    resolvedName?: string;
    resolvedVersion?: string;
    resolvedSpec?: string;
    installedAt?: string;
  }>;
  diagnostics: PluginDiagnostic[];
  counts: {
    entries: number;
    manifests: number;
    enabledEntries: number;
    blocked: number;
    missing: number;
    loadPaths: number;
    diagnostics: number;
  };
  capabilityIndex: Record<string, string[]>;
}

export interface PluginToggleResponse {
  success: boolean;
  id: string;
  enabled: boolean;
  critical: boolean;
  impacts: PluginImpactPreview[];
  requiresRestart: boolean;
}

export interface PluginBulkTogglePayload {
  ids: string[];
  enabled: boolean;
  createMissingEntries?: boolean;
}

export interface PluginBulkToggleResponse {
  success: boolean;
  enabled: boolean;
  updatedIds: string[];
  skipped: Array<{
    id: string;
    reason: "invalid-id" | "not-discovered" | "not-configured";
  }>;
  results: PluginToggleResponse[];
  requiresRestart: boolean;
  summary: PluginsSummaryPayload;
}

export interface PluginBulkUpdatePayload {
  ids?: string[];
  all?: boolean;
  dryRun?: boolean;
  dangerouslyForceUnsafeInstall?: boolean;
}

export interface PluginBulkUninstallPayload {
  ids: string[];
  dryRun?: boolean;
  force?: boolean;
  keepFiles?: boolean;
}

export interface PluginBulkActionResponse {
  success: boolean;
  action: "update" | "uninstall";
  processedIds: string[];
  failures: Array<{
    id: string;
    error: string;
  }>;
  requiresRestart: boolean;
  summary: PluginsSummaryPayload;
}

export interface PluginUploadArchivePayload {
  fileName: string;
  dataBase64: string;
}

export interface PluginUploadPreflightPayload extends PluginUploadArchivePayload {}

export interface PluginUploadPreflightResult {
  checkedAt: string;
  fileName: string;
  preflight: PluginPreflightResult;
}

export interface PluginUploadInstallPayload extends PluginUploadArchivePayload {
  force?: boolean;
  pin?: boolean;
  dangerouslyForceUnsafeInstall?: boolean;
}

export interface PluginUploadInstallResponse {
  success: boolean;
  installedId: string | null;
  output: string;
  requiresRestart: boolean;
  summary: PluginsSummaryPayload;
  preflight: PluginPreflightResult;
}

export interface PluginInstallPayload {
  spec: string;
  force?: boolean;
  link?: boolean;
  pin?: boolean;
  marketplace?: string | null;
  dangerouslyForceUnsafeInstall?: boolean;
}

export interface PluginUpdatePayload {
  id?: string | null;
  all?: boolean;
  dryRun?: boolean;
  dangerouslyForceUnsafeInstall?: boolean;
}

export interface PluginUninstallPayload {
  id: string;
  dryRun?: boolean;
  force?: boolean;
  keepFiles?: boolean;
}

export interface PluginActionResponse {
  success: boolean;
  action: "install" | "update" | "uninstall";
  id: string | null;
  output: string;
  requiresRestart: boolean;
  summary: PluginsSummaryPayload;
}

export interface PluginPreflightPayload {
  spec: string;
  marketplace?: string | null;
}

export interface PluginPreflightResult {
  checkedAt: string;
  spec: string;
  kind: "directory" | "archive" | "npm-spec" | "marketplace";
  level: PluginDiagnosticLevel;
  readiness: "ready" | "review" | "blocked";
  summary: string;
  manifest: PluginManifestSummary | null;
  indicators: PluginDiagnostic[];
  manifestCount: number;
  pluginRoot: string | null;
  manifestPath: string | null;
  requiresRestart: boolean;
}
