import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import {
  createTracevaneConfig,
  createTracevaneContext,
  createTracevaneRequestHandler,
  createTracevaneServer,
} from './apps/api/index.js';
import {
  isTracevaneGatewayEnabled,
  isTracevaneStandaloneEnabled,
} from './apps/api/config.js';
import { buildTracevaneClientRuntimeConfig } from './apps/api/runtime-config.js';
import {
  TRACEVANE_CHAT_GATEWAY_EVENT,
  TRACEVANE_CHAT_GATEWAY_METHODS,
  type ChatGatewayAttachPayload,
  type ChatGatewayAbortPayload,
  type ChatGatewayDetachPayload,
  type ChatGatewayHeartbeatPayload,
  type ChatGatewayPolicySyncPayload,
  type ChatGatewaySendPayload,
} from './types/chat.js';
import {
  TRACEVANE_TERMINAL_GATEWAY_EVENT,
  TRACEVANE_TERMINAL_GATEWAY_METHODS,
  type TerminalGatewayAttachPayload,
  type TerminalGatewayClearPayload,
  type TerminalGatewayDetachPayload,
  type TerminalGatewayHeartbeatPayload,
  type TerminalGatewayInputPayload,
  type TerminalGatewayResizePayload,
} from './types/terminal.js';
import {
  buildTracevaneBeforePromptBuildResult,
  buildTracevaneBeforeToolCallResult,
} from './lib/tracevane-delivery-hooks.js';
import {
  getTracevaneChatGlobalHostManagementExecEnabled,
  getTracevaneChatSessionHostManagementExecEnabled,
  setTracevaneChatGlobalHostManagementExecEnabled,
  setTracevaneChatSessionHostManagementExecEnabled,
} from './lib/tracevane-chat-management-policy.js';
import { maybeHandleTracevaneReplyDispatch } from './lib/tracevane-reply-dispatch.js';
import { resolveTracevaneDeliveryTool } from './lib/tracevane-delivery-tool.js';
import { resolvePluginHostContext } from './lib/plugin-host-compat.js';
import {
  isTracevaneGatewayHttpAuthorized,
  rejectTracevaneGatewayHttpUnauthorized,
  syncTracevaneGatewayHttpAuthCookie,
} from './apps/api/gateway-http-auth.js';

let tracevaneServer: ReturnType<typeof createTracevaneServer> | null = null;
let tracevaneContext: ReturnType<typeof createTracevaneContext> | null = null;

function buildGatewayMethodError(message: string, code = 'BAD_REQUEST') {
  return {
    code,
    message,
  };
}

