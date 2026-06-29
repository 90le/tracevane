import crypto from "node:crypto";
import { WebSocket } from "ws";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import { OPENCLAW_GATEWAY_CLOSE_CODE_MAP } from "./openclaw-gateway-error.js";
import {
  buildOpenClawGatewayError,
  OpenClawGatewayServiceError,
  mapOpenClawGatewayContractError,
} from "./openclaw-gateway-error.js";
import {
  buildGatewayConnectRequest,
  loadGatewayAuthContext,
  type GatewaySignatureVersion,
} from "./openclaw-gateway-auth.js";
import { normalizeString } from "./openclaw-gateway-shared.js";

export interface GatewayConnectOptions {
  role?: string;
  scopes?: string[];
  timeoutMs?: number;
}

function readGatewayConnectErrorCode(frame: Record<string, any>): string {
  return normalizeString(
    frame.error?.details?.code || frame.error?.code,
  ).toUpperCase();
}

async function requestGatewayOnce<T>(
  config: TracevaneServerConfig,
  method: string,
  params: Record<string, unknown>,
  options: GatewayConnectOptions,
  signatureVersion: GatewaySignatureVersion,
  allowSignatureRetry: boolean,
): Promise<T> {
  const auth = loadGatewayAuthContext(config);
  const role = options.role || "operator";
  const scopes = options.scopes || auth.scopes;
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && (options.timeoutMs || 0) > 0
      ? Math.trunc(options.timeoutMs || 0)
      : 15_000;

  return await new Promise<T>((resolve, reject) => {
    const ws = new WebSocket(config.gatewayWsUrl);
    let requested = false;
    const targetRequestId = `req-${crypto.randomUUID()}`;
    const connectRequestId = `connect-${crypto.randomUUID()}`;
    const timeout = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      reject(
        new OpenClawGatewayServiceError(
          504,
          buildOpenClawGatewayError(
            "gateway_down",
            `Gateway request timed out for ${method}.`,
            "gateway",
            true,
          ),
        ),
      );
    }, timeoutMs);

    const finish = (fn: () => void): void => {
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {}
      fn();
    };

    ws.on("message", (raw) => {
      let frame: Record<string, any>;
      try {
        frame = JSON.parse(String(raw));
      } catch (error) {
        finish(() => reject(error));
        return;
      }

      if (frame.type === "event" && frame.event === "connect.challenge") {
        ws.send(
          JSON.stringify(
            buildGatewayConnectRequest({
              auth,
              connectRequestId,
              nonce: normalizeString(frame.payload?.nonce),
              role,
              scopes,
              signatureVersion,
            }),
          ),
        );
        return;
      }

      if (frame.type === "res" && frame.id === connectRequestId) {
        if (!frame.ok) {
          const connectErrorCode = readGatewayConnectErrorCode(frame);
          if (
            allowSignatureRetry &&
            connectErrorCode === "DEVICE_AUTH_SIGNATURE_INVALID"
          ) {
            finish(() => {
              void requestGatewayOnce<T>(
                config,
                method,
                params,
                options,
                signatureVersion === "v2" ? "v3" : "v2",
                false,
              ).then(resolve, reject);
            });
            return;
          }
          finish(() =>
            reject(
              new OpenClawGatewayServiceError(
                502,
                mapOpenClawGatewayContractError(
                  new Error(
                    normalizeString(
                      frame.error?.message,
                      "Gateway connect failed",
                    ),
                  ),
                  "Gateway connect failed",
                ),
              ),
            ),
          );
          return;
        }

        if (!requested) {
          requested = true;
          ws.send(
            JSON.stringify({
              type: "req",
              id: targetRequestId,
              method,
              params,
            }),
          );
        }
        return;
      }

      if (frame.type === "res" && frame.id === targetRequestId) {
        if (!frame.ok) {
          finish(() =>
            reject(
              new OpenClawGatewayServiceError(
                400,
                mapOpenClawGatewayContractError(
                  new Error(
                    normalizeString(
                      frame.error?.message,
                      `Gateway ${method} failed`,
                    ),
                  ),
                  `Gateway ${method} failed`,
                ),
              ),
            ),
          );
          return;
        }

        finish(() => resolve(frame.payload as T));
      }
    });

    ws.on("close", (code) => {
      if (requested) return;
      clearTimeout(timeout);
      const mappedCode =
        OPENCLAW_GATEWAY_CLOSE_CODE_MAP[code] || "gateway_down";
      reject(
        new OpenClawGatewayServiceError(
          502,
          buildOpenClawGatewayError(
            mappedCode,
            `Gateway connection closed during ${method}.`,
            "gateway",
            mappedCode === "gateway_down",
          ),
        ),
      );
    });

    ws.on("error", (error) => {
      finish(() =>
        reject(
          new OpenClawGatewayServiceError(
            502,
            mapOpenClawGatewayContractError(error, `Gateway ${method} failed`),
          ),
        ),
      );
    });
  });
}

export async function requestGateway<T>(
  config: TracevaneServerConfig,
  method: string,
  params: Record<string, unknown>,
  options: GatewayConnectOptions = {},
): Promise<T> {
  return await requestGatewayOnce(config, method, params, options, "v2", true);
}
