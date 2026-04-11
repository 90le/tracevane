declare module 'openclaw/plugin-sdk' {
  export interface OpenClawPluginToolContext {
    agentId?: string;
    sessionKey?: string;
    sessionId?: string;
    messageChannel?: string;
    messageProvider?: string;
    channelId?: string;
    workspaceDir?: string;
    trigger?: string;
    runId?: string;
    toolName?: string;
    toolCallId?: string;
  }

  export interface OpenClawPluginToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute(id: string, params: unknown): Promise<unknown> | unknown;
  }

  export type OpenClawPluginHttpRouteAuth = 'gateway' | 'plugin';
  export type OpenClawPluginHttpRouteMatch = 'exact' | 'prefix';
  export type OpenClawPluginHttpRouteHandler = (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ) => Promise<boolean | void> | boolean | void;

  export interface OpenClawPluginHttpRouteParams {
    path: string;
    handler: OpenClawPluginHttpRouteHandler;
    auth: OpenClawPluginHttpRouteAuth;
    match?: OpenClawPluginHttpRouteMatch;
    replaceExisting?: boolean;
  }

  export interface GatewayRequestHandlerOptions {
    req: {
      method: string;
      params?: Record<string, unknown>;
      [key: string]: unknown;
    };
    params: Record<string, unknown>;
    client: {
      connId?: string;
      [key: string]: unknown;
    } | null;
    respond: (ok: boolean, payload?: unknown, error?: unknown, meta?: Record<string, unknown>) => void;
    context: {
      broadcast: (event: string, payload: unknown, opts?: Record<string, unknown>) => void;
      broadcastToConnIds: (
        event: string,
        payload: unknown,
        connIds: ReadonlySet<string>,
        opts?: Record<string, unknown>,
      ) => void;
      [key: string]: unknown;
    };
    isWebchatConnect: (params: unknown) => boolean;
  }

  export type GatewayRequestHandler = (
    opts: GatewayRequestHandlerOptions,
  ) => Promise<void> | void;

  export type OpenClawPluginToolFactory = (
    ctx: OpenClawPluginToolContext,
  ) => OpenClawPluginToolDefinition | OpenClawPluginToolDefinition[] | null | undefined;

  export interface OpenClawPluginApi {
    logger: {
      info: (...args: unknown[]) => void;
      warn: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
      debug?: (...args: unknown[]) => void;
    };
    pluginConfig?: Record<string, unknown>;
    config?: {
      gateway?: {
        port?: number;
      };
    };
    resolvePath(path: string): string;
    registerTool(
      tool: OpenClawPluginToolDefinition | OpenClawPluginToolFactory,
      opts?: {
        name?: string;
        names?: string[];
        optional?: boolean;
      },
    ): void;
    registerHttpRoute(params: OpenClawPluginHttpRouteParams): void;
    registerGatewayMethod(
      method: string,
      handler: GatewayRequestHandler,
      opts?: {
        scope?: string;
      },
    ): void;
    registerService(service: {
      id: string;
      start: () => void | Promise<void>;
      stop: () => void | Promise<void>;
    }): void;
    on?<TEvent = any, TCtx = any, TResult = any>(
      event: string,
      handler: (payload: TEvent, ctx: TCtx) => TResult | Promise<TResult>,
      opts?: {
        priority?: number;
      },
    ): void;
  }
}

declare module 'openclaw/plugin-sdk/reply-runtime' {
  export type ReplyPayload = {
    text?: string;
    mediaUrl?: string;
    mediaUrls?: string[];
    replyToId?: string;
    audioAsVoice?: boolean;
    isError?: boolean;
    isReasoning?: boolean;
    isCompactionNotice?: boolean;
    channelData?: Record<string, unknown>;
  };

  export function getReplyFromConfig(
    ctx: Record<string, unknown>,
    opts?: {
      runId?: string;
      abortSignal?: AbortSignal;
      onReplyStart?: () => Promise<void> | void;
      onToolResult?: (payload: ReplyPayload) => Promise<void> | void;
      onBlockReply?: (payload: ReplyPayload) => Promise<void> | void;
      [key: string]: unknown;
    },
    configOverride?: Record<string, unknown>,
  ): Promise<ReplyPayload | ReplyPayload[] | undefined>;
}
