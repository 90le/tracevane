# Studio 飞书渠道稳定性修复实施方案

> 状态: 已实施 1-9；2026-06-10 后续 false-ready/长连接专项继续记录在 `docs/feishu-long-connection-issue-tracker.md`
> 日期: 2026-06-10
> 范围: `apps/api/modules/channel-connectors/daemon.ts` 及相关文件
> 背景: `docs/feishu-long-connection-issue-tracker.md`
> 深度分析: `~/.openclaw/projects/openclaw/latest/extensions/feishu/FEISHU_THREE_LAYER_COMPARISON.md`

---

## 修改文件清单

| # | 文件 | 行数 | 改动类型 |
|---|------|------|----------|
| 1 | `daemon.ts` | 8187 | writeRuntime → 异步去抖动 |
| 2 | `daemon.ts` | 8187 | writeJsonLine → 异步批量追加 + 日志轮转 |
| 3 | `daemon.ts` | 8187 | /health 端点真实健康检查 |
| 4 | `daemon.ts` | 8187 | shutdown 强制退出超时 |
| 5 | `daemon.ts` | 8187 | 消息队列超时 |
| 6 | `daemon.ts` | 8187 | 飞书启动失败重试 |
| 7 | `feishu-transport.ts` | 1443 | Token 内存缓存 |
| 8 | `daemon.ts` | 8187 | sendOctoTyping catch |
| 9 | `daemon.ts` | 8187 | 管理端口认证 |

不新增文件。所有改动在现有文件内完成。

> **注意**: 原"修改 9: clients 数组清理"已删除——`closeFeishuGroupWsClient()` (daemon.ts:7692-7693) 已包含 `clients.splice(index, 1)` 逻辑，无需重复添加。修改编号保持连续：9 → 管理端口认证（原修改 10）。

---

## 修改 1: writeRuntime → 异步去抖动

**问题**: 33 个调用点同步 `fs.writeFileSync`，阻塞事件循环。高频率时（看门狗 tick + Agent 进度同时触发）每次阻塞 5-50ms。

**文件**: `daemon.ts:657-662`

```
当前:
  writeRuntime(config, state) {
    ensureDir(...)
    state.agentSessionDriver = buildAgentSessionDriverState(config);
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(config.paths.runtime, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }
```

**替换为**:

```typescript
let runtimeDirty = false;
let runtimeDirtyAt = 0;
let runtimeDebounceTimer: NodeJS.Timeout | null = null;
const RUNTIME_DEBOUNCE_MS = 2000;

function markRuntimeDirty(config: ChannelConnectorsDaemonRuntimeConfig, state: ChannelDaemonState): void {
  state.agentSessionDriver = buildAgentSessionDriverState(config);
  state.updatedAt = new Date().toISOString();
  runtimeDirty = true;
  runtimeDirtyAt = Date.now();
  if (!runtimeDebounceTimer) {
    runtimeDebounceTimer = setTimeout(() => {
      runtimeDebounceTimer = null;
      if (!runtimeDirty) return;
      runtimeDirty = false;
      ensureDir(path.dirname(config.paths.runtime));
      fs.promises.writeFile(config.paths.runtime, `${JSON.stringify(state, null, 2)}\n`, "utf8").catch(() => {});
    }, RUNTIME_DEBOUNCE_MS);
    runtimeDebounceTimer.unref();
  }
}

function flushRuntime(config: ChannelConnectorsDaemonRuntimeConfig, state: ChannelDaemonState): void {
  if (runtimeDebounceTimer) {
    clearTimeout(runtimeDebounceTimer);
    runtimeDebounceTimer = null;
  }
  runtimeDirty = false;
  state.agentSessionDriver = buildAgentSessionDriverState(config);
  state.updatedAt = new Date().toISOString();
  ensureDir(path.dirname(config.paths.runtime));
  fs.writeFileSync(config.paths.runtime, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
```

**全局替换**: 所有 33 个 `writeRuntime(config, state)` 调用点改为 `markRuntimeDirty(config, state)`。唯独 `stop()` 函数内的调用改为 `flushRuntime(config, state)`（关闭时需要同步写出）。

**验证**:
- 启动守护进程，发送飞书消息触发 Agent 运行
- 用 `inotifywait -m ~/.config/openclaw-studio/channel-connectors/runtime.json` 观察写入频率
- 预期：2s 内多次状态变化合并为一次写入

---

## 修改 2: writeJsonLine → 异步批量追加 + 日志轮转

**问题**: 48 个调用点同步 `fs.appendFileSync`。无大小限制、无轮转。启动时 `seedFeishuSeenMessagesFromEventLog` 全量 `readFileSync` + `split`。

**文件**: `daemon.ts:645-648`

```
当前:
  writeJsonLine(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
  }
```

**替换为**:

