import fs from "node:fs";

import type { TracevaneServerConfig } from "../../../../../types/api.js";

export type ToolchainProviderStatus =
  | "notConfigured"
  | "configured"
  | "missingBinary"
  | "unsupportedVersion"
  | "missingWorkspaceConfig"
  | "disabledByTrust"
  | "unavailable";

export type ToolchainProviderId = "go" | "rust" | "java" | "clangd";

export interface ToolchainProviderAllowedProfile {
  profileId: string;
  label: string;
  binary: string;
  description: string;
}

export interface ToolchainProviderConfigState {
  configurationKey: string;
  configured: boolean;
  trusted: boolean;
  enabled: boolean;
  profileId: string | null;
  configSource: "openclaw-config" | "none";
  acceptedProfileIds: string[];
  rejectedReason: string | null;
}

export interface ToolchainProviderCandidate {
  providerId: ToolchainProviderId;
  label: string;
  languages: string[];
  status: ToolchainProviderStatus;
  configured: boolean;
  requiredBinary: string;
  configurationKey: string;
  capabilities: string[];
  nextAction: string;
  notes: string[];
  allowedProfiles: ToolchainProviderAllowedProfile[];
  config: ToolchainProviderConfigState;
}

export interface ToolchainProviderStatusSnapshot {
  candidates: ToolchainProviderCandidate[];
  policy: {
    readOnly: true;
    probesRuntimePath: false;
    startsLanguageServers: false;
    acceptsFrontendCommandOverrides: false;
    acceptsOnlyAllowlistedProfiles: true;
    configSource: "openclaw-config";
  };
}

type ToolchainProviderTemplate = Omit<ToolchainProviderCandidate, "status" | "configured" | "nextAction" | "notes" | "config"> & {
  defaultNextAction: string;
  defaultNotes: string[];
  configPath: string[];
};

interface RawToolchainConfig {
  enabled?: unknown;
  trusted?: unknown;
  profileId?: unknown;
  command?: unknown;
  args?: unknown;
  env?: unknown;
  cwd?: unknown;
}

const FORBIDDEN_RUNTIME_OVERRIDE_KEYS = ["command", "args", "env", "cwd"] as const;

const TOOLCHAIN_PROVIDER_TEMPLATES: ToolchainProviderTemplate[] = [
  {
    providerId: "go",
    label: "Go / gopls",
    languages: ["go"],
    requiredBinary: "gopls",
    configurationKey: "lsp.toolchains.go.gopls",
    configPath: ["lsp", "toolchains", "go", "gopls"],
    capabilities: ["diagnostics", "hover", "completion", "definition", "references", "rename", "formatting", "codeAction"],
    allowedProfiles: [{ profileId: "workspace", label: "Workspace gopls", binary: "gopls", description: "Use a trusted workspace gopls profile after explicit configuration." }],
    defaultNextAction: "Configure a trusted workspace gopls profile before enabling Go language service runtime.",
    defaultNotes: [
      "M12-I reads config state only; it does not inspect PATH or launch gopls.",
      "Future enablement must pass cwd/root guard and version checks before diagnostics routing.",
    ],
  },
  {
    providerId: "rust",
    label: "Rust / rust-analyzer",
    languages: ["rust"],
    requiredBinary: "rust-analyzer",
    configurationKey: "lsp.toolchains.rust.rustAnalyzer",
    configPath: ["lsp", "toolchains", "rust", "rustAnalyzer"],
    capabilities: ["diagnostics", "hover", "completion", "definition", "references", "rename", "formatting", "codeAction"],
    allowedProfiles: [{ profileId: "workspace", label: "Workspace rust-analyzer", binary: "rust-analyzer", description: "Use a trusted workspace rust-analyzer profile after explicit configuration." }],
    defaultNextAction: "Configure a trusted workspace rust-analyzer profile before enabling Rust language service runtime.",
    defaultNotes: [
      "M12-I reads config state only; it does not inspect PATH or launch rust-analyzer.",
      "Future enablement must keep Cargo/project probing behind explicit trust gates.",
    ],
  },
  {
    providerId: "java",
    label: "Java / Eclipse JDT LS",
    languages: ["java"],
    requiredBinary: "jdtls",
    configurationKey: "lsp.toolchains.java.jdtls",
    configPath: ["lsp", "toolchains", "java", "jdtls"],
    capabilities: ["diagnostics", "hover", "completion", "definition", "references", "rename", "formatting", "codeAction"],
    allowedProfiles: [{ profileId: "workspace", label: "Workspace JDT LS", binary: "jdtls", description: "Use a trusted workspace JDT LS profile after explicit configuration." }],
    defaultNextAction: "Configure a trusted workspace JDT LS profile and workspace data directory before enabling Java language service runtime.",
    defaultNotes: [
      "M12-I reads config state only; it does not inspect PATH or launch Eclipse JDT LS.",
      "Future enablement must isolate JDT LS workspace storage per trusted Tracevane root.",
    ],
  },
  {
    providerId: "clangd",
    label: "C/C++ / clangd",
    languages: ["c", "cpp", "objective-c", "objective-cpp"],
    requiredBinary: "clangd",
    configurationKey: "lsp.toolchains.cxx.clangd",
    configPath: ["lsp", "toolchains", "cxx", "clangd"],
    capabilities: ["diagnostics", "hover", "completion", "definition", "references", "rename", "formatting", "codeAction"],
    allowedProfiles: [{ profileId: "workspace", label: "Workspace clangd", binary: "clangd", description: "Use a trusted workspace clangd profile after explicit configuration." }],
    defaultNextAction: "Configure a trusted workspace clangd profile and compile_commands policy before enabling C/C++ language service runtime.",
    defaultNotes: [
      "M12-I reads config state only; it does not inspect PATH or launch clangd.",
      "Future enablement must treat compile_commands.json and build-system discovery as workspace-trust-sensitive.",
    ],
  },
];

