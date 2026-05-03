import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import {
  createStudioConfig,
  createStudioContext,
  createStudioRequestHandler,
  createStudioServer,
} from './apps/api/index.js';
import {
  isStudioGatewayEnabled,
  isStudioStandaloneEnabled,
} from './apps/api/config.js';
import { buildStudioClientRuntimeConfig } from './apps/api/runtime-config.js';
import {
  STUDIO_CHAT_GATEWAY_EVENT,
  STUDIO_CHAT_GATEWAY_METHODS,
  type ChatGatewayAttachPayload,
  type ChatGatewayAbortPayload,
  type ChatGatewayDetachPayload,
  type ChatGatewayHeartbeatPayload,
  type ChatGatewayPolicySyncPayload,
  type ChatGatewaySendPayload,
} from './types/chat.js';
import {
  STUDIO_TERMINAL_GATEWAY_EVENT,
  STUDIO_TERMINAL_GATEWAY_METHODS,
  type TerminalGatewayAttachPayload,
  type TerminalGatewayClearPayload,
  type TerminalGatewayDetachPayload,
  type TerminalGatewayHeartbeatPayload,
  type TerminalGatewayInputPayload,
  type TerminalGatewayResizePayload,
} from './types/terminal.js';
import {
  buildStudioBeforePromptBuildResult,
  buildStudioBeforeToolCallResult,
} from './lib/studio-delivery-hooks.js';
import {
  getStudioChatGlobalHostManagementExecEnabled,
  getStudioChatSessionHostManagementExecEnabled,
  setStudioChatGlobalHostManagementExecEnabled,
  setStudioChatSessionHostManagementExecEnabled,
} from './lib/studio-chat-management-policy.js';
import { maybeHandleStudioReplyDispatch } from './lib/studio-reply-dispatch.js';
import { resolveStudioDeliveryTool } from './lib/studio-delivery-tool.js';
import { resolvePluginHostContext } from './lib/plugin-host-compat.js';
import {
  isStudioGatewayHttpAuthorized,
  rejectStudioGatewayHttpUnauthorized,
  syncStudioGatewayHttpAuthCookie,
} from './apps/api/gateway-http-auth.js';

let studioServer: ReturnType<typeof createStudioServer> | null = null;
let studioContext: ReturnType<typeof createStudioContext> | null = null;

function buildGatewayMethodError(message: string, code = 'BAD_REQUEST') {
  return {
    code,
    message,
  };
}

