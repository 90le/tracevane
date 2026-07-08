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

export interface ToolchainProviderDocLink {
  label: string;
  url: string;
}

export interface ToolchainProviderDegradedReason {
  status: ToolchainProviderStatus;
  reason: string;
  action: string;
}

export interface ToolchainProviderSetupGuidance {
  summary: string;
  requiredRuntime: string[];
  workspaceMarkers: string[];
  configurationHint: string;
  docs: ToolchainProviderDocLink[];
  degradedReasons: ToolchainProviderDegradedReason[];
  copyableHint: string;
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
  setupGuidance: ToolchainProviderSetupGuidance;
  allowedProfiles: ToolchainProviderAllowedProfile[];
  config: ToolchainProviderConfigState;
}

export interface ToolchainProviderStatusSnapshot {
  candidates: ToolchainProviderCandidate[];
  policy: {
    readOnly: true;
    probesRuntimePath: false;
    startsLanguageServers: boolean;
    runtimeProofProviderIds: ToolchainProviderId[];
    acceptsFrontendCommandOverrides: false;
    acceptsOnlyAllowlistedProfiles: true;
    configSource: "openclaw-config";
  };
}

type ToolchainProviderTemplate = Omit<
  ToolchainProviderCandidate,
  "status" | "configured" | "nextAction" | "notes" | "config" | "setupGuidance"