```typescript
const jsonLineBuffers = new Map<string, { lines: string[]; timer: NodeJS.Timeout | null }>();
const JSON_LINE_FLUSH_INTERVAL_MS = 1000;
const JSON_LINE_FLUSH_MAX_LINES = 100;
const JSON_LINE_MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB

function writeJsonLine(filePath: string, value: Record<string, unknown>): void {
  let buffer = jsonLineBuffers.get(filePath);
  if (!buffer) {
    buffer = { lines: [], timer: null };
    jsonLineBuffers.set(filePath, buffer);
  }
  buffer.lines.push(JSON.stringify(value));
  if (buffer.lines.length >= JSON_LINE_FLUSH_MAX_LINES) {
    flushJsonLineBuffer(filePath, buffer);
    return;
  }
  if (!buffer.timer) {
    buffer.timer = setTimeout(() => {
      buffer!.timer = null;
      flushJsonLineBuffer(filePath, buffer!);
    }, JSON_LINE_FLUSH_INTERVAL_MS);
    buffer.timer.unref();
  }
}

function flushJsonLineBuffer(filePath: string, buffer: { lines: string[]; timer: NodeJS.Timeout | null }): void {
  if (buffer.lines.length === 0) return;
  const content = buffer.lines.join("\n") + "\n";
  buffer.lines = [];
  ensureDir(path.dirname(filePath));
  fs.promises.appendFile(filePath, content, "utf8").catch(() => {});
  rotateJsonLineFile(filePath);
}

function rotateJsonLineFile(filePath: string): void {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < JSON_LINE_MAX_FILE_BYTES) return;
    const rotated = `${filePath}.${Date.now()}.rotated`;
    fs.renameSync(filePath, rotated);
  } catch {}
}
```

**同步修改**: `seedFeishuSeenMessagesFromEventLog` (line 4987-5018)

```
当前:
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

替换为:
  const { size } = fs.statSync(filePath);
  const start = Math.max(0, size - 5 * 1024 * 1024); // 只读最后 5MB
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(size - start);
  fs.readSync(fd, buf, 0, buf.length, start);
  fs.closeSync(fd);
  const raw = buf.toString("utf8");
  const firstNewline = raw.indexOf("\n");
  const lines = (firstNewline >= 0 ? raw.slice(firstNewline + 1) : raw).split(/\r?\n/);
```

**验证**:
- 检查 `feishuEvents` 日志文件不再无限增长
- 重启守护进程，观察启动时间不随日志文件大小增长

---

## 修改 3: /health 端点真实健康检查

**问题**: `daemon.ts:1304-1307` 永远返回 `{ ok: true }`。systemd 健康检查形同虚设。

**文件**: `daemon.ts:1304-1307`

```
当前:
  if (req.url === "/health") {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true, pid: process.pid }));
    return;
  }
```

**替换为**:

```typescript
if (req.url === "/health") {
  const feishuStates = Object.values(state.feishuConnections);
  const feishuHealthy = feishuStates.length === 0 || feishuStates.every((c) =>
    c.connected === true && c.state !== "reconnecting"
  );
  const runsHealthy = (state.activeRuns || 0) < 50;
  const ok = feishuHealthy && runsHealthy;
  res.statusCode = ok ? 200 : 503;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    ok,
    pid: process.pid,
    feishu: { groups: feishuStates.length, connected: feishuStates.filter((c) => c.connected).length },
    activeRuns: state.activeRuns || 0,
  }));
  return;
}
```

**设计说明**: 使用已有的 `state.feishuConnections`（类型 `ChannelDaemonFeishuConnectionState`，含 `connected: boolean` 和 `state` 字段），不需要扩展 `startHttp()` 的函数签名。`state.activeRuns` 已在 `/status` 端点中使用（daemon.ts:1321），可直接复用。

**验证**:
- 断开飞书连接后 `curl http://127.0.0.1:18797/health` 应返回 `503 { ok: false }`
- 正常运行时返回 `200 { ok: true }`

---

## 修改 4: shutdown 强制退出超时

**问题**: `daemon.ts:8177` 的 `server.close(() => process.exit(0))` 在有 keep-alive 连接时永远不触发。

**文件**: `daemon.ts:8167-8180`

```
当前:
  const stop = () => {
    ... (清理代码) ...
    server.close(() => process.exit(0));
  };
```

**在 `server.close(...)` 之前插入**:

```typescript
const forceExitTimer = setTimeout(() => {
  process.stderr.write("channel-connectors daemon: forced exit after 5s timeout\n");
  process.exit(0);
}, 5000);
forceExitTimer.unref();
server.close(() => {
  clearTimeout(forceExitTimer);
  process.exit(0);
});
```

**验证**:
- `kill -SIGTERM <pid>` 后进程在 5s 内退出

---

## 修改 5: 消息队列超时

