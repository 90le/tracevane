import { createRequire } from "node:module";
import path from "node:path";

import type { ExternalLanguageServerBudgets, ExternalLanguageServerProfile } from "./externalLanguageServerTypes.js";

const require = createRequire(import.meta.url);

export const DEFAULT_EXTERNAL_LSP_BUDGETS: ExternalLanguageServerBudgets = {
  initializeMs: 3_000,
  requestMs: 5_000,
  shutdownMs: 1_000,
};

export const YAML_LANGUAGE_SERVER_BIN = require.resolve("yaml-language-server/bin/yaml-language-server");
export const BASH_LANGUAGE_SERVER_BIN = require.resolve("bash-language-server/out/cli.js");
export const PYRIGHT_LANGUAGE_SERVER_BIN = require.resolve("pyright/langserver.index.js");
export const DOCKERFILE_LANGUAGE_SERVER_BIN = require.resolve("dockerfile-language-server-nodejs/bin/docker-langserver");
export const MARKDOWN_LANGUAGE_SERVER_BIN = require.resolve("vscode-langservers-extracted/bin/vscode-markdown-language-server");
export const ESLINT_LANGUAGE_SERVER_BIN = require.resolve("vscode-langservers-extracted/bin/vscode-eslint-language-server");

/**
 * External language servers are server-side allowlisted. The frontend never
 * provides commands or arguments. providers are added only after exact-pin metadata, status UI, and
 * provider-specific smoke coverage.
 */
export const EXTERNAL_LANGUAGE_SERVER_PROFILES: ExternalLanguageServerProfile[] = [
  {
    id: "yaml",
    label: "YAML Language Server",
    command: process.execPath,
    args: [YAML_LANGUAGE_SERVER_BIN, "--stdio"],
    languages: ["yaml", "yml"],
    capabilities: { diagnostics: true },
    budgets: { initializeMs: 3_000, requestMs: 3_000, shutdownMs: 1_000 },
  },
  {
    id: "bash",
    label: "Bash Language Server",
    command: process.execPath,
    args: [BASH_LANGUAGE_SERVER_BIN, "start"],
    languages: ["shell", "shellscript", "bash", "sh"],
    capabilities: { diagnostics: true },
    budgets: { initializeMs: 10_000, requestMs: 3_000, shutdownMs: 1_000 },
    env: { BASH_IDE_LOG_LEVEL: "error", PATH: `${path.dirname(process.execPath)}${path.delimiter}/usr/bin${path.delimiter}/bin` },
  },
  {
    id: "pyright",
    label: "Pyright Language Server",
    command: process.execPath,
    args: [PYRIGHT_LANGUAGE_SERVER_BIN, "--stdio"],
    languages: ["python", "py", "python3", "pyi"],
    capabilities: { diagnostics: true },
    budgets: { initializeMs: 10_000, requestMs: 5_000, shutdownMs: 1_500 },
    env: { NODE_ENV: "production" },
  },
  {
    id: "dockerfile",
    label: "Dockerfile Language Server",
    command: process.execPath,
    args: [DOCKERFILE_LANGUAGE_SERVER_BIN, "--stdio"],
    languages: ["dockerfile", "docker"],
    capabilities: { diagnostics: true },
    budgets: { initializeMs: 5_000, requestMs: 3_000, shutdownMs: 1_000 },
    env: { NODE_ENV: "production" },
  },
  {
    id: "markdown",
    label: "Markdown Language Server",
    command: process.execPath,
    args: [MARKDOWN_LANGUAGE_SERVER_BIN, "--stdio"],
    languages: ["markdown", "md", "mdx"],
    capabilities: { diagnostics: true },
    budgets: { initializeMs: 5_000, requestMs: 3_000, shutdownMs: 1_000 },
    env: { NODE_ENV: "production" },
  },
  {
    id: "eslint",
    label: "ESLint Language Server",
    command: process.execPath,
    args: [ESLINT_LANGUAGE_SERVER_BIN, "--stdio"],
    languages: ["javascript", "javascriptreact", "typescript", "typescriptreact"],
    capabilities: { diagnostics: true },
    budgets: { initializeMs: 10_000, requestMs: 5_000, shutdownMs: 1_500 },
    env: { NODE_ENV: "production" },
    settings: {
      validate: "on",
      packageManager: "npm",
      codeAction: { disableRuleComment: { enable: false }, showDocumentation: { enable: false } },
      codeActionOnSave: { enable: false, mode: "problems" },
      format: false,
      run: "onType",
      workingDirectory: { mode: "location" },
      nodePath: null,
      options: {},
      rulesCustomizations: [],
      problems: { shortenToSingleLine: false },
      experimental: { useFlatConfig: false },
      useESLintClass: true,
    },
  },
];

export function getExternalLanguageServerProfiles(): ExternalLanguageServerProfile[] {
  return EXTERNAL_LANGUAGE_SERVER_PROFILES.map(cloneProfile);
}

export function findExternalLanguageServerProfile(
  providerId: string,
  profiles: ExternalLanguageServerProfile[] = EXTERNAL_LANGUAGE_SERVER_PROFILES,
): ExternalLanguageServerProfile | null {
  const profile = profiles.find((candidate) => candidate.id === providerId);
  return profile ? cloneProfile(profile) : null;
}

export function profileBudgets(profile: ExternalLanguageServerProfile): ExternalLanguageServerBudgets {
  return { ...DEFAULT_EXTERNAL_LSP_BUDGETS, ...profile.budgets };
}

export function resolveExternalLanguageServerCwd(rootPath: string, cwd?: string): string {
  const root = path.resolve(rootPath);
  const resolved = cwd ? path.resolve(root, cwd) : root;
  if (!isWithinRoot(root, resolved)) {
    throw new Error("External LSP cwd must stay inside workspace root");
  }
  return resolved;
}

export function isWithinRoot(rootPath: string, targetPath: string): boolean {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function cloneProfile(profile: ExternalLanguageServerProfile): ExternalLanguageServerProfile {
  return {
    ...profile,
    args: profile.args ? [...profile.args] : undefined,
    languages: [...profile.languages],
    capabilities: { ...profile.capabilities },
    budgets: profile.budgets ? { ...profile.budgets } : undefined,
    env: profile.env ? { ...profile.env } : undefined,
    settings: profile.settings ? JSON.parse(JSON.stringify(profile.settings)) as Record<string, unknown> : undefined,
  };
}
