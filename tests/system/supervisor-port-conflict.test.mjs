import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createServiceManager,
} from "../../dist/apps/api/modules/supervisor/service-manager.js";
import {
  isOwnedDaemonProcess,
  parseHealthUrlTarget,
  parseProcNetTcpListeners,
  resolveDaemonPortConflict,
} from "../../dist/apps/api/modules/supervisor/port-conflict.js";

function fixtureDefinition(root, overrides = {}) {
  return {
    id: "model-gateway",
    displayName: "Fixture Gateway",
    serviceName: "tracevane-fixture.service",
    windowsTaskName: "TracevaneFixture",
    launchdLabel: "dev.tracevane.fixture",
    entryPath: path.join(root, "dist", "apps", "api", "model-gateway-daemon.js"),
    workingDirectory: root,
    configPath: path.join(root, "config.json"),
    runtimePath: path.join(root, "runtime.json"),
    logPath: path.join(root, "fixture.log"),
    healthUrl: "http://127.0.0.1:18796/api/model-gateway/status",
    args: [],
    ...overrides,
  };
}

function sessionStatus(overrides = {}) {
  return {
    mode: "session",
    supervisor: "session",
    installed: false,
    enabled: null,
    active: false,
    state: "stopped",
    configCurrent: true,
    checkedAt: "2026-07-18T00:00:00.000Z",
    errorCode: null,
    errorMessage: null,
    pid: null,
    restartCount: 0,
    ...overrides,
  };
}

function createFakeSession() {
  const calls = [];
  return {
    calls,
    session: {
      async status(serviceId) {
        calls.push(["status", serviceId]);
        return sessionStatus();
      },
      async start(definition) {
        calls.push(["start", definition.id]);
        return sessionStatus({ active: true, state: "running", pid: 4321 });
      },
      async stop(serviceId) {
        calls.push(["stop", serviceId]);
        return sessionStatus();
      },
      async dispose() {
        calls.push(["dispose"]);
      },
    },
  };
}

function createRunner(behaviors = {}) {
  const calls = [];
  const runner = async (command) => {
    calls.push([command.command, ...command.args]);
    const behavior = behaviors[command.args.join(" ")] ?? {};
    const ok = behavior.ok !== false;
    return {
      ...command,
      ok,
      exitCode: ok ? 0 : (behavior.exitCode ?? 1),
      stdout: behavior.stdout ?? "",
      stderr: behavior.stderr ?? "",
      errorCode: ok ? null : (behavior.errorCode ?? "unknown"),
      errorMessage: null,
      durationMs: 1,
    };
  };
  return { calls, runner };
}

const NO_CONFLICT = {
  conflict: false,
  owned: false,
  resolved: true,
  holderPid: null,
  holderDescription: null,
  detail: null,
};

test("parseHealthUrlTarget extracts host and port", () => {
  assert.deepEqual(
    parseHealthUrlTarget("http://127.0.0.1:18796/api/model-gateway/status"),
    { host: "127.0.0.1", port: 18796 },
  );
  assert.deepEqual(parseHealthUrlTarget("https://example.com/health"), {
    host: "example.com",
    port: 443,
  });
  assert.equal(parseHealthUrlTarget("not-a-url"), null);
  assert.equal(parseHealthUrlTarget("http://127.0.0.1:99999/"), null);
});

test("parseProcNetTcpListeners returns only LISTEN inodes for the port", () => {
  const content = [
    "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode",
    "   0: 0100007F:496D 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 123456 1 0000 100 0 0 10 0",
    "   1: 00000000:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 999999 1 0000 100 0 0 10 0",
    "   2: 0100007F:496D 0100007F:E244 01 00000000:00000000 00:00000000 00000000  1000        0 555555 1 0000 100 0 0 10 0",
  ].join("\n");
  const inodes = parseProcNetTcpListeners(content, 18797);
  assert.deepEqual([...inodes], ["123456"]);
});

