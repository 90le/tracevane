import crypto from 'node:crypto';
import { WebSocket } from 'ws';
import { ChatServiceError, buildChatError } from '../errors.js';
import type { GatewaySignatureVersion } from './gateway-auth.js';

export interface BridgePendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface SessionGatewayBridge {
  sessionKey: string;
  ws: WebSocket | null;
  readyPromise: Promise<void> | null;
  resolveReady: (() => void) | null;
  rejectReady: ((error: unknown) => void) | null;
  connectRequestId: string | null;
  pending: Map<string, BridgePendingRequest>;
  subscribers: number;
  manualClose: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  signatureVersion: GatewaySignatureVersion;
  pendingSignatureRetry: boolean;
  signatureRetryBudgetUsed: boolean;
  pendingPairingRetry: boolean;
  pairingRetryBudgetUsed: boolean;
}

export function createSessionGatewayBridge(sessionKey: string): SessionGatewayBridge {
  return {
    sessionKey,
    ws: null,
    readyPromise: null,
    resolveReady: null,
    rejectReady: null,
    connectRequestId: null,
    pending: new Map<string, BridgePendingRequest>(),
    subscribers: 0,
    manualClose: false,
    reconnectTimer: null,
    signatureVersion: 'v2',
    pendingSignatureRetry: false,
    signatureRetryBudgetUsed: false,
    pendingPairingRetry: false,
    pairingRetryBudgetUsed: false,
  };
}

export function rejectBridgePending(bridge: SessionGatewayBridge, error: unknown): void {
  for (const [requestId, pending] of bridge.pending.entries()) {
    clearTimeout(pending.timer);
    pending.reject(error);
    bridge.pending.delete(requestId);
  }
}

export async function requestViaBridge<T>(
  bridge: SessionGatewayBridge,
  method: string,
  params: Record<string, unknown>
): Promise<T> {
  const requestId = `req-${crypto.randomUUID()}`;
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      bridge.pending.delete(requestId);
      reject(new ChatServiceError(504, buildChatError('gateway_down', `Gateway bridge timed out for ${method}.`, 'gateway', true)));
    }, 15_000);

    bridge.pending.set(requestId, {
      resolve: (value) => resolve(value as T),
      reject,
      timer,
    });

    if (!bridge.ws || bridge.ws.readyState !== WebSocket.OPEN) {
      clearTimeout(timer);
      bridge.pending.delete(requestId);
      reject(new ChatServiceError(502, buildChatError('gateway_down', 'Gateway bridge is not connected.', 'gateway', true)));
      return;
    }

    bridge.ws.send(JSON.stringify({
      type: 'req',
      id: requestId,
      method,
      params,
    }));
  });
}
