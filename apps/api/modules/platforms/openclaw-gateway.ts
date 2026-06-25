import type { TracevaneServerConfig } from '../../../../types/api.js';
import { ChatServiceError, buildChatError } from '../chat/errors.js';
import { requestGateway } from '../chat/openclaw-runtime/gateway-request.js';
import { normalizeString } from '../chat/shared.js';

export interface OpenClawGatewayRequest {
  method: string;
  params?: Record<string, unknown> | null;
}

function normalizeOpenClawGatewayParams(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
}

function requireGatewayTargetKey(params: Record<string, unknown>, method: string): string {
  const key = normalizeString(params.key || params.sessionKey);
  if (!key) {
    throw new ChatServiceError(
      400,
      buildChatError('invalid_request', `OpenClaw gateway method '${method}' requires a session key`),
    );
  }
  return key;
}

export async function requestOpenClawGateway(
  config: TracevaneServerConfig,
  payload: OpenClawGatewayRequest,
): Promise<unknown> {
  const method = normalizeString(payload?.method).toLowerCase();
  const params = normalizeOpenClawGatewayParams(payload?.params);

  switch (method) {
    case 'models.list':
      return await requestGateway<Record<string, unknown>>(config, 'models.list', {});
    case 'skills.status':
      return await requestGateway<Record<string, unknown>>(config, 'skills.status', {
        agentId: normalizeString(params.agentId),
      });
    case 'agents.list':
      return await requestGateway<Record<string, unknown>>(config, 'agents.list', {});
    case 'sessions.list':
      return await requestGateway<Record<string, unknown>>(config, 'sessions.list', {});
    case 'config.get':
      return await requestGateway<Record<string, unknown>>(config, 'config.get', {});
    case 'config.schema.lookup':
      return await requestGateway<Record<string, unknown>>(config, 'config.schema.lookup', {
        path: normalizeString(params.path),
      });
    case 'exec.approvals.get':
      return await requestGateway<Record<string, unknown>>(config, 'exec.approvals.get', {});
    case 'exec.approvals.set':
      return await requestGateway<Record<string, unknown>>(config, 'exec.approvals.set', {
        baseHash: normalizeString(params.baseHash),
        file: params.file,
      });
    case 'exec.approvals.node.get':
      return await requestGateway<Record<string, unknown>>(config, 'exec.approvals.node.get', {
        nodeId: normalizeString(params.nodeId),
      });
    case 'exec.approvals.node.set':
      return await requestGateway<Record<string, unknown>>(config, 'exec.approvals.node.set', {
        nodeId: normalizeString(params.nodeId),
        baseHash: normalizeString(params.baseHash),
        file: params.file,
      });
    case 'tools.effective': {
      const key = requireGatewayTargetKey(params, method);
      return await requestGateway<Record<string, unknown>>(config, 'tools.effective', {
        sessionKey: key,
      });
    }
    case 'sessions.compact': {
      const key = requireGatewayTargetKey(params, method);
      return await requestGateway<Record<string, unknown>>(config, 'sessions.compact', {
        key,
      });
    }
    case 'sessions.patch': {
      const key = requireGatewayTargetKey(params, method);
      return await requestGateway<Record<string, unknown>>(config, 'sessions.patch', {
        ...params,
        key,
      });
    }
    case 'sessions.steer': {
      const key = requireGatewayTargetKey(params, method);
      return await requestGateway<Record<string, unknown>>(config, 'sessions.steer', {
        ...params,
        key,
      });
    }
    case 'chat.abort': {
      const key = requireGatewayTargetKey(params, method);
      return await requestGateway<Record<string, unknown>>(config, 'chat.abort', {
        sessionKey: key,
      });
    }
    case 'chat.send': {
      const key = requireGatewayTargetKey(params, method);
      return await requestGateway<Record<string, unknown>>(config, 'chat.send', {
        ...params,
        sessionKey: key,
      });
    }
    default:
      throw new ChatServiceError(
        400,
        buildChatError('invalid_request', `Unsupported OpenClaw gateway method '${method || '<empty>'}'`),
      );
  }
}
