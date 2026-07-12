#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import {
  defaultChannelConnectorAgentProcessRunner,
} from "../dist/apps/api/modules/channel-connectors/agent-runner.js";

const CLI_HEARTBEAT_AGENTS = ["codex", "claude-code", "opencode", "gemini"];
const HEARTBEAT_INTERVAL_MS = 80;
const HEARTBEAT_TIMEOUT_MS = 900;
const IDLE_REPLACES_TOTAL_TIMEOUT_MS = 80;
const IDLE_REPLACES_TOTAL_IDLE_MS = 900;
const IDLE_REPLACES_TOTAL_DELAY_MS = 360;
const HEARTBEAT_STALL_MS = 320;
const ASYNC_TASK_TIMEOUT_MS = 250;
const ASYNC_TASK_GRACE_MS = 1200;
const ASYNC_TASK_COMPLETION_DELAY_MS = 520;
const SILENT_HEARTBEAT_TIMEOUT_MS = 350;
const NON_RUNTIME_TIMEOUT_MS = 350;

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
or Codex/Claude/OpenCode/Gemini binaries.

Checks:
  - Codex / Claude Code / OpenCode / Gemini stderr CR-only TUI heartbeat keeps runs alive
  - Codex / Claude Code / OpenCode / Gemini stdout activity keeps runs alive
  - Codex / Claude Code / OpenCode / Gemini async child-task TUI status uses bounded idle grace
  - heartbeat-only CLI output emits process/heartbeat-stall diagnostics
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
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-heartbeat-local-"));
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
  if (agent === "gemini") {
    return [
      JSON.stringify({ type: "message", role: "assistant", content: text }),
      JSON.stringify({ type: "result", status: "success", response: text }),
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
    `}, ${input.intervalMs || HEARTBEAT_INTERVAL_MS});`,
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

function heartbeatOnlyStallScript(agent) {
  const completion = completionScript(agent, `${agent} heartbeat-only stall diagnosed`);
  return [
    "let tick = 0;",
    "const interval = setInterval(() => {",
    "  tick += 1;",
    "  process.stderr.write(`\\rTUI heartbeat ${tick}`);",
    "  if (tick >= 7) {",
    "    clearInterval(interval);",
    completion,
    "  }",
    `}, ${HEARTBEAT_INTERVAL_MS});`,
  ].join("");
}

function asyncTaskStatusScript(agent) {
  const completion = completionScript(agent, `${agent} async child task grace kept alive`);
  const status = agent === "claude-code"
    ? "◯ deep-research  Deep research harness — fan-out web searches… 3/18 agents done · 4m 53s · ↓ 15.9k tokens"
    : agent === "opencode"
      ? "opencode parallel tasks: 2/7 tasks running · 1m 12s · ↓ 4.2k tokens"
      : "codex subagents: 3/18 agents done · 4m 53s · ↓ 15.9k tokens";
  return [
    `process.stderr.write(${JSON.stringify(`\r${status}`)});`,
    "setTimeout(() => {",
    completion,
    `}, ${ASYNC_TASK_COMPLETION_DELAY_MS});`,
  ].join("");
}

function nonRuntimeActivityScript() {
  return [
    "let tick = 0;",
    "const interval = setInterval(() => {",
    "  tick += 1;",
    "  process.stdout.write(`non-runtime activity ${tick}\\n`);",
    "  if (tick >= 80) clearInterval(interval);",
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

function assertHeartbeatStall(result, progress, label) {
  assertAlive(result, progress, label, 90);
  const stallEvents = progress.filter((event) => event.rawType === "process/heartbeat-stall");
  if (!stallEvents.length) throw new Error(`${label}: expected process/heartbeat-stall progress event`);
  if (!stallEvents.every((event) => event.type === "running")) {
    throw new Error(`${label}: heartbeat stall diagnostics must be non-terminal running events`);
  }
}

function assertAsyncTaskGrace(result, progress, label) {
  assertAlive(result, progress, label, 55);
  const asyncTaskEvents = progress.filter((event) => event.rawType === "process/async-task");
  if (!asyncTaskEvents.length) throw new Error(`${label}: expected process/async-task progress event`);
  if (!asyncTaskEvents.every((event) => event.type === "running")) {
    throw new Error(`${label}: async child-task diagnostics must be non-terminal running events`);
  }
  if (progress.some((event) => event.rawType === "process/heartbeat-timeout")) {
    throw new Error(`${label}: emitted process/heartbeat-timeout during async child-task grace`);
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
      heartbeatStallMs: input.heartbeatStallMs,
      asyncTaskIdleGraceMs: input.asyncTaskIdleGraceMs,
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
      timeoutMs: HEARTBEAT_TIMEOUT_MS,
      script: heartbeatScript({
        agent,
        stream: "stderr",
        frame: agent === "codex" ? "\\r• Working (tick)" : "\\r✻ Imagining... (tick) ........ esc interrupt",
        text: `${agent} stderr TUI heartbeat kept alive`,
      }),
      assertResult: (result, progress, label) => assertAlive(result, progress, label, 300),
    });
    cases.push({
      name: `${agent}:stdout-heartbeat`,
      agent,
      timeoutMs: HEARTBEAT_TIMEOUT_MS,
      script: heartbeatScript({
        agent,
        stream: "stdout",
        frame: `${agent} stdout heartbeat tick\n`,
        text: `${agent} stdout heartbeat kept alive`,
      }),
      assertResult: (result, progress, label) => assertAlive(result, progress, label, 300),
    });
    cases.push({
      name: `${agent}:idle-timeout-replaces-total-timeout`,
      agent,
      timeoutMs: IDLE_REPLACES_TOTAL_TIMEOUT_MS,
      idleTimeoutMs: IDLE_REPLACES_TOTAL_IDLE_MS,
      script: delayedCompletionScript(agent, `${agent} idle timeout replaced total timeout`, IDLE_REPLACES_TOTAL_DELAY_MS),
      assertResult: (result, progress, label) => assertAlive(result, progress, label, IDLE_REPLACES_TOTAL_TIMEOUT_MS),
    });
    cases.push({
      name: `${agent}:heartbeat-only-stall-diagnostic`,
      agent,
      timeoutMs: HEARTBEAT_TIMEOUT_MS,
      heartbeatStallMs: HEARTBEAT_STALL_MS,
      script: heartbeatOnlyStallScript(agent),
      assertResult: assertHeartbeatStall,
    });
    cases.push({
      name: `${agent}:async-child-task-idle-grace`,
      agent,
      timeoutMs: ASYNC_TASK_TIMEOUT_MS,
      asyncTaskIdleGraceMs: ASYNC_TASK_GRACE_MS,
      script: asyncTaskStatusScript(agent),
      assertResult: assertAsyncTaskGrace,
    });
    cases.push({
      name: `${agent}:silent-heartbeat-timeout`,
      agent,
      timeoutMs: SILENT_HEARTBEAT_TIMEOUT_MS,
      script: hangScript(),
      assertResult: assertHeartbeatTimeout,
    });
  }
  cases.push({
    name: "kimi:fixed-timeout-unchanged",
    agent: "kimi",
    timeoutMs: NON_RUNTIME_TIMEOUT_MS,
    idleTimeoutMs: 1200,
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
