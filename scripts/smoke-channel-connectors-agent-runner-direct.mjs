#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import {
  runChannelConnectorAgentTurn,
} from "../dist/apps/api/modules/channel-connectors/agent-runner.js";
import {
  resolveChannelConnectorGatewayClientKey,
} from "../dist/apps/api/modules/channel-connectors/gateway-secret.js";

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".config/tracevane/channel-connectors/daemon/config.json");
const DEFAULT_AGENTS = ["opencode"];
const DEFAULT_MODEL = "glm-5";
const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_MIN_PROCESS_REPLIES = 2;
const DEFAULT_MIN_TOOL_OUTPUTS = 3;

function parseArgs(argv) {
  const options = {
    configPath: DEFAULT_CONFIG_PATH,
    agents: DEFAULT_AGENTS,
    model: DEFAULT_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    minProcessReplies: DEFAULT_MIN_PROCESS_REPLIES,
    minToolOutputs: DEFAULT_MIN_TOOL_OUTPUTS,
    keepTemp: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--keep-temp") options.keepTemp = true;
    else if (arg === "--agents") options.agents = csv(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--agents=")) options.agents = csv(arg.slice("--agents=".length));
    else if (arg === "--model") options.model = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--model=")) options.model = arg.slice("--model=".length);
    else if (arg === "--config") options.configPath = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--config=")) options.configPath = arg.slice("--config=".length);
    else if (arg === "--timeout-ms") options.timeoutMs = positiveInt(requireValue(argv, ++index, arg), DEFAULT_TIMEOUT_MS);
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = positiveInt(arg.slice("--timeout-ms=".length), DEFAULT_TIMEOUT_MS);
    else if (arg === "--min-process-replies") options.minProcessReplies = nonNegativeInt(requireValue(argv, ++index, arg), DEFAULT_MIN_PROCESS_REPLIES);
    else if (arg.startsWith("--min-process-replies=")) options.minProcessReplies = nonNegativeInt(arg.slice("--min-process-replies=".length), DEFAULT_MIN_PROCESS_REPLIES);
    else if (arg === "--min-tool-outputs") options.minToolOutputs = nonNegativeInt(requireValue(argv, ++index, arg), DEFAULT_MIN_TOOL_OUTPUTS);
    else if (arg.startsWith("--min-tool-outputs=")) options.minToolOutputs = nonNegativeInt(arg.slice("--min-tool-outputs=".length), DEFAULT_MIN_TOOL_OUTPUTS);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.agents.length) throw new Error("--agents must include at least one agent id");
  options.configPath = path.resolve(options.configPath);
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-channel-connectors-agent-runner-direct.mjs [options]

Runs real Channel Connector runner turns without injecting IM messages. This proves
the native CLI runner/parser path only; use smoke-channel-connectors-agent-run-live
for Feishu/Octo event-log evidence.

Options:
  --agents <ids>              Comma-separated: codex,claude-code,opencode. Default: ${DEFAULT_AGENTS.join(",")}
  --model <id>                Gateway model. Default: ${DEFAULT_MODEL}
  --min-process-replies <n>   Required assistant intermediate replies per agent. Default: ${DEFAULT_MIN_PROCESS_REPLIES}
  --min-tool-outputs <n>      Required visible tool outputs per agent. Default: ${DEFAULT_MIN_TOOL_OUTPUTS}
  --timeout-ms <n>            Per-agent timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --config <path>             Daemon config path. Default: ${DEFAULT_CONFIG_PATH}
  --keep-temp                 Keep isolated CLI runtime files for debugging
  --json                      Emit JSON only
  -h, --help                  Show this help

Examples:
  node scripts/smoke-channel-connectors-agent-runner-direct.mjs --json
  node scripts/smoke-channel-connectors-agent-runner-direct.mjs --agents opencode --model glm-5
`);
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function csv(value) {
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function agentProfileRef(agent) {
  if (agent === "claude-code") return "claude";
  return agent;
}

function promptText() {
  return [
    "请严格按顺序执行，不要跳步，不要并行：",
    "1. 先用一句话说明准备执行第一条命令，然后调用 shell 工具执行 date +%s。",
    "2. 第一条命令返回后，先用一句话说明返回结果，再调用 shell 工具执行 pwd。",
    "3. 第二条命令返回后，先用一句话说明返回结果，再调用 shell 工具执行 whoami。",
    "4. 第三条命令返回后，最后给最终总结。",
    "要求：每次工具前后都必须输出自然语言过程回复；总共调用 3 次工具；每个工具调用都要有 stdout 输出。",
  ].join("\n");
}

function projectForAgent(config, agent, model) {
  const gatewayEndpoint = normalizeString(config.gateway?.endpoint) || "http://127.0.0.1:18796/v1";
  return {
    id: `${agent}-direct-runner-smoke`,
    name: `${agent} Direct Runner Smoke`,
    workDir: process.cwd(),
    agent,
    model,
    permissionMode: "yolo",
    gatewayEndpoint,
    gatewayKeyRef: normalizeString(config.gateway?.clientKeyRef) || "tracevane-gateway-client-key",
    appProfileRef: agentProfileRef(agent),
    platformBindings: [],
  };
}

function bindingForAgent(agent) {
  return {
    id: `${agent}-direct-runner-smoke`,
    platform: "octo",
    accountId: "direct",
    botId: "direct",
    displayName: `${agent} Direct Runner Smoke`,
    agent,
    enabled: true,
    allowlist: [],
    adminUsers: [],
    disabledCommands: [],
    metadata: {
      agentSessionDriver: "one-shot",
    },
  };
}

function messageForAgent(agent) {
  const content = promptText();
  return {
    messageId: `direct-${agent}-${Date.now()}`,
    fromUid: "direct-user",
    channelId: "direct-channel",
    channelType: 1,
    timestamp: Date.now(),
    payload: {
      type: 1,
      content,
      plain: content,
    },
    attachments: [],
    members: [],
  };
}

function visibleToolOutput(event) {
  const text = normalizeString(event.text);
  if (!text) return false;
  if (/^(?:No output|无输出)$/i.test(text)) return false;
  return event.rawType === "tool_result"
    || event.itemType === "tool_result"
    || /(?:stdout:|output:|status=completed|exit_code)/i.test(text);
}

function summarizeProgress(progress) {
  const assistantIntermediate = progress.filter((event) => event.type === "assistant" && event.phase === "intermediate" && normalizeString(event.text));
  const assistantFinal = progress.filter((event) => event.type === "assistant" && event.phase === "final" && normalizeString(event.text));
  const toolEvents = progress.filter((event) => event.type === "tool");
  const toolOutputs = toolEvents.filter(visibleToolOutput);
  const reasoning = progress.filter((event) => event.type === "reasoning" && normalizeString(event.text));
  return {
    progressCount: progress.length,
    assistantIntermediateCount: assistantIntermediate.length,
    assistantFinalCount: assistantFinal.length,
    toolCount: toolEvents.length,
    toolOutputCount: toolOutputs.length,
    reasoningCount: reasoning.length,
    intermediateSamples: assistantIntermediate.slice(0, 3).map((event) => normalizeString(event.text).slice(0, 160)),
    toolSamples: toolOutputs.slice(0, 5).map((event) => ({
      rawType: event.rawType,
      itemType: event.itemType,
      toolName: event.toolName,
      text: normalizeString(event.text).slice(0, 220),
    })),
  };
}

async function runAgentSmoke(config, gatewayClientKey, agent, options, runtimeRoot) {
  const progress = [];
  const project = projectForAgent(config, agent, options.model);
  const result = await runChannelConnectorAgentTurn({
    project,
    binding: bindingForAgent(agent),
    message: messageForAgent(agent),
    sessionKey: `direct:${agent}:${Date.now()}`,
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey,
    agentRuntimeDir: path.join(runtimeRoot, agent),
    onProgress(event) {
      progress.push(event);
    },
    timeoutMs: options.timeoutMs,
  });
  const summary = summarizeProgress(progress);
  const passed = result.ok === true
    && summary.assistantIntermediateCount >= options.minProcessReplies
    && summary.toolOutputCount >= options.minToolOutputs
    && normalizeString(result.replyText).length > 0;
  return {
    agent,
    ok: result.ok,
    passed,
    status: result.status,
    exitCode: result.exitCode,
    error: result.error,
    replyLength: normalizeString(result.replyText).length,
    finalSample: normalizeString(result.replyText).slice(0, 400),
    latest: result.progress.latest,
    ...summary,
  };
}

function printHuman(results) {
  const passed = results.every((result) => result.passed);
  console.log(`Channel direct runner smoke ${passed ? "passed" : "failed"} (${results.filter((result) => result.passed).length}/${results.length})`);
  for (const result of results) {
    const parts = [
      result.passed ? "ok" : "fail",
      `agent=${result.agent}`,
      `status=${result.status}`,
      `process=${result.assistantIntermediateCount}`,
      `tool-output=${result.toolOutputCount}`,
      `final=${result.assistantFinalCount}`,
    ];
    if (result.error) parts.push(`error=${result.error}`);
    console.log(`- ${parts.join(" ")}`);
    for (const sample of result.intermediateSamples) console.log(`  process: ${sample}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = readJson(options.configPath);
  const gatewayClientKey = resolveChannelConnectorGatewayClientKey(config);
  if (!gatewayClientKey) throw new Error("Tracevane Gateway client key is missing.");
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-runner-direct-"));
  const results = [];
  try {
    for (const agent of options.agents) {
      results.push(await runAgentSmoke(config, gatewayClientKey, agent, options, runtimeRoot));
    }
  } finally {
    if (!options.keepTemp) {
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
    } else if (!options.json) {
      console.log(`Kept temp runtime: ${runtimeRoot}`);
    }
  }
  if (options.json) console.log(JSON.stringify({ ok: results.every((result) => result.passed), results }, null, 2));
  else printHuman(results);
  if (!results.every((result) => result.passed)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
