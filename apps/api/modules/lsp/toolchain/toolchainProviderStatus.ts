export type ToolchainProviderStatus =
  | "notConfigured"
  | "configured"
  | "missingBinary"
  | "unsupportedVersion"
  | "missingWorkspaceConfig"
  | "disabledByTrust"
  | "unavailable";

export interface ToolchainProviderCandidate {
  providerId: "go" | "rust" | "java" | "clangd";
  label: string;
  languages: string[];
  status: ToolchainProviderStatus;
  configured: boolean;
  requiredBinary: string;
  configurationKey: string;
  capabilities: string[];
  nextAction: string;
  notes: string[];
}

export interface ToolchainProviderStatusSnapshot {
  candidates: ToolchainProviderCandidate[];
  policy: {
    readOnly: true;
    probesRuntimePath: false;
    startsLanguageServers: false;
    acceptsFrontendCommandOverrides: false;
  };
}

const TOOLCHAIN_PROVIDER_CANDIDATES: ToolchainProviderCandidate[] = [
  {
    providerId: "go",
    label: "Go / gopls",
    languages: ["go"],
    status: "notConfigured",
    configured: false,
    requiredBinary: "gopls",
    configurationKey: "lsp.toolchains.go.gopls",
    capabilities: ["diagnostics", "hover", "completion", "definition", "references", "rename", "formatting", "codeAction"],
    nextAction: "Configure a trusted workspace gopls profile before enabling Go language service runtime.",
    notes: [
      "M12-H exposes status only; it does not inspect PATH or launch gopls.",
      "Future enablement must pass workspace trust, cwd/root guard, and version checks.",
    ],
  },
  {
    providerId: "rust",
    label: "Rust / rust-analyzer",
    languages: ["rust"],
    status: "notConfigured",
    configured: false,
    requiredBinary: "rust-analyzer",
    configurationKey: "lsp.toolchains.rust.rustAnalyzer",
    capabilities: ["diagnostics", "hover", "completion", "definition", "references", "rename", "formatting", "codeAction"],
    nextAction: "Configure a trusted workspace rust-analyzer profile before enabling Rust language service runtime.",
    notes: [
      "M12-H exposes status only; it does not inspect PATH or launch rust-analyzer.",
      "Future enablement must keep Cargo/project probing behind explicit trust gates.",
    ],
  },
  {
    providerId: "java",
    label: "Java / Eclipse JDT LS",
    languages: ["java"],
    status: "notConfigured",
    configured: false,
    requiredBinary: "jdtls",
    configurationKey: "lsp.toolchains.java.jdtls",
    capabilities: ["diagnostics", "hover", "completion", "definition", "references", "rename", "formatting", "codeAction"],
    nextAction: "Configure a trusted workspace JDT LS profile and workspace data directory before enabling Java language service runtime.",
    notes: [
      "M12-H exposes status only; it does not inspect PATH or launch Eclipse JDT LS.",
      "Future enablement must isolate JDT LS workspace storage per trusted Tracevane root.",
    ],
  },
  {
    providerId: "clangd",
    label: "C/C++ / clangd",
    languages: ["c", "cpp", "objective-c", "objective-cpp"],
    status: "notConfigured",
    configured: false,
    requiredBinary: "clangd",
    configurationKey: "lsp.toolchains.cxx.clangd",
    capabilities: ["diagnostics", "hover", "completion", "definition", "references", "rename", "formatting", "codeAction"],
    nextAction: "Configure a trusted workspace clangd profile and compile_commands policy before enabling C/C++ language service runtime.",
    notes: [
      "M12-H exposes status only; it does not inspect PATH or launch clangd.",
      "Future enablement must treat compile_commands.json and build-system discovery as workspace-trust-sensitive.",
    ],
  },
];

export function toolchainProviderStatusSnapshot(): ToolchainProviderStatusSnapshot {
  return {
    candidates: TOOLCHAIN_PROVIDER_CANDIDATES.map((candidate) => ({
      ...candidate,
      languages: [...candidate.languages],
      capabilities: [...candidate.capabilities],
      notes: [...candidate.notes],
    })),
    policy: {
      readOnly: true,
      probesRuntimePath: false,
      startsLanguageServers: false,
      acceptsFrontendCommandOverrides: false,
    },
  };
}
