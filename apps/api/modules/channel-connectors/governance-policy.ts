import fs from "node:fs";
import path from "node:path";
import type {
  ChannelConnectorPlatformId,
} from "../../../../types/channel-connectors.js";

interface ChannelConnectorGovernanceBinding {
  id: string;
  allowlist: string[];
  adminUsers: string[];
  metadata?: Record<string, unknown>;
}

export interface ChannelConnectorGovernanceDecision {
  allowed: boolean;
  skippedReason: string | null;
  detail: string | null;
  rateLimit: {
    limit: number | null;
    windowSeconds: number | null;
    remaining: number | null;
  };
}

interface ChannelConnectorGovernanceBucket {
  key: string;
  bindingId: string;
  platform: ChannelConnectorPlatformId;
  fromUid: string;
  windowStartMs: number;
  windowSeconds: number;
  count: number;
}

interface ChannelConnectorGovernanceState {
  version: 1;
  updatedAt: string;
  buckets: ChannelConnectorGovernanceBucket[];
}

const DEFAULT_RATE_WINDOW_SECONDS = 60;
const MAX_BUCKETS = 2000;

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function lowerIdentity(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataValue(binding: ChannelConnectorGovernanceBinding, keys: string[]): unknown {
  const metadata = isRecord(binding.metadata) ? binding.metadata : {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) return metadata[key];
  }
  return undefined;
}

function metadataStringList(binding: ChannelConnectorGovernanceBinding, keys: string[]): string[] {
  const value = metadataValue(binding, keys);
  if (Array.isArray(value)) return value.map(normalizeString).filter(Boolean);
  const normalized = normalizeString(value);
  if (!normalized) return [];
  return normalized.split(/[\n,]/).map(normalizeString).filter(Boolean);
}

function metadataNumber(binding: ChannelConnectorGovernanceBinding, keys: string[], fallback: number | null): number | null {
  const value = metadataValue(binding, keys);
  if (value === undefined || value === null || value === "") return fallback;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function emptyState(): ChannelConnectorGovernanceState {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    buckets: [],
  };
}

function readState(filePath: string): ChannelConnectorGovernanceState {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!isRecord(raw) || !Array.isArray(raw.buckets)) return emptyState();
    return {
      version: 1,
      updatedAt: normalizeString(raw.updatedAt) || new Date().toISOString(),
      buckets: raw.buckets
        .map((value): ChannelConnectorGovernanceBucket | null => {
          if (!isRecord(value)) return null;
          const key = normalizeString(value.key);
          const bindingId = normalizeString(value.bindingId);
          const fromUid = normalizeString(value.fromUid);
          const platform = normalizeString(value.platform) as ChannelConnectorPlatformId;
          const windowStartMs = Number(value.windowStartMs);
          const windowSeconds = Number(value.windowSeconds);
          const count = Number(value.count);
          if (!key || !bindingId || !fromUid || !platform) return null;
          if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowSeconds) || !Number.isFinite(count)) return null;
          return {
            key,
            bindingId,
            platform,
            fromUid,
            windowStartMs,
            windowSeconds,
            count,
          };
        })
        .filter((bucket): bucket is ChannelConnectorGovernanceBucket => Boolean(bucket)),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

function writeState(filePath: string, state: ChannelConnectorGovernanceState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const next: ChannelConnectorGovernanceState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    buckets: state.buckets.slice(-MAX_BUCKETS),
  };
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function matchesIdentity(value: string, candidates: string[]): boolean {
  const target = lowerIdentity(value);
  if (!target) return false;
  return candidates.some((candidate) => {
    const normalized = lowerIdentity(candidate);
    return normalized === "*" || normalized === "all" || normalized === target;
  });
}

function allowlistDecision(binding: ChannelConnectorGovernanceBinding, fromUid: string): ChannelConnectorGovernanceDecision | null {
  if (!binding.allowlist.length) return null;
  if (matchesIdentity(fromUid, binding.allowlist) || matchesIdentity(fromUid, binding.adminUsers)) return null;
  return {
    allowed: false,
    skippedReason: "channel_user_not_allowed",
    detail: "sender_not_in_allowlist",
    rateLimit: {
      limit: null,
      windowSeconds: null,
      remaining: null,
    },
  };
}

