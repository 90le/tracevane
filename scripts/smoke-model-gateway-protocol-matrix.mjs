#!/usr/bin/env node
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const DEFAULT_ENDPOINT = "http://127.0.0.1:18796";
const DEFAULT_TIMEOUT_MS = 240_000;
const MIN_STAGE_TIMEOUT_MS = 30_000;
const STAGE_TIMEOUT_GRACE_MS = 15_000;
const DEFAULT_GLM_PROVIDER = "glm";
const DEFAULT_GLM_MODEL = "glm-5.2";
const DEFAULT_CODEX_PROVIDER = "codex-account";
const DEFAULT_CODEX_MODEL = "gpt-5.5";
const DEFAULT_CODEX_MODELS = ["gpt-5.4", "gpt-5.5", "gpt-5.4-mini"];
const DEFAULT_CODEX_SCOPES = ["codex", "claude-code", "opencode"];

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const activeRoutesScript = path.join(repoRoot, "scripts/smoke-model-gateway-active-routes.mjs");

function parseArgs(argv) {
  const options = {
    endpoint: process.env.TRACEVANE_GATEWAY_ENDPOINT || process.env.TRACEVANE_GATEWAY_ENDPOINT || DEFAULT_ENDPOINT,
    glmProvider: process.env.TRACEVANE_GATEWAY_PROTOCOL_GLM_PROVIDER || process.env.TRACEVANE_GATEWAY_PROTOCOL_GLM_PROVIDER || DEFAULT_GLM_PROVIDER,
    glmModel: process.env.TRACEVANE_GATEWAY_PROTOCOL_GLM_MODEL || process.env.TRACEVANE_GATEWAY_PROTOCOL_GLM_MODEL || DEFAULT_GLM_MODEL,
    codexProvider: process.env.TRACEVANE_GATEWAY_PROTOCOL_CODEX_PROVIDER || process.env.TRACEVANE_GATEWAY_PROTOCOL_CODEX_PROVIDER || DEFAULT_CODEX_PROVIDER,
    codexModel: process.env.TRACEVANE_GATEWAY_PROTOCOL_CODEX_MODEL || process.env.TRACEVANE_GATEWAY_PROTOCOL_CODEX_MODEL || DEFAULT_CODEX_MODEL,
    codexModelExplicit: Boolean(process.env.TRACEVANE_GATEWAY_PROTOCOL_CODEX_MODEL),
    codexModels: parseCsv(process.env.TRACEVANE_GATEWAY_PROTOCOL_CODEX_MODELS || ""),
    codexModelsExplicit: Boolean(process.env.TRACEVANE_GATEWAY_PROTOCOL_CODEX_MODELS),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    stageTimeoutMs: 0,
    stageRetries: nonNegativeInt(process.env.TRACEVANE_GATEWAY_PROTOCOL_STAGE_RETRIES, 0),
    skipGlm: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--endpoint") options.endpoint = argv[++index] || options.endpoint;
    else if (arg.startsWith("--endpoint=")) options.endpoint = arg.slice("--endpoint=".length);
    else if (arg === "--glm-provider") options.glmProvider = argv[++index] || options.glmProvider;
    else if (arg.startsWith("--glm-provider=")) options.glmProvider = arg.slice("--glm-provider=".length);
    else if (arg === "--glm-model") options.glmModel = argv[++index] || options.glmModel;
    else if (arg.startsWith("--glm-model=")) options.glmModel = arg.slice("--glm-model=".length);
    else if (arg === "--codex-provider") options.codexProvider = argv[++index] || options.codexProvider;
    else if (arg.startsWith("--codex-provider=")) options.codexProvider = arg.slice("--codex-provider=".length);
    else if (arg === "--codex-model") {
      options.codexModel = argv[++index] || options.codexModel;
      options.codexModelExplicit = true;
    }
    else if (arg.startsWith("--codex-model=")) {
      options.codexModel = arg.slice("--codex-model=".length);
      options.codexModelExplicit = true;
    }
    else if (arg === "--codex-models") {
      options.codexModels = parseCsv(argv[++index] || "");
      options.codexModelsExplicit = true;
    }
    else if (arg.startsWith("--codex-models=")) {
      options.codexModels = parseCsv(arg.slice("--codex-models=".length));
      options.codexModelsExplicit = true;
    }
    else if (arg === "--skip-glm") options.skipGlm = true;
    else if (arg === "--timeout-ms") options.timeoutMs = positiveInt(argv[++index], DEFAULT_TIMEOUT_MS);
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = positiveInt(arg.slice("--timeout-ms=".length), DEFAULT_TIMEOUT_MS);
    else if (arg === "--stage-timeout-ms") options.stageTimeoutMs = positiveInt(argv[++index], 0);
    else if (arg.startsWith("--stage-timeout-ms=")) options.stageTimeoutMs = positiveInt(arg.slice("--stage-timeout-ms=".length), 0);
    else if (arg === "--stage-retries") options.stageRetries = nonNegativeInt(argv[++index], 0);
    else if (arg.startsWith("--stage-retries=")) options.stageRetries = nonNegativeInt(arg.slice("--stage-retries=".length), 0);
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  options.endpoint = options.endpoint.replace(/\/+$/g, "");
  options.glmProvider = options.glmProvider.trim();
  options.glmModel = options.glmModel.trim();
  options.codexProvider = options.codexProvider.trim();
  options.codexModel = options.codexModel.trim();
  options.codexModels = options.codexModels.length
    ? Array.from(new Set(options.codexModels.map((item) => item.trim()).filter(Boolean)))
    : options.codexModelExplicit && !options.codexModelsExplicit
      ? [options.codexModel]
      : DEFAULT_CODEX_MODELS;
  if (!options.glmProvider) throw new Error("--glm-provider is required.");
  if (!options.glmModel) throw new Error("--glm-model is required.");
  if (!options.codexProvider) throw new Error("--codex-provider is required.");
  if (!options.codexModel) throw new Error("--codex-model is required.");
  if (!options.stageTimeoutMs) options.stageTimeoutMs = defaultStageTimeoutMs(options.timeoutMs);
  return options;
}

function parseCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function defaultStageTimeoutMs(timeoutMs) {
  const parsed = positiveInt(timeoutMs, DEFAULT_TIMEOUT_MS);
  return Math.max(MIN_STAGE_TIMEOUT_MS, parsed + STAGE_TIMEOUT_GRACE_MS);
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-model-gateway-protocol-matrix.mjs [options]

Verifies the current release protocol matrix through active-route smoke:
  - GLM Coding Chat covers OpenAI Chat-compatible / OpenCode.
  - GLM Coding Anthropic covers Anthropic Messages / Claude Code.
  - Codex account covers Codex / Claude Code / OpenCode via Responses-backed adapters.

Options:
  --endpoint <url>        default: ${DEFAULT_ENDPOINT}
  --glm-provider <id>     default: ${DEFAULT_GLM_PROVIDER}
  --glm-model <id>        default: ${DEFAULT_GLM_MODEL}
  --codex-provider <id>   default: ${DEFAULT_CODEX_PROVIDER}
  --codex-model <id>      single Codex account model override; default primary: ${DEFAULT_CODEX_MODEL}
  --codex-models <csv>    Codex account model matrix; default: ${DEFAULT_CODEX_MODELS.join(",")}
  --skip-glm             run only Codex account matrix stages
  --timeout-ms <n>        per active-route smoke timeout
  --stage-timeout-ms <n>  per child process watchdog; default: max(${MIN_STAGE_TIMEOUT_MS}, --timeout-ms + ${STAGE_TIMEOUT_GRACE_MS})
  --stage-retries <n>     retry a failed matrix stage; default: 0
  --json                  machine-readable output
  -h, --help              Show this help
`);
}

function stageDefinitions(options) {
  const stages = [];
  if (!options.skipGlm) {
    stages.push(
      {
        id: "glm-anthropic-messages",
        label: "GLM native Anthropic Messages proof",
        provider: options.glmProvider,
        model: options.glmModel,
        args: [
          "--provider", options.glmProvider,
          "--model", options.glmModel,
          "--scopes", "claude-code",
          "--expect-endpoints", "claude-code=coding-anthropic",
          "--expect-routes", "claude-code=anthropic_messages",
          "--expect-api-formats", "claude-code=anthropic_messages",
        ],
        expectedProofs: [
          { id: "anthropic_messages", scope: "claude-code", provider: options.glmProvider, endpointProfile: "coding-anthropic" },
        ],
      },
      {
        id: "glm-chat-completions",
        label: "GLM native Chat Completions proof",
        provider: options.glmProvider,
        model: options.glmModel,
        args: [
          "--provider", options.glmProvider,
          "--model", options.glmModel,
          "--scopes", "opencode",
          "--expect-endpoints", "opencode=coding-chat",
          "--expect-routes", "opencode=openai_chat_completions",
          "--expect-api-formats", "opencode=openai_chat",
        ],
        expectedProofs: [
          { id: "openai_chat_completions", scope: "opencode", provider: options.glmProvider, endpointProfile: "coding-chat" },
        ],
      },
    );
  }
  stages.push(...options.codexModels.map((model) => ({
    id: `codex-account-three-client-${model}`,
    label: `Codex account three-client proof (${model})`,
    provider: options.codexProvider,
    model,
    args: [
      "--provider", options.codexProvider,
      "--model", model,
      "--scopes", DEFAULT_CODEX_SCOPES.join(","),
      "--tool-smoke",
      "--stream-tool-smoke",
      "--tool-result-smoke",
      "--stream-tool-result-smoke",
      "--compatibility-smoke",
      "--stream-compatibility-smoke",
      "--malformed-smoke",
      "--stream-malformed-smoke",
      "--error-smoke",
      "--stream-error-smoke",
      "--expect-routes", "codex=openai_responses,claude-code=anthropic_messages,opencode=openai_chat_completions",
      "--expect-api-formats", "codex=openai_responses,claude-code=openai_responses,opencode=openai_responses",
    ],
    expectedProofs: [
      { id: `codex_account_responses:${model}`, scope: "codex", provider: options.codexProvider, endpointProfile: null, model },
      { id: `codex_account_claude_code:${model}`, scope: "claude-code", provider: options.codexProvider, endpointProfile: null, model },
      { id: `codex_account_opencode:${model}`, scope: "opencode", provider: options.codexProvider, endpointProfile: null, model },
    ],
  })));
  return stages;
}

async function runActiveRoutesStage(options, stage) {
  const attempts = [];
  const maxAttempts = 1 + options.stageRetries;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runActiveRoutesStageOnce(options, stage, attempt, maxAttempts);
    attempts.push(stageAttemptSummary(result));
    if (result.ok || attempt >= maxAttempts) {
      return {
        ...result,
        attempt,
        attempts: maxAttempts,
        previousAttempts: attempts.slice(0, -1),
      };
    }
    await sleep(Math.min(1_000 * attempt, 3_000));
  }
  throw new Error("unreachable stage retry loop");
}

async function runActiveRoutesStageOnce(options, stage, attempt, attempts) {
  const args = [
    activeRoutesScript,
    "--endpoint", options.endpoint,
    "--timeout-ms", String(options.timeoutMs),
    "--json",
    ...stage.args,
  ];
  try {
    const result = await execFileAsync(process.execPath, args, {
      cwd: repoRoot,
      env: process.env,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 16,
      timeout: options.stageTimeoutMs,
      killSignal: "SIGTERM",
    });
    return {
      id: stage.id,
      label: stage.label,
      ok: true,
      attempt,
      attempts,
      expectedProofs: stage.expectedProofs,
      activeRoutes: JSON.parse(result.stdout),
    };
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    let parsed = null;
    try {
      parsed = stdout ? JSON.parse(stdout) : null;
    } catch {
      parsed = null;
    }
    return {
      id: stage.id,
      label: stage.label,
      ok: false,
      attempt,
      attempts,
      expectedProofs: stage.expectedProofs,
      activeRoutes: parsed,
      error: {
        message: error instanceof Error ? error.message : String(error),
        stderr: typeof error?.stderr === "string" ? error.stderr.trim() : "",
        timedOut: Boolean(error?.killed && error?.signal === "SIGTERM"),
        timeoutMs: options.stageTimeoutMs,
      },
    };
  }
}

function stageAttemptSummary(result) {
  return {
    attempt: result.attempt,
    ok: result.ok,
    error: result.error || null,
    activeRoutesOk: Boolean(result.activeRoutes?.ok),
    failedSmokes: failedSmokeSummaries(result.activeRoutes),
    expectationFailures: result.activeRoutes?.expectationFailures || [],
    setupFailures: result.activeRoutes?.setupFailures || [],
    restoreFailures: result.activeRoutes?.restoreFailures || [],
  };
}

function failedSmokeSummaries(activeRoutes) {
  const summaries = [];
  for (const group of ["routeSmokes", "toolSmokes", "streamToolSmokes", "toolResultSmokes", "streamToolResultSmokes", "compatibilitySmokes", "streamCompatibilitySmokes", "malformedSmokes", "streamMalformedSmokes", "errorSmokes", "streamErrorSmokes"]) {
    for (const smoke of activeRoutes?.[group] || []) {
      if (smoke?.ok) continue;
      summaries.push({
        group,
        scope: smoke?.scope || null,
        status: smoke?.status ?? null,
        statusCode: smoke?.statusCode ?? null,
        routeId: smoke?.routeId || null,
        apiFormat: smoke?.apiFormat || null,
        transient: Boolean(smoke?.transient),
        error: smoke?.error || null,
        responsePreview: typeof smoke?.responsePreview === "string" ? smoke.responsePreview.slice(0, 500) : null,
      });
    }
  }
  return summaries;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function protocolProofs(stages) {
  const proofs = [];
  for (const stage of stages) {
    const smokes = Array.isArray(stage.activeRoutes?.routeSmokes) ? stage.activeRoutes.routeSmokes : [];
    for (const proof of stage.expectedProofs) {
      const smoke = smokes.find((item) => item.scope === proof.scope) || null;
      proofs.push({
        ...proof,
        ok: Boolean(stage.ok && smoke?.ok),
        routeId: smoke?.routeId || null,
        mode: smoke?.mode || null,
        endpointProfile: smoke?.endpointProfile || null,
        apiFormat: smoke?.apiFormat || null,
        upstreamUrl: smoke?.upstreamUrl || null,
      });
    }
  }
  return proofs;
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Gateway protocol matrix smoke: ${result.ok ? "PASS" : "FAIL"}`);
  for (const proof of result.protocolProofs) {
    console.log(`- ${proof.id}: ${proof.ok ? "PASS" : "FAIL"} ${proof.provider} ${proof.routeId || ""} ${proof.endpointProfile || ""}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const stages = [];
  for (const stage of stageDefinitions(options)) {
    stages.push(await runActiveRoutesStage(options, stage));
  }
  const proofs = protocolProofs(stages);
  const result = {
    ok: stages.every((stage) => stage.ok) && proofs.every((proof) => proof.ok),
    endpoint: options.endpoint,
    checkedAt: new Date().toISOString(),
    timeoutMs: options.timeoutMs,
    stageTimeoutMs: options.stageTimeoutMs,
    protocolProofs: proofs,
    stages,
  };
  printResult(result, options.json);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