**问题**: `acquireChannelSessionAgentRun` (line 1252) 的 Promise 链队列无超时。Agent 挂起则同 session 所有后续消息永远排队。

**文件**: `daemon.ts:1252-1300`

**步骤 A**: 扩展 `acquireChannelSessionAgentRun` 的 `input` 类型，添加可选回调：

在函数签名的 `input` 对象中（line 1254-1259）添加一个字段：

```typescript
// 在 input 类型中添加:
onQueueTimeout?: (error: Error) => void;
```

**步骤 B**: 替换 line 1281-1284 的等待逻辑：

```
当前:
  if (existing) {
    await input.onQueued?.(queuePosition);
    await previous.catch(() => undefined);
  }

替换为:
  if (existing) {
    await input.onQueued?.(queuePosition);
    const queueTimeoutMs = 300_000; // 5 minutes
    await Promise.race([
      previous.catch(() => undefined),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("session_queue_timeout")), queueTimeoutMs)
      ),
    ]).catch((error) => {
      input.onQueueTimeout?.(error);
      releaseCurrent();
    });
  }
```

**步骤 C**: 在两个调用点传入 `onQueueTimeout` 回调。

调用点 1 — `daemon.ts:5308`:
```typescript
const sessionRunLease = await acquireChannelSessionAgentRun(channelSessionAgentRunQueues, {
  // ... 现有参数 ...
  onQueueTimeout: (error) => {
    appendLog(config.paths.log, "Session run queue timeout, releasing", {
      bindingId: input.bindingId,
      sessionKey: input.sessionKey,
      error: error.message,
    });
  },
});
```

调用点 2 — `daemon.ts:6296`:
```typescript
const sessionRunLease = await acquireChannelSessionAgentRun(channelSessionAgentRunQueues, {
  // ... 现有参数 ...
  onQueueTimeout: (error) => {
    appendLog(config.paths.log, "Session run queue timeout, releasing", {
      bindingId: input.bindingId,
      sessionKey: input.sessionKey,
      error: error.message,
    });
  },
});
```

**验证**:
- 制造一个 Agent 运行挂起的场景（如不响应 abort）
- 发送第二条消息到同 session
- 预期：5min 后第二条消息开始处理（不永远排队）

---

## 修改 6: 飞书启动失败重试

**问题**: `main()` line 8157 的 `startFeishuConnections(...).catch(...)` 失败后只记日志，不重试。

**文件**: `daemon.ts:8157-8165`

```
当前:
  void startFeishuConnections(config, state, activeRunCancels, feishuClients, feishuClientAbortControllers, seenMessages, feishuGroups)
    .then((timer) => { feishuWatchdog = timer; })
    .catch((error) => { appendLog(...); });
```

**替换为**:

```typescript
(async () => {
  let attempt = 0;
  while (true) {
    try {
      const timer = await startFeishuConnections(config, state, activeRunCancels, feishuClients, feishuClientAbortControllers, seenMessages, feishuGroups);
      feishuWatchdog = timer;
      return;
    } catch (error) {
      attempt += 1;
      const delayMs = Math.min(30_000 * 2 ** Math.min(attempt - 1, 4), 300_000);
      appendLog(config.paths.log, "Feishu connection startup failed, retrying", {
        error: error instanceof Error ? error.message : String(error),
        attempt,
        retryInMs: delayMs,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
})();
```

**验证**:
- 配置一个错误的 appSecret
- 启动守护进程
- 预期：日志中看到重试，延迟递增（30s → 60s → 120s → 240s → 300s）

---

## 修改 7: Token 缓存内存层

**问题**: `feishu-transport.ts` 的 `cachedToken()` (line 176) 每次调用 `readCache()` (line 153) 从磁盘 `readFileSync`。13+ 个 API 函数通过 `getFeishuTenantToken()` 调用，高频消息场景下产生大量磁盘 I/O。

**文件**: `feishu-transport.ts`

**步骤 A**: 在 `TOKEN_EXPIRY_SKEW_MS` 常量（line 21）之后添加内存缓存：

```typescript
const tokenMemoryCache = new Map<string, { token: string; expiresAt: number }>();

function cachedTokenFromMemory(cacheKey: string): string | null {
  const cached = tokenMemoryCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() >= cached.expiresAt - TOKEN_EXPIRY_SKEW_MS) {
    tokenMemoryCache.delete(cacheKey);
    return null;
  }
  return cached.token;
}

function setTokenToMemory(cacheKey: string, token: string, expiresAt: number): void {
  tokenMemoryCache.set(cacheKey, { token, expiresAt });
}
```

**步骤 B**: 修改 `cachedToken()` 函数（line 176-183），在 `readCache()` 调用之前插入内存缓存检查：

