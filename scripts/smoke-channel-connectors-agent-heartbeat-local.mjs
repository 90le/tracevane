#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import {
  defaultChannelConnectorAgentProcessRunner,
} from "../dist/apps/api/modules/channel-connectors/agent-runner.js";

const CLI_HEARTBEAT_AGENTS = ["codex", "claude-code", "opencode"];

function parseArgs(argv) {
  const options = {
    json: false,
    keepTemp: false,
  };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--keep-temp") options.keepTemp = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-channel-connectors-agent-heartbeat-local.mjs [options]

Runs a local-only Channel Connectors process-runner heartbeat matrix. It uses
synthetic child Node processes instead of real IM channels, Gateway requests,
or Codex/Claude/OpenCode binaries.

Checks:
  - Codex / Claude Code / OpenCode stderr CR-only TUI heartbeat keeps runs alive
  - Codex / Claude Code / OpenCode stdout activity keeps runs alive
  - idleTimeoutMs replaces the old total timeout for CLI heartbeat agents
  - silent CLI agents fail with process/heartbeat-timeout
  - non-runtime agents still use the fixed process timeout

Options:
  --json       Emit JSON only
  --keep-temp  Keep temporary child working directories for debugging
  -h, --help   Show this help

Examples:
  node scripts/smoke-channel-connectors-agent-heartbeat-local.mjs
  node scripts/smoke-channel-connectors-agent-heartbeat-local.mjs --json
`);
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "studio-channel-heartbeat-local-"));
}

function cleanupTempRoot(root, keepTemp) {
  if (keepTemp) return;
  fs.rmSync(root, { recursive: true, force: true });
}

function completionLines(agent, text) {
  if (agent === "codex") {
    return [
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } }),
      JSON.stringify({ type: "turn.completed" }),
    ];
  }
  if (agent === "claude-code") {
    return [
      JSON.stringify({ type: "result", result: text, session_id: `${agent}-heartbeat-local` }),
    ];
  }
  return [
    JSON.stringify({ type: "text", part: { type: "text", text } }),
    JSON.stringify({ type: "step_finish", part: { type: "step-finish", reason: "stop" } }),
  ];
}

function completionScript(agent, text) {
  return completionLines(agent, text)
    .map((line) => `process.stdout.write(${JSON.stringify(`${line}\n`)});`)
    .join("");
}

function heartbeatScript(input) {
  const completion = completionScript(input.agent, input.text);
  return [
    "let tick = 0;",
    "const interval = setInterval(() => {",
    "  tick += 1;",
    `  process.${input.stream}.write(${JSON.stringify(input.frame)}.replace("tick", String(tick)));`,
    "  if (tick >= 5) {",
    "    clearInterval(interval);",
    completion,
    "  }",
    "}, 45);",
  ].join("");
}

function delayedCompletionScript(agent, text, delayMs) {
  return [
    "setTimeout(() => {",
    completionScript(agent, text),
    `}, ${delayMs});`,
  ].join("");
}

function hangScript() {
  return "setInterval(() => {}, 1000);";
}

function nonRuntimeActivityScript() {
  return [
    "let tick = 0;",
    "const interval = setInterval(() => {",
    "  tick += 1;",
    "  process.stdout.write(`non-runtime activity ${tick}\\n`);",
    "  if (tick >= 8) clearInterval(interval);",
    "}, 25);",
  ].join("");
}

function assertAlive(result, progress, label, minDurationMs) {
  if (result.exitCode !== 0) throw new Error(`${label}: expected exitCode=0, got ${result.exitCode}`);
  if (result.timedOut) throw new Error(`${label}: unexpectedly timed out: ${result.error || ""}`);
  if (result.error) throw new Error(`${label}: unexpected error: ${result.error}`);
  if (result.durationMs < minDurationMs) throw new Error(`${label}: finished before timeout pressure (${result.durationMs}ms < ${minDurationMs}ms)`);
  if (progress.some((event) => event.rawType === "process/heartbeat-timeout")) {
    throw new Error(`${label}: emitted process/heartbeat-timeout during active heartbeat`);
  }
  if (progress.at(-1)?.type !== "completed") {
    throw new Error(`${label}: expected final completed progress event`);
  }
}

function assertHeartbeatTimeout(result, progress, label) {
  if (!result.timedOut) throw new Error(`${label}: expected timedOut=true`);
  if (!/heartbeat timed out/.test(result.error || "")) throw new Error(`${label}: expected heartbeat timeout error, got ${result.error || "null"}`);
  if (!progress.some((event) => event.rawType === "process/heartbeat-timeout" && event.type === "failed")) {
    throw new Error(`${label}: expected process/heartbeat-timeout progress event`);
  }
}

function assertFixedTimeout(result, progress, label) {
  if (!result.timedOut) throw new Error(`${label}: expected fixed process timeout`);
  if (result.error !== "Agent process timed out.") throw new Error(`${label}: expected legacy timeout error, got ${result.error || "null"}`);
  if (progress.some((event) => event.rawType === "process/heartbeat-timeout")) {
    throw new Error(`${label}: non-runtime agent must not emit heartbeat timeout progress`);
  }
}

async function runCase(input, options) {
  const root = makeTempRoot();
  const progress = [];
  try {
    const result = await defaultChannelConnectorAgentProcessRunner({
      command: process.execPath,
      args: ["-e", input.script],
      cwd: root,
      stdin: "",
      env: {},
      timeoutMs: input.timeoutMs,
      idleTimeoutMs: input.idleTimeoutMs,
      agent: input.agent,
      onProgress: (event) => progress.push(event),
    });
    input.assertResult(result, progress, input.name);
    return {
      name: input.name,
      agent: input.agent,
      ok: true,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      error: result.error,
      progressTypes: progress.map((event) => event.rawType || event.type),
    };
  } catch (error) {
    return {
      name: input.name,
      agent: input.agent,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    cleanupTempRoot(root, options.keepTemp);
  }
}

function buildCases() {
  const cases = [];
  for (const agent of CLI_HEARTBEAT_AGENTS) {
    cases.push({
      name: `${agent}:stderr-cr-tui-heartbeat`,
      agent,
      timeoutMs: 180,
      script: heartbeatScript({
        agent,
        stream: "stderr",
        frame: agent === "codex" ? "\\r• Working (tick)" : "\\r✻ Imagining... (tick) ........ esc interrupt",
        text: `${agent} stderr TUI heartbeat kept alive`,
      }),
      assertResult: (result, progress, label) => assertAlive(result, progress, label, 180),
    });
    cases.push({
      name: `${agent}:stdout-heartbeat`,
      agent,
      timeoutMs: 180,
      script: heartbeatScript({
        agent,
        stream: "stdout",
        frame: `${agent} stdout heartbeat tick\n`,
        text: `${agent} stdout heartbeat kept alive`,
      }),
      assertResult: (result, progress, label) => assertAlive(result, progress, label, 180),
    });
    cases.push({
      name: `${agent}:idle-timeout-replaces-total-timeout`,
      agent,
      timeoutMs: 40,
      idleTimeoutMs: 220,
      script: delayedCompletionScript(agent, `${agent} idle timeout replaced total timeout`, 110),
      assertResult: (result, progress, label) => assertAlive(result, progress, label, 40),
    });
    cases.push({
      name: `${agent}:silent-heartbeat-timeout`,
      agent,
      timeoutMs: 60,
      script: hangScript(),
      assertResult: assertHeartbeatTimeout,
    });
  }
  cases.push({
    name: "gemini:fixed-timeout-unchanged",
    agent: "gemini",
    timeoutMs: 70,
    idleTimeoutMs: 500,
    script: nonRuntimeActivityScript(),
    assertResult: assertFixedTimeout,
  });
  return cases;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const results = [];
  for (const item of buildCases()) {
    results.push(await runCase(item, options));
  }
  const failed = results.filter((item) => !item.ok);
  const summary = {
    ok: failed.length === 0,
    durationMs: Date.now() - startedAt,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    for (const item of results) {
      const status = item.ok ? "PASS" : "FAIL";
      const detail = item.ok ? `${item.durationMs}ms` : item.error;
      console.log(`${status} ${item.name} ${detail}`);
    }
    console.log(`${summary.ok ? "PASS" : "FAIL"} local heartbeat smoke: ${summary.passed}/${summary.total} passed in ${summary.durationMs}ms`);
  }

  if (!summary.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
