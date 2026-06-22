import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { sendJson } from "../../core/http.js";
import {
  MODEL_GATEWAY_REALTIME_UNSUPPORTED_CODE,
  MODEL_GATEWAY_REALTIME_UNSUPPORTED_MESSAGE,
  MODEL_GATEWAY_REALTIME_UNSUPPORTED_UPGRADE_PATHS,
} from "./unsupported-endpoints.js";

const MODEL_GATEWAY_REALTIME_PATHS = new Set(MODEL_GATEWAY_REALTIME_UNSUPPORTED_UPGRADE_PATHS);

const realtimeUnsupportedServer = new WebSocketServer({ noServer: true });

function requestPath(req: http.IncomingMessage): string {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  return url.pathname.replace(/\/+$/g, "") || "/";
}

export function isModelGatewayRealtimePath(req: http.IncomingMessage): boolean {
  const pathname = requestPath(req);
  return MODEL_GATEWAY_REALTIME_PATHS.has(pathname);
}

export function modelGatewayRealtimeUnsupportedPayload(endpoint?: string): Record<string, unknown> {
  return {
    error: {
      code: MODEL_GATEWAY_REALTIME_UNSUPPORTED_CODE,
      message: MODEL_GATEWAY_REALTIME_UNSUPPORTED_MESSAGE,
      details: {
        ...(endpoint ? { endpoint } : {}),
        providerType: "gateway",
        feasibility: "blocked-no-verified-gateway-websocket-proxy-contract",
        reference:
          "OpenAI documents Responses WebSocket mode plus Realtime voice, translation, and transcription sessions, but Tracevane Gateway has not verified a safe WebSocket/WebRTC/SIP proxy contract yet; these routes stay explicit unsupported until turn state, binary/audio frames, and session lifecycle are tested end-to-end.",
        alternatives: [
          "Use /v1/responses for Codex account text and tool workflows.",
          "Use /v1/chat/completions or /v1/messages through Gateway protocol conversion.",
          "For realtime voice, translation, or transcription sessions, connect directly to an official/OpenAI-compatible realtime provider until Tracevane Gateway has a verified WebSocket/WebRTC bridge.",
        ],
      },
    },
  };
}

export function sendModelGatewayRealtimeUnsupported(res: http.ServerResponse, endpoint?: string): void {
  sendJson(res, 501, modelGatewayRealtimeUnsupportedPayload(endpoint));
}

export function handleModelGatewayRealtimeUnsupportedUpgrade(
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer,
): boolean {
  if (!isModelGatewayRealtimePath(req)) return false;
  const endpoint = requestPath(req) === "/v1/responses" ? "/v1/responses#websocket" : requestPath(req);

  realtimeUnsupportedServer.handleUpgrade(req, socket, head, (ws) => {
    ws.send(JSON.stringify({
      type: "error",
      ...modelGatewayRealtimeUnsupportedPayload(endpoint),
    }), () => {
      ws.close(1003, "realtime unsupported");
    });
  });
  return true;
}
