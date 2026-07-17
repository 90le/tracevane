# Codex Agent 配置应用能力恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢复 Codex CLI 的模型选择、单项应用、批量应用、备份与回滚，使其与其他 Agent 客户端使用同一套 App Connection 行为。

**Architecture:** 删除 `manageCodexCli` 形成的 Codex 特殊禁用层，继续复用现有 `buildCodexConfig`、通用 App Connection 写入/备份/回滚和前端确认流程。应用仅管理 `~/.codex/config.toml` 与 Tracevane 模型目录，不接触 `~/.codex/auth.json`。

**Tech Stack:** Node.js 22、TypeScript、React、TanStack Query、内置 `node:test`、现有 Model Gateway App Connection 服务。

## Global Constraints

- 不增加依赖或第二套账户直连/网关模式状态。
- Codex 与 Claude Code、OpenCode、OpenClaw 使用相同的应用前置条件和按钮语义。
- 单项与批量应用都包含 Codex。
- 写入前保留现有差异确认、备份、脱敏、授权、路径保护与原子写入。
- 不读取或修改 `~/.codex/auth.json`。
- 只修改当前 `codex/cross-platform-release-gate` 工作树范围内的相关文件，保留现有未跟踪计划文件。

---

### Task 1: 用回归测试定义 Codex 恢复后的服务行为

**Files:**
- Modify: `tests/system/model-gateway-service.test.mjs:7001-7005,7336-7375,7382,7738,7813,7876,7948,8174`
- Modify: `tests/system/web-model-gateway.test.mjs:224-230,378-401`

**Interfaces:**
- Consumes: `createModelGatewayService(config, { homeDir })`、`listAppConnections()`、`applyAppConnection()`、`applyAppConnections()`、`rollbackAppConnection()`。
- Produces: Codex 通用可应用、单项写入、凭据不变、批量包含和逐字节回滚的回归合同。

- [ ] **Step 1: 将旧的禁止 Codex 测试替换为恢复能力测试**

用以下测试替换 `model gateway preserves direct Codex login and bulk apply excludes Codex`：

```js
test("model gateway applies and rolls back Codex config without changing login credentials", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const homeDir = path.join(root, "home");
  const service = createModelGatewayService(config, { homeDir });
  service.upsertProvider(undefined, {
    provider: {
      id: "gateway-managed-clients",
      name: "Gateway Managed Clients",
      appScopes: ["codex", "claude-code", "opencode", "openclaw"],
      baseUrl: "https://provider.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: { defaultModel: "gpt-main", models: [{ id: "gpt-main" }, { id: "gpt-alt" }] },
    },
    secret: { apiKey: "sk-upstream-managed-clients" },
  });
  service.updateClientAuth(undefined, { apiKey: "sk-local-managed-clients" });
  service.updateAppConnectionProfile(undefined, {
    profile: { appModels: { codex: "gpt-alt" } },
  });

  const codexPath = path.join(homeDir, ".codex", "config.toml");
  const authPath = path.join(homeDir, ".codex", "auth.json");
  fs.mkdirSync(path.dirname(codexPath), { recursive: true });
  const directLoginConfig = 'model = "gpt-5.6-terra"\nmodel_reasoning_effort = "low"\n';
  const authContents = '{"tokens":{"access_token":"user-owned"}}\n';
  fs.writeFileSync(codexPath, directLoginConfig, "utf8");
  fs.writeFileSync(authPath, authContents, "utf8");

  const listed = service.listAppConnections();
  const codex = listed.connections.find((connection) => connection.id === "codex");
  assert.equal(codex.canApply, true);
  assert.deepEqual(codex.issues, []);

  const single = service.applyAppConnection(undefined, { appId: "codex" });
  assert.equal(single.applied, true);
  assert.ok(single.backupPath && fs.existsSync(single.backupPath));
  assert.equal(single.connection.configured, true);
  const appliedConfig = fs.readFileSync(codexPath, "utf8");
  assert.match(appliedConfig, /model = "gpt-alt"/);
  assert.match(appliedConfig, /model_provider = "tracevane_gateway"/);
  assert.match(appliedConfig, /\[model_providers\.tracevane_gateway\]/);
  assert.equal(fs.readFileSync(authPath, "utf8"), authContents);

  const rollback = service.rollbackAppConnection(undefined, { appId: "codex" });
  assert.equal(rollback.rolledBack, true);
  assert.equal(fs.readFileSync(codexPath, "utf8"), directLoginConfig);
  assert.equal(fs.readFileSync(authPath, "utf8"), authContents);

  const bulk = service.applyAppConnections(undefined);
  assert.deepEqual(
    bulk.applied.map((item) => item.connection.id),
    ["codex", "claude-code", "opencode", "openclaw"],
  );
  assert.equal(bulk.applied.every((item) => item.applied), true);
});
```