test("isOwnedDaemonProcess identifies tracevane daemons and rejects foreign processes", () => {
  const channelDefinition = fixtureDefinition("/opt/tracevane", {
    id: "channel-connectors",
    serviceName: "tracevane-channel-connectors.service",
    entryPath: "/opt/tracevane/dist/apps/api/modules/channel-connectors/daemon.js",
  });
  assert.equal(
    isOwnedDaemonProcess(
      channelDefinition,
      "node /home/u/.openclaw/extensions/tracevane/dist/apps/api/modules/channel-connectors/daemon.js --config /home/u/.openclaw/openclaw.json",
    ),
    true,
  );
  assert.equal(
    isOwnedDaemonProcess(
      fixtureDefinition("/opt/tracevane"),
      "node /somewhere/else/model-gateway-daemon.js --state-dir /x",
    ),
    true,
  );
  assert.equal(
    isOwnedDaemonProcess(
      fixtureDefinition("/opt/tracevane"),
      "python3 -m http.server 18796",
    ),
    false,
  );
  assert.equal(isOwnedDaemonProcess(fixtureDefinition("/opt/tracevane"), ""), false);
});

test("resolveDaemonPortConflict reports no conflict when the port is free", async () => {
  const outcome = await resolveDaemonPortConflict(fixtureDefinition("/opt/tracevane"), {
    platform: "linux",
    connect: async () => false,
  });
  assert.equal(outcome.conflict, false);
  assert.equal(outcome.resolved, true);
});

test("resolveDaemonPortConflict skips unsupported platforms", async () => {
  const outcome = await resolveDaemonPortConflict(fixtureDefinition("/opt/tracevane"), {
    platform: "win32",
    connect: async () => true,
  });
  assert.equal(outcome.conflict, false);
});

test("resolveDaemonPortConflict terminates a stale owned holder", async () => {
  const terminated = [];
  let connects = 0;
  const outcome = await resolveDaemonPortConflict(fixtureDefinition("/opt/tracevane"), {
    platform: "linux",
    connect: async () => {
      connects += 1;
      return connects === 1;
    },
    listHolders: async () => [
      { pid: 2019, cmdline: "node /opt/tracevane/dist/apps/api/model-gateway-daemon.js --state-dir /x" },
    ],
    terminate: async (pid) => {
      terminated.push(pid);
      return true;
    },
  });
  assert.deepEqual(terminated, [2019]);
  assert.equal(outcome.owned, true);
  assert.equal(outcome.resolved, true);
  assert.equal(outcome.holderPid, 2019);
});

test("resolveDaemonPortConflict never kills a foreign holder", async () => {
  let terminateCalled = false;
  const outcome = await resolveDaemonPortConflict(fixtureDefinition("/opt/tracevane"), {
    platform: "linux",
    connect: async () => true,
    listHolders: async () => [{ pid: 777, cmdline: "python3 -m http.server 18796" }],
    terminate: async () => {
      terminateCalled = true;
      return true;
    },
  });
  assert.equal(terminateCalled, false);
  assert.equal(outcome.conflict, true);
  assert.equal(outcome.owned, false);
  assert.equal(outcome.resolved, false);
  assert.equal(outcome.holderPid, 777);
  assert.match(outcome.detail, /unrelated process/);
});

test("resolveDaemonPortConflict reports unidentifiable holders without killing", async () => {
  const outcome = await resolveDaemonPortConflict(fixtureDefinition("/opt/tracevane"), {
    platform: "linux",
    connect: async () => true,
    listHolders: async () => [],
  });
  assert.equal(outcome.conflict, true);
  assert.equal(outcome.owned, false);
  assert.equal(outcome.resolved, false);
  assert.equal(outcome.holderPid, null);
});

test("failed fresh install removes the wants symlink and rolls back the unit file", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-supervisor-"));
  const home = path.join(root, "home");
  const unitDir = path.join(home, ".config", "systemd", "user");
  fs.mkdirSync(path.join(unitDir, "default.target.wants"), { recursive: true });
  const wantsPath = path.join(unitDir, "default.target.wants", "tracevane-fixture.service");
  fs.writeFileSync(wantsPath, "stale-link-target");

  const { calls, runner } = createRunner({
    "--user start tracevane-fixture.service": { ok: false },
  });
  const manager = createServiceManager({
    platform: "linux",
    homeDir: home,
    runner,
    session: createFakeSession().session,
    probe: async () => false,
    portConflictResolver: async () => NO_CONFLICT,
  });
  const response = await manager.manage(fixtureDefinition(root), {
    action: "install",
    mode: "persistent",
    apply: true,
  });

  assert.equal(response.ok, false);
  assert.ok(
    calls.some((call) => call.join(" ").includes("disable")),
    "expected the enablement cleanup to run systemctl disable",
  );
  assert.equal(fs.existsSync(wantsPath), false, "dangling wants symlink must be removed");
  assert.equal(
    fs.existsSync(path.join(unitDir, "tracevane-fixture.service")),
    false,
    "unit file must be rolled back",
  );
});

