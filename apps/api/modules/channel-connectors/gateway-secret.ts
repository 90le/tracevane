import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ChannelConnectorsDaemonRuntimeConfig,
} from "../../../../types/channel-connectors.js";

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function readGatewayClientKey(filePath: string): string | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      secrets?: Record<string, { value?: unknown }>;
    };
    return normalizeString(raw.secrets?.["gateway:client-api-key"]?.value) || null;
  } catch {
    return null;
  }
}

export function channelConnectorGatewaySecretCandidates(
  config: Pick<ChannelConnectorsDaemonRuntimeConfig, "paths">,
): string[] {
  const home = normalizeString(process.env.HOME) || os.homedir();
  return uniqueStrings([
    path.resolve(config.paths.root, "..", "..", "model-gateway", "secrets.json"),
    path.join(home, ".openclaw", "tracevane", "model-gateway", "secrets.json"),
    path.join(home, ".config", "tracevane", "model-gateway", "secrets.json"),
  ]);
}

export function resolveChannelConnectorGatewayClientKey(
  config: Pick<ChannelConnectorsDaemonRuntimeConfig, "paths">,
): string | null {
  const envKey = normalizeString(process.env.TRACEVANE_GATEWAY_API_KEY)
    || normalizeString(process.env.OPENCLAW_TRACEVANE_GATEWAY_API_KEY);
  if (envKey) return envKey;
  for (const filePath of channelConnectorGatewaySecretCandidates(config)) {
    const key = readGatewayClientKey(filePath);
    if (key) return key;
  }
  return null;
}