export function toolchainProviderStatusSnapshot(config: TracevaneServerConfig): ToolchainProviderStatusSnapshot {
  const rawConfig = readOpenclawConfig(config.openclawConfigFile);
  return {
    candidates: TOOLCHAIN_PROVIDER_TEMPLATES.map((template) => candidateFromTemplate(template, rawConfig)),
    policy: {
      readOnly: true,
      probesRuntimePath: false,
      startsLanguageServers: false,
      acceptsFrontendCommandOverrides: false,
      acceptsOnlyAllowlistedProfiles: true,
      configSource: "openclaw-config",
    },
  };
}

function candidateFromTemplate(template: ToolchainProviderTemplate, rawConfig: unknown): ToolchainProviderCandidate {
  const rawProviderConfig = getRecordAtPath(rawConfig, template.configPath);
  const configState = resolveConfigState(template, rawProviderConfig);
  const status = statusFromConfig(configState);
  return {
    providerId: template.providerId,
    label: template.label,
    languages: [...template.languages],
    status,
    configured: configState.configured,
    requiredBinary: template.requiredBinary,
    configurationKey: template.configurationKey,
    capabilities: [...template.capabilities],
    nextAction: nextActionFromConfig(template, configState, status),
    notes: notesFromConfig(template, configState),
    allowedProfiles: template.allowedProfiles.map((profile) => ({ ...profile })),
    config: configState,
  };
}

function resolveConfigState(template: ToolchainProviderTemplate, rawConfig: RawToolchainConfig | null): ToolchainProviderConfigState {
  const acceptedProfileIds = template.allowedProfiles.map((profile) => profile.profileId);
  if (!rawConfig) {
    return {
      configurationKey: template.configurationKey,
      configured: false,
      trusted: false,
      enabled: false,
      profileId: null,
      configSource: "none",
      acceptedProfileIds,
      rejectedReason: null,
    };
  }

  const forbiddenKey = FORBIDDEN_RUNTIME_OVERRIDE_KEYS.find((key) => rawConfig[key] !== undefined);
  const enabled = rawConfig.enabled === true;
  const trusted = rawConfig.trusted === true;
  const profileId = typeof rawConfig.profileId === "string" ? rawConfig.profileId.trim() : "";
  let rejectedReason: string | null = null;
  if (forbiddenKey) rejectedReason = `Runtime override key '${forbiddenKey}' is not accepted for toolchain providers.`;
  else if (!profileId) rejectedReason = "Missing allowlisted profileId.";
  else if (!acceptedProfileIds.includes(profileId)) rejectedReason = `Profile '${profileId}' is not allowlisted for ${template.providerId}.`;

  return {
    configurationKey: template.configurationKey,
    configured: enabled && trusted && Boolean(profileId) && !rejectedReason,
    trusted,
    enabled,
    profileId: profileId || null,
    configSource: "openclaw-config",
    acceptedProfileIds,
    rejectedReason,
  };
}

function statusFromConfig(config: ToolchainProviderConfigState): ToolchainProviderStatus {
  if (config.rejectedReason) return "unavailable";
  if (!config.enabled) return "notConfigured";
  if (!config.trusted) return "disabledByTrust";
  if (!config.profileId) return "missingWorkspaceConfig";
  if (config.configured) return "configured";
  return "missingWorkspaceConfig";
}

function nextActionFromConfig(template: ToolchainProviderTemplate, config: ToolchainProviderConfigState, status: ToolchainProviderStatus): string {
  if (status === "configured") return `${template.label} has a trusted allowlisted profile. Runtime startup remains gated until provider-specific proof is implemented.`;
  if (status === "disabledByTrust") return `Mark ${template.configurationKey}.trusted=true only after the workspace is explicitly trusted.`;
  if (status === "unavailable") return config.rejectedReason ?? `Fix ${template.configurationKey} before enabling this provider.`;
  if (status === "missingWorkspaceConfig") return `Set ${template.configurationKey}.profileId to one of: ${config.acceptedProfileIds.join(", ")}.`;
  return template.defaultNextAction;
}

function notesFromConfig(template: ToolchainProviderTemplate, config: ToolchainProviderConfigState): string[] {
  const notes = [...template.defaultNotes];
  notes.push("Only allowlisted profileId values are accepted; command/args/env/cwd overrides are rejected.");
  if (config.configSource === "openclaw-config") notes.push(`Configuration source: ${template.configurationKey}.`);
  if (config.rejectedReason) notes.push(config.rejectedReason);
  return notes;
}

function readOpenclawConfig(configFile: string): unknown {
  try {
    if (!fs.existsSync(configFile)) return null;
    return JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch {
    return null;
  }
}

function getRecordAtPath(value: unknown, pathSegments: string[]): RawToolchainConfig | null {
  let current = value;
  for (const segment of pathSegments) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  return isRecord(current) ? current as RawToolchainConfig : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
