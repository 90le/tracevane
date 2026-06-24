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
- `metadata`: platform transport JSON such as `appId`, `appSecret`, `verificationToken`, `encryptKey`, `botToken`, `apiUrl`, `wsUrl`, `corpId`, `agentId`

Secrets are never returned raw from the config API. Browser reads receive `[redacted]`; saving an unchanged redacted value preserves the real secret on disk.

### Agent profile

Agent profiles remain read-only on the IM page. They are owned by the native Channel Connectors config and reference the runtime agent, model, workdir, permission mode, and Gateway endpoint.

### IM session and delivery log

Runtime sessions, command events, daemon status, and logs remain operational evidence. IM Channels may display and operate them, but should not own generic terminal/PTY lifecycle.

## 4. Frontend flows

Implemented first slice:

1. Agent profile list, read-only.
2. Platform binding list.
3. Create platform binding.
4. Edit platform binding.
5. Delete platform binding with confirmation.
6. Enable/disable binding.
7. Edit allowlist/admin/disabled command policy.
8. Edit transport metadata JSON for credentials and adapter-specific fields.
9. Redacted secret warning and safe round-trip behavior.
10. Feishu `tenant-token` transport smoke.
11. Octo `register` transport smoke.
12. Daemon native binding preview remains read-only evidence.

Still P0/P1 follow-up:

- Guided Feishu setup checklist and callback URL copy.
- Guided WeCom/企业微信 setup once adapter smoke is verified.
- Dedicated account-vs-binding split only when a real multi-binding account store is needed.
- Delivery logs with filtering by binding/session/error.
- Per-binding model/runtime preview.
- Attachment/file policy controls.

## 5. Backend expectations

Current backend contract:

- `GET /api/channel-connectors/config` returns redacted native config for browser use.
- `PUT /api/channel-connectors/config` saves the native config while preserving existing secrets when the payload still contains `[redacted]`.
- `POST /api/channel-connectors/adapters/feishu/transport-smoke` supports safe Feishu token verification.
- `POST /api/channel-connectors/adapters/octo/transport-smoke` supports Octo transport smoke actions.
- Daemon config/service/log/session endpoints remain the runtime operations layer.

Future backend work should add narrow account CRUD only when the product needs multiple peer bindings per shared account. Until then, avoid duplicating a second account store beside `platformBindings`.

## 6. Non-goals

- Do not manage model provider API keys here.
- Do not manage Codex/Claude/OpenCode client config here.
- Do not manage terminal PTY lifecycle here except through IM session evidence/status.
- Do not expose raw token values after save.
- Do not claim Feishu/WeCom setup is complete without adapter-level smoke evidence.
- Do not fake external platform success.

## 7. Research notes

2026-06-24 checked current platform docs before changing the user-visible IM setup flow:

- Feishu Open Platform message/send docs: token-bearing API calls use `tenant_access_token` bearer auth, and bot sending requires IM permissions such as `im:message:send_as_bot`.
- Feishu card/message docs still require app token flow and platform-specific message identifiers for send/update actions.
- WeCom/企业微信 public integration references consistently require `corpId`/app secret/agent id plus callback `Token` and `EncodingAESKey`; Tracevane should keep these as metadata templates until a verified first-party adapter exists.
- Octo in this repo already has verified transport smoke code; the UI exposes only the existing `register` smoke by default and does not invent unsupported actions.
