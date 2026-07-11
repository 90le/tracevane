import test from "node:test";
import assert from "node:assert/strict";

import {
  classifySupervisorFailure,
  runSupervisorCommand,
} from "../../dist/apps/api/modules/supervisor/command-runner.js";

function commandFailure(overrides = {}) {
  return {
    label: "Query scheduled task",
    command: "schtasks.exe",
    args: ["/Query", "/TN", "TracevaneMissing", "/HResult"],
    ok: false,
    exitCode: -2147024894,
    stdout: "",
    stderr: "任務不存在",
    errorCode: null,
    errorMessage: null,
    durationMs: 1,
    ...overrides,
  };
}

test("classifier uses the schtasks not-found HRESULT instead of localized text", () => {
  assert.equal(
    classifySupervisorFailure(commandFailure()),
    "task-not-found",
  );
  assert.equal(
    classifySupervisorFailure(commandFailure({ exitCode: 0x80070002 })),
    "task-not-found",
  );
});

test("classifier recognizes the schtasks permission HRESULT", () => {
  assert.equal(
    classifySupervisorFailure(commandFailure({ exitCode: -2147024891 })),
    "permission-denied",
  );
  assert.equal(
    classifySupervisorFailure(commandFailure({ exitCode: 0x80070005 })),
    "permission-denied",
  );
});

test("classifier leaves generic exit code 1 unknown regardless of localized text", () => {
  assert.equal(
    classifySupervisorFailure(commandFailure({
      exitCode: 1,
      stderr: "ERROR: The system cannot find the scheduled task specified.",
    })),
    "unknown",
  );
  assert.equal(
    classifySupervisorFailure(commandFailure({
      exitCode: 1,
      stderr: "任務不存在",
    })),
    "unknown",
  );
});

test("runner returns command-timeout for a process that exceeds its deadline", async () => {
  const result = await runSupervisorCommand(
    {
      label: "Wait forever",
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1_000)"],
    },
    { timeoutMs: 100, platform: process.platform, action: "status" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "command-timeout");
  assert.equal(result.errorMessage, "Supervisor command timed out.");
});

test("runner returns command-not-found for ENOENT", async () => {
  const missingCommand = `tracevane-command-does-not-exist-${process.pid}-${Date.now()}`;
  const result = await runSupervisorCommand(
    { label: "Missing command", command: missingCommand, args: [] },
    { timeoutMs: 2_000, platform: process.platform, action: "status" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, null);
  assert.equal(result.errorCode, "command-not-found");
  assert.equal(result.errorMessage, "Supervisor command is not available.");
});

test("runner bounds stdout and stderr to 16 KiB per stream", async () => {
  const result = await runSupervisorCommand(
    {
      label: "Large output",
      command: process.execPath,
      args: [
        "-e",
        'process.stdout.write("o".repeat(20 * 1024)); process.stderr.write("e".repeat(20 * 1024));',
      ],
    },
    { timeoutMs: 2_000, platform: process.platform, action: "status" },
  );

  assert.equal(result.ok, true);
  assert.equal(Buffer.byteLength(result.stdout, "utf8"), 16 * 1024);
  assert.equal(Buffer.byteLength(result.stderr, "utf8"), 16 * 1024);
  assert.equal(result.stdout, "o".repeat(16 * 1024));
  assert.equal(result.stderr, "e".repeat(16 * 1024));
});

test("runner redacts secrets from every retained result field", async () => {
  const secret = "secret-value";
  const result = await runSupervisorCommand(
    {
      label: `Fixture ${secret}`,
      command: process.execPath,
      args: [
        "-e",
        "const value = process.argv[1]; process.stdout.write(value); process.stderr.write(value); process.exit(1);",
        secret,
      ],
    },
    {
      timeoutMs: 2_000,
      platform: process.platform,
      action: "status",
      redact: [secret],
    },
  );

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(secret), false);
  assert.match(result.label, /\[REDACTED\]/);
  assert.match(result.args.at(-1) ?? "", /\[REDACTED\]/);
  assert.equal(result.stdout, "[REDACTED]");
  assert.equal(result.stderr, "[REDACTED]");
  assert.equal(result.errorCode, "unknown");
});

test("runner replaces invalid UTF-8 with a bounded byte-count diagnostic", async () => {
  const result = await runSupervisorCommand(
    {
      label: "Invalid bytes",
      command: process.execPath,
      args: ["-e", "process.stdout.write(Buffer.from([0x66, 0x6f, 0x80, 0xff]));"],
    },
    { timeoutMs: 2_000, platform: process.platform, action: "status" },
  );

  assert.equal(result.ok, true);
  assert.equal(result.stdout.includes("�"), false);
  assert.match(result.stdout, /diagnostic/i);
  assert.match(result.stdout, /4 bytes/);
  assert.ok(Buffer.byteLength(result.stdout, "utf8") <= 16 * 1024);
});

test("runner passes native arguments without shell interpolation", async () => {
  const literal = "literal & | > $() ; value";
  const result = await runSupervisorCommand(
    {
      label: "Literal argument",
      command: process.execPath,
      args: ["-e", "process.stdout.write(process.argv[1]);", literal],
    },
    { timeoutMs: 2_000, platform: process.platform, action: "status" },
  );

  assert.equal(result.ok, true);
  assert.equal(result.stdout, literal);
});
