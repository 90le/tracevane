#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const DEFAULT_ENDPOINT = "http://127.0.0.1:18796";
const DEFAULT_TIMEOUT_MS = 240_000;
const MIN_STAGE_TIMEOUT_MS = 30_000;
const STAGE_TIMEOUT_GRACE_MS = 15_000;
const DEFAULT_GLM_PROVIDER = "glm";
const DEFAULT_GLM_MODEL = "glm-4.7";
const DEFAULT_CODEX_PROVIDER = "codex-account";
const DEFAULT_CODEX_MODEL = "gpt-5.4";
const DEFAULT_CLAUDE_PROVIDER = "api-key-provider";
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
const AGENT_SCOPES = ["codex", "claude-code", "opencode"];
const SMOKE_GROUPS = [
  "routeSmokes",
  "toolSmokes",
  "streamToolSmokes",
  "toolResultSmokes",
  "streamToolResultSmokes",
  "compatibilitySmokes",
  "streamCompatibilitySmokes",
  "malformedSmokes",
  "streamMalformedSmokes",
  "errorSmokes",
  "streamErrorSmokes",
];
const FULL_SMOKE_FLAGS = [
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
];

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const activeRoutesScript = path.join(repoRoot, "scripts/smoke-model-gateway-active-routes.mjs");

