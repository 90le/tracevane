#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const DEFAULT_SINCE_MINUTES = 1440;

const THREE_STEP_PROMPT = [
  "请按顺序执行 3 次 shell 工具调用。",
  "每次工具返回后先用一句话说明结果，再继续下一次。",
  "最后给一个简短总结；每次工具都要有可见输出。",
].join("\n");

function parseArgs(argv) {
  const options = {
    sinceMinutes: DEFAULT_SINCE_MINUTES,
    plan: false,
    json: false,
    verbose: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--plan") options.plan = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--verbose") options.verbose = true;
    else if (arg === "--since-minutes") options.sinceMinutes = positiveInt(requireValue(argv, ++index, arg), DEFAULT_SINCE_MINUTES);
    else if (arg.startsWith("--since-minutes=")) options.sinceMinutes = positiveInt(arg.slice("--since-minutes=".length), DEFAULT_SINCE_MINUTES);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-channel-connectors-profile-closure.mjs [options]

Runs the live proof gates for the Channel Connectors Profile/App Connection goal.
This script intentionally separates real Feishu/Octo event-log proof from
direct-runner or dry-run evidence.
Dry-run/probe/direct-runner evidence 不替代真实 IM live proof.

Options:
  --since-minutes <n>  Event-log window. Default: ${DEFAULT_SINCE_MINUTES}
  --plan               Print planned gates and IM trigger prompts without running them.
  --json               Emit JSON only.
  --verbose            Include child stdout/stderr in JSON output.
  -h, --help           Show this help

Examples:
  node scripts/smoke-channel-connectors-profile-closure.mjs --plan
  node scripts/smoke-channel-connectors-profile-closure.mjs --json
`);
}

function gateDefinitions(options) {
  const since = String(options.sinceMinutes);
  return [
    {
      id: "three-agent-live-run",
      label: "Codex / Claude Code / OpenCode real IM tool + process reply coverage",
      command: "node",
      args: [
        "scripts/smoke-channel-connectors-agent-run-live.mjs",
        "--since-minutes", since,
        "--agents", "codex,claude-code,opencode",
        "--require-agent-coverage",
        "--require-ok",
        "--require-reply",
        "--require-tool",
        "--require-tool-output",
        "--require-process-reply",
        "--min-runs", "3",
        "--limit-runs", "0",
        "--json",
      ],
      missingHint: "在 Feishu 或 Octo 私聊中分别切到缺失 Agent，然后发送三步工具流 prompt。",
    },
    {
      id: "feishu-explicit-compact",
      label: "Feishu long-connection explicit /compact native proof",
      command: "node",
      args: [
        "scripts/smoke-channel-connectors-compact-live.mjs",
        "--platform", "feishu",
        "--mode", "explicit",
        "--since-minutes", since,
        "--json",
      ],
      missingHint: "在 Feishu 私聊中发送 /compact，等待完成后重跑本脚本。",
    },
    {
      id: "octo-explicit-compact",
      label: "Octo explicit /compact native proof",
      command: "node",
      args: [
        "scripts/smoke-channel-connectors-compact-live.mjs",
        "--platform", "octo",
        "--mode", "explicit",
        "--since-minutes", since,
        "--json",
      ],
      missingHint: "在 Octo 私聊中发送 /compact，等待完成后重跑本脚本。",
    },
    {
      id: "inbound-image",
      label: "Feishu/Octo inbound image staged-path proof",
      command: "node",
      args: [
        "scripts/smoke-channel-connectors-agent-run-live.mjs",
        "--since-minutes", since,
        "--require-ok",
        "--require-reply",
        "--require-inbound-image",
        "--require-staged-files",
        "--min-runs", "1",
        "--limit-runs", "0",
        "--json",
      ],
      missingHint: "向 Feishu 或 Octo 私聊发送一张图片并等待 Agent 回复。",
    },
  ];
}

function runGate(gate, options) {
  const child = spawnSync(gate.command, gate.args, {
    encoding: "utf8",
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  const parsed = parseJson(child.stdout);
  return {
    id: gate.id,
    label: gate.label,
    ok: child.status === 0 && parsed?.ok === true,
    exitCode: child.status,
    command: [gate.command, ...gate.args].join(" "),
    summary: summarizeGate(gate.id, parsed),
    missingHint: gate.missingHint,
    ...(options.verbose ? { stdout: child.stdout, stderr: child.stderr } : {}),
  };
}

function parseJson(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function summarizeGate(id, parsed) {
  if (!parsed || typeof parsed !== "object") return { parsed: false };
  if (id === "three-agent-live-run") {
    return {
      matchingAgents: parsed.matchingAgents || [],
      missingAgents: parsed.missingAgents || [],
      matchingRuns: parsed.counts?.matchingRuns ?? null,
      requirementViolations: parsed.counts?.requirementViolations ?? null,
      requirementWarnings: parsed.counts?.requirementWarnings ?? null,
    };
  }
  if (id.endsWith("compact")) {
    return {
      proofCount: parsed.proofCount ?? null,
      failures: parsed.failures || [],
    };
  }
  if (id === "inbound-image") {
    return {
      matchingRuns: parsed.counts?.matchingRuns ?? null,
      stagedRequired: parsed.requirements?.requireStagedFiles ?? null,
    };
  }
  return { ok: parsed.ok === true };
}

function triggerPlan() {
  return [
    {
      purpose: "缺失 Agent 工具流/过程回复",
      action: "在 Feishu 或 Octo 私聊中，对缺失 Agent 分别执行：/agent codex 或 /agent opencode，然后发送 prompt。",
      prompt: THREE_STEP_PROMPT,
    },
    {
      purpose: "Feishu 显式 compact",
      action: "在 Feishu 私聊发送 /compact，等待 compact 完成。",
    },
    {
      purpose: "Octo 显式 compact",
      action: "在 Octo 私聊发送 /compact，等待 compact 完成。",
    },
    {
      purpose: "入站图片",
      action: "向 Feishu 或 Octo 私聊发送一张图片，等待 Agent 回复。",
    },
  ];
}

function renderHuman(report) {
  console.log("Channel Connectors Profile/App Connection closure gates");
  console.log(`checkedAt: ${report.checkedAt}`);
  console.log(`sinceMinutes: ${report.sinceMinutes}`);
  for (const gate of report.gates) {
    console.log(`- ${gate.ok ? "OK" : "MISSING"} ${gate.id}: ${gate.label}`);
    if (!gate.ok) {
      console.log(`  ${gate.missingHint}`);
      if (gate.summary?.missingAgents?.length) console.log(`  missingAgents: ${gate.summary.missingAgents.join(", ")}`);
    }
  }
  if (!report.ok) {
    console.log("\nIM trigger plan:");
    for (const item of report.triggerPlan) {
      console.log(`- ${item.purpose}: ${item.action}`);
      if (item.prompt) console.log(`  prompt: ${item.prompt.replace(/\n/g, " / ")}`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const gates = gateDefinitions(options);
  const report = {
    ok: false,
    checkedAt: new Date().toISOString(),
    sinceMinutes: options.sinceMinutes,
    mode: options.plan ? "plan" : "run",
    gates: options.plan ? gates.map((gate) => ({
      id: gate.id,
      label: gate.label,
      command: [gate.command, ...gate.args].join(" "),
      missingHint: gate.missingHint,
    })) : gates.map((gate) => runGate(gate, options)),
    triggerPlan: triggerPlan(),
  };
  report.ok = options.plan ? true : report.gates.every((gate) => gate.ok === true);

  if (options.json) console.log(JSON.stringify(report, null, 2));
  else renderHuman(report);
  process.exit(report.ok ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