> & {
  defaultNextAction: string;
  defaultNotes: string[];
  configPath: string[];
  setupGuidance: Omit<
    ToolchainProviderSetupGuidance,
    "configurationHint" | "copyableHint"
  >;
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

const FORBIDDEN_RUNTIME_OVERRIDE_KEYS = [
  "command",
  "args",
  "env",
  "cwd",
] as const;

const TOOLCHAIN_PROVIDER_TEMPLATES: ToolchainProviderTemplate[] = [
  {
    providerId: "go",
    label: "Go / gopls",
    languages: ["go"],
    requiredBinary: "gopls",
    configurationKey: "lsp.toolchains.go.gopls",
    configPath: ["lsp", "toolchains", "go", "gopls"],
    capabilities: [
      "diagnostics",
      "hover",
      "completion",
      "definition",
      "references",
      "rename",
      "formatting",
      "codeAction",
    ],
    allowedProfiles: [
      {
        profileId: "workspace",
        label: "Workspace gopls",
        binary: "gopls",
        description:
          "Use a trusted workspace gopls profile after explicit configuration.",
      },
    ],
    defaultNextAction:
      "Configure a trusted workspace gopls profile before enabling Go language service runtime.",
    defaultNotes: [
      "M12-K enables only a guarded Go/gopls diagnostics proof for trusted workspace profiles.",
      "Status reporting does not inspect PATH; diagnostics runtime probes only after explicit trusted configuration.",
      "Runtime startup must pass cwd/root guard, Go workspace marker, and bounded version checks before diagnostics routing.",
    ],
    setupGuidance: {
      summary:
        "Enable Go only after a trusted workspace gopls profile and Go workspace marker are present.",
      requiredRuntime: [
        "gopls binary available to the backend process",
        "Trusted OpenClaw workspace profile",
        "Go workspace opened under the configured root",
      ],
      workspaceMarkers: ["go.work", "go.mod"],
      docs: [{ label: "gopls documentation", url: "https://go.dev/gopls/" }],
      degradedReasons: commonDegradedReasons(
        "lsp.toolchains.go.gopls",
        "go.work or go.mod",
      ),
    },
  },
  {
    providerId: "rust",
    label: "Rust / rust-analyzer",
    languages: ["rust"],
    requiredBinary: "rust-analyzer",
    configurationKey: "lsp.toolchains.rust.rustAnalyzer",
    configPath: ["lsp", "toolchains", "rust", "rustAnalyzer"],
    capabilities: [
      "diagnostics",
      "hover",
      "completion",
      "definition",
      "references",
      "rename",
      "formatting",
      "codeAction",
    ],
    allowedProfiles: [
      {
        profileId: "workspace",
        label: "Workspace rust-analyzer",
        binary: "rust-analyzer",
        description:
          "Use a trusted workspace rust-analyzer profile after explicit configuration.",
      },
    ],
    defaultNextAction:
      "Configure a trusted workspace rust-analyzer profile before enabling Rust language service runtime.",
    defaultNotes: [
      "M12-N enables only a guarded Rust/rust-analyzer diagnostics proof for trusted workspace profiles.",
      "Status reporting does not inspect PATH; diagnostics runtime probes only after explicit trusted configuration.",
      "Runtime startup must pass cwd/root guard, Cargo.toml/rust-project.json marker, and bounded version checks before diagnostics routing.",
    ],
    setupGuidance: {
      summary:
        "Enable Rust only after a trusted workspace rust-analyzer profile and Rust project marker are present.",
      requiredRuntime: [
        "rust-analyzer binary available to the backend process",
        "Trusted OpenClaw workspace profile",
        "Cargo project or rust-project.json under the configured root",
      ],
      workspaceMarkers: ["Cargo.toml", "rust-project.json"],
      docs: [
        {
          label: "rust-analyzer manual",
          url: "https://rust-analyzer.github.io/manual.html",
        },
      ],
      degradedReasons: commonDegradedReasons(
        "lsp.toolchains.rust.rustAnalyzer",
        "Cargo.toml or rust-project.json",
      ),
    },
  },
  {
    providerId: "java",
    label: "Java / Eclipse JDT LS",
    languages: ["java"],
    requiredBinary: "jdtls",
    configurationKey: "lsp.toolchains.java.jdtls",
    configPath: ["lsp", "toolchains", "java", "jdtls"],
    capabilities: [
      "diagnostics",
      "hover",
      "completion",
      "definition",
      "references",
      "rename",
      "formatting",
      "codeAction",
    ],
    allowedProfiles: [
      {
        profileId: "workspace",
        label: "Workspace JDT LS",
        binary: "jdtls",
        description:
          "Use a trusted workspace JDT LS profile after explicit configuration.",
      },
    ],
    defaultNextAction:
      "Configure a trusted workspace JDT LS profile and workspace data directory before enabling Java language service runtime.",
    defaultNotes: [
      "M12-T enables only a guarded Java/JDT LS diagnostics proof for trusted workspace profiles.",
      "Status reporting does not inspect PATH; diagnostics runtime probes only after explicit trusted configuration.",
      "Runtime startup must pass marker, Java 21+, launcher jar, platform config, and per-workspace -data guards before diagnostics routing.",
    ],
    setupGuidance: {
      summary:
        "Enable Java only after Java 21+, JDT LS launcher/config, per-workspace data directory, and Java project markers are ready.",
      requiredRuntime: [
        "Java 21+ runtime",
        "Eclipse JDT LS launcher jar and platform config",
        "Trusted OpenClaw workspace profile",
        "Per-workspace -data directory inside guarded runtime state",
      ],
      workspaceMarkers: [
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
        ".project",
      ],
      docs: [
        {
          label: "Eclipse JDT LS",
          url: "https://github.com/eclipse-jdtls/eclipse.jdt.ls",
        },
      ],
      degradedReasons: commonDegradedReasons(
        "lsp.toolchains.java.jdtls",
        "pom.xml, Gradle file, or .project",
      ),
    },
  },
  {
    providerId: "clangd",
    label: "C/C++ / clangd",
    languages: ["c", "cpp", "objective-c", "objective-cpp"],
    requiredBinary: "clangd",
    configurationKey: "lsp.toolchains.cxx.clangd",
    configPath: ["lsp", "toolchains", "cxx", "clangd"],
    capabilities: [
      "diagnostics",
      "hover",
      "completion",
      "definition",
      "references",
      "rename",
      "formatting",
      "codeAction",
    ],
    allowedProfiles: [
      {
        profileId: "workspace",
        label: "Workspace clangd",
        binary: "clangd",
        description:
          "Use a trusted workspace clangd profile after explicit configuration.",
      },
    ],
    defaultNextAction:
      "Configure a trusted workspace clangd profile and compile_commands policy before enabling C/C++ language service runtime.",
    defaultNotes: [
      "M12-Q enables only a guarded clangd diagnostics proof for trusted workspace profiles.",
      "Status reporting does not inspect PATH; diagnostics runtime probes only after explicit trusted configuration.",
      "Runtime startup must pass cwd/root guard, compile_commands.json/compile_flags.txt/.clangd marker, and bounded version checks before diagnostics routing.",
    ],
    setupGuidance: {
      summary:
        "Enable clangd only after a trusted workspace clangd profile and compile command policy are present.",
      requiredRuntime: [
        "clangd binary available to the backend process",
        "Trusted OpenClaw workspace profile",
        "Compilation database or explicit clangd config under the configured root",
      ],
      workspaceMarkers: [
        "compile_commands.json",
        "compile_flags.txt",
        ".clangd",
      ],
      docs: [
        {
          label: "clangd installation",
          url: "https://clangd.llvm.org/installation",
        },
        {
          label: "clangd configuration",
          url: "https://clangd.llvm.org/config",
        },
      ],
      degradedReasons: commonDegradedReasons(
        "lsp.toolchains.cxx.clangd",
        "compile_commands.json, compile_flags.txt, or .clangd",
      ),
    },
  },
];

export function toolchainProviderStatusSnapshot(
  config: TracevaneServerConfig,
): ToolchainProviderStatusSnapshot {
  const rawConfig = readOpenclawConfig(config.openclawConfigFile);
  return {
    candidates: TOOLCHAIN_PROVIDER_TEMPLATES.map((template) =>
      candidateFromTemplate(template, rawConfig),
    ),
    policy: {
      readOnly: true,
      probesRuntimePath: false,
      startsLanguageServers: true,
      runtimeProofProviderIds: ["go", "rust", "clangd", "java"],
      acceptsFrontendCommandOverrides: false,
      acceptsOnlyAllowlistedProfiles: true,
      configSource: "openclaw-config",
    },
  };
}

function candidateFromTemplate(
  template: ToolchainProviderTemplate,
  rawConfig: unknown,
): ToolchainProviderCandidate {
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
    setupGuidance: setupGuidanceFromTemplate(template),
    allowedProfiles: template.allowedProfiles.map((profile) => ({
      ...profile,
    })),
    config: configState,
  };
}