- [ ] **Step 2: 删除测试中的 `manageCodexCli: true`**

将所有：

```js
createModelGatewayService(config, { homeDir, manageCodexCli: true })
```

改为：

```js
createModelGatewayService(config, { homeDir })
```

- [ ] **Step 3: 将 Web 合同改为要求通用 Codex 行为**

在 `App Connections view links client config rows to active route diagnostics` 中删除旧断言：

```js
assert.match(apps, /connection\.id === "codex" && !connection\.canApply/);
assert.match(apps, /账户直连/);
assert.match(apps, /gatewayManagedConnections/);
```

并加入：

```js
assert.doesNotMatch(apps, /保持账户直连/);
assert.doesNotMatch(apps, /gatewayManagedConnections/);
assert.match(apps, /connection\.configured \? "重新应用" : "应用"/);
assert.match(apps, /connections\.filter\(\(connection\) => connection\.configured\)/);
```

在总览页合同中删除：

```js
assert.match(overview, /connection\.id !== "codex"/);
assert.match(overview, /账户直连/);
assert.match(overview, /configuredConnectionCount\}\/\{gatewayManagedConnections\.length/);
```

并加入：

```js
assert.doesNotMatch(overview, /connection\.id !== "codex"/);
assert.doesNotMatch(overview, /账户直连/);
assert.match(overview, /configuredConnectionCount\}\/\{appConnections\.length/);
```

- [ ] **Step 4: 运行定向测试并确认 RED**

Run:

```powershell
node --test --test-name-pattern="applies and rolls back Codex config" tests/system/model-gateway-service.test.mjs
node --test --test-name-pattern="Overview exposes|App Connections view links" tests/system/web-model-gateway.test.mjs
```

Expected: 服务测试因 `codex.canApply` 仍为 `false` 失败；Web 测试因 App Connections 与 Overview 源码仍含 Codex 直连特判和 `gatewayManagedConnections` 失败。

---

### Task 2: 删除 Codex 特殊禁用层并恢复通用 UI

**Files:**
- Modify: `apps/api/modules/model-gateway/service.ts:6661-6684,10156-10164,10233-10239,10421-10426`
- Modify: `apps/web/src/features/model-gateway/views/AppConnectionsView.tsx:89-98,641-645,718-730,900-908,981-983,1010-1016`
- Modify: `apps/web/src/features/model-gateway/views/OverviewView.tsx:206-215,341-352,378-379,863-869`
- Test: `tests/system/model-gateway-service.test.mjs`
- Test: `tests/system/web-model-gateway.test.mjs`

**Interfaces:**
- Consumes: Task 1 的失败合同和现有通用 `canApply`、`applyAppConnection`、`applyAppConnections` 行为。
- Produces: 不含 Codex 特判的 `ModelGatewayServiceOptions`、四客户端批量应用及统一前端状态。

- [ ] **Step 1: 删除后端管理开关和拒绝分支**

从 `ModelGatewayServiceOptions` 删除：

```ts
manageCodexCli?: boolean;
```

删除局部变量：

```ts
const manageCodexCli = options.manageCodexCli === true;
```

从 `buildAppConnection` 的 `issues` 中删除 Codex 直连 issue，并从 `applyAppConnection` 删除 `model_gateway_codex_direct_login_preserved` 409 分支。将批量应用恢复为：

```ts
const applied = appConnectionSpecs().map((spec) => applyAppConnection(req, {
  appId: spec.id,
  profile,
}));
```

- [ ] **Step 2: 删除前端 Codex 特判**

`connectionStatus` 只保留通用状态：

```ts
function connectionStatus(connection: ModelGatewayAppConnection): {
  variant: "ok" | "warn" | "bad" | "mute";
  label: string;
} {
  if (connection.issues.length > 0) return { variant: "bad", label: "有问题" };
  if (connection.configured) return { variant: "ok", label: "已应用" };
  return { variant: "warn", label: "未应用" };
}
```

删除 `directCodexLogin`，按钮恢复为：

```tsx
<Upload />
{connection.configured ? "重新应用" : "应用"}
```

统计恢复为：

```ts
const configuredConnectionCount = connections.filter((connection) => connection.configured).length;
const attentionConnectionCount = connections.filter(
  (connection) => !connection.configured || connection.issues.length > 0,
).length;
const writableConnectionCount = connections.filter((connection) => connection.canApply).length;
```

