# IM Channels Target Design

> Status: active target
> Updated: 2026-06-24

## 1. Current assessment

IM Channels is not complete. It currently behaves too much like a status viewer. A usable IM product must let the user create, edit, delete, bind, test and operate IM accounts and bot credentials.

## 2. Product goal

IM Channels should connect external IM platforms to local Agent runtime:

```text
IM platform account/bot
        ↓
Binding: user/group/channel/thread → Agent runtime settings
        ↓
Inbound message / command / attachment
        ↓
CLI Agent session via Channel Connectors
        ↓
Model Gateway
        ↓
Outbound reply / delivery log
```

## 3. Owned objects

### Platform account

A platform account represents one bot/app identity.

Common fields:

- `id`
- `platform`: feishu / wecom / octo / future adapters
- `name`
- `enabled`
- `appId` / `clientId`
- `appSecret` / secret ref
- `botId`
- `verificationToken`
- `encryptKey`
- `webhookUrl` or callback path
- long-connection switch and status
- created/updated/tested timestamps

Secrets must be masked in UI and written only through backend secret-safe APIs.

### Binding

A binding maps an IM source to an Agent runtime target.

Fields:

- `id`
- `platformAccountId`
- `peerKind`: user / group / channel / thread
- `peerId`
- `agent`: codex / claude / opencode / configured runtime profile
- `model` or model route scope
- `workDir`
- `permissionMode`
- `sessionMode`: one-shot / persistent
- delivery options and progress-card options
- enabled/disabled

### IM session

Runtime object created by messages:

- source binding
- native platform message/thread id
- agent session id
- model/workdir/permission mode
- turn count
- running/idle/error
- last delivery status

## 4. Required frontend flows

P0:

1. Platform account list.
2. Create account.
3. Edit account.
4. Delete/disable account with confirmation.
5. Credential field templates per platform.
6. Binding list.
7. Create binding.
8. Edit binding.
9. Delete/disable binding with confirmation.
10. Test account connectivity.
11. Test binding delivery or command surface where supported.
12. Delivery logs with useful error text.

P1:

- Guided Feishu setup.
- Guided WeCom/企业微信 setup.
- “copy callback URL” and platform setup checklist.
- Attachment/file policy controls.
- Per-binding model/runtime preview.

## 5. Backend expectations

The backend should expose clear APIs for:

- list/get/create/update/delete platform accounts
- list/get/create/update/delete bindings
- validate credentials without persisting unsafe data
- smoke platform connection
- smoke binding delivery
- manage daemon service
- read delivery logs and IM sessions

If existing `channels` and `channel-connectors` APIs overlap, the product surface should converge them behind IM Channels instead of showing two mental models to the user.

## 6. Non-goals

- Do not manage model provider API keys here.
- Do not manage terminal PTY lifecycle here except via session-driver status.
- Do not expose raw token values after save.
- Do not claim Feishu/WeCom setup is complete without an end-to-end send/receive smoke.