function parseArgs(argv) {
  const options = {
    endpoint: process.env.TRACEVANE_GATEWAY_ENDPOINT || DEFAULT_ENDPOINT,
    glmProvider: process.env.TRACEVANE_GATEWAY_REPRESENTATIVE_GLM_PROVIDER || DEFAULT_GLM_PROVIDER,
    glmModel: process.env.TRACEVANE_GATEWAY_REPRESENTATIVE_GLM_MODEL || DEFAULT_GLM_MODEL,
    codexProvider: process.env.TRACEVANE_GATEWAY_REPRESENTATIVE_CODEX_PROVIDER || DEFAULT_CODEX_PROVIDER,
    codexModel: process.env.TRACEVANE_GATEWAY_REPRESENTATIVE_CODEX_MODEL || DEFAULT_CODEX_MODEL,
    claudeProvider: process.env.TRACEVANE_GATEWAY_REPRESENTATIVE_CLAUDE_PROVIDER || DEFAULT_CLAUDE_PROVIDER,
    claudeModel: process.env.TRACEVANE_GATEWAY_REPRESENTATIVE_CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    stageTimeoutMs: 0,
    stageRetries: nonNegativeInt(process.env.TRACEVANE_GATEWAY_REPRESENTATIVE_STAGE_RETRIES, 0),
    smokeRetries: 1,
    smokeDelayMs: nonNegativeInt(process.env.TRACEVANE_GATEWAY_REPRESENTATIVE_SMOKE_DELAY_MS, 0),
    skipGlm: false,
    skipCodex: false,
    skipClaude: false,
    routeOnly: false,
    json: false,
    reportFile: "",
    markdownReport: "",
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
    else if (arg === "--codex-model") options.codexModel = argv[++index] || options.codexModel;
    else if (arg.startsWith("--codex-model=")) options.codexModel = arg.slice("--codex-model=".length);
    else if (arg === "--claude-provider") options.claudeProvider = argv[++index] || options.claudeProvider;
    else if (arg.startsWith("--claude-provider=")) options.claudeProvider = arg.slice("--claude-provider=".length);
    else if (arg === "--claude-model") options.claudeModel = argv[++index] || options.claudeModel;
    else if (arg.startsWith("--claude-model=")) options.claudeModel = arg.slice("--claude-model=".length);
    else if (arg === "--timeout-ms") options.timeoutMs = positiveInt(argv[++index], DEFAULT_TIMEOUT_MS);
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = positiveInt(arg.slice("--timeout-ms=".length), DEFAULT_TIMEOUT_MS);
    else if (arg === "--stage-timeout-ms") options.stageTimeoutMs = positiveInt(argv[++index], 0);
    else if (arg.startsWith("--stage-timeout-ms=")) options.stageTimeoutMs = positiveInt(arg.slice("--stage-timeout-ms=".length), 0);
    else if (arg === "--stage-retries") options.stageRetries = nonNegativeInt(argv[++index], 0);
    else if (arg.startsWith("--stage-retries=")) options.stageRetries = nonNegativeInt(arg.slice("--stage-retries=".length), 0);
    else if (arg === "--smoke-retries") options.smokeRetries = nonNegativeInt(argv[++index], 1);
    else if (arg.startsWith("--smoke-retries=")) options.smokeRetries = nonNegativeInt(arg.slice("--smoke-retries=".length), 1);
    else if (arg === "--smoke-delay-ms") options.smokeDelayMs = nonNegativeInt(argv[++index], 0);
    else if (arg.startsWith("--smoke-delay-ms=")) options.smokeDelayMs = nonNegativeInt(arg.slice("--smoke-delay-ms=".length), 0);
    else if (arg === "--skip-glm") options.skipGlm = true;
    else if (arg === "--skip-codex") options.skipCodex = true;
    else if (arg === "--skip-claude") options.skipClaude = true;
    else if (arg === "--route-only") options.routeOnly = true;
    else if (arg === "--report-file") options.reportFile = argv[++index] || "";
    else if (arg.startsWith("--report-file=")) options.reportFile = arg.slice("--report-file=".length);
    else if (arg === "--markdown-report") options.markdownReport = argv[++index] || "";
    else if (arg.startsWith("--markdown-report=")) options.markdownReport = arg.slice("--markdown-report=".length);
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  options.endpoint = options.endpoint.replace(/\/+$/g, "");
  for (const field of ["glmProvider", "glmModel", "codexProvider", "codexModel", "claudeProvider", "claudeModel"]) {
    options[field] = String(options[field] || "").trim();
  }
  if (!options.stageTimeoutMs) options.stageTimeoutMs = defaultStageTimeoutMs(options.timeoutMs);
  if (!options.skipGlm && (!options.glmProvider || !options.glmModel)) throw new Error("--glm-provider and --glm-model are required.");
  if (!options.skipCodex && (!options.codexProvider || !options.codexModel)) throw new Error("--codex-provider and --codex-model are required.");
  if (!options.skipClaude && (!options.claudeProvider || !options.claudeModel)) throw new Error("--claude-provider and --claude-model are required.");
  if (options.skipGlm && options.skipCodex && options.skipClaude) throw new Error("At least one representative stage must be enabled.");
  return options;
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
  console.log(`Usage: node scripts/smoke-model-gateway-representative-matrix.mjs [options]

Runs the high-confidence representative release matrix:
  - ${DEFAULT_GLM_MODEL} through GLM Chat + Anthropic endpoint profiles.
  - ${DEFAULT_CODEX_MODEL} through Codex account Responses.
  - ${DEFAULT_CLAUDE_MODEL} through Anthropic + Chat endpoint profiles.

Each enabled representative stage is tested across codex, claude-code, and
opencode scopes. By default every stage runs route, tool, stream-tool,
tool-result, stream-tool-result, compatibility/MCP-shaped, malformed-history,
and structured-error smokes.

Options:
  --endpoint <url>          default: ${DEFAULT_ENDPOINT}
  --glm-provider <id>       default: ${DEFAULT_GLM_PROVIDER}
  --glm-model <id>          default: ${DEFAULT_GLM_MODEL}
  --codex-provider <id>     default: ${DEFAULT_CODEX_PROVIDER}
  --codex-model <id>        default: ${DEFAULT_CODEX_MODEL}
  --claude-provider <id>    default: ${DEFAULT_CLAUDE_PROVIDER}
  --claude-model <id>       default: ${DEFAULT_CLAUDE_MODEL}
  --skip-glm                omit the GLM representative stage
  --skip-codex              omit the Codex account representative stage
  --skip-claude             omit the Claude-provider representative stage
  --route-only              run only route smokes, useful for fast endpoint triage
  --timeout-ms <n>          per active-route smoke timeout
  --stage-timeout-ms <n>    per child process watchdog; default: max(${MIN_STAGE_TIMEOUT_MS}, --timeout-ms + ${STAGE_TIMEOUT_GRACE_MS})
  --stage-retries <n>       retry a failed representative stage; default: 0
  --smoke-retries <n>       pass-through retry count for transient smoke failures; default: 1
  --smoke-delay-ms <n>      wait between active-route smoke requests in child stages
  --report-file <path>      write machine-readable JSON report
  --markdown-report <path>  write human-readable Markdown report
  --json                    machine-readable stdout
  -h, --help                Show this help
`);
}

function smokeFlags(options) {
  return options.routeOnly ? [] : FULL_SMOKE_FLAGS;
}

function stageDefinitions(options) {
  const stages = [];
  if (!options.skipGlm) {
    stages.push({
      id: `glm-${options.glmModel}`,
      channel: "glm",
      label: `GLM representative proof (${options.glmModel})`,
      provider: options.glmProvider,
      model: options.glmModel,
      expectedEndpointProfiles: {
        codex: "coding-anthropic",
        "claude-code": "coding-anthropic",
        opencode: "coding-chat",
      },
      expectedRoutes: {
        codex: "openai_responses",
        "claude-code": "anthropic_messages",
        opencode: "openai_chat_completions",
      },
      expectedApiFormats: {
        codex: "anthropic_messages",
        "claude-code": "anthropic_messages",
        opencode: "openai_chat",
      },
    });
  }
  if (!options.skipCodex) {
    stages.push({
      id: `codex-account-${options.codexModel}`,
      channel: "codex-account",
      label: `Codex account representative proof (${options.codexModel})`,
      provider: options.codexProvider,
      model: options.codexModel,
      expectedEndpointProfiles: {},
      expectedRoutes: {
        codex: "openai_responses",
        "claude-code": "anthropic_messages",
        opencode: "openai_chat_completions",
      },
      expectedApiFormats: {
        codex: "openai_responses",
        "claude-code": "openai_responses",
        opencode: "openai_responses",
      },
    });
  }
  if (!options.skipClaude) {
    stages.push({
      id: `claude-provider-${options.claudeModel}`,
      channel: "claude-provider",
      label: `Claude-provider representative proof (${options.claudeModel})`,
      provider: options.claudeProvider,
      model: options.claudeModel,
      expectedEndpointProfiles: {
        codex: "chat",
        "claude-code": "anthropic",
        opencode: "chat",
      },
      expectedRoutes: {
        codex: "openai_responses",
        "claude-code": "anthropic_messages",
        opencode: "openai_chat_completions",
      },
      expectedApiFormats: {
        codex: "openai_chat",
        "claude-code": "anthropic_messages",
        opencode: "openai_chat",
      },
    });
  }
  return stages.map((stage) => ({
    ...stage,
    args: activeRoutesArgsForStage(options, stage),
    expectedProofs: AGENT_SCOPES.map((scope) => ({
      id: `${stage.channel}:${stage.model}:${scope}`,
      channel: stage.channel,
      provider: stage.provider,
      model: stage.model,
      scope,
      endpointProfile: stage.expectedEndpointProfiles[scope] || null,
      routeId: stage.expectedRoutes[scope],
      apiFormat: stage.expectedApiFormats[scope],
    })),
  }));
}

function activeRoutesArgsForStage(options, stage) {
  return [
    "--provider", stage.provider,
    "--model", stage.model,
    "--scopes", AGENT_SCOPES.join(","),
    "--smoke-retries", String(options.smokeRetries),
    "--smoke-delay-ms", String(options.smokeDelayMs),
    "--expect-routes", scopeMap(stage.expectedRoutes),
    "--expect-api-formats", scopeMap(stage.expectedApiFormats),
    ...(Object.keys(stage.expectedEndpointProfiles).length
      ? ["--expect-endpoints", scopeMap(stage.expectedEndpointProfiles)]
      : []),
    ...smokeFlags(options),
  ];
}

function scopeMap(values) {
  return AGENT_SCOPES
    .map((scope) => values[scope] ? `${scope}=${values[scope]}` : "")
    .filter(Boolean)
    .join(",");
}

async function runRepresentativeStage(options, stage) {
  const attempts = [];
  const maxAttempts = 1 + options.stageRetries;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runRepresentativeStageOnce(options, stage, attempt, maxAttempts);
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

async function runRepresentativeStageOnce(options, stage, attempt, attempts) {
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
      maxBuffer: 1024 * 1024 * 32,
      timeout: options.stageTimeoutMs,
      killSignal: "SIGTERM",
    });
    const activeRoutes = JSON.parse(result.stdout);
    return {
      id: stage.id,
      channel: stage.channel,
      label: stage.label,
      provider: stage.provider,
      model: stage.model,
      ok: Boolean(activeRoutes?.ok),
      attempt,
      attempts,
      expectedProofs: stage.expectedProofs,
      activeRoutes,
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
      channel: stage.channel,
      label: stage.label,
      provider: stage.provider,
      model: stage.model,
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
    restoreMismatches: result.activeRoutes?.restoreMismatches || [],
  };
}