const studioPlugin = {
  id: 'studio',
  name: 'OpenClaw Studio',
  description: 'OpenClaw Studio 管理控制台扩展，当前阶段聚焦配置、技能、终端、频道、定时任务和 Agent 管理。',
  kind: 'ui' as const,
  configSchema: {
    type: 'object',
    properties: {
      apiPort: {
        type: 'number',
        default: 3760,
      },
      autoStart: {
        type: 'boolean',
        default: true,
      },
      transport: {
        type: 'object',
        properties: {
          preferredMode: {
            type: 'string',
            enum: ['standalone', 'gateway'],
            default: 'standalone',
          },
          standalone: {
            type: 'object',
            properties: {
              enabled: {
                type: 'boolean',
                default: true,
              },
              port: {
                type: 'number',
                default: 3760,
              },
            },
          },
          gateway: {
            type: 'object',
            properties: {
              enabled: {
                type: 'boolean',
                default: true,
              },
              basePath: {
                type: 'string',
                default: '/studio',
              },
            },
          },
        },
      },
      chat: {
        type: 'object',
        properties: {
          allowHostManagementExecInStudioChat: {
            type: 'boolean',
            default: false,
          },
        },
      },
    },
  },
  register(api: OpenClawPluginApi) {
    const studioChatConfig = (
      api.pluginConfig
      && typeof api.pluginConfig.chat === 'object'
      && api.pluginConfig.chat
    )
      ? api.pluginConfig.chat as { allowHostManagementExecInStudioChat?: unknown }
      : null;
    setStudioChatGlobalHostManagementExecEnabled(
      studioChatConfig?.allowHostManagementExecInStudioChat === true,
    );
    const ensureStudioRuntime = () => {
      const config = createStudioConfig(api, api.pluginConfig || {});
      if (!studioContext) {
        studioContext = createStudioContext({
          config,
          logger: api.logger,
        });
      }
      return {
        config,
        ctx: studioContext,
      };
    };
    const registerHttpRoute = typeof api.registerHttpRoute === 'function'
      ? api.registerHttpRoute.bind(api)
      : null;
    const registerGatewayMethod = typeof api.registerGatewayMethod === 'function'
      ? api.registerGatewayMethod.bind(api)
      : null;

    api.registerTool((ctx) => resolveStudioDeliveryTool(ctx), {
      name: 'studio_delivery',
    });
    api.on?.('before_prompt_build', (_event, ctx) => {
      const host = resolvePluginHostContext(ctx);
      return (
      buildStudioBeforePromptBuildResult({
        sessionKey: host.sessionKey,
        channelId: host.channelId,
      })
      );
    }, { priority: 100 });
    api.on?.('before_tool_call', (event, ctx) => {
      const host = resolvePluginHostContext(ctx);
      const result = buildStudioBeforeToolCallResult({
        toolName: event.toolName,
        toolParams: event.params || {},
        sessionKey: host.sessionKey,
        channelId: host.channelId,
      });
      if (result?.block) {
        api.logger.warn(`studio: blocked tool call in Studio webchat (tool=${event.toolName}): ${result.blockReason}`);
      }
      return result;
    }, { priority: 100 });
    api.on?.('reply_dispatch', (event, ctx) => {
      return maybeHandleStudioReplyDispatch(event as Record<string, unknown> as {
        ctx: Record<string, unknown>;
        runId?: string;
        sessionKey?: string;
        sendPolicy?: 'allow' | 'deny';
        shouldRouteToOriginating?: boolean;
      }, ctx as Record<string, unknown> as {
        cfg: Record<string, unknown>;
        dispatcher: {
          sendToolResult: (payload: unknown) => boolean;
          sendBlockReply: (payload: unknown) => boolean;
          sendFinalReply: (payload: unknown) => boolean;
          getQueuedCounts: () => Record<string, number>;
        };
        abortSignal?: AbortSignal;
        onReplyStart?: () => Promise<void> | void;
        recordProcessed: (
          outcome: 'completed' | 'skipped' | 'error',
          opts?: {
            reason?: string;
            error?: string;
          },
        ) => void;
        markIdle: (reason: string) => void;
      });
    }, { priority: 100 });

    {
      const { config, ctx } = ensureStudioRuntime();
      if (isStudioGatewayEnabled(config)) {
        if (!registerHttpRoute || !registerGatewayMethod) {
          api.logger.warn('studio: gateway exposure requested but host plugin API lacks route registration; skipping gateway runtime');
        } else {
        const requestHandler = createStudioRequestHandler(ctx, {
          stripBasePath: config.transport.gateway.basePath,
          runtimeConfig: buildStudioClientRuntimeConfig(config, 'gateway'),
        });
        registerHttpRoute({
          path: config.transport.gateway.basePath,
          auth: 'plugin',
          match: 'prefix',
          handler: async (req, res) => {
            if (!isStudioGatewayHttpAuthorized(config, req)) {
              rejectStudioGatewayHttpUnauthorized(res, req);
              return true;
            }
            syncStudioGatewayHttpAuthCookie(config, req, res);
            return requestHandler(req, res);
          },
        });
        api.logger.info(`studio: gateway HTTP route registered at ${config.transport.gateway.basePath}`);

        const withConnId = (client: { connId?: string } | null): string => {
          const connId = String(client?.connId || '').trim();
          if (!connId) {
            throw new Error('gateway connId is required');
          }
          return connId;
        };

        registerGatewayMethod(STUDIO_CHAT_GATEWAY_METHODS.attach, async (opts) => {
          try {
            const connId = withConnId(opts.client);
            const connIds = new Set([connId]);
            const payload = await ctx.services.chat.attachGatewayClient(
              opts.params as unknown as ChatGatewayAttachPayload,
              {
                connId,
                emit: (event) => {
                  opts.context.broadcastToConnIds(STUDIO_CHAT_GATEWAY_EVENT, event, connIds, {
                    dropIfSlow: true,
                  });
                  return true;
                },
              }
            );
            opts.respond(true, payload);
          } catch (error) {
            opts.respond(false, undefined, buildGatewayMethodError(
              error instanceof Error ? error.message : 'chat_attach_failed'
            ));
          }
        }, { scope: 'operator.read' });

        registerGatewayMethod(STUDIO_CHAT_GATEWAY_METHODS.heartbeat, (opts) => {
          try {
            const payload = ctx.services.chat.heartbeatGatewayClient(
              opts.params as unknown as ChatGatewayHeartbeatPayload,
              { connId: withConnId(opts.client) }
            );
            opts.respond(true, payload);
          } catch (error) {
            opts.respond(false, undefined, buildGatewayMethodError(
              error instanceof Error ? error.message : 'chat_heartbeat_failed'
            ));
          }
        }, { scope: 'operator.read' });

        registerGatewayMethod(STUDIO_CHAT_GATEWAY_METHODS.detach, (opts) => {
          try {
            const payload = ctx.services.chat.detachGatewayClient(
              opts.params as unknown as ChatGatewayDetachPayload,
              { connId: withConnId(opts.client) }
            );
            opts.respond(true, payload);
          } catch (error) {
            opts.respond(false, undefined, buildGatewayMethodError(
              error instanceof Error ? error.message : 'chat_detach_failed'
            ));
          }
        }, { scope: 'operator.read' });

        registerGatewayMethod(STUDIO_CHAT_GATEWAY_METHODS.send, async (opts) => {
          try {
            const payload = opts.params as unknown as ChatGatewaySendPayload;
            const sessionKey = String(payload?.sessionKey || '').trim();
            const response = await ctx.services.chat.send(sessionKey, {
              text: payload?.text || '',
              clientRequestId: payload?.clientRequestId,
              thinking: payload?.thinking,
              composerDocument: payload?.composerDocument,
              fileRefs: payload?.fileRefs,
              attachments: payload?.attachments,
            });
            opts.respond(true, response);
          } catch (error) {
            opts.respond(false, undefined, buildGatewayMethodError(
              error instanceof Error ? error.message : 'chat_send_failed',
              'CHAT_SEND_FAILED',
            ));
          }
        }, { scope: 'operator.read' });

        registerGatewayMethod(STUDIO_CHAT_GATEWAY_METHODS.abort, async (opts) => {
          try {
            const payload = opts.params as unknown as ChatGatewayAbortPayload;
            const sessionKey = String(payload?.sessionKey || '').trim();
            const response = await ctx.services.chat.abort(sessionKey);
            opts.respond(true, response);
          } catch (error) {
            opts.respond(false, undefined, buildGatewayMethodError(
              error instanceof Error ? error.message : 'chat_abort_failed',
              'CHAT_ABORT_FAILED',
            ));
          }
        }, { scope: 'operator.read' });

        registerGatewayMethod(STUDIO_CHAT_GATEWAY_METHODS.policySync, (opts) => {
          try {
            const payload = opts.params as unknown as ChatGatewayPolicySyncPayload;
            const sessionKey = String(payload?.sessionKey || '').trim();
            if (typeof payload?.globalHostManagementExecEnabled === 'boolean') {
              setStudioChatGlobalHostManagementExecEnabled(payload.globalHostManagementExecEnabled);
            }
            if (sessionKey) {
              setStudioChatSessionHostManagementExecEnabled(
                sessionKey,
                payload?.allowHostManagementExec === true,
              );
            }
            opts.respond(true, {
              ok: true,
              sessionKey: sessionKey || null,
              globalHostManagementExecEnabled: getStudioChatGlobalHostManagementExecEnabled(),
              allowHostManagementExec: sessionKey
                ? getStudioChatSessionHostManagementExecEnabled(sessionKey)
                : null,
            });
          } catch (error) {
            opts.respond(false, undefined, buildGatewayMethodError(
              error instanceof Error ? error.message : 'chat_policy_sync_failed',
              'CHAT_POLICY_SYNC_FAILED',
            ));
          }
        }, { scope: 'operator.read' });

        registerGatewayMethod(STUDIO_TERMINAL_GATEWAY_METHODS.attach, (opts) => {
          try {
            const connId = withConnId(opts.client);
            const connIds = new Set([connId]);
            const payload = ctx.services.terminal.attachGatewayClient(
              opts.params as unknown as TerminalGatewayAttachPayload,
              {
                connId,
                emit: (event) => {
                  opts.context.broadcastToConnIds(STUDIO_TERMINAL_GATEWAY_EVENT, event, connIds);
                  return true;
                },
              }
            );
            opts.respond(true, payload);
          } catch (error) {
            opts.respond(false, undefined, buildGatewayMethodError(
              error instanceof Error ? error.message : 'terminal_attach_failed'
            ));
          }
        }, { scope: 'operator.write' });

        registerGatewayMethod(STUDIO_TERMINAL_GATEWAY_METHODS.input, (opts) => {
          try {
            const params = opts.params as unknown as TerminalGatewayInputPayload;
            const payload = ctx.services.terminal.sendGatewayInput(
              params,
              { connId: withConnId(opts.client) }
            );
            if (params?.ackMode === 'none') {
              return;
            }
            opts.respond(true, payload);
          } catch (error) {
            opts.respond(false, undefined, buildGatewayMethodError(
              error instanceof Error ? error.message : 'terminal_input_failed'
            ));
          }
        }, { scope: 'operator.write' });

        registerGatewayMethod(STUDIO_TERMINAL_GATEWAY_METHODS.resize, (opts) => {
          try {
            const payload = ctx.services.terminal.resizeGatewayClient(
              opts.params as unknown as TerminalGatewayResizePayload,
              { connId: withConnId(opts.client) }
            );
            opts.respond(true, payload);
          } catch (error) {
            opts.respond(false, undefined, buildGatewayMethodError(
              error instanceof Error ? error.message : 'terminal_resize_failed'
            ));
          }
        }, { scope: 'operator.write' });

        registerGatewayMethod(STUDIO_TERMINAL_GATEWAY_METHODS.heartbeat, (opts) => {
          try {
            const payload = ctx.services.terminal.heartbeatGatewayClient(
              opts.params as unknown as TerminalGatewayHeartbeatPayload,
              { connId: withConnId(opts.client) }
            );
            opts.respond(true, payload);
          } catch (error) {
            opts.respond(false, undefined, buildGatewayMethodError(
              error instanceof Error ? error.message : 'terminal_heartbeat_failed'
            ));
          }
        }, { scope: 'operator.write' });

        registerGatewayMethod(STUDIO_TERMINAL_GATEWAY_METHODS.clear, (opts) => {
          try {
            const payload = ctx.services.terminal.clearGatewaySession(
              opts.params as unknown as TerminalGatewayClearPayload,
              { connId: withConnId(opts.client) }
            );
            opts.respond(true, payload);
          } catch (error) {
            opts.respond(false, undefined, buildGatewayMethodError(
              error instanceof Error ? error.message : 'terminal_clear_failed'
            ));
          }
        }, { scope: 'operator.write' });

        registerGatewayMethod(STUDIO_TERMINAL_GATEWAY_METHODS.detach, (opts) => {
          try {
            const payload = ctx.services.terminal.detachGatewayClient(
              opts.params as unknown as TerminalGatewayDetachPayload,
              { connId: withConnId(opts.client) }
            );
            opts.respond(true, payload);
          } catch (error) {
            opts.respond(false, undefined, buildGatewayMethodError(
              error instanceof Error ? error.message : 'terminal_detach_failed'
            ));
          }
        }, { scope: 'operator.write' });
        }
      }
    }

    api.registerService({
      id: 'studio-server',
      start: async () => {
        const { config, ctx } = ensureStudioRuntime();
        if (!isStudioStandaloneEnabled(config)) {
          api.logger.info('studio: standalone exposure disabled; skipping standalone HTTP server');
          return;
        }
        if (studioServer?.isRunning()) return;

        studioServer = createStudioServer(ctx);
        await studioServer.start();
      },
      stop: async () => {
        if (!studioServer) return;
        await studioServer.stop();
        studioServer = null;
      },
    });

    api.logger.info('studio: management foundation, delivery tool, and Studio chat hooks registered');
  },
};

export default studioPlugin;