function bannedWordsDecision(binding: ChannelConnectorGovernanceBinding, content: string): ChannelConnectorGovernanceDecision | null {
  const words = metadataStringList(binding, [
    "bannedWords",
    "banned_words",
    "blockedWords",
    "blocked_words",
    "denyWords",
    "deny_words",
  ]);
  if (!words.length) return null;
  const haystack = content.toLowerCase();
  const matched = words.find((word) => haystack.includes(word.toLowerCase()));
  if (!matched) return null;
  return {
    allowed: false,
    skippedReason: "channel_banned_word",
    detail: `matched:${matched}`,
    rateLimit: {
      limit: null,
      windowSeconds: null,
      remaining: null,
    },
  };
}

function rateLimitDecision(input: {
  binding: ChannelConnectorGovernanceBinding;
  platform: ChannelConnectorPlatformId;
  fromUid: string;
  statePath?: string | null;
  nowMs: number;
}): ChannelConnectorGovernanceDecision | null {
  const limit = metadataNumber(input.binding, [
    "rateLimitPerMinute",
    "rate_limit_per_minute",
    "messagesPerMinute",
    "messages_per_minute",
    "maxMessagesPerMinute",
    "max_messages_per_minute",
  ], null);
  if (!limit || limit <= 0) return null;
  const windowSeconds = Math.max(1, Math.min(3600, metadataNumber(input.binding, [
    "rateLimitWindowSeconds",
    "rate_limit_window_seconds",
  ], DEFAULT_RATE_WINDOW_SECONDS) || DEFAULT_RATE_WINDOW_SECONDS));
  const statePath = normalizeString(input.statePath);
  if (!statePath) return null;
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(input.nowMs / windowMs) * windowMs;
  const key = `${input.binding.id}:${input.platform}:${input.fromUid}:${windowStartMs}:${windowSeconds}`;
  const state = readState(statePath);
  state.buckets = state.buckets.filter((bucket) => input.nowMs - bucket.windowStartMs <= Math.max(windowMs * 2, 120000));
  let bucket = state.buckets.find((candidate) => candidate.key === key);
  if (!bucket) {
    bucket = {
      key,
      bindingId: input.binding.id,
      platform: input.platform,
      fromUid: input.fromUid,
      windowStartMs,
      windowSeconds,
      count: 0,
    };
    state.buckets.push(bucket);
  }
  bucket.count += 1;
  writeState(statePath, state);
  const remaining = Math.max(0, Math.floor(limit) - bucket.count);
  if (bucket.count > limit) {
    return {
      allowed: false,
      skippedReason: "channel_rate_limited",
      detail: `limit:${Math.floor(limit)}/${windowSeconds}s`,
      rateLimit: {
        limit: Math.floor(limit),
        windowSeconds,
        remaining,
      },
    };
  }
  return {
    allowed: true,
    skippedReason: null,
    detail: null,
    rateLimit: {
      limit: Math.floor(limit),
      windowSeconds,
      remaining,
    },
  };
}

export function evaluateChannelConnectorGovernance(input: {
  binding: ChannelConnectorGovernanceBinding;
  platform: ChannelConnectorPlatformId;
  fromUid: string;
  content: string;
  statePath?: string | null;
  now?: Date;
}): ChannelConnectorGovernanceDecision {
  const fromUid = normalizeString(input.fromUid);
  const content = normalizeString(input.content);
  const allowlist = allowlistDecision(input.binding, fromUid);
  if (allowlist) return allowlist;
  const bannedWords = bannedWordsDecision(input.binding, content);
  if (bannedWords) return bannedWords;
  const rateLimit = rateLimitDecision({
    binding: input.binding,
    platform: input.platform,
    fromUid,
    statePath: input.statePath,
    nowMs: (input.now || new Date()).getTime(),
  });
  if (rateLimit?.allowed === false) return rateLimit;
  return {
    allowed: true,
    skippedReason: null,
    detail: null,
    rateLimit: rateLimit?.rateLimit || {
      limit: null,
      windowSeconds: null,
      remaining: null,
    },
  };
}
