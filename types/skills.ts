export type SkillSourceCategory =
  | 'bundled'
  | 'managed'
  | 'workspace'
  | 'plugin'
  | 'extra'
  | 'config-only'
  | 'unknown';

export type SkillStatus = 'ready' | 'needs-setup' | 'disabled' | 'blocked';

export type SkillApiKeyMode = 'none' | 'plaintext' | 'secret-ref';

export type SkillsMarketplaceSourceId = 'skillhub-tencent' | 'clawhub';

export type SkillsMarketplaceSort = 'featured' | 'downloads' | 'stars' | 'installs' | 'newest';

export type SkillsInstallMethod = 'skillhub-cli' | 'clawhub-cli' | 'mirror-download' | 'unavailable';
export type SkillsMaintenanceAction = 'update' | 'uninstall';
export type SkillsRiskLevel = 'low' | 'medium' | 'high';

export interface SkillMissingRequirements {
  bins: string[];
  anyBins: string[];
  env: string[];
  config: string[];
  os: string[];
}

export interface SkillInstallMetadata {
  slug: string | null;
  version: string | null;
  publishedAt: string | null;
  ownerId: string | null;
}

export interface SkillPathInfo {
  workspacePath: string | null;
  managedPath: string | null;
  activePath: string | null;
}

export interface SkillSummary {
  slug: string;
  name: string;
  description: string;
  emoji: string | null;
  homepage: string | null;
  primaryEnv: string | null;
  eligible: boolean;
  enabled: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  bundled: boolean;
  source: string;
  sourceCategory: SkillSourceCategory;
  status: SkillStatus;
  hasApiKey: boolean;
  apiKeyMode: SkillApiKeyMode;
  envKeys: string[];
  configKeys: string[];
  missing: SkillMissingRequirements;
  paths: SkillPathInfo;
  installMetadata: SkillInstallMetadata | null;
}

export interface SkillsSummaryPayload {
  checkedAt: string;
  stale: boolean;
  workspaceDir: string;
  managedSkillsDir: string;
  counts: {
    total: number;
    enabled: number;
    ready: number;
    needsSetup: number;
    disabled: number;
    blocked: number;
    workspace: number;
    managed: number;
    bundled: number;
    configured: number;
    marketplaceInstalled: number;
  };
  tools: {
    clawhubInstalled: boolean;
    skillhubInstalled: boolean;
  };
  skills: SkillSummary[];
}

export interface SkillTogglePayload {
  slug: string;
  enabled: boolean;
}

export interface SkillConfigState {
  enabled: boolean;
  hasApiKey: boolean;
  apiKeyMode: SkillApiKeyMode;
  apiKeyMasked: string | null;
  apiKeySecretRefLabel: string | null;
  env: Record<string, string>;
  config: Record<string, unknown>;
}

export interface SkillConfigPayload {
  checkedAt: string;
  slug: string;
  summary: SkillSummary;
  entry: SkillConfigState;
}

export interface SkillConfigUpdatePayload {
  enabled?: boolean;
  apiKey?: string | null;
  env?: Record<string, string>;
  config?: Record<string, unknown>;
}

export interface SkillConfigSaveResponse {
  success: boolean;
  slug: string;
  entry: SkillConfigState;
}

export interface SkillSecretPayload {
  slug: string;
  apiKey: string | null;
  apiKeyMode: SkillApiKeyMode;
  primaryEnv: string | null;
}

export interface SkillsMarketplaceSource {
  id: SkillsMarketplaceSourceId;
  name: string;
  region: 'domestic' | 'global';
  preferred: boolean;
  description: string;
  browseUrl: string;
  docsUrl: string | null;
  cliName: string | null;
  cliInstalled: boolean;
  installCommand: string | null;
  cliOnlyCommand: string | null;
  supportsSearch: boolean;
  supportsDirectInstall: boolean;
  note: string | null;
}

export interface SkillsMarketplaceSourcesPayload {
  checkedAt: string;
  recommendedSourceId: SkillsMarketplaceSourceId;
  sources: SkillsMarketplaceSource[];
}

export interface SkillsMarketplaceItem {
  sourceId: SkillsMarketplaceSourceId;
  slug: string;
  name: string;
  summary: string;
  summaryZh: string | null;
  version: string | null;
  ownerName: string | null;
  downloads: number | null;
  stars: number | null;
  installs: number | null;
  category: string | null;
  tags: string[];
  homepage: string | null;
  detailUrl: string;
  updatedAt: string | null;
  installed: boolean;
}

export interface SkillsMarketplacePayload {
  checkedAt: string;
  source: SkillsMarketplaceSource;
  query: string;
  sort: SkillsMarketplaceSort;
  page: number;
  pageSize: number;
  total: number;
  stale: boolean;
  error: string | null;
  items: SkillsMarketplaceItem[];
}

export interface SkillsMarketplaceInstallPayload {
  sourceId: SkillsMarketplaceSourceId;
  slug: string;
  replaceExisting?: boolean;
}

export interface SkillsMarketplaceInstallResponse {
  success: boolean;
  sourceId: SkillsMarketplaceSourceId;
  slug: string;
  method: SkillsInstallMethod;
  installedPath: string | null;
  output: string;
  note: string | null;
  requiresNewSession: boolean;
}

export interface SkillsPreflightPayload {
  sourceId: SkillsMarketplaceSourceId;
  slug: string;
}

export interface SkillsPreflightIndicator {
  key: string;
  label: string;
  severity: SkillsRiskLevel;
  detail: string;
}

export interface SkillsPreflightPayloadData {
  fileCount: number;
  textFileCount: number;
  hasSkillMd: boolean;
  externalUrls: string[];
  suggestedEnv: string[];
  requiredBins: string[];
  installHints: string[];
}

export interface SkillsPreflightResult {
  checkedAt: string;
  sourceId: SkillsMarketplaceSourceId;
  slug: string;
  level: SkillsRiskLevel;
  summary: string;
  indicators: SkillsPreflightIndicator[];
  payload: SkillsPreflightPayloadData;
}

export interface SkillsMaintenancePayload {
  slug: string;
  sourceId?: SkillsMarketplaceSourceId;
}

export interface SkillsMaintenanceResponse {
  success: boolean;
  action: SkillsMaintenanceAction;
  slug: string;
  sourceId: SkillsMarketplaceSourceId | null;
  output: string;
  note: string | null;
  affectedPath: string | null;
  requiresNewSession: boolean;
}
