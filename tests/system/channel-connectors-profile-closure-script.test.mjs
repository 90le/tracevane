import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const scriptPath = "scripts/smoke-channel-connectors-profile-closure.mjs";

test("profile closure smoke script exposes real IM gates and trigger plan", () => {
  const result = spawnSync(process.execPath, [scriptPath, "--plan", "--json"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode, "plan");
  assert.deepEqual(
    parsed.gates.map((gate) => gate.id),
    [
      "three-agent-live-run",
      "feishu-explicit-compact",
      "octo-explicit-compact",
      "inbound-image",
    ],
  );
  assert.match(parsed.gates[0].command, /--require-agent-coverage/);
  assert.match(parsed.gates[0].command, /--require-tool-output/);
  assert.match(parsed.gates[0].command, /--require-process-reply/);
  assert.match(parsed.gates[1].command, /--platform feishu/);
  assert.match(parsed.gates[2].command, /--platform octo/);
  assert.match(parsed.gates[3].command, /--require-inbound-image/);
  assert.ok(parsed.triggerPlan.some((item) => item.prompt?.includes("3 次 shell 工具调用")));
});

test("profile closure smoke script documents dry-run boundary", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.match(source, /separates real Feishu\/Octo event-log proof/);
  assert.match(source, /does not prove agent run coverage|不替代真实 IM live/);
  assert.doesNotMatch(source, /smoke-channel-connectors-agent-runner-direct\.mjs/);
});
