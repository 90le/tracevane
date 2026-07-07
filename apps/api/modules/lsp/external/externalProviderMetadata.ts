import { createRequire } from "node:module";

import type { ExternalLanguageServerProfile } from "./externalLanguageServerTypes.js";

const require = createRequire(import.meta.url);

export type ExternalLanguageServerInstallMode = "bundled-npm" | "system-binary" | "optional-bundled-npm";
export type ExternalLanguageServerInstallStatus = "installed" | "missing" | "disabled" | "degraded";

export interface ExternalLanguageServerProviderMetadata {
  providerId: string;
  packageName: string;
  source: string;
  installMode: ExternalLanguageServerInstallMode;
  installStatus: ExternalLanguageServerInstallStatus;
  version: string | null;
  pinnedVersion: string | null;
  license: string;
  optional: boolean;
  commandSource: "server-allowlist";
  audit: {
    status: "accepted-known-risk" | "clean" | "unknown";
    summary: string;
  };
  policy: {
    autoInstall: false;
    frontendCanProvideCommand: false;
    notes: string[];
  };
}

interface ProviderMetadataSeed {
  packageName: string;
  source: string;
  installMode: ExternalLanguageServerInstallMode;
  pinnedVersion: string | null;
  license: string;
  optional: boolean;
  auditSummary: string;
  notes: string[];
}

const PROVIDER_METADATA: Record<string, ProviderMetadataSeed> = {
  yaml: {
    packageName: "yaml-language-server",
    source: "npm:yaml-language-server",
    installMode: "bundled-npm",
    pinnedVersion: "1.23.0",
    license: "MIT",
    optional: false,
    auditSummary: "Bundled npm provider proof with exact-pinned dependency; future upgrades require provider-specific audit and smoke evidence.",
    notes: [
      "Started only through server-side allowlisted process.execPath + require.resolve command.",
      "Exact-pinned during M11-L dependency hygiene; update only with provider-specific audit and smoke evidence.",
    ],
  },
  bash: {
    packageName: "bash-language-server",
    source: "npm:bash-language-server",
    installMode: "bundled-npm",
    pinnedVersion: "5.6.0",
    license: "MIT",
    optional: false,
    auditSummary: "Known audit risk in transitive editorconfig/minimatch chain; npm fix suggests semver-major/downgrade path and is deferred to dependency hygiene.",
    notes: [
      "Started only through server-side allowlisted process.execPath + require.resolve command.",
      "Profile uses scoped PATH because bash-language-server scans PATH during initialize.",
    ],
  },
  pyright: {
    packageName: "pyright",
    source: "npm:pyright",
    installMode: "bundled-npm",
    pinnedVersion: "1.1.411",
    license: "MIT",
    optional: false,
    auditSummary: "Bundled npm provider added as a diagnostics-only Python proof; package is larger than YAML/Bash and future upgrades require provider-specific smoke evidence.",
    notes: [
      "Started only through server-side allowlisted process.execPath + require.resolve command.",
      "M11-N exposes diagnostics/status only; Python hover/completion/definition and interpreter discovery remain deferred.",
    ],
  },
  dockerfile: {
    packageName: "dockerfile-language-server-nodejs",
    source: "npm:dockerfile-language-server-nodejs",
    installMode: "bundled-npm",
    pinnedVersion: "0.15.0",
    license: "MIT",
    optional: false,
    auditSummary: "Bundled npm provider added as a small Dockerfile diagnostics-only proof; no Docker daemon or container runtime is required.",
    notes: [
      "Started only through server-side allowlisted process.execPath + require.resolve command.",
      "M11-P exposes diagnostics/status only; Dockerfile hover/completion/formatting remain deferred.",
    ],
  },
};

export function externalProviderMetadataForProfile(profile: ExternalLanguageServerProfile): ExternalLanguageServerProviderMetadata {
  const seed = PROVIDER_METADATA[profile.id] ?? fallbackSeed(profile);
  const version = resolvePackageVersion(seed.packageName);
  const installStatus: ExternalLanguageServerInstallStatus = profile.enabled === false
    ? "disabled"
    : version
      ? "installed"
      : seed.optional
        ? "missing"
        : "degraded";

  return {
    providerId: profile.id,
    packageName: seed.packageName,
    source: seed.source,
    installMode: seed.installMode,
    installStatus,
    version,
    pinnedVersion: seed.pinnedVersion,
    license: seed.license,
    optional: seed.optional,
    commandSource: "server-allowlist",
    audit: {
      status: seed.auditSummary ? "accepted-known-risk" : "unknown",
      summary: seed.auditSummary || "No provider-specific audit note recorded yet.",
    },
    policy: {
      autoInstall: false,
      frontendCanProvideCommand: false,
      notes: [...seed.notes],
    },
  };
}

function fallbackSeed(profile: ExternalLanguageServerProfile): ProviderMetadataSeed {
  return {
    packageName: profile.id,
    source: `profile:${profile.id}`,
    installMode: "system-binary",
    pinnedVersion: null,
    license: "unknown",
    optional: true,
    auditSummary: "No provider-specific audit note recorded yet.",
    notes: ["Unknown external provider metadata; keep disabled or optional until explicitly reviewed."],
  };
}

function resolvePackageVersion(packageName: string): string | null {
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const packageJson = require(packageJsonPath) as { version?: unknown };
    return typeof packageJson.version === "string" ? packageJson.version : null;
  } catch {
    return null;
  }
}
