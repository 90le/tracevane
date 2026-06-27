# IM Channels Frontend Design Contract

> Status: active design contract
> Updated: 2026-06-24
> Authority: this document is the IM Channels UI contract under the Aurora design system. It refines `docs/界面设计守则.md` and `DESIGN.md` for the IM Channels domain.

## 1. Design position

IM Channels is a Tracevane **Connections** domain. It connects external chat platforms to local Agent runtime. It is not a traditional admin dashboard, not a Gateway page, and not a CLI terminal page.

The UI must follow Aurora's working principles:

- Row/table-first for scan and compare.
- One primary object per view.
- No card walls.
- No equal-weight left/right layout copied from generic SaaS dashboards.
- No “put every panel on the first screen” layout.
- Use Drawer for multi-field editing, Sheet for read-only evidence/details, Dialog for dangerous confirmation, Toast for immediate result.
- Advanced or low-frequency details stay collapsed or move to a sub-view.

## 2. Main page shape

IM Channels should be a single domain page with a compact local viewbar/segmented control. The top-level views are:

```text
IM Channels
├─ 概览
├─ 平台账号
├─ 绑定路由
├─ 会话投递
└─ 守护诊断
```

This is **not** a left-navigation sub-app. It is one Aurora page where the main stage swaps the current primary object view.

Rules:

- Viewbar primary tabs should stay at 5 or fewer.
- Each view has one toolbar and one active work surface.
- Do not show platform accounts, bindings, agent profiles, daemon generated bindings, sessions, and logs as peer panels on the same screen.
- Cross-domain references use links: Gateway route opens Model Gateway; Agent runtime opens CLI Agents / Agent Runs; files open Evidence / Workspace.

## 3. View contracts

### 3.1 概览

Purpose: answer “can IM work right now, and what needs attention?”

Visible content:

- Compact readiness strip: daemon state, online accounts, enabled bindings, failed delivery count.
- Recommended next action: process failed delivery, add platform account, add binding route, inspect daemon.
- Recent failures as rows.
- Platform health as compact rows.

Do not show:

- Full credential forms.
- Full Agent Profile list.
- Full daemon native binding list.
- Long implementation explanations.

### 3.2 平台账号

Primary object: platform account / bot / app identity.

Examples:

- `Feishu · tracevane-bot`
- `Octo · octo-main`
- `WeCom · enterprise app`

Page shape:

```text
Toolbar: search + platform filter + status filter + 新建平台账号
Rows: platform account, credential state, smoke state, binding count, last used
Read-only detail: Sheet
Edit/create: Drawer
Delete/disable: Dialog or row action with confirmation
```

Rows, not cards, are the default. A row click opens a read-only Sheet for last smoke evidence, credential state, callback URL, and referenced bindings. Editing opens a Drawer.

### 3.3 绑定路由

Primary object: route from IM source to Agent profile.

Examples:

- `Feishu 研发群 → Codex profile`
- `Feishu 私聊 → Claude Code profile`
- `Octo 群组 → OpenCode profile`

Page shape:

```text
Toolbar: search + account filter + agent filter + status filter + 新建绑定
Rows: route name, platform account, source kind/id, Agent profile, state, last match
Read-only detail: Sheet
Edit/create: Drawer
Delete: Dialog
```

This view must not ask for app secret, bot token, verification token, or encrypt key. Those belong to platform accounts.

### 3.4 会话投递

Primary object: runtime delivery event / IM session evidence.

Page shape:

```text
Toolbar: platform filter + binding filter + state filter + time range + only failures
Rows: time, platform, source, binding, Agent Run, status, duration
Read-only detail: Sheet
```

The detail Sheet should show the chain:

```text
platform message → binding match → permission decision → Agent Run → Gateway route → outbound delivery
```

Failure reasons should be human-readable categories:

- no binding matched
- permission denied
- command disabled
- agent launch failed
- agent timeout
- gateway/model failed
- platform send failed
- token expired
- platform permission missing

### 3.5 守护诊断

Primary object: Channel Connectors daemon.

Page shape: Status Console.

Visible content:

- Service state: installed, active, enabled, pid, endpoint, last heartbeat.
- Recommended action: refresh, install, start, stop, restart, inspect logs.
- Checklist rows: config current, template current, daemon reachable, adapters healthy.
- Logs as rows; click opens Sheet.
- Generated/native config preview as collapsed evidence.

Do not show:

- New platform account forms.
- Binding route forms.
- Gateway provider configuration.
- Generic terminal/PTX operations.

## 4. Account vs binding boundary

The frontend must clearly split two concepts even while the current backend may store them in one `platformBinding` document.

### Platform account owns credentials

Fields belong here:

- platform
- account display name
- account enabled state
- app id / client id
- app secret / bot token / corp secret
- bot id / agent id
- verification token
- encrypt key / EncodingAESKey
- callback URL
- long-connection endpoint/status
- platform-level smoke result

