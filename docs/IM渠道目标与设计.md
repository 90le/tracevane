# IM Channels Target Design

> Status: active target
> Updated: 2026-06-24

## 1. Current assessment

IM Channels is the product domain for external chat platforms. It must not be a duplicate Gateway or CLI page. The first usable slice now focuses on native platform bindings: create, edit, delete, enable/disable, enter bot/account credentials, and run safe transport smoke checks where an adapter exists.

## 2. Product goal

```text
IM platform account/bot
        ↓
Platform binding: account/bot credentials + Agent profile + access policy
        ↓
Inbound message / command / attachment
        ↓
Channel Connectors runtime session
        ↓
CLI Agent session + Model Gateway route
        ↓
Outbound reply / delivery log
```

## 3. Owned objects

### Platform binding / account identity

Current implementation stores the account identity and binding target in one native `platformBinding` record. This is intentional for the first usable slice: it avoids a second half-working account store while still allowing real setup.

Fields:

- `id`
- `platform`: feishu / octo / wecom / future adapters
- `displayName`
- `accountId`
- `botId`
- `agentProfileId`
- `enabled`
- `allowlist`
- `adminUsers`
- `disabledCommands`
- `metadata`: platform transport JSON such as `appId`, `appSecret`, `verificationToken`, `encryptKey`, `botToken`, `apiUrl`, `wsUrl`, `corpId`, `agentId`; route override JSON such as `routeAgent`, `routeModel`, `routeWorkDir`, `routePermissionMode`

Secrets are never returned raw from the config API. Browser reads receive `[redacted]`; saving an unchanged redacted value preserves the real secret on disk.

### Agent profile

Agent profiles remain read-only on the IM page. They are owned by the native Channel Connectors config and reference the runtime agent, model, workdir, permission mode, and Gateway endpoint. A binding route may independently override agent, default model, startup directory, and permission mode; the profile then acts as the template plus gateway key/app-profile reference.

### IM session and delivery log

Runtime sessions, command events, daemon status, and logs remain operational evidence. IM Channels may display and operate them, but should not own generic terminal/PTY lifecycle.


## 4. Frontend information architecture

The authoritative UI contract is `IM渠道前端设计契约.md`. IM Channels must use one Aurora domain page with compact local views, not a generic left/right admin layout and not a pile of equal panels.

Top-level views:

```text
概览 / 平台账号 / 绑定路由 / 会话投递 / 守护诊断
```

Required UI boundaries:

- 平台账号 owns platform credentials, callback URL, connection mode, and platform smoke.
- 绑定路由 owns source matching, Agent profile template, per-route Agent/model/workdir/permission overrides, allowlist/admin/commands, and session policy.
- 会话投递 owns runtime evidence and human-readable failure diagnosis.
- 守护诊断 owns daemon/service checks and generated config evidence.
- Agent profiles and daemon native bindings must not be displayed as equal first-screen panels beside user-editable bindings.
- Raw `metadata` JSON is advanced fallback only; normal account creation/editing must use platform-specific fields.

## 5. Current frontend flows

Implemented slices:

1. Aurora local views: 概览 / 平台账号 / 绑定路由 / 会话投递 / 守护诊断.
2. Platform account rows with create/edit/delete, enable/disable, redacted credential state, Feishu `tenant-token` smoke and Octo `register` smoke.
3. Wide account Drawer with platform-specific Feishu / Octo / WeCom field templates and advanced collapsed metadata JSON.
4. Binding route rows with source kind/id, effective Agent/model/workdir preview, allowlist/admin/disabledCommands, session policy, and a separate wide route Drawer.
5. 会话投递 view for IM-triggered Agent sessions and runtime event evidence.
6. 守护诊断 view for daemon service, checklist, logs, and generated native binding evidence.
7. Agent profiles are selectors/previews, not a first-screen panel.
8. Daemon native bindings are collapsed evidence, not a second user-editable binding list.
9. Browser config reads remain redacted; saving unchanged `[redacted]` preserves real secrets.

Still P0/P1 follow-up:

- Guided Feishu setup checklist and callback URL copy.
- Guided WeCom/企业微信 setup once adapter smoke is verified.
- Dedicated account-vs-binding backend split only when a real multi-binding account store is needed.
- Delivery logs with filtering by binding/session/error.
- Per-binding model/runtime preview.（已具备基础 effective Agent/model/workdir 展示，后续补真实 smoke 矩阵。）
- Attachment/file policy controls.

## 6. Backend expectations

Current backend contract:

- `GET /api/channel-connectors/config` returns redacted native config for browser use.
- `PUT /api/channel-connectors/config` saves the native config while preserving existing secrets when the payload still contains `[redacted]`.
- `POST /api/channel-connectors/adapters/feishu/transport-smoke` supports safe Feishu token verification.
- `POST /api/channel-connectors/adapters/octo/transport-smoke` supports Octo transport smoke actions.
- Daemon config/service/log/session endpoints remain the runtime operations layer. Runtime config generation must split a binding into its own synthetic project when route metadata overrides agent/model/workdir/permission mode, so every IM route can launch an independent Agent target.

Future backend work should add narrow account CRUD only when the product needs multiple peer bindings per shared account. Until then, avoid duplicating a second account store beside `platformBindings`.

## 7. Non-goals

- Do not manage model provider API keys here.
- Do not manage Codex/Claude/OpenCode client config here.
- Do not manage terminal PTY lifecycle here except through IM session evidence/status.
- Do not expose raw token values after save.
- Do not claim Feishu/WeCom setup is complete without adapter-level smoke evidence.
- Do not fake external platform success.

## 8. Research notes

2026-06-24 local contract check for route overrides and diagnostics:

- `ChannelConnectorAgentProfile` already owns `agent`/`model`/`workDir`/`permissionMode`; route metadata now stores safe per-binding overrides without introducing another account store.
- Model choices come from the existing Model Gateway model list query, not hard-coded strings.
- Diagnostic logs are evidence, not the primary UX; summaries/problem lines should precede raw logs, and raw logs must use bounded height plus forced word breaks.
- Session events should translate runtime event types into human-readable status, impact, and next action while retaining the raw type as a small evidence tag.


2026-06-24 checked current platform docs before changing the user-visible IM setup flow:

- Feishu Open Platform message/send docs: token-bearing API calls use `tenant_access_token` bearer auth, and bot sending requires IM permissions such as `im:message:send_as_bot`.
- Feishu card/message docs still require app token flow and platform-specific message identifiers for send/update actions.
- WeCom/企业微信 public integration references consistently require `corpId`/app secret/agent id plus callback `Token` and `EncodingAESKey`; Tracevane should keep these as metadata templates until a verified first-party adapter exists.
- Octo in this repo already has verified transport smoke code; the UI exposes only the existing `register` smoke by default and does not invent unsupported actions.
