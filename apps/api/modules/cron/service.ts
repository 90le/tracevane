import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import type {
  CronAgentOption,
  CronDeliverySummary,
  CronDetailPayload,
  CronFailureAlertSummary,
  CronFailureDestinationSummary,
  CronJobInput,
  CronJobSummary,
  CronMutationResponse,
  CronPayloadSummary,
  CronRunResponse,
  CronRunSummary,
  CronScheduleSummary,
  CronSchedulerSummary,
  CronSessionOption,
  CronStateSummary,
  CronSummaryPayload,
  CronTargetOption,
} from "../../../../types/cron.js";
import {
  ensureDir,
  listDirectories,
  readJsonFile,
  readOpenClawConfig,
  writeJsonFile,
} from "../../core/state.js";

const execFileAsync = promisify(execFile);

interface CronServiceErrorShape {
  statusCode: number;
  code: string;
  message: string;
}

interface CronStoreShape {
  version?: number;
  jobs?: Array<Record<string, any>>;
}

interface ParsedCronTarget {
  deliveryTargets: CronTargetOption[];
  sessionTargets: CronSessionOption[];
}

class CronServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }

  toShape(): CronServiceErrorShape {
    return {
      statusCode: this.statusCode,
      code: this.code,
      message: this.message,
    };
  }
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    return new Date(value).toISOString();
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  return null;
}

function resolveCronStorePath(
  config: TracevaneServerConfig,
  openclawConfig: Record<string, any>,
): string {
  const configured = normalizeString(openclawConfig.cron?.store);
  if (!configured) return path.join(config.openclawRoot, "cron", "jobs.json");
  return configured.startsWith("~")
    ? path.join(
        config.openclawRoot.replace(/\/?\.openclaw$/, ""),
        configured.slice(2),
      )
    : configured;
}

function resolveRunLogDir(config: TracevaneServerConfig): string {
  return path.join(config.openclawRoot, "cron", "runs");
}

function readCronStore(storePath: string): CronStoreShape {
  return readJsonFile<CronStoreShape>(storePath, { version: 1, jobs: [] });
}

function writeCronStore(storePath: string, store: CronStoreShape): void {
  ensureDir(path.dirname(storePath));
  if (fs.existsSync(storePath)) {
    try {
      fs.copyFileSync(storePath, `${storePath}.bak`);
    } catch {
      // ignore backup failure
    }
  }

  writeJsonFile(storePath, {
    version: store.version || 1,
    jobs: Array.isArray(store.jobs) ? store.jobs : [],
  });
}

