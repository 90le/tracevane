import * as React from "react";

export type ExternalLspProviderRuntimeStatus =
  | "available"
  | "starting"
  | "stopped"
  | "crashed"
  | "degraded"
  | "unavailable";

export type ExternalLspProviderInstallStatus = "installed" | "missing" | "disabled" | "degraded" | string;

export interface ExternalLspProviderInstallSummary {
  status: ExternalLspProviderInstallStatus;
  version?: string | null;
  pinnedVersion?: string | null;
  source?: string | null;
  packageName?: string | null;
  optional?: boolean;
}

export interface ExternalLspProviderProfile {
  id: string;
  label: string;
  languages: string[];
  capabilities: string[] | Record<string, boolean>;
  enabled: boolean;
  install?: ExternalLspProviderInstallSummary;
}

export interface ExternalLspProviderMetadata {
  providerId: string;
  packageName: string;
  source: string;
  installMode: string;
  installStatus: ExternalLspProviderInstallStatus;
  version?: string | null;
  pinnedVersion?: string | null;
  license?: string | null;
  optional?: boolean;
  commandSource?: string | null;
  audit?: { status?: string | null; summary?: string | null } | null;
  policy?: {
    autoInstall?: boolean;
    frontendCanProvideCommand?: boolean;
    notes?: string[];
  } | null;
}


export type ToolchainLspProviderStatus =
  | "notConfigured"
  | "configured"
  | "missingBinary"
  | "unsupportedVersion"
  | "missingWorkspaceConfig"
  | "disabledByTrust"
  | "unavailable";

export interface ToolchainLspProviderAllowedProfile {
  profileId: string;
  label: string;
  binary: string;
  description: string;
}

export interface ToolchainLspProviderConfigState {
  configurationKey: string;
  configured: boolean;
  trusted: boolean;
  enabled: boolean;
  profileId: string | null;
  configSource: "openclaw-config" | "none" | string;
  acceptedProfileIds: string[];
  rejectedReason: string | null;
}

export interface ToolchainLspProviderCandidate {
  providerId: string;
  label: string;
  languages: string[];
  status: ToolchainLspProviderStatus | string;
  configured: boolean;
  requiredBinary: string;
  configurationKey: string;
  capabilities: string[];
  nextAction: string;
  notes: string[];
  allowedProfiles?: ToolchainLspProviderAllowedProfile[];
  config?: ToolchainLspProviderConfigState;
}

export interface ToolchainLspProviderPolicy {
  readOnly: boolean;
  probesRuntimePath: boolean;
  startsLanguageServers: boolean;
  runtimeProofProviderIds?: string[];
  acceptsFrontendCommandOverrides: boolean;
  acceptsOnlyAllowlistedProfiles?: boolean;
  configSource?: string;
}

export interface ExternalLspProviderStatus {
  providerId: string;
  label: string;
  status: ExternalLspProviderRuntimeStatus | string;
  reason?: string;
  pid?: number;
  startedAt?: string;
  exitedAt?: string;
  lastTransitionAt?: string;
  exitCode?: number | null;
  signal?: string | null;
  lastError?: string | null;
  stderrTail?: string[];
}

export interface LspStatusResponse {
  ok: true;
  provider: string;
  websocketPath: string;
  supportedLanguages: string[];
  features: string[];
  externalProviders?: {
    profiles?: ExternalLspProviderProfile[];
    statuses?: ExternalLspProviderStatus[];
    metadata?: ExternalLspProviderMetadata[];
  };
  toolchainProviders?: {
    candidates?: ToolchainLspProviderCandidate[];
    policy?: ToolchainLspProviderPolicy;
  };
}

export type ExternalLspProviderStatusTone = "available" | "attention" | "stopped" | "none";

export interface ExternalLspProviderStatusSummary {
  label: string;
  title: string;
  tone: ExternalLspProviderStatusTone;
  profileCount: number;
  activeCount: number;
  attentionCount: number;
}

export async function requestLspStatus(options: { signal?: AbortSignal } = {}): Promise<LspStatusResponse> {
  const response = await fetch("/api/lsp/status", {
    headers: { Accept: "application/json" },
    signal: options.signal,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : `LSP status failed: ${response.status}`;
    throw new Error(message);
  }
  return data as LspStatusResponse;
}

export function summarizeExternalLspProviders(status: LspStatusResponse | null | undefined): ExternalLspProviderStatusSummary {
  const profiles = status?.externalProviders?.profiles ?? [];
  const statuses = status?.externalProviders?.statuses ?? [];
  if (profiles.length === 0) {
    return {
      label: "LSP: internal",
      title: "仅启用内置 LSP provider。",
      tone: "none",
      profileCount: 0,
      activeCount: 0,
      attentionCount: 0,
    };
  }

  const activeCount = statuses.filter((item) => item.status === "available" || item.status === "starting").length;
  const attentionCount = statuses.filter((item) => item.status === "crashed" || item.status === "degraded" || item.status === "unavailable").length;
  const stoppedCount = statuses.filter((item) => item.status === "stopped").length;
  const tone: ExternalLspProviderStatusTone = attentionCount > 0
    ? "attention"
    : activeCount > 0
      ? "available"
      : "stopped";
  const statusLabel = attentionCount > 0
    ? `${attentionCount} attention`
    : activeCount > 0
      ? `${activeCount} active`
      : `${stoppedCount || profiles.length} stopped`;

  return {
    label: `LSP: ${statusLabel}`,
    title: `${profiles.length} external provider profile(s), ${statusLabel}.`,
    tone,
    profileCount: profiles.length,
    activeCount,
    attentionCount,
  };
}

export function useLspExternalProviderStatus(pollMs = 20_000) {
  const [status, setStatus] = React.useState<LspStatusResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const next = await requestLspStatus({ signal });
      setStatus(next);
      setError(null);
      return next;
    } catch (caught) {
      if (signal?.aborted) return null;
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const interval = window.setInterval(() => {
      void refresh();
    }, pollMs);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [pollMs, refresh]);

  return { status, loading, error, refresh };
}