```typescript
function cachedToken(cachePath: string | null | undefined, config: ChannelConnectorFeishuTransportConfig): string | null {
  if (!cachePath) return null;
  const key = tokenCacheKey(config);
  const memToken = cachedTokenFromMemory(key);
  if (memToken) return memToken;
  const record = readCache(cachePath)[key];
  if (!record?.tenantAccessToken || !record.expiresAt) return null;
  const expiresAt = Date.parse(record.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + TOKEN_EXPIRY_SKEW_MS) return null;
  setTokenToMemory(key, record.tenantAccessToken, expiresAt);
  return record.tenantAccessToken;
}
```

**步骤 C**: 在 `getFeishuTenantToken()` 函数（line 526-567）中，API 获取新 token 成功并 `writeCache()` 之后（line 559），插入内存缓存写入：

```typescript
// 在 writeCache(cachePath, cache); 之后添加:
const expiresIn = Number(response.body.expire);
if (Number.isFinite(expiresIn)) {
  setTokenToMemory(tokenCacheKey(config), token, Date.now() + expiresIn * 1000);
}
```

**验证**:
- 发送 100 条飞书消息
- 用 `strace -e trace=openat -p <pid> 2>&1 | grep token` 观察磁盘读取次数
- 预期：首次读取磁盘，后续命中内存缓存

---

## 修改 8: sendOctoTyping 未处理 Promise rejection

**问题**: `daemon.ts:2983` 的 `void sendOctoTyping(...)` 有 `.finally()` 但无 `.catch()`。如果 `sendOctoTyping` reject，会产生 unhandled promise rejection。

**文件**: `daemon.ts:2983-2986`

```
当前:
  void sendOctoTyping(transport, channelId, message.channelType)
    .finally(() => {
      inFlight = false;
    });

替换为:
  void sendOctoTyping(transport, channelId, message.channelType)
    .catch(() => {})
    .finally(() => {
      inFlight = false;
    });
```

---

## 修改 9: 管理端口认证

**问题**: `/agent-sessions` 端点无认证。

**文件**: `daemon.ts:1302` 的 `startHttp` 函数

在 handler 顶部（`/health` 检查之后）添加：

```typescript
const managementToken = config.management?.token || process.env.STUDIO_DAEMON_MANAGEMENT_TOKEN;
if (managementToken && req.url !== "/health" && req.url !== "/status") {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${managementToken}`) {
    res.statusCode = 401;
    res.end("unauthorized");
    return;
  }
}
```

**验证**:
- 不带 token 访问 `/agent-sessions` 返回 401
- 带 `Authorization: Bearer <token>` 访问正常

---

## 实施顺序和依赖关系

```
无依赖，可并行:
  ├── 修改 1: writeRuntime 异步化         (P0)
  ├── 修改 2: writeJsonLine 异步化        (P0)
  ├── 修改 3: /health 真实检查            (P0)
  ├── 修改 4: shutdown 强制退出           (P0)
  ├── 修改 7: Token 内存缓存             (P1)
  ├── 修改 8: sendOctoTyping catch       (P1)
  └── 修改 9: 管理端口认证               (P1)

无依赖（仅 daemon.ts 内部函数签名变更）:
  ├── 修改 5: 消息队列超时               (P1) — 通过 onQueueTimeout 回调解决日志问题
  └── 修改 6: 启动失败重试               (P1) — 独立循环
```

**建议第一批**: 修改 1-4，全部 P0，互不依赖，可并行开发。完成后部署验证 1-2 天。

**建议第二批**: 修改 5-9，P1，修改 1-2 稳定后实施。

---

## 验证清单

每个修改完成后，在合入前执行以下检查：

```bash
# 在项目根目录执行 (cd ~/.openclaw/extensions/openclaw-studio)

# 1. 类型检查
npm run typecheck:api

# 2. 构建检查
npm run build:api

# 3. 重启守护进程
systemctl --user restart openclaw-studio-channel-connectors

# 4. 发送飞书测试消息，确认 Agent 正常回复

# 5. 检查 runtime.json 正常更新
watch -n 1 'cat ~/.config/openclaw-studio/channel-connectors/runtime.json | jq ".feishuConnections"'

# 6. 检查日志文件大小不增长
ls -lh ~/.config/openclaw-studio/channel-connectors/feishu-events.jsonl

# 7. 健康检查
curl http://127.0.0.1:18797/health

# 8. 优雅关闭
time systemctl --user stop openclaw-studio-channel-connectors
# 预期: <5s 退出
```

---

## 回滚方案

每个修改都是独立的函数替换。如果某个修改导致问题：

1. 恢复该函数的原始实现
2. 重启守护进程
3. 其他修改不受影响

如果需要紧急全量回滚：
```bash
git revert HEAD  # 回滚最近一次提交
systemctl --user restart openclaw-studio-channel-connectors
```
