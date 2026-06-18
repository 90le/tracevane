#!/usr/bin/env node
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const DEFAULT_ENDPOINT = "http://127.0.0.1:18796";
const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_GLM_PROVIDER = "glm";
const DEFAULT_GLM_MODEL = "glm-5.2";
const DEFAULT_CODEX_PROVIDER = "codex-account";
const DEFAULT_CODEX_MODEL = "gpt-5.5";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const activeRoutesScript = path.join(repoRoot, "scripts/smoke-model-gateway-active-routes.mjs");

function parseArgs(argv) {
  const options = {
    endpoint: process.env.STUDIO_GATEWAY_ENDPOINT || DEFAULT_ENDPOINT,
    glmProvider: process.env.STUDIO_GATEWAY_PROTOCOL_GLM_PROVIDER || DEFAULT_GLM_PROVIDER,
    glmModel: process.env.STUDIO_GATEWAY_PROTOCOL_GLM_MODEL || DEFAULT_GLM_MODEL,
    codexProvider: process.env.STUDIO_GATEWAY_PROTOCOL_CODEX_PROVIDER || DEFAULT_CODEX_PROVIDER,
    codexModel: process.env.STUDIO_GATEWAY_PROTOCOL_CODEX_MODEL || DEFAULT_CODEX_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
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
    else if (arg === "--codex-model") options.codexModel = argv[++index] || options.codexModel;
    else if (arg.startsWith("--codex-model=")) options.codexModel = arg.slice("--codex-model=".length);
    else if (arg === "--timeout-ms") options.timeoutMs = positiveInt(argv[++index], DEFAULT_TIMEOUT_MS);
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = positiveInt(arg.slice("--timeout-ms=".length), DEFAULT_TIMEOUT_MS);
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
  if (!options.glmProvider) throw new Error("--glm-provider is required.");
  if (!options.glmModel) throw new Error("--glm-model is required.");
  if (!options.codexProvider) throw new Error("--codex-provider is required.");
  if (!options.codexModel) throw new Error("--codex-model is required.");
  return options;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-model-gateway-protocol-matrix.mjs [options]

Verifies the current release protocol matrix through active-route smoke:
  - GLM Coding Chat covers OpenAI Chat-compatible / OpenCode.
  - GLM Coding Anthropic covers Anthropic Messages / Claude Code.
  - Codex account covers the official Codex Responses account route.

Options:
  --endpoint <url>        default: ${DEFAULT_ENDPOINT}
  --glm-provider <id>     default: ${DEFAULT_GLM_PROVIDER}
  --glm-model <id>        default: ${DEFAULT_GLM_MODEL}
  --codex-provider <id>   default: ${DEFAULT_CODEX_PROVIDER}
  --codex-model <id>      default: ${DEFAULT_CODEX_MODEL}
  --timeout-ms <n>        per active-route smoke timeout
  --json                  machine-readable output
  -h, --help              Show this help
`);
}

function stageDefinitions(options) {
  return [
    {
      id: "glm-native-protocols",
      label: "GLM native Chat + Anthropic protocol proof",
      provider: options.glmProvider,
      model: options.glmModel,
      args: [
        "--provider", options.glmProvider,
        "--model", options.glmModel,
        "--scopes", "claude-code,opencode",
        "--expect-endpoints", "claude-code=coding-anthropic,opencode=coding-chat",
        "--expect-routes", "claude-code=anthropic_messages,opencode=openai_chat_completions",
        "--expect-api-formats", "claude-code=anthropic_messages,opencode=openai_chat",
      ],
      expectedProofs: [
        { id: "anthropic_messages", scope: "claude-code", provider: options.glmProvider, endpointProfile: "coding-anthropic" },
        { id: "openai_chat_completions", scope: "opencode", provider: options.glmProvider, endpointProfile: "coding-chat" },
      ],
    },
    {
      id: "codex-account-responses",
      label: "Codex account official Responses proof",
      provider: options.codexProvider,
      model: options.codexModel,
      args: [
        "--provider", options.codexProvider,
        "--model", options.codexModel,
        "--scopes", "codex",
        "--expect-routes", "codex=openai_responses",
        "--expect-api-formats", "codex=openai_responses",
      ],
      expectedProofs: [
        { id: "codex_account_responses", scope: "codex", provider: options.codexProvider, endpointProfile: null },
      ],
    },
  ];
}

async function runActiveRoutesStage(options, stage) {
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
    });
    return {
      id: stage.id,
      label: stage.label,
      ok: true,
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
      expectedProofs: stage.expectedProofs,
      activeRoutes: parsed,
      error: {
        message: error instanceof Error ? error.message : String(error),
        stderr: typeof error?.stderr === "string" ? error.stderr.trim() : "",
      },
    };
  }
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
