export type TracevaneLspProviderId = "json" | "typescript" | "html" | "css" | "yaml" | "bash" | "pyright" | "dockerfile" | "markdown" | "eslint" | "vue" | "svelte";
export type TracevaneLspProviderMode = "in-process" | "external" | "fallback";
export type TracevaneLspProviderStatus = "available" | "degraded" | "unavailable";

export type TracevaneLspProviderFeature =
  | "diagnostics"
  | "hover"
  | "completion"
  | "definition"
  | "references"
  | "semanticTokens"
  | "workspaceSymbols"
  | "rename"
  | "formatting"
  | "codeAction";

export interface TracevaneLspProviderDescriptor {
  id: TracevaneLspProviderId;
  source: string;
  mode: TracevaneLspProviderMode;
  status: TracevaneLspProviderStatus;
  languages: string[];
  capabilities: Partial<Record<TracevaneLspProviderFeature, boolean>>;
}

export const JSON_PROVIDER_SOURCE = "vscode-json-languageservice";
export const TS_PROVIDER_SOURCE = "typescript-lsp";
export const HTML_PROVIDER_SOURCE = "vscode-html-languageservice";
export const CSS_PROVIDER_SOURCE = "vscode-css-languageservice";
export const YAML_PROVIDER_SOURCE = "yaml-language-server";
export const BASH_PROVIDER_SOURCE = "bash-language-server";
export const PYRIGHT_PROVIDER_SOURCE = "pyright";
export const DOCKERFILE_PROVIDER_SOURCE = "dockerfile-language-server-nodejs";
export const MARKDOWN_PROVIDER_SOURCE = "vscode-langservers-extracted";
export const ESLINT_PROVIDER_SOURCE = "vscode-langservers-extracted";
export const VUE_PROVIDER_SOURCE = "@vue/language-server";
export const SVELTE_PROVIDER_SOURCE = "svelte-language-server";

export const TYPESCRIPT_LANGUAGES = new Set(["typescript", "typescriptreact", "javascript", "javascriptreact"]);
export const CSS_LANGUAGES = new Set(["css", "scss", "less"]);
export const YAML_LANGUAGES = new Set(["yaml", "yml"]);
export const BASH_LANGUAGES = new Set(["shell", "shellscript", "bash", "sh"]);
export const PYTHON_LANGUAGES = new Set(["python", "py", "python3", "pyi"]);
export const DOCKERFILE_LANGUAGES = new Set(["dockerfile", "docker"]);
export const MARKDOWN_LANGUAGES = new Set(["markdown", "md", "mdx"]);
export const ESLINT_LANGUAGES = new Set(["javascript", "javascriptreact", "typescript", "typescriptreact"]);
export const VUE_LANGUAGES = new Set(["vue"]);
export const SVELTE_LANGUAGES = new Set(["svelte"]);

export const TRACEVANE_LSP_PROVIDERS: TracevaneLspProviderDescriptor[] = [
  {
    id: "json",
    source: JSON_PROVIDER_SOURCE,
    mode: "in-process",
    status: "available",
    languages: ["json"],
    capabilities: {
      diagnostics: true,
      hover: true,
      completion: true,
      definition: true,
      references: true,
      formatting: true,
      codeAction: true,
    },
  },
  {
    id: "html",
    source: HTML_PROVIDER_SOURCE,
    mode: "in-process",
    status: "available",
    languages: ["html"],
    capabilities: {
      hover: true,
      completion: true,
      formatting: true,
      codeAction: true,
    },
  },
  {
    id: "css",
    source: CSS_PROVIDER_SOURCE,
    mode: "in-process",
    status: "available",
    languages: [...CSS_LANGUAGES],
    capabilities: {
      diagnostics: true,
      hover: true,
      completion: true,
      definition: true,
      references: true,
      formatting: true,
      codeAction: true,
    },
  },

  {
    id: "yaml",
    source: YAML_PROVIDER_SOURCE,
    mode: "external",
    status: "available",
    languages: [...YAML_LANGUAGES],
    capabilities: {
      diagnostics: true,
    },
  },
  {
    id: "bash",
    source: BASH_PROVIDER_SOURCE,
    mode: "external",
    status: "available",
    languages: [...BASH_LANGUAGES],
    capabilities: {
      diagnostics: true,
    },
  },
  {
    id: "pyright",
    source: PYRIGHT_PROVIDER_SOURCE,
    mode: "external",
    status: "available",
    languages: [...PYTHON_LANGUAGES],
    capabilities: {
      diagnostics: true,
    },
  },
  {
    id: "dockerfile",
    source: DOCKERFILE_PROVIDER_SOURCE,
    mode: "external",
    status: "available",
    languages: [...DOCKERFILE_LANGUAGES],
    capabilities: {
      diagnostics: true,
    },
  },
  {
    id: "markdown",
    source: MARKDOWN_PROVIDER_SOURCE,
    mode: "external",
    status: "available",
    languages: [...MARKDOWN_LANGUAGES],
    capabilities: {
      diagnostics: true,
    },
  },
  {
    id: "typescript",
    source: TS_PROVIDER_SOURCE,
    mode: "in-process",
    status: "available",
    languages: [...TYPESCRIPT_LANGUAGES],
    capabilities: {
      diagnostics: true,
      hover: true,
      completion: true,
      definition: true,
      references: true,
      semanticTokens: true,
      workspaceSymbols: true,
      rename: true,
      formatting: true,
      codeAction: true,
    },
  },

  {
    id: "vue",
    source: VUE_PROVIDER_SOURCE,
    mode: "external",
    status: "available",
    languages: [...VUE_LANGUAGES],
    capabilities: {
      diagnostics: true,
    },
  },

  {
    id: "svelte",
    source: SVELTE_PROVIDER_SOURCE,
    mode: "external",
    status: "available",
    languages: [...SVELTE_LANGUAGES],
    capabilities: {
      diagnostics: true,
    },
  },
  {
    id: "eslint",
    source: ESLINT_PROVIDER_SOURCE,
    mode: "external",
    status: "available",
    languages: [...ESLINT_LANGUAGES],
    capabilities: {
      diagnostics: true,
    },
  },
];

export function providerForLanguage(language: string): TracevaneLspProviderDescriptor | null {
  return TRACEVANE_LSP_PROVIDERS.find((provider) => provider.languages.includes(language)) ?? null;
}

export function providerSupports(language: string, feature: TracevaneLspProviderFeature): boolean {
  return providerForLanguage(language)?.capabilities[feature] === true;
}

export function supportedLanguagesFromRegistry(): string[] {
  return [...new Set(TRACEVANE_LSP_PROVIDERS.flatMap((provider) => provider.languages))];
}

export function supportedFeaturesFromRegistry(): string[] {
  return [...new Set(TRACEVANE_LSP_PROVIDERS.flatMap((provider) => Object.entries(provider.capabilities)
    .filter(([, enabled]) => enabled === true)
    .map(([feature]) => feature)))];
}

export function providerCapabilityMatrix(): TracevaneLspProviderDescriptor[] {
  return TRACEVANE_LSP_PROVIDERS.map((provider) => ({
    ...provider,
    languages: [...provider.languages],
    capabilities: { ...provider.capabilities },
  }));
}
