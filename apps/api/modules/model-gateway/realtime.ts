import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { sendJson } from "../../core/http.js";

const REALTIME_UNSUPPORTED_CODE = "model_gateway_codex_account_realtime_unsupported";
const REALTIME_UNSUPPORTED_MESSAGE =
  "Studio Gateway does not expose Codex account Realtime or Responses WebSocket yet; use /v1/responses, /v1/chat/completions, /v1/messages, or an OpenAI-compatible realtime provider.";

const realtimeUnsupportedServer = new WebSocketServer({ noServer: true });

function requestPath(req: http.IncomingMessage): string {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  return url.pathname.replace(/\/+$/g, "") || "/";
}

export function isModelGatewayRealtimePath(req: http.IncomingMessage): boolean {
  const pathname = requestPath(req);
  return pathname === "/v1/responses/ws" || pathname === "/v1/realtime";
}

export function modelGatewayRealtimeUnsupportedPayload(): Record<string, unknown> {
  return {
    error: {
      code: REALTIME_UNSUPPORTED_CODE,
      message: REALTIME_UNSUPPORTED_MESSAGE,
      details: {
        providerType: "codex-account",
        feasibility: "blocked-no-stable-codex-account-realtime-contract",
        reference:
          "No official or directly verified Codex account Realtime/WebSocket contract is available for Studio Gateway yet; this route stays explicit unsupported until a full turn-state contract is verified and tested.",
        alternatives: [
          "Use /v1/responses for Codex account text and tool workflows.",
          "Use /v1/chat/completions or /v1/messages through Gateway protocol conversion.",
          "Use an OpenAI-compatible realtime/audio provider for realtime or audio routes.",
        ],
      },
    },
  };
}

export function sendModelGatewayRealtimeUnsupported(res: http.ServerResponse): void {
  sendJson(res, 501, modelGatewayRealtimeUnsupportedPayload());
}

export function handleModelGatewayRealtimeUnsupportedUpgrade(
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer,
): boolean {
  if (!isModelGatewayRealtimePath(req)) return false;

  realtimeUnsupportedServer.handleUpgrade(req, socket, head, (ws) => {
    ws.send(JSON.stringify({
      type: "error",
      ...modelGatewayRealtimeUnsupportedPayload(),
    }), () => {
      ws.close(1003, "realtime unsupported");
    });
  });
  return true;
}