function failedSmokeSummaries(activeRoutes) {
  const summaries = [];
  for (const group of SMOKE_GROUPS) {
    for (const smoke of activeRoutes?.[group] || []) {
      if (smoke?.ok) continue;
      summaries.push({
        group,
        scope: smoke?.scope || null,
        status: smoke?.status ?? null,
        statusCode: smoke?.statusCode ?? null,
        routeId: smoke?.routeId || null,
        endpointProfile: smoke?.endpointProfile || null,
        apiFormat: smoke?.apiFormat || null,
        upstreamUrl: smoke?.upstreamUrl || null,
        transient: Boolean(smoke?.transient),
        error: smoke?.error || null,
        responsePreview: typeof smoke?.responsePreview === "string" ? smoke.responsePreview.slice(0, 500) : null,
      });
    }
  }
  return summaries;
}

function representativeProofs(stages) {
  const proofs = [];
  for (const stage of stages) {
    const smokes = Array.isArray(stage.activeRoutes?.routeSmokes) ? stage.activeRoutes.routeSmokes : [];
    for (const expected of stage.expectedProofs) {
      const smoke = smokes.find((item) => item.scope === expected.scope) || null;
      proofs.push({
        ...expected,
        ok: Boolean(
          smoke?.ok
          && smoke.routeId === expected.routeId
          && smoke.apiFormat === expected.apiFormat
          && (expected.endpointProfile === null || smoke.endpointProfile === expected.endpointProfile)
        ),
        observedRouteId: smoke?.routeId || null,
        observedMode: smoke?.mode || null,
        observedEndpointProfile: smoke?.endpointProfile || null,
        observedApiFormat: smoke?.apiFormat || null,
        observedUpstreamUrl: smoke?.upstreamUrl || null,
        status: smoke?.status ?? null,
        statusCode: smoke?.statusCode ?? null,
        error: smoke?.error || null,
      });
    }
  }
  return proofs;
}