function commonDegradedReasons(
  configurationKey: string,
  markerDescription: string,
): ToolchainProviderDegradedReason[] {
  return [
    {
      status: "notConfigured",
      reason: "No enabled OpenClaw toolchain profile is configured.",
      action: `Set ${configurationKey}.enabled=true, trusted=true, and profileId=workspace after trust review.`,
    },
    {
      status: "disabledByTrust",
      reason:
        "Provider is enabled but the workspace has not been explicitly trusted.",
      action: `Set ${configurationKey}.trusted=true only after reviewing the workspace and toolchain.`,
    },
    {
      status: "missingWorkspaceConfig",
      reason:
        "The allowlisted workspace profile or workspace marker is missing.",
      action: `Use profileId=workspace and ensure ${markerDescription} exists under the workspace root.`,
    },
    {
      status: "missingBinary",
      reason:
        "The required binary is not available to the backend runtime when diagnostics start.",
      action:
        "Install the toolchain on the server or expose it to the backend service environment; the status endpoint will not probe PATH.",
    },
    {
      status: "unsupportedVersion",
      reason: "The runtime version is outside the bounded proof policy.",
      action:
        "Use a supported provider version before enabling diagnostics or rich interactions.",
    },
    {
      status: "unavailable",
      reason: "The config contains a rejected profile or runtime override.",
      action:
        "Remove command/args/env/cwd overrides and use only the allowlisted workspace profile.",
    },
  ];
}

function setupGuidanceFromTemplate(
  template: ToolchainProviderTemplate,
): ToolchainProviderSetupGuidance {
  const configurationHint = JSON.stringify(
    configHintForTemplate(template),
    null,
    2,
  );
  return {
    ...template.setupGuidance,
    requiredRuntime: [...template.setupGuidance.requiredRuntime],
    workspaceMarkers: [...template.setupGuidance.workspaceMarkers],
    docs: template.setupGuidance.docs.map((doc) => ({ ...doc })),
    degradedReasons: template.setupGuidance.degradedReasons.map((item) => ({
      ...item,
    })),
    configurationHint,
    copyableHint: [
      `${template.label} setup guidance`,
      `Config key: ${template.configurationKey}`,
      `Required runtime: ${template.setupGuidance.requiredRuntime.join("; ")}`,
      `Workspace markers: ${template.setupGuidance.workspaceMarkers.join(", ")}`,
      "OpenClaw config hint:",
      configurationHint,
      "Policy: no PATH probing in status, no frontend command/args/env/cwd override, no auto install.",
    ].join("\n"),
  };
}

