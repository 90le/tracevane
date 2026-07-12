import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const helperPath = path.join(
  rootDir,
  "apps/web/src/shared/service-supervisor.ts",
);
const supervisorHelpers = await import(
  `${pathToFileURL(helperPath).href}?t=${Date.now()}`,
);

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

const modelQuerySource = read("apps/web/src/lib/query/model-gateway.ts");
const channelQuerySource = read("apps/web/src/lib/query/channel-connectors.ts");
const recoveryQuerySource = read("apps/web/src/lib/query/recovery.ts");
const modelPanelSource = read(
  "apps/web/src/features/model-gateway/views/DaemonServicePanel.tsx",
);
const channelPanelSource = read(
  "apps/web/src/features/channel-connectors/views/DaemonServicePanel.tsx",
);
const recoveryPanelSource = read(
  "apps/web/src/features/recovery/views/RecoveryServicePanel.tsx",
);
const modelOverviewSource = read(
  "apps/web/src/features/model-gateway/views/OverviewView.tsx",
);
const channelRuntimeSource = read(
  "apps/web/src/features/channel-connectors/views/V3RuntimeView.tsx",
);

test("daemon service panels share one pure supervisor view model", () => {
  assert.equal(fs.existsSync(helperPath), true);
});

function manager(overrides = {}) {
  return {
    mode: "session",
    supervisor: "session",
    installed: false,
    enabled: null,
    active: false,
    state: "stopped",
    configCurrent: true,
    checkedAt: "2026-07-12T00:00:00.000Z",
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

test("primaryServiceAction follows the exact session and persistent matrix", () => {
  const cases = [
    ["session stopped", manager(), "start"],
    ["session not-installed", manager({ state: "not-installed" }), "start"],
    ["session running", manager({ state: "running", active: true }), "restart"],
    ["session starting", manager({ state: "starting", active: null }), null],
    [
      "session degraded runtime",
      manager({ state: "degraded", active: null, errorCode: "runtime-not-ready" }),
      "restart",
    ],
    [
      "session failed runtime",
      manager({ state: "failed", errorCode: "runtime-not-ready" }),
      null,
    ],
    ["session unknown", manager({ state: "unknown", errorCode: "unknown" }), null],
    [
      "session stable error",
      manager({ state: "stopped", errorCode: "permission-denied" }),
      null,
    ],
    [
      "persistent not-installed",
      manager({
        mode: "persistent",
        supervisor: "scheduled-task",
        state: "not-installed",
        errorCode: "task-not-found",
      }),
      "install",
    ],
    [
      "persistent task missing despite a retained template",
      manager({
        mode: "persistent",
        supervisor: "scheduled-task",
        installed: true,
        state: "unknown",
        errorCode: "task-not-found",
      }),
      "install",
    ],
    [
      "persistent stale",
      manager({
        mode: "persistent",
        supervisor: "systemd-user",
        installed: true,
        state: "stale-config",
        configCurrent: false,
        errorCode: "stale-config",
      }),
      "repair",
    ],
    [
      "persistent stopped",
      manager({
        mode: "persistent",
        supervisor: "launchd-user",
        installed: true,
      }),
      "start",
    ],
    [
      "persistent running",
      manager({
        mode: "persistent",
        supervisor: "systemd-user",
        installed: true,
        state: "running",
        active: true,
      }),
      "restart",
    ],
    [
      "persistent degraded runtime",
      manager({
        mode: "persistent",
        supervisor: "scheduled-task",
        installed: true,
        state: "degraded",
        active: null,
        errorCode: "runtime-not-ready",
      }),
      "restart",
    ],
    [
      "persistent starting",
      manager({
        mode: "persistent",
        supervisor: "launchd-user",
        installed: true,
        state: "starting",
        active: null,
      }),
      null,
    ],
    [
      "persistent running cannot override a stable error",
      manager({
        mode: "persistent",
        supervisor: "systemd-user",
        installed: true,
        state: "running",
        active: true,
        errorCode: "permission-denied",
      }),
      null,
    ],
  ];

  for (const [name, status, expected] of cases) {
    assert.equal(supervisorHelpers.primaryServiceAction(status), expected, name);
  }

  for (const errorCode of [
    "permission-denied",
    "command-not-found",
    "command-timeout",
    "template-invalid",
    "unsupported-platform",
    "unknown",
  ]) {
    assert.equal(
      supervisorHelpers.primaryServiceAction(
        manager({
          mode: "persistent",
          supervisor: "scheduled-task",
          installed: true,
          state: "unknown",
          errorCode,
        }),
      ),
      null,
      errorCode,
    );
  }
});

test("service capability helpers expose only valid secondary actions", () => {
  assert.equal(
    supervisorHelpers.canStopService(manager({ state: "running", active: true })),
    true,
  );
  assert.equal(
    supervisorHelpers.canStopService(
      manager({
        state: "running",
        active: true,
        errorCode: "permission-denied",
      }),
    ),
    false,
  );
  assert.equal(
    supervisorHelpers.canStopService(
      manager({ state: "degraded", active: null, errorCode: "runtime-not-ready" }),
    ),
    true,
  );
  assert.equal(supervisorHelpers.canStopService(manager()), false);
  assert.equal(
    supervisorHelpers.canUninstallService(
      manager({ mode: "persistent", supervisor: "systemd-user", installed: true }),
    ),
    true,
  );
  assert.equal(supervisorHelpers.canUninstallService(manager()), false);
  assert.equal(
    supervisorHelpers.canUninstallService(
      manager({ mode: "persistent", supervisor: "launchd-user", installed: false }),
    ),
    false,
  );
  assert.equal(
    supervisorHelpers.canUninstallService(
      manager({
        mode: "persistent",
        supervisor: "launchd-user",
        installed: true,
        state: "starting",
        active: null,
      }),
    ),
    false,
  );
  for (const errorCode of [
    "task-not-found",
    "permission-denied",
    "command-not-found",
    "command-timeout",
    "template-invalid",
    "unsupported-platform",
    "unknown",
  ]) {
    assert.equal(
      supervisorHelpers.canUninstallService(
        manager({
          mode: "persistent",
          supervisor: "scheduled-task",
          installed: true,
          state: "unknown",
          errorCode,
        }),
      ),
      false,
      errorCode,
    );
  }
  assert.equal(
    supervisorHelpers.canUninstallService(
      manager({
        mode: "persistent",
        supervisor: "systemd-user",
        installed: true,
        state: "stale-config",
        errorCode: "stale-config",
      }),
    ),
    true,
  );
  assert.equal(
    supervisorHelpers.canUninstallService(
      manager({
        mode: "persistent",
        supervisor: "launchd-user",
        installed: true,
        state: "degraded",
        errorCode: "runtime-not-ready",
      }),
    ),
    true,
  );
});

test("supervisor labels and badges cover every normalized state", () => {
  assert.deepEqual(
    ["session", "persistent"].map((mode) => supervisorHelpers.serviceModeLabel(mode)),
    ["会话托管", "系统守护"],
  );
  assert.deepEqual(
    ["session", "persistent"].map((mode) => supervisorHelpers.serviceModeCopy(mode)),
    [
      "由 Tracevane 开发 API 管理；开发 API 停止时一同停止；不会注册系统服务。",
      "注册在当前用户范围，可在开发 API 停止后继续运行；不会请求管理员或 root 权限。",
    ],
  );

  const supervisorLabels = {
    "systemd-user": "systemd 用户服务",
    "launchd-user": "launchd 用户代理",
    "scheduled-task": "Windows 计划任务",
    session: "开发 API 会话",
    none: "未托管",
    unknown: "未知",
  };
  for (const [kind, expected] of Object.entries(supervisorLabels)) {
    assert.equal(supervisorHelpers.supervisorLabel(kind), expected, kind);
  }

  const states = {
    "not-installed": ["未安装", "mute"],
    stopped: ["已停止", "mute"],
    starting: ["启动中", "warn"],
    running: ["运行中", "ok"],
    degraded: ["运行异常", "warn"],
    failed: ["失败", "bad"],
    "stale-config": ["配置待修复", "warn"],
    unknown: ["未知", "mute"],
  };
  for (const [state, [label, badge]] of Object.entries(states)) {
    assert.equal(supervisorHelpers.serviceStateLabel(state), label, state);
    assert.equal(supervisorHelpers.serviceStateBadge(state), badge, state);
  }
});

test("supervisorErrorCopy maps every structured error to stable Chinese copy", () => {
  const expected = {
    "task-not-found": "当前用户守护服务尚未安装。",
    "permission-denied": "当前用户权限不足，无法管理守护服务。",
    "command-not-found": "系统缺少所需的守护服务管理命令。",
    "command-timeout": "守护服务管理命令执行超时。",
    "template-invalid": "守护服务定义无效或无法写入。",
    "address-in-use": "守护服务端口已被其他进程占用。",
    "runtime-not-ready": "守护进程未通过就绪检查。",
    "stale-config": "守护服务定义已过期，需要修复。",
    "unsupported-platform": "当前平台不支持此守护方式。",
    unknown: "无法确定守护服务状态。",
  };

  for (const [code, copy] of Object.entries(expected)) {
    assert.equal(supervisorHelpers.supervisorErrorCopy(code), copy, code);
  }
  assert.equal(supervisorHelpers.supervisorErrorCopy(null), null);
});

test("daemon service queries key and inspect status by selected mode", () => {
  for (const source of [modelQuerySource, channelQuerySource, recoveryQuerySource]) {
    assert.match(
      source,
      /daemonServices:\s*\(\)\s*=>\s*\[[^\]]*"daemon-service"/,
    );
    assert.match(
      source,
      /daemonService:\s*\(mode: TracevaneServiceMode\)\s*=>\s*\[\.\.\.[A-Za-z]+Keys\.daemonServices\(\),\s*mode\]/,
    );
    assert.match(source, /action:\s*"status"/);
    assert.match(source, /mode,/);
    assert.match(source, /apply:\s*true/);
    assert.match(source, /\(\{\s*signal\s*\}\)/);
    assert.match(source, /variables\?\.mode\s*\?\?\s*"session"/);
  }

  assert.match(modelQuerySource, /manageModelGatewayDaemonService\([\s\S]*?signal/);
  assert.match(channelQuerySource, /manageChannelConnectorsDaemonService\([\s\S]*?signal/);
  assert.match(recoveryQuerySource, /manageOpenClawRecoveryDaemonService\([\s\S]*?signal/);
  assert.match(recoveryQuerySource, /return\s+response\.service/);
  assert.doesNotMatch(
    recoveryQuerySource,
    /queryFn:[^\n]*getOpenClawRecoveryDaemonService/,
  );
});

test("Channel Connectors keeps a daemon-service prefix for broad invalidation", () => {
  assert.match(
    channelQuerySource,
    /daemonServices:\s*\(\)\s*=>\s*\["channel-connectors",\s*"daemon-service"\]/,
  );
  assert.match(
    channelQuerySource,
    /invalidateQueries\(\{\s*queryKey:\s*channelConnectorsKeys\.daemonServices\(\)\s*\}\)/,
  );
});

test("lifecycle mutations never cache a cross-mode uninstall response", () => {
  const contracts = [
    [modelQuerySource, "result\\.manager\\.mode", "modelGatewayKeys"],
    [channelQuerySource, "result\\.serviceManager\\.mode", "channelConnectorsKeys"],
    [recoveryQuerySource, "result\\.service\\.manager\\.mode", "recoveryKeys"],
  ];

  for (const [source, modeAccessor, keysName] of contracts) {
    const branch = source.match(new RegExp(
      `if \\(${modeAccessor} === mode\\) \\{([\\s\\S]*?)\\} else \\{([\\s\\S]*?)\\}`,
    ));
    assert.ok(branch, modeAccessor);
    assert.match(branch[1], new RegExp(`${keysName}\\.daemonService\\(mode\\)`));
    assert.match(branch[1], /setQueryData/);
    assert.doesNotMatch(branch[1], /invalidateQueries/);
    assert.match(branch[2], new RegExp(`${keysName}\\.daemonService\\(mode\\)`));
    assert.match(branch[2], /invalidateQueries/);
    assert.doesNotMatch(branch[2], /setQueryData/);
  }
});

test("all daemon panels expose the shared state-driven accessible control surface", () => {
  for (const source of [modelPanelSource, channelPanelSource, recoveryPanelSource]) {
    assert.match(source, /@\/shared\/service-supervisor/);
    assert.match(source, /useState<TracevaneServiceMode>\("session"\)/);
    assert.match(source, /primaryServiceAction\(manager\)/);
    assert.match(source, /serviceStateBadge\(manager\.state\)/);
    assert.match(source, /serviceModeCopy\(mode\)/);
    assert.match(source, /role="group"[^>]*aria-label="托管模式"/);
    assert.match(source, /aria-pressed=\{mode === "session"\}/);
    assert.match(source, /aria-pressed=\{mode === "persistent"\}/);
    assert.doesNotMatch(source, /TabsList|TabsTrigger/);
    assert.match(source, /<ConfirmDialog/);
    assert.match(source, /description=/);
    assert.match(source, /busy=\{pending\}/);
    assert.match(source, /aria-busy=\{pending\}/);
    assert.match(source, /aria-controls=\{panelRegionId\}/);
    assert.match(source, /role="region"/);
    assert.match(source, /aria-labelledby=\{panelTriggerId\}/);
    assert.match(source, /role="status"/);
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /role="alert"/);
    assert.match(source, /<details/);
    assert.match(source, /<summary/);
    assert.match(source, /title=\{serviceName\}/);
    assert.match(source, /if \(!result\.ok\)/);
    assert.match(source, /\{ action, mode, apply: true \}/);
    assert.doesNotMatch(source, /runCommands/);
    assert.doesNotMatch(source, /from "@\/design\/ui\/dialog"/);

    const successBlock = source.match(
      /onSuccess:\s*\(result\)\s*=>\s*\{([\s\S]*?)\n\s*\},\n\s*onError/,
    )?.[1] ?? "";
    assert.notEqual(successBlock, "");
    assert.doesNotMatch(successBlock, /serviceQuery\.refetch/);
  }
});

test("each daemon panel derives actions from its canonical manager only", () => {
  assert.match(modelPanelSource, /const manager = data\?\.manager;/);
  assert.doesNotMatch(modelPanelSource, /DAEMON_STATE_BADGE|local\?\.state|data\?\.serviceManager/);
  assert.doesNotMatch(modelPanelSource, /cmd && !cmd\.ok|cmd\.stderr \|\| cmd\.error/);

  assert.match(channelPanelSource, /const manager = data\?\.serviceManager;/);
  assert.doesNotMatch(channelPanelSource, /managerBadge|manager\.(?:checked|reachable|lastError)/);
  assert.doesNotMatch(channelPanelSource, /cmd && !cmd\.ok|cmd\.stderr \|\| cmd\.error/);

  assert.match(recoveryPanelSource, /const manager = data\?\.manager;/);
  assert.doesNotMatch(recoveryPanelSource, /function serviceStateBadge\(activeState|commands\.find|failed\?\./);
});

test("Channel reload is running-only and never leaks into the other panels", () => {
  assert.match(channelPanelSource, /const canReload = manager\?\.state === "running";/);
  assert.match(
    channelPanelSource,
    /action: "reload",\s*mode,\s*apply: true,\s*reloadMode: "when-idle"/,
  );
  assert.doesNotMatch(modelPanelSource, /reloadMode|action: "reload"/);
  assert.doesNotMatch(recoveryPanelSource, /reloadMode|action: "reload"/);
});

test("confirmation copy preserves each daemon domain impact", () => {
  assert.match(modelPanelSource, /进行中的模型请求/);
  assert.match(channelPanelSource, /IM 接收与回复/);
  assert.match(recoveryPanelSource, /探测与自动修复/);
  for (const source of [modelPanelSource, channelPanelSource, recoveryPanelSource]) {
    assert.match(source, /安装并启动/);
    assert.match(source, /修复并重启/);
    assert.match(source, /卸载服务/);
  }
});

test("panel diagnostics stay mode-scoped and raw transport errors stay collapsed", () => {
  for (const source of [modelPanelSource, channelPanelSource, recoveryPanelSource]) {
    assert.match(source, /lastResult\?\.mode === mode \? lastResult\.result : null/);
    assert.match(source, /setLastResult\(\{ mode, result \}\)/);
    assert.match(source, /const selectMode = \(nextMode: TracevaneServiceMode\) =>/);
    assert.match(source, /setLastResult\(null\)/);
    assert.match(source, /manageMutation\.reset\(\)/);
    assert.match(source, /aria-pressed=\{mode === "session"\}[\s\S]*?disabled=\{pending\}/);
    assert.doesNotMatch(source, /<div role="status"/);
    assert.doesNotMatch(source, /toast\.error\([^\n]*error\.message/);
    assert.doesNotMatch(
      source,
      /<span[^>]*text-red[^>]*>\{serviceQuery\.error\.message\}<\/span>/,
    );
    assert.match(source, /<details[\s\S]*?serviceQuery\.error\.message[\s\S]*?<\/details>/);
    assert.match(source, /case "uninstall":[\s\S]*?\$\{impact\}/);
  }
  assert.doesNotMatch(modelPanelSource, /onMutated\?\.\(\)/);
  assert.doesNotMatch(channelPanelSource, /onMutated\?\.\(\)/);
  assert.doesNotMatch(modelPanelSource, /onMutated/);
  assert.doesNotMatch(channelPanelSource, /onMutated/);
  const modelCall = modelOverviewSource.match(/<DaemonServicePanel[\s\S]*?\/>/)?.[0] ?? "";
  const channelCall = channelRuntimeSource.match(/<DaemonServicePanel[\s\S]*?\/>/)?.[0] ?? "";
  assert.notEqual(modelCall, "");
  assert.notEqual(channelCall, "");
  assert.doesNotMatch(modelCall, /onMutated/);
  assert.doesNotMatch(channelCall, /onMutated/);
});

test("Model and Channel lifecycle hooks own their business refresh", () => {
  const modelMutation = modelQuerySource.match(
    /export function useManageModelGatewayDaemonServiceMutation[\s\S]*?\n\}/,
  )?.[0] ?? "";
  const channelMutation = channelQuerySource.match(
    /export function useManageChannelConnectorsDaemonServiceMutation[\s\S]*?\n\}/,
  )?.[0] ?? "";
  assert.notEqual(modelMutation, "");
  assert.notEqual(channelMutation, "");
  assert.match(modelMutation, /modelGatewayKeys\.status\(\)/);
  assert.match(channelMutation, /channelConnectorsKeys\.status\(\)/);
  assert.match(channelMutation, /channelConnectorsKeys\.daemonConfig\(\)/);
});
