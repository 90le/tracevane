export interface ConfigProviderModelSummary {
  id: string;
  input: string[];
  reasoning: boolean;
  contextWindow: number | null;
  maxTokens: number | null;
}

export interface ConfigProviderSummary {
  id: string;
  api: string | null;
  baseUrl: string | null;
  hasApiKey: boolean;
  modelCount: number;
  models: ConfigProviderModelSummary[];
}

export interface ConfigProviderInput {
  id: string;
  api: string | null;
  baseUrl: string | null;
  apiKey?: string;
  models: ConfigProviderModelSummary[];
}

export interface ConfigAgentDefaultModelSummary {
  alias?: string;
  params?: Record<string, unknown>;
  streaming?: boolean;
}

export interface ConfigSummaryPayload {
  checkedAt: string;
  defaults: {
    model: string;
    modelFallback: string[];
    imageModel: string;
    imageModelFallback: string[];
    imageGenerationModel: string;
    imageGenerationModelFallback: string[];
    videoGenerationModel: string;
    videoGenerationModelFallback: string[];
    musicGenerationModel: string;
    musicGenerationModelFallback: string[];
    mediaGenerationAutoProviderFallback: boolean;
    pdfModel: string;
    pdfModelFallback: string[];
    thinking: string;
    verbose: string;
    timeoutSeconds: number;
    maxConcurrent: number;
    subagentMaxConcurrent: number;
    subagentModel: string;
    subagentThinking: string;
    subagentRunTimeoutSeconds: number | null;
    subagentMaxSpawnDepth: number | null;
    subagentMaxChildrenPerAgent: number | null;
    subagentArchiveAfterMinutes: number | null;
    subagentAnnounceTimeoutMs: number | null;
    workspace: string;
    repoRoot: string;
    skipBootstrap: boolean;
    bootstrapMaxChars: number | null;
    bootstrapTotalMaxChars: number | null;
    systemPromptOverride: string;
    skills: string[];
    contextInjection: string;
    bootstrapPromptTruncationWarning: string;
    userTimezone: string;
    timeFormat: string;
    envelopeTimezone: string;
    envelopeTimestamp: string;
    envelopeElapsed: string;
    contextTokens: number | null;
    typingMode: string;
    elevated: string;
    blockStreaming: string;
    blockStreamingBreak: string;
    blockStreamingChunk: Record<string, unknown> | null;
    blockStreamingCoalesce: Record<string, unknown> | null;
    mediaMaxMb: number | null;
    imageMaxDimensionPx: number | null;
    typingIntervalSeconds: number | null;
    pdfMaxBytesMb: number | null;
    pdfMaxPages: number | null;
    llmIdleTimeoutSeconds: number | null;
    embeddedPiProjectSettingsPolicy: string;
    memorySearch: Record<string, unknown> | null;
    humanDelay: Record<string, unknown> | null;
    heartbeat: Record<string, unknown> | null;
    params: Record<string, unknown> | null;
    cliBackends: Record<string, unknown> | null;
    contextPruning: Record<string, unknown> | null;
    models: Record<string, ConfigAgentDefaultModelSummary>;
  };
  compaction: {
    mode: string;
    reserveTokensFloor: number;
    identifierPolicy: string;
    identifierInstructions: string;
    postCompactionSections: string[];
    model: string;
    memoryFlush: {
      enabled: boolean;
      softThresholdTokens: number;
    };
  };
  sandbox: {
    mode: string;
    workspaceAccess: string;
    scope: string;
    sessionToolsVisibility: string;
    prune: {
      idleHours: number;
      maxAgeDays: number;
    };
  };
  tools: {
    profile: string;
    elevatedEnabled: boolean;
    execHost: string;
    execNode: string;
    execAsk: string;
    execSecurity: string;
    execTimeoutSec: number;
    fsWorkspaceOnly: boolean;
  };
  execApprovals: {
    socketPath: string;
    availableAgentIds: string[];
    defaults: {
      security: string;
      ask: string;
      askFallback: string;
      autoAllowSkills: boolean;
    };
    agents: Array<{
      agentId: string;
      security: string;
      ask: string;
      askFallback: string;
      autoAllowSkills: boolean;
      allowlistCount: number;
      allowlist: Array<{
        pattern: string;
        lastUsedAt: number;
        lastUsedCommand: string;
        lastResolvedPath: string;
      }>;
    }>;
  };
  session: {
    dmScope: string;
    threadBindings: {
      enabled: boolean;
      idleHours: number;
      maxAgeHours: number;
    };
  };
  messages: {
    responsePrefix: string;
    ackReaction: string;
    ackReactionScope: string;
    removeAckAfterReply: boolean;
    queue: {
      mode: string;
      debounceMs: number;
      cap: number;
      drop: string;
      byChannel: Record<string, string>;
    };
  };
  gateway: {
    port: number;
    mode: string;
    bind: string;
    customBindHost?: string;
    auth: {
      mode: string;
      hasToken: boolean;
      hasPassword: boolean;
      allowTailscale: boolean;
      trustedProxy?: {
        userHeader: string;
        requiredHeaders: string[];
        allowUsers: string[];
      };
      rateLimit: {
        maxAttempts: number;
        windowMs: number;
        lockoutMs: number;
        exemptLoopback: boolean;
      };
    };
    controlUi: {
      enabled?: boolean;
      basePath?: string;
      root?: string;
      allowedOrigins: string[];
      dangerouslyAllowHostHeaderOriginFallback: boolean;
      allowInsecureAuth: boolean;
      dangerouslyDisableDeviceAuth?: boolean;
    };
    trustedProxies: string[];
    allowRealIpFallback?: boolean;
    tools?: {
      allow: string[];
      deny: string[];
    };
    webchat?: {
      chatHistoryMaxChars: number | null;
    };
    channelHealthCheckMinutes?: number | null;
    tailscale: {
      mode: string;
    };
  };
  channels: Record<string, ConfigChannelSummary>;
  sessionReset: {
    mode: string;
    atHour: number | null;
    idleMinutes: number | null;
    resetByType: Record<string, string>;
    resetByChannel: Record<string, string>;
  };
  hooks: {
    internal: {
      enabled: boolean;
      entries: Record<string, { enabled: boolean; [key: string]: unknown }>;
    };
  };
  commands: {
    native: string;
    nativeSkills: string;
    restart: boolean;
    ownerDisplay: string;
  };
  mcp?: {
    sessionIdleTtlMs?: number | null;
    servers?: Record<string, unknown>;
  };
  skills?: {
    allowBundled?: boolean;
    load?: {
      extraDirs?: string[];
    };
    install?: {
      preferBrew?: boolean;
      nodeManager?: string;
    };
    limits?: {
      maxSkillsPromptChars?: number | null;
    };
    entries?: Record<string, unknown>;
  };
  acp?: {
    enabled?: boolean;
    dispatch?: { enabled?: boolean };
    backend?: string;
    defaultAgent?: string;
    allowedAgents?: string[];
    maxConcurrentSessions?: number;
  };
  plugins?: {
    enabled?: boolean;
    allow?: string[];
    deny?: string[];
    loadPaths?: string[];
    slots?: {
      memory?: string;
      contextEngine?: string;
    };
    installs?: Array<{
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
    entries?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
  };
  browser?: {
    enabled?: boolean;
    evaluateEnabled?: boolean;
    cdpUrl?: string;
    remoteCdpTimeoutMs?: number | null;
    remoteCdpHandshakeTimeoutMs?: number | null;
    defaultProfile?: string;
    attachOnly?: boolean;
    cdpPortRangeStart?: number | null;
    executablePath?: string;
    headless?: boolean;
    noSandbox?: boolean;
    extraArgs?: string[];
    color?: string;
    snapshotDefaults?: {
      mode?: string;
    };
    tabCleanup?: {
      enabled?: boolean;
      idleMinutes?: number | null;
      maxTabsPerSession?: number | null;
      sweepMinutes?: number | null;
    };
    ssrfPolicy?: {
      dangerouslyAllowPrivateNetwork?: boolean;
      hostnameAllowlist?: string[];
      allowedHostnames?: string[];
    };
    profiles?: Array<{
      id: string;
      driver?: string;
      attachOnly?: boolean;
      cdpPort?: number | null;
      cdpUrl?: string;
      userDataDir?: string;
      color?: string;
    }>;
  };
  logging?: {
    level?: string;
    file?: string;
    maxFileBytes?: number;
    consoleLevel?: string;
    consoleStyle?: string;
    redactSensitive?: string;
  };
  providers: ConfigProviderSummary[];
  pluginEntries: Array<{
    id: string;
    enabled: boolean;
  }>;
  skillEntriesCount: number;
}

export interface ConfigChannelAccountSummary {
  enabled?: boolean;
  hasToken: boolean;
  maskedToken: string;
  proxy?: string;
  groupPolicy?: string;
  streaming?: string;
  dmPolicy?: string;
  [key: string]: unknown;
}

export interface ConfigChannelSummary {
  enabled: boolean;
  groupPolicy: string;
  streaming: string;
  threadBindings?: {
    enabled: boolean;
    idleHours: number;
    maxAgeHours: number;
    [key: string]: unknown;
  };
  accounts: Record<string, ConfigChannelAccountSummary>;
  [key: string]: unknown;
}

export interface ConfigUpdatePayload {
  defaults: ConfigSummaryPayload['defaults'];
  compaction: ConfigSummaryPayload['compaction'];
  sandbox: ConfigSummaryPayload['sandbox'];
  tools: ConfigSummaryPayload['tools'];
  execApprovals: {
    defaults: ConfigSummaryPayload['execApprovals']['defaults'];
    agents: ConfigSummaryPayload['execApprovals']['agents'];
  };
  session: ConfigSummaryPayload['session'];
  messages: ConfigSummaryPayload['messages'];
  providers: ConfigProviderInput[];
  gateway?: Partial<ConfigSummaryPayload['gateway']>;
  channels?: Record<string, Record<string, unknown>>;
  sessionReset?: Partial<ConfigSummaryPayload['sessionReset']>;
  hooks?: Partial<ConfigSummaryPayload['hooks']>;
  commands?: Partial<ConfigSummaryPayload['commands']>;
  mcp?: Partial<ConfigSummaryPayload['mcp']>;
  skills?: Partial<ConfigSummaryPayload['skills']>;
  acp?: Partial<ConfigSummaryPayload['acp']>;
  plugins?: Partial<ConfigSummaryPayload['plugins']>;
  browser?: Partial<ConfigSummaryPayload['browser']>;
  logging?: Partial<ConfigSummaryPayload['logging']>;
}

export interface ConfigSaveResponse {
  success: boolean;
  message: string;
  config: ConfigSummaryPayload;
}

export interface ConfigProviderSecretPayload {
  checkedAt: string;
  providerId: string;
  apiKey: string;
}

export interface ConfigChannelSecretPayload {
  checkedAt: string;
  channelId: string;
  accountId: string;
  token: string;
}
