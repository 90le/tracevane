import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/smoke-model-gateway-cli.mjs");
const distEntry = path.join(repoRoot, "dist/apps/api/index.js");
const execFileAsync = promisify(execFile);

test("gateway CLI diagnostic shell action is tokenized for Windows and POSIX", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.match(source, /platform === "win32"[\s\S]*?\["cmd\.exe", "\/d", "\/s", "\/c", "echo GATEWAY_OK"\]/);
  assert.match(source, /: \["sh", "-c", "printf GATEWAY_OK"\]/);
  assert.doesNotMatch(source, /command: \["bash", "-lc", "printf GATEWAY_OK"\]/);
});

const fakeCliSource = `#!/usr/bin/env node
const app = "__TRACEVANE_FAKE_APP__";
const args = process.argv.slice(2);

function argValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function post(path, body) {
  const endpoint = process.env.TRACEVANE_GATEWAY_CLI_SMOKE_ENDPOINT;
  if (!endpoint) throw new Error("TRACEVANE_GATEWAY_CLI_SMOKE_ENDPOINT is missing");
  const response = await fetch(endpoint.replace(/\\/$/, "") + path, {
    method: "POST",
    headers: {
      authorization: "Bearer " + (process.env.TRACEVANE_GATEWAY_CLI_SMOKE_KEY || "test-key"),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Gateway returned " + response.status + " for " + path);
  await response.text();
}

if (app === "codex") {
  const model = argValue("--model");
  const prompt = args.at(-1) || "";
  await post("/responses", {
    model,
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text: prompt }] }],
  });
  console.log("GATEWAY_OK");
  process.exit(0);
}

if (app === "opencode") {
  const rawModel = argValue("--model") || "";
  const model = rawModel.replace(/^tracevane-gateway\\//, "");
  const prompt = args.at(-1) || "";
  await post("/chat/completions", {
    model,
    messages: [
      { role: "system", content: "fake opencode diagnostic cli" },
      { role: "user", content: prompt },
    ],
  });
  await post("/chat/completions", {
    model,
    messages: [
      { role: "system", content: "fake opencode diagnostic cli" },
      { role: "user", content: "GATEWAY_OK without standard tool result round trip" },
    ],
  });
  console.log(JSON.stringify({ type: "text", text: "GATEWAY_OK" }));
  process.exit(0);
}

throw new Error("Unexpected fake CLI command: " + app);
`;

const fakeNoRequestCliSource = `#!/usr/bin/env node
console.log("GATEWAY_OK");
`;

const fakeHangingCliSource = `#!/usr/bin/env node
import("node:fs").then(({ writeFileSync }) => {
  writeFileSync(process.env.TRACEVANE_FAKE_CLI_PID_FILE, String(process.pid));
  setInterval(() => {}, 1000);
});
`;

const fakeToolRoundTripCliSource = `#!/usr/bin/env node
const app = "__TRACEVANE_FAKE_APP__";
const args = process.argv.slice(2);

function argValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function post(path, body) {
  const endpoint = process.env.TRACEVANE_GATEWAY_CLI_SMOKE_ENDPOINT;
  if (!endpoint) throw new Error("TRACEVANE_GATEWAY_CLI_SMOKE_ENDPOINT is missing");
  const baseUrl = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  const response = await fetch(baseUrl + path, {
    method: "POST",
    headers: {
      authorization: "Bearer " + (process.env.TRACEVANE_GATEWAY_CLI_SMOKE_KEY || "test-key"),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Gateway returned " + response.status + " for " + path);
  await response.text();
}

async function main() {
  if (app === "codex") {
    const model = argValue("--model");
    const prompt = args.at(-1) || "";
    await post("/responses", {
      model,
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: prompt }] }],
    });
    await post("/responses", {
      model,
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: prompt }] },
        { type: "shell_call_output", call_id: "call_lookup", output: "GATEWAY_OK" },
      ],
    });
    console.log("GATEWAY_OK");
    return;
  }

  if (app === "opencode") {
    const rawModel = argValue("--model") || "";
    const model = rawModel.startsWith("tracevane-gateway/") ? rawModel.slice("tracevane-gateway/".length) : rawModel;
    const prompt = args.at(-1) || "";
    await post("/chat/completions", {
      model,
      messages: [
        { role: "system", content: "fake opencode roundtrip cli" },
        { role: "user", content: prompt },
      ],
      tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object", properties: {} } } }],
    });
    await post("/chat/completions", {
      model,
      messages: [
        { role: "system", content: "fake opencode roundtrip cli" },
        { role: "user", content: prompt },
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "call_lookup", type: "function", function: { name: "lookup", arguments: "{}" } }],
        },
        { role: "tool", tool_call_id: "call_lookup", content: "GATEWAY_OK" },
      ],
    });
    console.log(JSON.stringify({ type: "text", text: "GATEWAY_OK" }));
    return;
  }

  throw new Error("Unexpected fake CLI command: " + app);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
`;