页面说明与统计副文案恢复为：

```tsx
把网关路由应用到本地 CLI 客户端。每行展示 Agent scope、协议、Gateway endpoint 和当前实际 active route；写入、编辑和回滚仍先展示差异与备份证据。
```

```tsx
sub={`${connections.length} 个入口中已写入网关路由`}
```

总览页删除 `appConnectionBadge` 的 Codex 直连分支，并直接用全部 `appConnections` 计算：

```ts
const configuredConnectionCount = appConnections.filter(
  (connection) => connection.configured,
).length;
const appConnectionIssues = appConnections.filter(
  (connection) => !connection.configured || connection.issues.length > 0,
);
```

将总数与展示分母恢复为：

```ts
const clientTotal = appConnections.length;
```

```tsx
{configuredConnectionCount}/{appConnections.length}
```

- [ ] **Step 3: 运行定向测试并确认 GREEN**

Run:

```powershell
node --test --test-name-pattern="applies and rolls back Codex config" tests/system/model-gateway-service.test.mjs
node --test --test-name-pattern="Overview exposes|App Connections view links" tests/system/web-model-gateway.test.mjs
```

Expected: 两个命令均退出 0，测试无失败。

- [ ] **Step 4: 提交恢复实现**

```powershell
git add apps/api/modules/model-gateway/service.ts apps/web/src/features/model-gateway/views/AppConnectionsView.tsx apps/web/src/features/model-gateway/views/OverviewView.tsx tests/system/model-gateway-service.test.mjs tests/system/web-model-gateway.test.mjs
git commit -m "fix: restore Codex app connection management"
```

---

### Task 3: 同步研究决策、构建、重启和运行时验收

**Files:**
- Modify: `docs/研究先行开发清单.md:208-222`
- Verify: `apps/api/modules/model-gateway/service.ts`
- Verify: `apps/web/src/features/model-gateway/views/AppConnectionsView.tsx`

**Interfaces:**
- Consumes: Task 2 的四客户端统一应用行为。
- Produces: 最新研究决策、可编译产物和当前运行实例的已验证 UI/API。

- [ ] **Step 1: 在研究清单追加 2026-07-13 决策**

在 2026-07-12 Codex Account 条目之后加入：

```markdown
## 2026-07-13 Codex CLI 配置应用能力恢复

- 范围：Model Gateway 客户端接入控制台中的 Codex 单项应用、批量应用、备份与回滚。
- 官方参考：OpenAI 当前 Configuration Reference 确认用户级配置位于 `~/.codex/config.toml`，`model`、`model_provider`、`model_providers` 是用户级 Provider 配置；项目级配置不能覆盖这些 machine-local provider 字段。
- 本次决策：
  - 用户已明确授权 Tracevane 将 Codex CLI 与其他 Agent 一样纳入 App Connection 管理。
  - 单项与批量应用都包含 Codex；应用继续使用差异确认、备份、原子写入和回滚。
  - Tracevane 只管理 `~/.codex/config.toml` 与 `tracevane-gateway-models.json`，不读取或修改 `~/.codex/auth.json`。
  - 原“默认拒绝 Codex 应用并返回 409”的决策由本条替代。
```

- [ ] **Step 2: 运行完整定向验证**

Run:

```powershell
npm run build:api
npm run typecheck:web
node --test tests/system/model-gateway-service.test.mjs tests/system/web-model-gateway.test.mjs
git diff --check
```

Expected: 所有命令退出 0，Node 测试报告 0 failures。

- [ ] **Step 3: 提交文档同步**

```powershell
git add docs/研究先行开发清单.md docs/superpowers/plans/2026-07-13-codex-app-connection-restoration.md
git commit -m "docs: record Codex configuration ownership change"
```

- [ ] **Step 4: 重启当前工作树运行实例**

先读取 `package.json` 与现有运行终端，使用项目已有的 restart 命令停止并重启属于该工作树的 Web/API 进程，不终止未归属进程。等待 readiness 后记录实际 Web 与 API 地址。

- [ ] **Step 5: 验证运行时 API 与页面**

对实际 API 调用 App Connections 查询，确认 Codex `canApply=true` 且无直连保护 issue。打开客户端接入控制台并确认：

- Codex 模型选择器可操作；
- 主按钮显示“应用”或“重新应用”，不是“保持账户直连”；
- 批量应用说明包含四个入口；
- 回滚按钮继续按备份状态显示。

只验证页面与查询，不在 smoke 中自动覆盖用户真实 `~/.codex/config.toml`。