function parseDurationMs(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;
  const match = raw.match(/^(\d+)\s*(ms|s|m|h|d)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier =
    unit === "ms"
      ? 1
      : unit === "s"
        ? 1000
        : unit === "m"
          ? 60_000
          : unit === "h"
            ? 3_600_000
            : 86_400_000;
  return value * multiplier;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "";
  if (ms % 86_400_000 === 0) return `${ms / 86_400_000}d`;
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${ms}ms`;
}

function formatScheduleLabel(schedule: CronScheduleSummary): string {
  if (schedule.kind === "every")
    return `every ${formatDuration(schedule.everyMs) || "?"}`;
  if (schedule.kind === "at") return schedule.at || "at";
  const tz = schedule.timezone ? ` · ${schedule.timezone}` : "";
  return `${schedule.expr || "cron"}${tz}`;
}

function parseSchedule(rawSchedule: unknown): CronScheduleSummary {
  if (rawSchedule && typeof rawSchedule === "object") {
    const schedule = rawSchedule as Record<string, any>;
    const kind = normalizeString(
      schedule.kind,
      schedule.everyMs ? "every" : schedule.at ? "at" : "cron",
    ) as CronScheduleSummary["kind"];
    const summary: CronScheduleSummary = {
      kind,
      label: "",
      expr: normalizeString(schedule.expr),
      everyMs: Number.isFinite(Number(schedule.everyMs))
        ? Number(schedule.everyMs)
        : null,
      at: normalizeDate(schedule.atMs) || normalizeDate(schedule.at),
      timezone: normalizeString(schedule.tz) || null,
      staggerMs: Number.isFinite(Number(schedule.staggerMs))
        ? Number(schedule.staggerMs)
        : null,
    };
    summary.label = formatScheduleLabel(summary);
    return summary;
  }

  if (typeof rawSchedule === "string" && rawSchedule.trim()) {
    const summary: CronScheduleSummary = {
      kind: "cron",
      label: rawSchedule.trim(),
      expr: rawSchedule.trim(),
      everyMs: null,
      at: null,
      timezone: null,
      staggerMs: null,
    };
    return summary;
  }

  return {
    kind: "cron",
    label: "unknown",
    expr: "",
    everyMs: null,
    at: null,
    timezone: null,
    staggerMs: null,
  };
}

function parsePayload(rawPayload: unknown): CronPayloadSummary {
  const payload =
    rawPayload && typeof rawPayload === "object"
      ? (rawPayload as Record<string, any>)
      : {};
  const kind = normalizeString(
    payload.kind,
    payload.systemEvent ? "systemEvent" : "agentTurn",
  ) as CronPayloadSummary["kind"];
  return {
    kind,
    message: normalizeString(payload.message),
    systemEvent: normalizeString(payload.systemEvent),
    thinking: normalizeString(payload.thinking),
    timeoutSeconds: Number.isFinite(Number(payload.timeoutSeconds))
      ? Number(payload.timeoutSeconds)
      : null,
    model: normalizeString(payload.model),
    lightContext: normalizeBoolean(payload.lightContext, false),
    expectFinal: normalizeBoolean(payload.expectFinal, false),
  };
}

function readAgentOptions(
  openclawConfig: Record<string, any>,
): CronAgentOption[] {
  const defaults = openclawConfig.agents?.defaults || {};
  const fallbackModel = normalizeString(defaults.model?.primary);
  return Array.isArray(openclawConfig.agents?.list)
    ? openclawConfig.agents.list
        .map((agent: Record<string, any>) => ({
          id: normalizeString(agent.id),
          name: normalizeString(agent.name || agent.id),
          model: normalizeString(agent.model || fallbackModel),
        }))
        .filter((agent: CronAgentOption) => Boolean(agent.id))
        .sort((left: CronAgentOption, right: CronAgentOption) =>
          left.id.localeCompare(right.id),
        )
    : [];
}

function buildBindingRef(binding: Record<string, any>): string {
  const channel = normalizeString(binding.match?.channel);
  const accountId = normalizeString(binding.match?.accountId);
  const agentId = normalizeString(binding.agentId, "main") || "main";
  if (!channel || !accountId) return "";
  return `${channel}:${accountId}:${agentId}`;
}

function buildCronTargets(
  config: TracevaneServerConfig,
  openclawConfig: Record<string, any>,
): ParsedCronTarget {
  const deliveryTargets: CronTargetOption[] = [];
  const sessionTargets: CronSessionOption[] = [];

  const bindings = Array.isArray(openclawConfig.bindings)
    ? openclawConfig.bindings
    : [];
  for (const binding of bindings) {
    const ref = buildBindingRef(binding);
    if (!ref || deliveryTargets.some((item) => item.ref === ref)) continue;
    deliveryTargets.push({
      ref,
      type: "channelBinding",
      label: `${normalizeString(binding.match?.channel)} / ${normalizeString(binding.match?.accountId)} -> ${normalizeString(binding.agentId)}`,
      description: normalizeString(binding.comment),
    });
  }

  const channels =
    openclawConfig.channels && typeof openclawConfig.channels === "object"
      ? (openclawConfig.channels as Record<string, any>)
      : {};
  for (const [channelType, channelConfig] of Object.entries(channels)) {
    const accounts =
      channelConfig &&
      typeof channelConfig === "object" &&
      channelConfig.accounts &&
      typeof channelConfig.accounts === "object"
        ? (channelConfig.accounts as Record<string, any>)
        : {};
    for (const accountId of Object.keys(accounts)) {
      if (accountId === "default") continue;
      const ref = `${channelType}:${accountId}`;
      if (deliveryTargets.some((item) => item.ref === ref)) continue;
      deliveryTargets.push({
        ref,
        type: "legacyChannel",
        label: `${channelType} / ${accountId}`,
        description: "",
      });
    }
  }

  for (const agentId of listDirectories(
    path.join(config.openclawRoot, "agents"),
  )) {
    const store = readJsonFile<Record<string, any>>(
      path.join(
        config.openclawRoot,
        "agents",
        agentId,
        "sessions",
        "sessions.json",
      ),
      {},
    );
    for (const [routeKey, session] of Object.entries(store)) {
      const record = session as Record<string, any>;
      const labelParts = [
        normalizeString(record.agentId, agentId),
        normalizeString(record.chatType),
        normalizeDate(record.updatedAtMs || record.updatedAt)
          ? new Date(
              Number(record.updatedAtMs || record.updatedAt),
            ).toLocaleString()
          : "",
      ].filter(Boolean);
      sessionTargets.push({
        key: routeKey,
        label: labelParts.join(" · ") || routeKey,
        agentId,
        updatedAt: normalizeDate(record.updatedAtMs || record.updatedAt),
      });
      if (!deliveryTargets.some((item) => item.ref === routeKey)) {
        deliveryTargets.push({
          ref: routeKey,
          type: "directSession",
          label: `session · ${labelParts.join(" · ") || routeKey}`,
          description: "",
        });
      }
    }
  }

  sessionTargets.sort((left, right) =>
    (right.updatedAt || "").localeCompare(left.updatedAt || ""),
  );
  deliveryTargets.sort((left, right) => left.label.localeCompare(right.label));
  return { deliveryTargets, sessionTargets };
}

function resolveFailureAlert(
  rawFailureAlert: unknown,
): CronFailureAlertSummary {
  if (rawFailureAlert === false || rawFailureAlert == null) {
    return {
      enabled: false,
      mode: "announce",
      channel: "",
      accountId: "",
      to: "",
      after: null,
      cooldownMs: null,
    };
  }

  const failureAlert =
    rawFailureAlert && typeof rawFailureAlert === "object"
      ? (rawFailureAlert as Record<string, any>)
      : {};
  return {
    enabled: true,
    mode:
      normalizeString(failureAlert.mode, "announce") === "webhook"
        ? "webhook"
        : "announce",
    channel: normalizeString(failureAlert.channel),
    accountId: normalizeString(failureAlert.accountId),
    to: normalizeString(failureAlert.to),
    after: Number.isFinite(Number(failureAlert.after))
      ? Number(failureAlert.after)
      : null,
    cooldownMs: Number.isFinite(Number(failureAlert.cooldownMs))
      ? Number(failureAlert.cooldownMs)
      : null,
  };
}

function resolveFailureDestination(
  rawFailureDestination: unknown,
): CronFailureDestinationSummary {
  if (!rawFailureDestination || typeof rawFailureDestination !== "object") {
    return {
      enabled: false,
      mode: "announce",
      channel: "",
      accountId: "",
      to: "",
    };
  }

  const failureDestination = rawFailureDestination as Record<string, any>;
  return {
    enabled: true,
    mode:
      normalizeString(failureDestination.mode, "announce") === "webhook"
        ? "webhook"
        : "announce",
    channel: normalizeString(failureDestination.channel),
    accountId: normalizeString(failureDestination.accountId),
    to: normalizeString(failureDestination.to),
  };
}

function resolveSessionTarget(
  rawSessionTarget: unknown,
  sessionTargets: CronSessionOption[],
): {
  mode: CronJobSummary["sessionTargetMode"];
  ref: string;
  label: string;
} {
  const value = normalizeString(rawSessionTarget, "isolated");
  if (value === "main" || value === "isolated") {
    return {
      mode: value,
      ref: "",
      label: value === "main" ? "main" : "isolated",
    };
  }

  const ref = value.startsWith("session:")
    ? value.slice("session:".length)
    : value;
  const target = sessionTargets.find((item) => item.key === ref);
  return {
    mode: "existing-session",
    ref,
    label: target?.label || ref,
  };
}

function resolveDelivery(
  rawDelivery: unknown,
  deliveryTargets: CronTargetOption[],
): CronDeliverySummary {
  const delivery =
    rawDelivery && typeof rawDelivery === "object"
      ? (rawDelivery as Record<string, any>)
      : {};
  const normalizedMode = normalizeString(delivery.mode, "silent");
  const mode =
    normalizedMode === "announce" || normalizedMode === "webhook"
      ? normalizedMode
      : "silent";
  if (mode === "silent") {
    return {
      mode,
      targetType: "",
      targetRef: "",
      label: "silent",
      bestEffort: normalizeBoolean(delivery.bestEffort, true),
      failureDestination: resolveFailureDestination(
        delivery.failureDestination,
      ),
    };
  }

  const targetRef = normalizeString(
    delivery.targetRef ||
      delivery.bindingRef ||
      delivery.sessionKey ||
      delivery.to,
  );
  const targetType =
    mode === "webhook"
      ? "webhook"
      : (normalizeString(
          delivery.targetType,
          targetRef.startsWith("session:") ? "directSession" : "channelBinding",
        ) as CronDeliverySummary["targetType"]);
  const target = deliveryTargets.find((item) => item.ref === targetRef);
  return {
    mode,
    targetType,
    targetRef,
    label:
      mode === "webhook"
        ? targetRef || "webhook"
        : target?.label || targetRef || "announce",
    bestEffort: normalizeBoolean(delivery.bestEffort, true),
    failureDestination: resolveFailureDestination(delivery.failureDestination),
  };
}

function resolveState(rawState: unknown): CronStateSummary {
  const state =
    rawState && typeof rawState === "object"
      ? (rawState as Record<string, any>)
      : {};
  return {
    lastStatus:
      normalizeString(state.lastStatus || state.lastRunStatus) || null,
    lastRunAt: normalizeDate(state.lastRunAtMs || state.lastRunAt),
    nextRunAt: normalizeDate(state.nextRunAtMs || state.nextRunAt),
    consecutiveErrors: normalizeNumber(state.consecutiveErrors, 0),
    lastDurationMs: Number.isFinite(Number(state.lastDurationMs))
      ? Number(state.lastDurationMs)
      : null,
    lastDeliveryStatus: normalizeString(state.lastDeliveryStatus) || null,
  };
}

function mapJob(
  rawJob: Record<string, any>,
  deliveryTargets: CronTargetOption[],
  sessionTargets: CronSessionOption[],
): CronJobSummary {
  const schedule = parseSchedule(rawJob.schedule);
  const payload = parsePayload(rawJob.payload);
  const sessionTarget = resolveSessionTarget(
    rawJob.sessionTarget,
    sessionTargets,
  );
  const delivery = resolveDelivery(rawJob.delivery, deliveryTargets);
  return {
    id: normalizeString(rawJob.id),
    name: normalizeString(rawJob.name || rawJob.id),
    description: normalizeString(rawJob.description),
    agentId: normalizeString(rawJob.agentId, "main"),
    enabled: rawJob.enabled !== false,
    schedule,
    sessionTargetMode: sessionTarget.mode,
    sessionTargetRef: sessionTarget.ref,
    sessionTargetLabel: sessionTarget.label,
    wakeMode: normalizeString(rawJob.wakeMode, "now"),
    payload,
    delivery,
    failureAlert: resolveFailureAlert(rawJob.failureAlert),
    deleteAfterRun: normalizeBoolean(
      rawJob.deleteAfterRun,
      schedule.kind === "at",
    ),
    state: resolveState(rawJob.state),
    createdAt: normalizeDate(rawJob.createdAtMs || rawJob.createdAt),
    updatedAt: normalizeDate(rawJob.updatedAtMs || rawJob.updatedAt),
  };
}

function readRunHistory(
  config: TracevaneServerConfig,
  jobId: string,
  limit = 20,
): CronRunSummary[] {
  const filePath = path.join(resolveRunLogDir(config), `${jobId}.jsonl`);
  if (!fs.existsSync(filePath)) return [];

  try {
    const lines = fs
      .readFileSync(filePath, "utf-8")
      .split(/\r?\n/)
      .filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => JSON.parse(line) as Record<string, any>)
      .map((entry) => ({
        ts: normalizeDate(entry.ts),
        action: normalizeString(entry.action),
        status: normalizeString(entry.status),
        error: normalizeString(entry.error || entry.deliveryError),
        summary: normalizeString(entry.summary || entry.stdout),
        summaryPreview: normalizeString(entry.summary || entry.stdout).slice(
          0,
          220,
        ),
        deliveryStatus: normalizeString(entry.deliveryStatus),
        sessionId: normalizeString(entry.sessionId),
        sessionKey: normalizeString(entry.sessionKey),
        runAt: normalizeDate(entry.runAtMs || entry.runAt),
        durationMs: Number.isFinite(Number(entry.durationMs))
          ? Number(entry.durationMs)
          : null,
        nextRunAt: normalizeDate(entry.nextRunAtMs || entry.nextRunAt),
        model: normalizeString(entry.model),
        provider: normalizeString(entry.provider),
        totalTokens: Number.isFinite(
          Number(entry.usage?.total_tokens || entry.usage?.total),
        )
          ? Number(entry.usage?.total_tokens || entry.usage?.total)
          : null,
      }))
      .reverse();
  } catch {
    return [];
  }
}

function readLiveCronStatus(): CronSchedulerSummary["live"] {
  try {
    const stdout = execFileSync("openclaw", ["cron", "status", "--json"], {
      timeout: 1500,
      maxBuffer: 1024 * 1024,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(stdout.trim());
    return {
      source: "cli",
      jobs: Number.isFinite(Number(parsed.jobs)) ? Number(parsed.jobs) : null,
      nextWakeAt: normalizeDate(parsed.nextWakeAtMs),
      error: "",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "cron status unavailable";
    return {
      source: "derived",
      jobs: null,
      nextWakeAt: null,
      error: message,
    };
  }
}

function buildSchedulerSummary(
  config: TracevaneServerConfig,
  openclawConfig: Record<string, any>,
  storePath: string,
): CronSchedulerSummary {
  const runLog =
    openclawConfig.cron?.runLog &&
    typeof openclawConfig.cron.runLog === "object"
      ? (openclawConfig.cron.runLog as Record<string, any>)
      : {};
  const cronConfig =
    openclawConfig.cron && typeof openclawConfig.cron === "object"
      ? (openclawConfig.cron as Record<string, any>)
      : {};
  const live = readLiveCronStatus();
  return {
    enabled: cronConfig.enabled !== false,
    storePath,
    maxConcurrentRuns: Number.isFinite(Number(cronConfig.maxConcurrentRuns))
      ? Number(cronConfig.maxConcurrentRuns)
      : null,
    runLogDir: resolveRunLogDir(config),
    sessionRetention: normalizeString(cronConfig.sessionRetention, "24h"),
    runLogMaxBytes: Number.isFinite(Number(runLog.maxBytes))
      ? Number(runLog.maxBytes)
      : null,
    runLogKeepLines: Number.isFinite(Number(runLog.keepLines))
      ? Number(runLog.keepLines)
      : null,
    failureWebhook: normalizeString(cronConfig.webhook),
    failureWebhookTokenConfigured: Boolean(
      normalizeString(cronConfig.webhookToken),
    ),
    defaultFailureAlert: resolveFailureAlert(cronConfig.failureAlert),
    defaultFailureDestination: resolveFailureDestination(
      cronConfig.failureDestination,
    ),
    live,
  };
}

function buildSummary(config: TracevaneServerConfig): CronSummaryPayload {
  const openclawConfig = readOpenClawConfig(config);
  const storePath = resolveCronStorePath(config, openclawConfig);
  const scheduler = buildSchedulerSummary(config, openclawConfig, storePath);
  const targets = buildCronTargets(config, openclawConfig);
  const store = readCronStore(storePath);
  const jobs = Array.isArray(store.jobs)
    ? store.jobs
        .map((job) =>
          mapJob(job, targets.deliveryTargets, targets.sessionTargets),
        )
        .sort((left, right) => left.name.localeCompare(right.name))
    : [];

  return {
    checkedAt: new Date().toISOString(),
    count: jobs.length,
    enabledCount: jobs.filter((job) => job.enabled).length,
    disabledCount: jobs.filter((job) => !job.enabled).length,
    scheduler,
    agents: readAgentOptions(openclawConfig),
    deliveryTargets: targets.deliveryTargets,
    sessionTargets: targets.sessionTargets.slice(0, 40),
    jobs,
  };
}

function getRawJob(
  config: TracevaneServerConfig,
  jobId: string,
): {
  openclawConfig: Record<string, any>;
  storePath: string;
  store: CronStoreShape;
  job: Record<string, any>;
  index: number;
} {
  const openclawConfig = readOpenClawConfig(config);
  const storePath = resolveCronStorePath(config, openclawConfig);
  const store = readCronStore(storePath);
  const jobs = Array.isArray(store.jobs) ? store.jobs : [];
  const index = jobs.findIndex((job) => normalizeString(job.id) === jobId);
  if (index === -1) {
    throw new CronServiceError(
      404,
      "cron_job_not_found",
      `Cron job '${jobId}' not found`,
    );
  }
  return { openclawConfig, storePath, store, job: jobs[index], index };
}

function buildDetail(
  config: TracevaneServerConfig,
  jobId: string,
): CronDetailPayload {
  const openclawConfig = readOpenClawConfig(config);
  const storePath = resolveCronStorePath(config, openclawConfig);
  const scheduler = buildSchedulerSummary(config, openclawConfig, storePath);
  const targets = buildCronTargets(config, openclawConfig);
  const store = readCronStore(storePath);
  const rawJobs = Array.isArray(store.jobs) ? store.jobs : [];
  const rawJob = rawJobs.find((job) => normalizeString(job.id) === jobId);
  if (!rawJob) {
    throw new CronServiceError(
      404,
      "cron_job_not_found",
      `Cron job '${jobId}' not found`,
    );
  }

  return {
    checkedAt: new Date().toISOString(),
    scheduler,
    agents: readAgentOptions(openclawConfig),
    deliveryTargets: targets.deliveryTargets,
    sessionTargets: targets.sessionTargets.slice(0, 40),
    job: mapJob(rawJob, targets.deliveryTargets, targets.sessionTargets),
    runs: readRunHistory(config, jobId),
  };
}

function parseAtInput(value: string): string {
  const raw = value.trim();
  if (!raw)
    throw new CronServiceError(
      400,
      "invalid_schedule",
      "One-shot schedule requires a date/time",
    );
  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp))
    throw new CronServiceError(
      400,
      "invalid_schedule",
      "Invalid one-shot date/time",
    );
  return new Date(timestamp).toISOString();
}

function normalizeInput(
  input: CronJobInput,
  config: TracevaneServerConfig,
  openclawConfig: Record<string, any>,
  existing?: Record<string, any>,
): Record<string, any> {
  const name = normalizeString(input.name);
  if (!name)
    throw new CronServiceError(
      400,
      "invalid_name",
      "Cron job name is required",
    );

  const agentOptions = readAgentOptions(openclawConfig);
  const agentId = normalizeString(
    input.agentId,
    existing ? normalizeString(existing.agentId, "main") : "main",
  );
  if (!agentOptions.some((agent) => agent.id === agentId)) {
    throw new CronServiceError(
      400,
      "invalid_agent",
      `Agent '${agentId}' not found`,
    );
  }

  const scheduleKind = normalizeString(
    input.scheduleKind,
    "cron",
  ) as CronJobInput["scheduleKind"];
  const schedule: Record<string, any> = { kind: scheduleKind };

  if (scheduleKind === "cron") {
    const expr = normalizeString(input.cronExpr);
    if (!expr)
      throw new CronServiceError(
        400,
        "invalid_schedule",
        "Cron expression is required",
      );
    schedule.expr = expr;
    if (normalizeString(input.timezone))
      schedule.tz = normalizeString(input.timezone);
  } else if (scheduleKind === "every") {
    const everyMs = parseDurationMs(normalizeString(input.every));
    if (!everyMs)
      throw new CronServiceError(
        400,
        "invalid_schedule",
        "Recurring duration is required, e.g. 10m or 1h",
      );
    schedule.everyMs = everyMs;
  } else {
    schedule.at = parseAtInput(normalizeString(input.at));
  }

  const staggerMs = parseDurationMs(normalizeString(input.stagger));
  if (staggerMs) schedule.staggerMs = staggerMs;

  const payloadKind = normalizeString(
    input.payloadKind,
    "agentTurn",
  ) as CronPayloadSummary["kind"];
  const payload: Record<string, any> = { kind: payloadKind };
  if (payloadKind === "systemEvent") {
    const systemEvent = normalizeString(input.systemEvent);
    if (!systemEvent)
      throw new CronServiceError(
        400,
        "invalid_payload",
        "System event text is required",
      );
    payload.systemEvent = systemEvent;
  } else {
    const message = normalizeString(input.message);
    if (!message)
      throw new CronServiceError(
        400,
        "invalid_payload",
        "Agent message is required",
      );
    payload.message = message;
  }
  if (normalizeString(input.thinking))
    payload.thinking = normalizeString(input.thinking);
  if (Number.isFinite(Number(input.timeoutSeconds)))
    payload.timeoutSeconds = Number(input.timeoutSeconds);
  if (normalizeString(input.model))
    payload.model = normalizeString(input.model);
  if (input.lightContext === true) payload.lightContext = true;
  if (input.expectFinal === true) payload.expectFinal = true;

  const sessionTargetMode = normalizeString(
    input.sessionTargetMode,
    "isolated",
  ) as CronJobInput["sessionTargetMode"];
  let sessionTarget = "isolated";
  if (sessionTargetMode === "main") {
    sessionTarget = "main";
  } else if (sessionTargetMode === "existing-session") {
    const ref = normalizeString(input.sessionTargetRef);
    if (!ref)
      throw new CronServiceError(
        400,
        "invalid_session_target",
        "Existing session target requires a session key",
      );
    sessionTarget = `session:${ref}`;
  }

  const deliveryMode = normalizeString(
    input.deliveryMode,
    "silent",
  ) as CronJobInput["deliveryMode"];
  const delivery: Record<string, any> = {
    mode:
      deliveryMode === "announce" || deliveryMode === "webhook"
        ? deliveryMode
        : "silent",
  };
  if (delivery.mode === "announce") {
    const targetType = normalizeString(
      input.deliveryTargetType,
      "channelBinding",
    );
    const targetRef = normalizeString(input.deliveryTargetRef);
    if (!targetRef)
      throw new CronServiceError(
        400,
        "invalid_delivery_target",
        "Delivery target is required for announce mode",
      );
    delivery.targetType = targetType;
    delivery.targetRef = targetRef;
    delivery.bestEffort = input.deliveryBestEffort !== false;
  } else if (delivery.mode === "webhook") {
    const targetRef = normalizeString(input.deliveryTargetRef);
    if (!/^https?:\/\//i.test(targetRef)) {
      throw new CronServiceError(
        400,
        "invalid_delivery_target",
        "Webhook delivery requires a valid http(s) URL",
      );
    }
    delivery.targetType = "webhook";
    delivery.targetRef = targetRef;
    delivery.to = targetRef;
  }

  let failureDestination: Record<string, any> | undefined;
  if (input.failureDestinationEnabled === true) {
    const mode = normalizeString(input.failureDestinationMode, "announce");
    if (mode !== "announce" && mode !== "webhook") {
      throw new CronServiceError(
        400,
        "invalid_failure_destination",
        "Failure destination mode must be announce or webhook",
      );
    }
    failureDestination = {
      mode,
    };
    if (normalizeString(input.failureDestinationChannel))
      failureDestination.channel = normalizeString(
        input.failureDestinationChannel,
      );
    if (normalizeString(input.failureDestinationAccountId))
      failureDestination.accountId = normalizeString(
        input.failureDestinationAccountId,
      );
    if (normalizeString(input.failureDestinationTo))
      failureDestination.to = normalizeString(input.failureDestinationTo);
    if (
      mode === "webhook" &&
      !/^https?:\/\//i.test(normalizeString(input.failureDestinationTo))
    ) {
      throw new CronServiceError(
        400,
        "invalid_failure_destination",
        "Webhook failure destination requires a valid http(s) URL",
      );
    }
  }

  let failureAlert: Record<string, any> | false | undefined;
  if (input.failureAlertEnabled === true) {
    failureAlert = {};
    const mode = normalizeString(input.failureAlertMode, "announce");
    if (mode !== "announce" && mode !== "webhook") {
      throw new CronServiceError(
        400,
        "invalid_failure_alert",
        "Failure alert mode must be announce or webhook",
      );
    }
    failureAlert.mode = mode;
    if (normalizeString(input.failureAlertChannel))
      failureAlert.channel = normalizeString(input.failureAlertChannel);
    if (normalizeString(input.failureAlertAccountId))
      failureAlert.accountId = normalizeString(input.failureAlertAccountId);
    if (normalizeString(input.failureAlertTo))
      failureAlert.to = normalizeString(input.failureAlertTo);
    if (
      Number.isFinite(Number(input.failureAlertAfter)) &&
      Number(input.failureAlertAfter) > 0
    ) {
      failureAlert.after = Number(input.failureAlertAfter);
    }
    const cooldownMs = parseDurationMs(
      normalizeString(input.failureAlertCooldown),
    );
    if (cooldownMs) failureAlert.cooldownMs = cooldownMs;
    if (
      mode === "webhook" &&
      !/^https?:\/\//i.test(normalizeString(input.failureAlertTo))
    ) {
      throw new CronServiceError(
        400,
        "invalid_failure_alert",
        "Webhook failure alerts require a valid http(s) URL",
      );
    }
  } else if (input.failureAlertEnabled === false) {
    failureAlert = false;
  }

  return {
    ...(existing || {}),
    name,
    description: normalizeString(input.description),
    agentId,
    enabled: input.enabled !== false,
    updatedAtMs: Date.now(),
    schedule,
    sessionTarget,
    wakeMode: normalizeString(input.wakeMode, "now"),
    payload,
    delivery: {
      ...delivery,
      ...(failureDestination ? { failureDestination } : {}),
    },
    ...(failureAlert !== undefined ? { failureAlert } : {}),
    deleteAfterRun: input.deleteAfterRun === true,
    state:
      existing?.state && typeof existing.state === "object"
        ? existing.state
        : { consecutiveErrors: 0, lastStatus: "never-run" },
  };
}

async function runCronJobByCli(
  jobId: string,
): Promise<{ success: boolean; output: string }> {
  try {
    const result = await execFileAsync("openclaw", ["cron", "run", jobId], {
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return {
      success: true,
      output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
    };
  } catch (error) {
    const cast = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      success: false,
      output: [cast.stderr, cast.stdout, cast.message]
        .filter(Boolean)
        .join("\n")
        .trim(),
    };
  }
}

export interface CronService {
  getSummary(): CronSummaryPayload;
  getDetail(jobId: string): CronDetailPayload | null;
  createJob(input: CronJobInput): CronMutationResponse;
  updateJob(jobId: string, input: CronJobInput): CronMutationResponse;
  deleteJob(jobId: string): CronMutationResponse;
  toggleJob(jobId: string, enabled: boolean): CronMutationResponse;
  runJob(jobId: string): Promise<CronRunResponse>;
}

export function createCronService(config: TracevaneServerConfig): CronService {
  return {
    getSummary(): CronSummaryPayload {
      return buildSummary(config);
    },

    getDetail(jobId: string): CronDetailPayload | null {
      try {
        return buildDetail(config, jobId);
      } catch (error) {
        if (error instanceof CronServiceError && error.statusCode === 404)
          return null;
        throw error;
      }
    },

    createJob(input: CronJobInput): CronMutationResponse {
      const openclawConfig = readOpenClawConfig(config);
      const storePath = resolveCronStorePath(config, openclawConfig);
      const store = readCronStore(storePath);
      const jobs = Array.isArray(store.jobs) ? store.jobs : [];
      const id = crypto.randomUUID();
      const nextJob = normalizeInput(input, config, openclawConfig);
      nextJob.id = id;
      nextJob.createdAtMs = Date.now();
      jobs.push(nextJob);
      store.jobs = jobs;
      writeCronStore(storePath, store);

      return {
        checkedAt: new Date().toISOString(),
        success: true,
        message: `Cron job '${nextJob.name}' created`,
        summary: buildSummary(config),
        detail: buildDetail(config, id),
      };
    },

    updateJob(jobId: string, input: CronJobInput): CronMutationResponse {
      const { openclawConfig, storePath, store, job, index } = getRawJob(
        config,
        jobId,
      );
      const jobs = Array.isArray(store.jobs) ? store.jobs : [];
      jobs[index] = normalizeInput(input, config, openclawConfig, job);
      store.jobs = jobs;
      writeCronStore(storePath, store);

      return {
        checkedAt: new Date().toISOString(),
        success: true,
        message: `Cron job '${jobId}' updated`,
        summary: buildSummary(config),
        detail: buildDetail(config, jobId),
      };
    },

    deleteJob(jobId: string): CronMutationResponse {
      const { storePath, store, index } = getRawJob(config, jobId);
      const jobs = Array.isArray(store.jobs) ? store.jobs : [];
      const removed = jobs[index];
      jobs.splice(index, 1);
      store.jobs = jobs;
      writeCronStore(storePath, store);

      return {
        checkedAt: new Date().toISOString(),
        success: true,
        message: `Cron job '${normalizeString(removed?.name, jobId)}' removed`,
        summary: buildSummary(config),
      };
    },

    toggleJob(jobId: string, enabled: boolean): CronMutationResponse {
      const { storePath, store, index } = getRawJob(config, jobId);
      const jobs = Array.isArray(store.jobs) ? store.jobs : [];
      jobs[index].enabled = enabled;
      jobs[index].updatedAtMs = Date.now();
      store.jobs = jobs;
      writeCronStore(storePath, store);

      return {
        checkedAt: new Date().toISOString(),
        success: true,
        message: enabled
          ? `Cron job '${jobId}' enabled`
          : `Cron job '${jobId}' disabled`,
        summary: buildSummary(config),
        detail: buildDetail(config, jobId),
      };
    },

    async runJob(jobId: string): Promise<CronRunResponse> {
      const detail = this.getDetail(jobId);
      if (!detail) {
        throw new CronServiceError(
          404,
          "cron_job_not_found",
          `Cron job '${jobId}' not found`,
        );
      }

      const result = await runCronJobByCli(jobId);
      if (!result.success) {
        throw new CronServiceError(
          502,
          "cron_run_failed",
          result.output || `Failed to run cron job '${jobId}'`,
        );
      }

      return {
        checkedAt: new Date().toISOString(),
        success: true,
        message: `Cron job '${detail.job.name}' enqueued`,
        output: result.output,
      };
    },
  };
}

export function isCronServiceError(error: unknown): error is CronServiceError {
  return error instanceof CronServiceError;
}