function writeFakeCli(binDir, name, source = fakeCliSource) {
  const file = path.join(binDir, name);
  const renderedSource = source.replaceAll("__TRACEVANE_FAKE_APP__", name);
  if (process.platform === "win32") {
    const scriptFile = `${file}.mjs`;
    fs.writeFileSync(scriptFile, renderedSource, "utf8");
    fs.writeFileSync(`${file}.cmd`, `@echo off\r\n"${process.execPath}" "${scriptFile}" %*\r\n`, "utf8");
    return;
  }
  fs.writeFileSync(file, renderedSource, { encoding: "utf8", mode: 0o755 });
}

function makeTempRoot(prefix) {
  const parent = path.join(os.tmpdir(), "tracevane CLI 测试");
  fs.mkdirSync(parent, { recursive: true });
  return fs.mkdtempSync(path.join(parent, prefix));
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessExit(pid, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (!processExists(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for fake CLI process ${pid} to exit`);
}

function stopFixtureProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || !processExists(pid)) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", timeout: 5_000 });
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The fixture may already have exited with the smoke process.
  }
}

async function runCliSmoke(args, env = {}) {
  try {
    const result = await execFileAsync(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env,
      },
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 16,
    });
    return JSON.parse(result.stdout);
  } catch (error) {
    if (typeof error?.stdout === "string" && error.stdout.trim().startsWith("{")) {
      return JSON.parse(error.stdout);
    }
    throw error;
  }
}

test("gateway CLI smoke records diagnostic transport and request evidence", async (t) => {
  if (!fs.existsSync(distEntry)) {
    t.skip("npm run build:api is required before the CLI smoke script system test");
    return;
  }

  const tempRoot = makeTempRoot("gateway-");
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const binDir = path.join(tempRoot, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  writeFakeCli(binDir, "codex");
  writeFakeCli(binDir, "opencode");

  const parsed = await runCliSmoke([
    "--apps",
    "codex-tool-diagnostic,opencode-tool-diagnostic",
    "--target-models",
    "gpt-5.4,gpt-5.5",
    "--strict",
  ], {
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  });

  assert.equal(parsed.ok, true, JSON.stringify(parsed, null, 2));
  assert.deepEqual(parsed.modelRuns.map((run) => run.targetModel), ["gpt-5.4", "gpt-5.5"]);

  for (const run of parsed.modelRuns) {
    const codexDiagnostic = run.results.find((result) => result.id === "codex-tool-diagnostic");
    assert.equal(codexDiagnostic.status, "diagnostic");
    assert.equal(codexDiagnostic.transportOk, true);
    assert.equal(codexDiagnostic.modelMatches, true);
    assert.deepEqual(codexDiagnostic.requestedModels, [run.targetModel]);
    assert.equal(codexDiagnostic.requestDiagnostic.ok, false);
    assert.equal(codexDiagnostic.requestDiagnostic.facts.hasToolOutput, false);
    assert.equal(codexDiagnostic.requestDiagnostic.facts.currentSupport, "unverified");
    assert.deepEqual(codexDiagnostic.requestSummaries.map((request) => request.path), ["/v1/responses"]);
    assert.equal(codexDiagnostic.requestSummaries[0].inputTypes.includes("message"), true);

    const openCodeDiagnostic = run.results.find((result) => result.id === "opencode-tool-diagnostic");
    assert.equal(openCodeDiagnostic.status, "diagnostic");
    assert.equal(openCodeDiagnostic.transportOk, true);
    assert.equal(openCodeDiagnostic.modelMatches, true);
    assert.deepEqual(openCodeDiagnostic.requestedModels, [run.targetModel]);
    assert.equal(openCodeDiagnostic.requestDiagnostic.ok, false);
    assert.equal(openCodeDiagnostic.requestDiagnostic.facts.hasAssistantToolCall, false);
    assert.equal(openCodeDiagnostic.requestDiagnostic.facts.hasToolResultMessage, false);
    assert.equal(openCodeDiagnostic.requestDiagnostic.facts.currentSupport, "unverified");
    assert.deepEqual(openCodeDiagnostic.requestSummaries.map((request) => request.path), [
      "/v1/chat/completions",
      "/v1/chat/completions",
    ]);
    assert.deepEqual(openCodeDiagnostic.requestSummaries[0].messageRoles.slice(0, 2), ["system", "user"]);
  }
});

test("gateway CLI diagnostic strict mode fails when transport evidence is missing", async (t) => {
  if (!fs.existsSync(distEntry)) {
    t.skip("npm run build:api is required before the CLI smoke script system test");
    return;
  }

  const tempRoot = makeTempRoot("gateway-no-request-");
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const binDir = path.join(tempRoot, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  writeFakeCli(binDir, "codex", fakeNoRequestCliSource);

  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath,
      "--apps",
      "codex-tool-diagnostic",
      "--target-model",
      "gpt-5.4",
      "--strict",
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
      },
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 16,
    }),
    (error) => {
      assert.equal(error.code, 1);
      const parsed = JSON.parse(error.stdout);
      assert.equal(parsed.ok, false);
      const diagnostic = parsed.results.find((result) => result.id === "codex-tool-diagnostic");
      assert.equal(diagnostic.status, "diagnostic");
      assert.equal(diagnostic.transportOk, false);
      assert.deepEqual(diagnostic.hitPaths, []);
      assert.deepEqual(diagnostic.requestedModels, []);
      assert.equal(diagnostic.modelMatches, false);
      assert.equal(diagnostic.requestCount, 0);
      assert.equal(diagnostic.outputContainsOk, true);
      assert.equal(diagnostic.requestDiagnostic.facts.currentSupport, "unverified");
      return true;
    },
  );
});

test("gateway CLI smoke timeout terminates the owned command shim process", async (t) => {
  if (!fs.existsSync(distEntry)) {
    t.skip("npm run build:api is required before the CLI smoke script system test");
    return;
  }

  const tempRoot = makeTempRoot("gateway-timeout-");
  const binDir = path.join(tempRoot, "挂起 shim bin");
  const pidFile = path.join(tempRoot, "fake-cli.pid");
  fs.mkdirSync(binDir, { recursive: true });
  writeFakeCli(binDir, "codex", fakeHangingCliSource);
  t.after(() => {
    if (fs.existsSync(pidFile)) stopFixtureProcess(Number(fs.readFileSync(pidFile, "utf8")));
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath,
      "--apps",
      "codex-tool-diagnostic",
      "--target-model",
      "gpt-5.4",
      "--strict",
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
        TRACEVANE_FAKE_CLI_PID_FILE: pidFile,
        TRACEVANE_GATEWAY_CLI_SMOKE_COMMAND_TIMEOUT_MS: "250",
      },
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 16,
      timeout: 5_000,
    }),
    (error) => {
      assert.equal(error.code, 1);
      const parsed = JSON.parse(error.stdout);
      const diagnostic = parsed.results.find((result) => result.id === "codex-tool-diagnostic");
      assert.equal(diagnostic.timedOut, true);
      assert.equal(diagnostic.transportOk, false);
      return true;
    },
  );
  const fixturePid = Number(fs.readFileSync(pidFile, "utf8"));
  await waitForProcessExit(fixturePid);
  assert.equal(processExists(fixturePid), false);
});

test("gateway CLI diagnostics mark recognized tool round trips as candidate support", async (t) => {
  if (!fs.existsSync(distEntry)) {
    t.skip("npm run build:api is required before the CLI smoke script system test");
    return;
  }

  const tempRoot = makeTempRoot("gateway-roundtrip-");
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const binDir = path.join(tempRoot, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  writeFakeCli(binDir, "codex", fakeToolRoundTripCliSource);
  writeFakeCli(binDir, "opencode", fakeToolRoundTripCliSource);

  const parsed = await runCliSmoke([
    "--apps",
    "codex-tool-diagnostic,opencode-tool-diagnostic",
    "--target-model",
    "gpt-5.4",
    "--strict",
  ], {
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  });

  assert.equal(parsed.ok, true, JSON.stringify(parsed, null, 2));

  const codexDiagnostic = parsed.results.find((result) => result.id === "codex-tool-diagnostic");
  assert.equal(codexDiagnostic.status, "diagnostic");
  assert.equal(codexDiagnostic.transportOk, true);
  assert.equal(codexDiagnostic.requestDiagnostic.ok, true);
  assert.equal(codexDiagnostic.requestDiagnostic.facts.hasToolOutput, true);
  assert.equal(codexDiagnostic.requestDiagnostic.facts.currentSupport, "candidate");
  assert.deepEqual(codexDiagnostic.requestSummaries.map((request) => request.path), ["/v1/responses", "/v1/responses"]);
  assert.equal(codexDiagnostic.requestSummaries[1].inputTypes.includes("shell_call_output"), true);

  const openCodeDiagnostic = parsed.results.find((result) => result.id === "opencode-tool-diagnostic");
  assert.equal(openCodeDiagnostic.status, "diagnostic");
  assert.equal(openCodeDiagnostic.transportOk, true);
  assert.equal(openCodeDiagnostic.requestDiagnostic.ok, true);
  assert.equal(openCodeDiagnostic.requestDiagnostic.facts.hasAssistantToolCall, true);
  assert.equal(openCodeDiagnostic.requestDiagnostic.facts.hasToolResultMessage, true);
  assert.equal(openCodeDiagnostic.requestDiagnostic.facts.currentSupport, "candidate");
  assert.deepEqual(openCodeDiagnostic.requestSummaries.map((request) => request.path), [
    "/v1/chat/completions",
    "/v1/chat/completions",
  ]);
  assert.equal(openCodeDiagnostic.requestSummaries[1].hasToolCalls, true);
  assert.deepEqual(openCodeDiagnostic.requestSummaries[1].toolCallIds, ["call_lookup"]);
  assert.equal(openCodeDiagnostic.requestSummaries[1].messageRoles.includes("tool"), true);
});