### Binding route owns routing

Fields belong here:

- route name
- selected platform account
- source kind: user / group / channel / thread
- source id or wildcard
- Agent profile
- allowlist
- admin users
- disabled commands
- session mode / busy guard / attachment policy when supported
- match/delivery test result

If a field can answer “how does Tracevane authenticate to the IM platform?”, it belongs to platform account. If it answers “which IM source triggers which Agent?”, it belongs to binding route.

## 5. Drawer contracts

Multi-field creation/editing uses Drawer, not small Dialog.

Drawer rules:

- Width: approximately `760px–860px` on desktop.
- Max height: about `85vh`.
- Body scrolls independently.
- Footer is sticky and always visible.
- Header states whether the user is creating account, editing account, creating binding, or editing binding.
- Inline validation appears next to the field.
- Advanced raw JSON is collapsed by default.
- Saving credentials or changing secret-like fields must clearly state that values are redacted after save.

Footer actions:

```text
取消 | 保存 | 保存并测试
```

Use `保存并测试` only when the backend has a verified smoke endpoint for that platform/action. Otherwise show an explicit unsupported note.

## 6. Platform account field templates

The primary UI must show platform-specific fields. Raw metadata JSON is advanced fallback only.

### Feishu

Sections:

- 基础信息: name, enabled
- 应用凭据: appId, appSecret, botId optional
- 事件回调: verificationToken, encryptKey, callback URL read-only/copy
- 测试: tenant-access-token; optional send-message only when receive/chat id is supplied

### Octo

Sections:

- 基础信息: name, enabled
- 连接: apiUrl, botToken, websocket URL optional, accountId/botId
- 测试: register; optional list-groups when safe inputs exist

### WeCom / 企业微信

Sections:

- 基础信息: name, enabled
- 应用凭据: corpId, agentId, secret
- 事件回调: token, EncodingAESKey, callback URL read-only/copy
- 测试: show “not yet verified” until a first-party backend smoke exists

### Unsupported platforms

Do not present a fully enabled form that implies production support. Either hide the platform, create a disabled draft, or show “adapter not implemented/verified”.

## 7. Binding route Drawer fields

Sections:

- 基础: route name, enabled, platform account selector
- 来源匹配: peer kind, peer id, wildcard warning when applicable
- Agent 目标: Agent profile selector, Agent kind read-only, route/model preview read-only with link to Model Gateway, workdir/permission preview with link to CLI Agents
- 权限策略: allowlist, adminUsers, disabledCommands
- 会话策略: one-shot/persistent, busy guard, attachment staging when supported
- 测试: match test or delivery smoke only when backend can verify it

Do not include platform credential fields here.

## 8. Detail and evidence patterns

- Row click opens Sheet for read-only details/evidence.
- Sheet should not contain large edit forms.
- Delivery failures should show a short reason, raw error evidence, and a suggested next action.
- Daemon native/generated config belongs in diagnostics or collapsed evidence, not as a peer editable list beside user bindings.
- Agent profiles should be selector/detail evidence, not a large top-of-page panel.

## 9. Explicit anti-patterns

Remove or avoid these patterns:

- A first screen with Agent profiles, platform bindings, and daemon native bindings all as equal panels.
- “Daemon 原生绑定” displayed as if it were a second user-editable binding list.
- Small modal dialogs for wide credential forms.
- Generic `metadata JSON` as the main form for normal users.
- Constant row-level button piles that crowd the table. Prefer toolbar, row hover/context, or selected-object actions.
- Unsupported platform actions that look enabled.
- Gateway provider/model config editable inside IM Channels.
- CLI terminal/PTY lifecycle controls inside IM Channels.

## 10. Migration from current implementation

Current backend can continue storing account identity and binding target in one `platformBinding` record during the first migration. The frontend should still present two conceptual views:

- Platform Accounts: groups/edits the credential and transport fields.
- Binding Routes: groups/edits the source-to-Agent policy fields.

A real backend split into `platformAccounts` and `bindingRoutes` should happen only when multi-binding account semantics require it. Do not add a half-working second store just to match UI naming.

## 11. Acceptance checklist

Before implementing an IM Channels UI change, verify:

- The current view has one primary object.
- High-frequency actions are visible within two steps.
- Low-frequency configuration is in Drawer/collapsed advanced sections.
- Secret values are never shown raw after save.
- Platform fields are template-based, not raw JSON-first.
- Unsupported adapter actions are visibly unsupported.
- Deleting/disabling/writing credentials uses confirmation when risk warrants it.
- No horizontal overflow at normal desktop width and mobile width.
- Detail Sheets are read-only/evidence-first.
- Generated daemon config is not shown as a duplicate editable source of truth.