function smokeGroupSummary(stages) {
  const groups = {};
  for (const group of SMOKE_GROUPS) {
    groups[group] = { total: 0, passed: 0, failed: 0, scopes: {}, channels: {} };
  }
  for (const stage of stages) {
    for (const group of SMOKE_GROUPS) {
      for (const smoke of stage.activeRoutes?.[group] || []) {
        const ok = Boolean(smoke?.ok);
        groups[group].total += 1;
        if (ok) groups[group].passed += 1;
        else groups[group].failed += 1;
        const scope = smoke?.scope || "unknown";
        groups[group].scopes[scope] = groups[group].scopes[scope] || { total: 0, passed: 0, failed: 0 };
        groups[group].scopes[scope].total += 1;
        if (ok) groups[group].scopes[scope].passed += 1;
        else groups[group].scopes[scope].failed += 1;
        const channel = stage.channel || "unknown";
        groups[group].channels[channel] = groups[group].channels[channel] || { total: 0, passed: 0, failed: 0 };
        groups[group].channels[channel].total += 1;
        if (ok) groups[group].channels[channel].passed += 1;
        else groups[group].channels[channel].failed += 1;
      }
    }
  }
  return groups;
}

function buildMonitoringSummary(stages) {
  const routeDecisions = [];
  const failures = [];
  const restoreIssues = [];
  for (const stage of stages) {
    for (const smoke of stage.activeRoutes?.routeSmokes || []) {
      routeDecisions.push({
        stage: stage.id,
        channel: stage.channel,
        provider: stage.provider,
        model: stage.model,
        scope: smoke.scope,
        ok: Boolean(smoke.ok),
        status: smoke.status,
        statusCode: smoke.statusCode,
        routeId: smoke.routeId,
        mode: smoke.mode,
        endpointProfile: smoke.endpointProfile,
        apiFormat: smoke.apiFormat,
        upstreamUrl: smoke.upstreamUrl,
      });
    }
    failures.push(...failedSmokeSummaries(stage.activeRoutes).map((failure) => ({
      ...failure,
      stage: stage.id,
      channel: stage.channel,
      provider: stage.provider,
      model: stage.model,
    })));
    for (const item of [
      ...(stage.activeRoutes?.setupFailures || []),
      ...(stage.activeRoutes?.expectationFailures || []),
      ...(stage.activeRoutes?.restoreFailures || []),
      ...(stage.activeRoutes?.restoreMismatches || []),
    ]) {
      restoreIssues.push({
        stage: stage.id,
        channel: stage.channel,
        provider: stage.provider,
        model: stage.model,
        ...item,
      });
    }
  }
  return {
    routeDecisions,
    failures,
    issues: restoreIssues,
    totalRouteDecisions: routeDecisions.length,
    totalFailures: failures.length,
    totalIssues: restoreIssues.length,
  };
}

