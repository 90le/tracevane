export type TracevaneLspProviderId = "json" | "typescript";
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

export const JSON_PROVIDER_SOURCE = "json-lsp";
export const TS_PROVIDER_SOURCE = "typescript-lsp";

export const TYPESCRIPT_LANGUAGES = new Set(["typescript", "typescriptreact", "javascript", "javascriptreact"]);

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