test("install terminates a stale owned port holder and starts", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-supervisor-"));
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });

  const { runner } = createRunner({
    "--user is-active tracevane-fixture.service": { stdout: "active\n" },
    "--user is-enabled tracevane-fixture.service": { stdout: "enabled\n" },
  });
  const manager = createServiceManager({
    platform: "linux",
    homeDir: home,
    runner,
    session: createFakeSession().session,
    probe: async () => true,
    portConflictResolver: async () => ({
      conflict: true,
      owned: true,
      resolved: true,
      holderPid: 4242,
      holderDescription: "node /opt/tracevane/dist/apps/api/model-gateway-daemon.js",
      detail: "A stale Fixture Gateway process (pid 4242) holding port 18796 was terminated.",
    }),
  });
  const response = await manager.manage(fixtureDefinition(root), {
    action: "install",
    mode: "persistent",
    apply: true,
  });

  assert.equal(response.ok, true);
  assert.equal(response.manager.state, "running");
  assert.ok(
    response.commands.some((command) => command.command === "port-conflict" && command.ok),
    "expected the port conflict resolution to be recorded",
  );
});

test("a foreign port holder blocks the start with address-in-use evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-supervisor-"));
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });

  const { calls, runner } = createRunner();
  const manager = createServiceManager({
    platform: "linux",
    homeDir: home,
    runner,
    session: createFakeSession().session,
    probe: async () => true,
    portConflictResolver: async () => ({
      conflict: true,
      owned: false,
      resolved: false,
      holderPid: 999,
      holderDescription: "python3 -m http.server 18796",
      detail: "Port 18796 is held by an unrelated process (pid 999); it was left running.",
    }),
  });
  const response = await manager.manage(fixtureDefinition(root), {
    action: "install",
    mode: "persistent",
    apply: true,
  });

  assert.equal(response.ok, false);
  assert.equal(response.manager.errorCode, "address-in-use");
  assert.match(response.manager.errorMessage, /999/);
  assert.equal(
    calls.some((call) => call.join(" ").includes(" start ")),
    false,
    "systemctl start must not run while a foreign process holds the port",
  );
  assert.equal(
    fs.existsSync(path.join(home, ".config", "systemd", "user", "tracevane-fixture.service")),
    false,
    "unit file must not be written when the port is blocked",
  );
});

test("systemd readiness requires the native unit to be active, not just a health probe", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-supervisor-"));
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });

  const { runner } = createRunner({
    "--user is-active tracevane-fixture.service": { stdout: "inactive\n" },
    "--user is-enabled tracevane-fixture.service": { stdout: "enabled\n" },
  });
  const manager = createServiceManager({
    platform: "linux",
    homeDir: home,
    runner,
    session: createFakeSession().session,
    probe: async () => true,
    portConflictResolver: async () => NO_CONFLICT,
  });
  const response = await manager.manage(fixtureDefinition(root), {
    action: "install",
    mode: "persistent",
    apply: true,
  });

  assert.equal(response.ok, false);
  assert.equal(response.manager.state, "degraded");
  assert.equal(response.manager.errorCode, "runtime-not-ready");
});

test("session start reports a foreign port holder instead of spawning", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-supervisor-"));
  const fake = createFakeSession();
  const manager = createServiceManager({
    platform: "linux",
    homeDir: root,
    runner: createRunner().runner,
    session: fake.session,
    probe: async () => false,
    portConflictResolver: async () => ({
      conflict: true,
      owned: false,
      resolved: false,
      holderPid: 31337,
      holderDescription: "python3 -m http.server 18796",
      detail: "Port 18796 is held by an unrelated process (pid 31337); it was left running.",
    }),
  });
  const response = await manager.manage(fixtureDefinition(root), {
    action: "start",
    mode: "session",
    apply: true,
  });

  assert.equal(response.ok, false);
  assert.equal(response.manager.errorCode, "address-in-use");
  assert.equal(
    fake.calls.some((call) => call[0] === "start"),
    false,
    "session child must not spawn while a foreign process holds the port",
  );
});