const tracevanePlugin = {
  id: 'tracevane',
  name: 'Tracevane',
  description: 'Tracevane 本地 AI Agent 控制工作台，聚焦 Gateway、Channel Connectors、CLI Agent 和运行态自愈。',
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
                default: '/tracevane',
              },
            },
          },
        },
      },
      chat: {
        type: 'object',
        properties: {
          allowHostManagementExecInTracevaneChat: {
            type: 'boolean',
            default: false,
          },
        },
      },
    },
  },
  register(api: OpenClawPluginApi) {
    const tracevaneChatConfig = (
      api.pluginConfig
      && typeof api.pluginConfig.chat === 'object'
      && api.pluginConfig.chat
    )
      ? api.pluginConfig.chat as { allowHostManagementExecInTracevaneChat?: unknown }
      : null;
    setTracevaneChatGlobalHostManagementExecEnabled(
      tracevaneChatConfig?.allowHostManagementExecInTracevaneChat === true,
    );
    const ensureTracevaneRuntime = () => {
      const config = createTracevaneConfig(api, api.pluginConfig || {});
      if (!tracevaneContext) {
        tracevaneContext = createTracevaneContext({
          config,
          logger: api.logger,
        });
      }
      return {
        config,
        ctx: tracevaneContext,
      };
    };
    const registerHttpRoute = typeof api.registerHttpRoute === 'function'
      ? api.registerHttpRoute.bind(api)
      : null;
    const registerGatewayMethod = typeof api.registerGatewayMethod === 'function'
      ? api.registerGatewayMethod.bind(api)
      : null;

    api.registerTool((ctx) => resolveTracevaneDeliveryTool(ctx), {
      name: 'tracevane_delivery',
    });
    api.on?.('before_prompt_build', (_event, ctx) => {
      const host = resolvePluginHostContext(ctx);
      return (
      buildTracevaneBeforePromptBuildResult({
        sessionKey: host.sessionKey,
        channelId: host.channelId,
      })
      );
    }, { priority: 100 });
    api.on?.('before_tool_call', (event, ctx) => {
      const host = resolvePluginHostContext(ctx);
      const result = buildTracevaneBeforeToolCallResult({
        toolName: event.toolName,
        toolParams: event.params || {},
        sessionKey: host.sessionKey,
        channelId: host.channelId,
      });
      if (result?.block) {
        api.logger.warn(`tracevane: blocked tool call in Tracevane webchat (tool=${event.toolName}): ${result.blockReason}`);
      }
      return result;
    }, { priority: 100 });
    api.on?.('reply_dispatch', (event, ctx) => {
      return maybeHandleTracevaneReplyDispatch(event as Record<string, unknown> as {
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
      const { config, ctx } = ensureTracevaneRuntime();
      if (isTracevaneGatewayEnabled(config)) {
        if (!registerHttpRoute || !registerGatewayMethod) {
          api.logger.warn('tracevane: gateway exposure requested but host plugin API lacks route registration; skipping gateway runtime');
        } else {
        const requestHandler = createTracevaneRequestHandler(ctx, {
          stripBasePath: config.transport.gateway.basePath,
          runtimeConfig: buildTracevaneClientRuntimeConfig(config, 'gateway'),
        });
        registerHttpRoute({
          path: config.transport.gateway.basePath,
          auth: 'plugin',
          match: 'prefix',
          handler: async (req, res) => {
            if (!isTracevaneGatewayHttpAuthorized(config, req)) {
              rejectTracevaneGatewayHttpUnauthorized(res, req);
              return true;
            }
            syncTracevaneGatewayHttpAuthCookie(config, req, res);
            return requestHandler(req, res);
          },
        });
        api.logger.info(`tracevane: gateway HTTP route registered at ${config.transport.gateway.basePath}`);

        const withConnId = (client: { connId?: string } | null): string => {
          const connId = String(client?.connId || '').trim();
          if (!connId) {
            throw new Error('gateway connId is required');
          }
          return connId;
        };

        registerGatewayMethod(TRACEVANE_CHAT_GATEWAY_METHODS.attach, async (opts) => {
          try {
            const connId = withConnId(opts.client);
            const connIds = new Set([connId]);
            const payload = await ctx.services.chat.attachGatewayClient(
              opts.params as unknown as ChatGatewayAttachPayload,
              {
                connId,
                emit: (event) => {
                  opts.context.broadcastToConnIds(TRACEVANE_CHAT_GATEWAY_EVENT, event, connIds, {
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

        registerGatewayMethod(TRACEVANE_CHAT_GATEWAY_METHODS.heartbeat, (opts) => {
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

        registerGatewayMethod(TRACEVANE_CHAT_GATEWAY_METHODS.detach, (opts) => {
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

        registerGatewayMethod(TRACEVANE_CHAT_GATEWAY_METHODS.send, async (opts) => {
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

        registerGatewayMethod(TRACEVANE_CHAT_GATEWAY_METHODS.abort, async (opts) => {
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

        registerGatewayMethod(TRACEVANE_CHAT_GATEWAY_METHODS.policySync, (opts) => {
          try {
            const payload = opts.params as unknown as ChatGatewayPolicySyncPayload;
            const sessionKey = String(payload?.sessionKey || '').trim();
            if (typeof payload?.globalHostManagementExecEnabled === 'boolean') {
              setTracevaneChatGlobalHostManagementExecEnabled(payload.globalHostManagementExecEnabled);
            }
            if (sessionKey) {
              setTracevaneChatSessionHostManagementExecEnabled(
                sessionKey,
                payload?.allowHostManagementExec === true,
              );
            }
            opts.respond(true, {
              ok: true,
              sessionKey: sessionKey || null,
              globalHostManagementExecEnabled: getTracevaneChatGlobalHostManagementExecEnabled(),
              allowHostManagementExec: sessionKey
                ? getTracevaneChatSessionHostManagementExecEnabled(sessionKey)
                : null,
            });
          } catch (error) {
            opts.respond(false, undefined, buildGatewayMethodError(
              error instanceof Error ? error.message : 'chat_policy_sync_failed',
              'CHAT_POLICY_SYNC_FAILED',
            ));
          }
        }, { scope: 'operator.read' });

        registerGatewayMethod(TRACEVANE_TERMINAL_GATEWAY_METHODS.attach, (opts) => {
          try {
            const connId = withConnId(opts.client);
            const connIds = new Set([connId]);
            const payload = ctx.services.terminal.attachGatewayClient(
              opts.params as unknown as TerminalGatewayAttachPayload,
              {
                connId,
                emit: (event) => {
                  opts.context.broadcastToConnIds(TRACEVANE_TERMINAL_GATEWAY_EVENT, event, connIds);
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

        registerGatewayMethod(TRACEVANE_TERMINAL_GATEWAY_METHODS.input, (opts) => {
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

        registerGatewayMethod(TRACEVANE_TERMINAL_GATEWAY_METHODS.resize, (opts) => {
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

        registerGatewayMethod(TRACEVANE_TERMINAL_GATEWAY_METHODS.heartbeat, (opts) => {
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

        registerGatewayMethod(TRACEVANE_TERMINAL_GATEWAY_METHODS.clear, (opts) => {
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

        registerGatewayMethod(TRACEVANE_TERMINAL_GATEWAY_METHODS.detach, (opts) => {
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
      id: 'tracevane-server',
      start: async () => {
        const { config, ctx } = ensureTracevaneRuntime();
        if (!isTracevaneStandaloneEnabled(config)) {
          api.logger.info('tracevane: standalone exposure disabled; skipping standalone HTTP server');
          return;
        }
        if (tracevaneServer?.isRunning()) return;

        tracevaneServer = createTracevaneServer(ctx);
        await tracevaneServer.start();
      },
      stop: async () => {
        if (!tracevaneServer) return;
        await tracevaneServer.stop();
        tracevaneServer = null;
      },
    });

    api.logger.info('tracevane: management foundation, delivery tool, and Tracevane chat hooks registered');
  },
};

export const plugin = tracevanePlugin;
export default tracevanePlugin;
