import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  cleanupNativeSupervisorRegistration,
  inspectNativeAbsence,
} from "./fixtures/supervisor-fixture-daemon.mjs";

function commandResult(command, overrides = {}) {
  return {
    ...command,
    durationMs: 1,
    errorCode: null,
    errorMessage: null,
    exitCode: 0,
    ok: true,
    stderr: "",
    stdout: "",
    ...overrides,
  };
}

function plan(platform, root) {
  const serviceName = platform === "win32"
    ? `TracevaneTest-Windows-${process.pid}`
    : platform === "darwin"
      ? `dev.tracevane.test.macos.${process.pid}`
      : `tracevane-test-linux-${process.pid}.service`;
  return {
    commands: {
      status: [{
        args: ["/Query", "/TN", serviceName, "/HResult"],
        command: "schtasks.exe",
        label: "Query scheduled task",
      }],
      stop: [{
        args: ["/End", "/TN", serviceName],
        command: "schtasks.exe",
        label: "Stop scheduled task",
      }],
      uninstall: [{
        args: ["/Delete", "/TN", serviceName, "/F"],
        command: "schtasks.exe",
        label: "Delete scheduled task",
      }],
    },
    configPath: path.join(root, `${serviceName}.xml`),
    platform,
    serviceName,
    template: `<Task><Description>${process.pid}</Description></Task>`,
  };
}

test("native absence accepts only stable platform not-found evidence", async () => {
  const root = os.tmpdir();
  const mac = plan("darwin", root);
  mac.commands.status = [{
    args: ["print", `gui/501/${mac.serviceName}`],
    command: "launchctl",
    label: "Print LaunchAgent status",
  }];
  assert.equal((await inspectNativeAbsence(mac, async (command) =>
    commandResult(command, {
      errorCode: "unknown",
      errorMessage: "Supervisor command failed.",
      exitCode: 1,
      ok: false,
    })
  )).absent, false);
  assert.equal((await inspectNativeAbsence(mac, async (command) =>
    commandResult(command, {
      errorCode: "unknown",
      errorMessage: "Supervisor command failed.",
      exitCode: 113,
      ok: false,
    })
  )).absent, true);

  const linux = plan("linux", root);
  let linuxProbe;
  assert.equal((await inspectNativeAbsence(linux, async (command) => {
    linuxProbe = command;
    return commandResult(command, { stdout: "not-found\n" });
  })).absent, true);
  assert.deepEqual(linuxProbe.args, [
    "--user",
    "show",
    linux.serviceName,
    "--property=LoadState",
    "--value",
  ]);
  assert.equal((await inspectNativeAbsence(linux, async (command) =>
    commandResult(command, {
      errorCode: "unknown",
      errorMessage: "Supervisor command failed.",
      exitCode: 1,
      ok: false,
    })
  )).absent, false);
});

test("fallback cleanup never unregisters after an unverified stop", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-cleanup-gate-"));
  const fixturePlan = plan("win32", root);
  const context = {
    heartbeatPath: path.join(root, "heartbeat.json"),
    instanceName: `windows-${process.pid}`,
    ownerPid: process.pid,
    root,
  };
  fs.writeFileSync(fixturePlan.configPath, fixturePlan.template, "utf8");
  let stops = 0;
  let uninstalls = 0;

  try {
    await assert.rejects(
      cleanupNativeSupervisorRegistration({
        context,
        plan: fixturePlan,
        runSupervisorCommand: async (command) => {
          if (command.label === "Query scheduled task") {
            return commandResult(command);
          }
          if (command.label === "Stop scheduled task") {
            stops += 1;
            return commandResult(command, {
              errorCode: "unknown",
              errorMessage: "Supervisor command failed.",
              exitCode: 1,
              ok: false,
            });
          }
          uninstalls += 1;
          return commandResult(command);
        },
      }),
      /could not confirm native supervisor stop/,
    );
    assert.equal(stops, 3);
    assert.equal(uninstalls, 0);
    assert.equal(fs.existsSync(fixturePlan.configPath), true);
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

test("already-absent cleanup observes a restart backoff before deleting the template", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-cleanup-backoff-"));
  const fixturePlan = plan("win32", root);
  const context = {
    heartbeatPath: path.join(root, "heartbeat.json"),
    instanceName: `windows-${process.pid}`,
    ownerPid: process.pid,
    root,
  };
  fs.writeFileSync(fixturePlan.configPath, fixturePlan.template, "utf8");
  const timer = setTimeout(() => {
    fs.writeFileSync(context.heartbeatPath, JSON.stringify({
      heartbeatAt: Date.now(),
      instanceName: context.instanceName,
      ownerPid: context.ownerPid,
      pid: process.pid,
      token: "delayed-restart",
    }), "utf8");
  }, 1_050);

  try {
    await assert.rejects(
      cleanupNativeSupervisorRegistration({
        context,
        plan: fixturePlan,
        runSupervisorCommand: async (command) =>
          commandResult(command, {
            errorCode: "task-not-found",
            errorMessage: "Persistent service is not installed.",
            exitCode: -2147024894,
            ok: false,
          }),
      }),
      /fixture daemon remained alive/,
    );
    assert.equal(fs.existsSync(fixturePlan.configPath), true);
  } finally {
    clearTimeout(timer);
    fs.rmSync(root, { force: true, recursive: true });
  }
});