function configHintForTemplate(
  template: ToolchainProviderTemplate,
): Record<string, unknown> {
  const leaf = { enabled: true, trusted: true, profileId: "workspace" };
  return template.configPath.reduceRight<Record<string, unknown>>(
    (child, segment) => ({ [segment]: child }),
    leaf,
  );
}

function resolveConfigState(
  template: ToolchainProviderTemplate,
  rawConfig: RawToolchainConfig | null,
): ToolchainProviderConfigState {
  const acceptedProfileIds = template.allowedProfiles.map(
    (profile) => profile.profileId,
  );
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

  const forbiddenKey = FORBIDDEN_RUNTIME_OVERRIDE_KEYS.find(
    (key) => rawConfig[key] !== undefined,
  );
  const enabled = rawConfig.enabled === true;
  const trusted = rawConfig.trusted === true;
  const profileId =
    typeof rawConfig.profileId === "string" ? rawConfig.profileId.trim() : "";
  let rejectedReason: string | null = null;
  if (forbiddenKey)
    rejectedReason = `Runtime override key '${forbiddenKey}' is not accepted for toolchain providers.`;
  else if (!profileId) rejectedReason = "Missing allowlisted profileId.";
  else if (!acceptedProfileIds.includes(profileId))
    rejectedReason = `Profile '${profileId}' is not allowlisted for ${template.providerId}.`;

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

function statusFromConfig(
  config: ToolchainProviderConfigState,
): ToolchainProviderStatus {
  if (config.rejectedReason) return "unavailable";
  if (!config.enabled) return "notConfigured";
  if (!config.trusted) return "disabledByTrust";
  if (!config.profileId) return "missingWorkspaceConfig";
  if (config.configured) return "configured";
  return "missingWorkspaceConfig";
}

function nextActionFromConfig(
  template: ToolchainProviderTemplate,
  config: ToolchainProviderConfigState,
  status: ToolchainProviderStatus,
): string {
  if (status === "configured" && template.providerId === "go")
    return `${template.label} has a trusted allowlisted profile. M12-K permits guarded diagnostics proof for Go files with go.work/go.mod markers.`;
  if (status === "configured" && template.providerId === "rust")
    return `${template.label} has a trusted allowlisted profile. M12-N permits guarded diagnostics proof for Rust files with Cargo.toml/rust-project.json markers.`;
  if (status === "configured" && template.providerId === "clangd")
    return `${template.label} has a trusted allowlisted profile. M12-Q permits guarded diagnostics proof for C/C++ files with compile_commands.json/compile_flags.txt/.clangd markers.`;
  if (status === "configured" && template.providerId === "java")
    return `${template.label} has a trusted allowlisted profile. M12-T permits guarded diagnostics proof for Java files with pom.xml, Gradle, or .project markers.`;
  if (status === "configured")
    return `${template.label} has a trusted allowlisted profile. Runtime startup remains gated until provider-specific proof is implemented.`;
  if (status === "disabledByTrust")
    return `Mark ${template.configurationKey}.trusted=true only after the workspace is explicitly trusted.`;
  if (status === "unavailable")
    return (
      config.rejectedReason ??
      `Fix ${template.configurationKey} before enabling this provider.`
    );
  if (status === "missingWorkspaceConfig")
    return `Set ${template.configurationKey}.profileId to one of: ${config.acceptedProfileIds.join(", ")}.`;
  return template.defaultNextAction;
}

function notesFromConfig(
  template: ToolchainProviderTemplate,
  config: ToolchainProviderConfigState,
): string[] {
  const notes = [...template.defaultNotes];
  notes.push(
    "Only allowlisted profileId values are accepted; command/args/env/cwd overrides are rejected.",
  );
  if (config.configSource === "openclaw-config")
    notes.push(`Configuration source: ${template.configurationKey}.`);
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

function getRecordAtPath(
  value: unknown,
  pathSegments: string[],
): RawToolchainConfig | null {
  let current = value;
  for (const segment of pathSegments) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  return isRecord(current) ? (current as RawToolchainConfig) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
