import type {
  ChannelConnectorOctoReplyPlan,
  ChannelConnectorOctoTransportConfig,
  ChannelConnectorOctoTransportResult,
  ChannelConnectorPlatformBinding,
} from "../../../../types/channel-connectors.js";

const OCTO_TEXT_MESSAGE_TYPE = 1;
const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordFrom(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function octoTransportFromBinding(binding: ChannelConnectorPlatformBinding): ChannelConnectorOctoTransportConfig | null {
  const metadata = recordFrom(binding.metadata);
  const apiUrl = normalizeString(metadata.apiUrl || metadata.api_url);
  const botToken = normalizeString(metadata.botToken || metadata.bot_token || metadata.token);
  if (!apiUrl || !botToken) return null;
  const wsUrl = normalizeString(metadata.wsUrl || metadata.ws_url);
  return {
    apiUrl,
    botToken,
    wsUrl: wsUrl || null,
  };
}

function transportResult(
  input: Partial<ChannelConnectorOctoTransportResult> & Pick<ChannelConnectorOctoTransportResult, "action">,
): ChannelConnectorOctoTransportResult {
  return {
    attempted: input.attempted ?? false,
    ok: input.ok ?? null,
    action: input.action,
    apiUrl: input.apiUrl ?? null,
    statusCode: input.statusCode ?? null,
    error: input.error ?? null,
    requestCount: input.requestCount ?? 0,
    robotId: input.robotId ?? null,
    imToken: input.imToken ?? null,
    wsUrl: input.wsUrl ?? null,
  };
}

export function emptyOctoTransportResult(action: ChannelConnectorOctoTransportResult["action"] = "none"): ChannelConnectorOctoTransportResult {
  return transportResult({ action });
}

async function postOctoJson(
  config: ChannelConnectorOctoTransportConfig,
  path: string,
  payload: unknown,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.apiUrl.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.botToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    if (raw) {
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        body = { raw };
      }
    }
    if (!response.ok) {
      throw Object.assign(new Error(`Octo API ${path} failed with HTTP ${response.status}`), {
        statusCode: response.status,
        body,
      });
    }
    return {
      statusCode: response.status,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Octo transport request failed.";
}

function errorStatusCode(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const value = Number((error as { statusCode?: unknown }).statusCode);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

export async function registerOctoBot(
  config: ChannelConnectorOctoTransportConfig,
  forceRefresh = false,
): Promise<ChannelConnectorOctoTransportResult> {
  const path = forceRefresh ? "/v1/bot/register?force_refresh=true" : "/v1/bot/register";
  try {
    const response = await postOctoJson(config, path, {});
    return transportResult({
      attempted: true,
      ok: true,
      action: "register",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount: 1,
      robotId: normalizeString(response.body.robot_id),
      imToken: normalizeString(response.body.im_token),
      wsUrl: normalizeString(response.body.ws_url) || config.wsUrl || null,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "register",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: 1,
    });
  }
}

export async function sendOctoTyping(
  config: ChannelConnectorOctoTransportConfig,
  channelId: string,
  channelType: number,
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await postOctoJson(config, "/v1/bot/typing", {
      channel_id: channelId,
      channel_type: channelType,
    });
    return transportResult({
      attempted: true,
      ok: true,
      action: "typing",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount: 1,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "typing",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: 1,
    });
  }
}

export async function sendOctoTextReply(
  config: ChannelConnectorOctoTransportConfig,
  replyPlan: ChannelConnectorOctoReplyPlan,
): Promise<ChannelConnectorOctoTransportResult> {
  let requestCount = 0;
  try {
    let lastStatusCode: number | null = null;
    for (const payload of replyPlan.payloads) {
      requestCount += 1;
      const response = await postOctoJson(config, "/v1/bot/sendMessage", {
        channel_id: payload.channel_id,
        channel_type: payload.channel_type,
        payload: {
          type: OCTO_TEXT_MESSAGE_TYPE,
          content: payload.payload.content,
          ...(payload.payload.mention ? { mention: payload.payload.mention } : {}),
        },
      });
      lastStatusCode = response.statusCode;
    }
    return transportResult({
      attempted: true,
      ok: true,
      action: "send-message",
      apiUrl: config.apiUrl,
      statusCode: lastStatusCode,
      requestCount,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "send-message",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount,
    });
  }
}
