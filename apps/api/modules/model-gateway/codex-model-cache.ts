import fs from "node:fs";
import path from "node:path";

import type { ModelGatewayProviderModel } from "../../../../types/model-gateway.js";

export interface CodexModelCacheReadResult {
  state: "current" | "stale" | "missing" | "invalid";
  fetchedAt: string | null;
  clientVersion: string | null;
  etag: string | null;
  models: ModelGatewayProviderModel[];
}

const CODEX_MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const CODEX_MODEL_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1_024 && value <= 10_000_000
    ? value
    : null;
}

function cacheModel(value: unknown): ModelGatewayProviderModel | null {
  const item = record(value);
  if (!item) return null;
  const id = text(item.slug) || text(item.id);
  if (!id || !CODEX_MODEL_ID_PATTERN.test(id)) return null;
  if (item.supported_in_api === false || text(item.visibility) === "hide") return null;
  const contextWindow = positiveInteger(item.max_context_window)
    ?? positiveInteger(item.context_window);
  const maxOutputTokens = positiveInteger(item.max_output_tokens);
  const label = text(item.display_name) || text(item.displayName);
  return {
    id,
    ...(label && label.toLowerCase() !== id.toLowerCase() ? { label } : {}),
    ...(contextWindow ? { contextWindow } : {}),
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
  };
}

export function readCodexModelCache(homeDir: string): CodexModelCacheReadResult {
  const cachePath = path.join(homeDir, ".codex", "models_cache.json");
  if (!fs.existsSync(cachePath)) {
    return { state: "missing", fetchedAt: null, clientVersion: null, etag: null, models: [] };
  }
  try {
    const source = record(JSON.parse(fs.readFileSync(cachePath, "utf8")));
    if (!source || !Array.isArray(source.models)) {
      return { state: "invalid", fetchedAt: null, clientVersion: null, etag: null, models: [] };
    }
    const models = source.models
      .map(cacheModel)
      .filter((model): model is ModelGatewayProviderModel => Boolean(model));
    if (!models.length) {
      return {
        state: "invalid",
        fetchedAt: text(source.fetched_at),
        clientVersion: text(source.client_version),
        etag: text(source.etag),
        models: [],
      };
    }
    const fetchedAt = text(source.fetched_at);
    const fetchedAtMs = fetchedAt ? Date.parse(fetchedAt) : Number.NaN;
    if (!Number.isFinite(fetchedAtMs)) {
      return { state: "invalid", fetchedAt, clientVersion: text(source.client_version), etag: text(source.etag), models: [] };
    }
    return {
      state: Date.now() - fetchedAtMs > CODEX_MODEL_CACHE_MAX_AGE_MS ? "stale" : "current",
      fetchedAt,
      clientVersion: text(source.client_version),
      etag: text(source.etag),
      models,
    };
  } catch {
    return { state: "invalid", fetchedAt: null, clientVersion: null, etag: null, models: [] };
  }
}