function buildAcceptanceSummary(proofs, stages) {
  const smokeGroups = smokeGroupSummary(stages);
  return {
    rule: "Representative matrix is signed off only when every enabled representative model passes every enabled agent scope and smoke group, with endpoint/route/api-format expectations satisfied.",
    representativeModels: Array.from(new Set(stages.map((stage) => `${stage.provider}:${stage.model}`))),
    agentScopes: AGENT_SCOPES,
    routeProofs: proofs.map((proof) => ({
      channel: proof.channel,
      provider: proof.provider,
      model: proof.model,
      agentScope: proof.scope,
      expectedRouteId: proof.routeId,
      observedRouteId: proof.observedRouteId,
      expectedEndpointProfile: proof.endpointProfile,
      observedEndpointProfile: proof.observedEndpointProfile,
      expectedApiFormat: proof.apiFormat,
      observedApiFormat: proof.observedApiFormat,
      status: proof.ok ? "passed" : "failed",
    })),
    smokeGroups,
  };
}

function writeReportFile(filePath, content) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content);
}

function markdownTable(rows, columns) {
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => markdownCell(row[column.key])).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

function markdownCell(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).replace(/\|/g, "\\|").replace(/\s+/g, " ");
}

function buildMarkdownReport(result) {
  const routeRows = result.acceptanceSummary.routeProofs;
  const smokeRows = Object.entries(result.acceptanceSummary.smokeGroups).map(([group, summary]) => ({
    group,
    total: summary.total,
    passed: summary.passed,
    failed: summary.failed,
  }));
  const failureRows = result.monitoring.failures.map((failure) => ({
    stage: failure.stage,
    scope: failure.scope,
    group: failure.group,
    status: failure.status,
    statusCode: failure.statusCode,
    error: failure.error?.code || failure.error?.message || failure.responsePreview || "",
  }));
  return [
    "# Model Gateway Representative Matrix Report",
    "",
    `Checked at: ${result.checkedAt}`,
    `Endpoint: ${result.endpoint}`,
    `Result: ${result.ok ? "PASS" : "FAIL"}`,
    "",
    "## Route Proofs",
    "",
    markdownTable(routeRows, [
      { key: "channel", label: "Channel" },
      { key: "provider", label: "Provider" },
      { key: "model", label: "Model" },
      { key: "agentScope", label: "Agent" },
      { key: "observedRouteId", label: "Route" },
      { key: "observedEndpointProfile", label: "Endpoint" },
      { key: "observedApiFormat", label: "API format" },
      { key: "status", label: "Status" },
    ]),
    "",
    "## Smoke Groups",
    "",
    markdownTable(smokeRows, [
      { key: "group", label: "Smoke group" },
      { key: "total", label: "Total" },
      { key: "passed", label: "Passed" },
      { key: "failed", label: "Failed" },
    ]),
    "",
    "## Failures",
    "",
    failureRows.length
      ? markdownTable(failureRows, [
        { key: "stage", label: "Stage" },
        { key: "scope", label: "Scope" },
        { key: "group", label: "Group" },
        { key: "status", label: "HTTP" },
        { key: "statusCode", label: "Upstream" },
        { key: "error", label: "Error" },
      ])
      : "None.",
    "",
    "## Monitoring Summary",
    "",
    `Route decisions: ${result.monitoring.totalRouteDecisions}`,
    `Failed smokes: ${result.monitoring.totalFailures}`,
    `Setup/restore/expectation issues: ${result.monitoring.totalIssues}`,
    "",
    "## Rule",
    "",
    result.acceptanceSummary.rule,
    "",
  ].join("\n");
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Gateway representative matrix: ${result.ok ? "PASS" : "FAIL"}`);
  for (const proof of result.representativeProofs) {
    console.log(`- ${proof.id}: ${proof.ok ? "PASS" : "FAIL"} ${proof.observedRouteId || ""} ${proof.observedEndpointProfile || ""} ${proof.observedApiFormat || ""}`);
  }
  if (result.monitoring.totalFailures) {
    console.log(`Failures: ${result.monitoring.totalFailures}`);
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const stages = [];
  for (const stage of stageDefinitions(options)) {
    stages.push(await runRepresentativeStage(options, stage));
  }
  const proofs = representativeProofs(stages);
  const acceptanceSummary = buildAcceptanceSummary(proofs, stages);
  const monitoring = buildMonitoringSummary(stages);
  const result = {
    ok: stages.every((stage) => stage.ok) && proofs.every((proof) => proof.ok) && monitoring.totalIssues === 0,
    endpoint: options.endpoint,
    checkedAt: new Date().toISOString(),
    timeoutMs: options.timeoutMs,
    stageTimeoutMs: options.stageTimeoutMs,
    smokeProfile: options.routeOnly ? "route-only" : "full",
    representativeProofs: proofs,
    acceptanceSummary,
    monitoring,
    stages,
  };
  writeReportFile(options.reportFile, `${JSON.stringify(result, null, 2)}\n`);
  writeReportFile(options.markdownReport, buildMarkdownReport(result));
  printResult(result, options.json);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
