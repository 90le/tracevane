# cc-connect dmwork platform plugin

Go implementation of the **DMWork** (WuKongIM / 明略科技 Octo 即时通讯平台) messaging platform for cc-connect, providing real-time bot messaging with file/image support.

DMWork is an enterprise IM platform built on the WuKongIM protocol by MiningLamp Technology (明略科技). It provides bot APIs for messaging, file transfer, and group management.

## Features

- **Real-time messaging** via WuKongIM WebSocket binary protocol
- **Text send/receive** with chunked delivery for long messages
- **Image support** — send and receive images via COS
- **File support** — send and receive files via COS (up to 100MB)
- **Curve25519 + AES-128-CBC encryption** for WebSocket payload
- **Auto-reconnect** with exponential backoff
- **Multi-account** — run multiple bots in one cc-connect instance
- **Typing indicators** and read receipts
- **Cron support** via ReplyContextReconstructor
- **System message filtering** — auto-skips type 99 and system channels

## @mention Resolution (Native, Zero-Config)

The platform natively resolves `@DisplayName` in agent replies to platform mentions — **no AGENTS.md or prompt configuration needed**.

**How it works:**
1. `FormattingInstructions()` injects @mention rules into the agent system prompt automatically (via the engine's `PlatformPromptInjector` interface)
2. When the agent writes `@SomeName` in its reply text, `extractMentions()` looks up the name in the group member map
3. Resolved UIDs are sent as `MentionUIDs` in the `sendMessage` API call
4. The DMWork platform renders native @mentions with notifications

**No user configuration required.** The platform fetches group members on inbound messages, builds a UID↔Name map, and uses it for both:
- Inbound: stripping @bot mentions from the user's message content
- Outbound: resolving @mentions in agent reply text to real platform mentions

Users are free to configure their own AGENTS.md for agent behavior, personality, or domain-specific instructions — but @mention functionality is built into the platform itself.

## Architecture

```
platform/dmwork/
├── types.go    — Data types, enums (ChannelType, MessageType, WSPacketType)
├── api.go      — REST API client (register, sendMessage, upload, heartbeat)
├── socket.go   — WuKongIM WebSocket client (binary protocol + encryption)
├── cos.go      — File upload (dual: multipart for small, COS STS for large)
├── dmwork.go   — Platform struct (core.Platform + ImageSender + FileSender)
├── inbound.go  — Message handler (dedup, type parsing, file download)
└── README.md   — This file
```

## Quick Start

### 1. Build cc-connect with dmwork support

Requires Go 1.25+:

```bash
git clone https://github.com/chenhg5/cc-connect.git
cd cc-connect

# The dmwork platform files should be in platform/dmwork/
# The registration file should be at cmd/cc-connect/plugin_platform_dmwork.go

go build -o cc-connect ./cmd/cc-connect/
```

### 2. Create a DMWork bot

Send `/newbot` to BotFather in DMWork/Octo to create a bot and get a `bf_` token.

### 3. Configure

Add to `config.toml`:

```toml
[[projects.platforms]]
type = "dmwork"

[projects.platforms.options]
bot_token = "bf_your_bot_token"
api_url = "https://your-dmwork-server.example.com/api"
# Optional:
# account_id = "my_bot"          # default: "default"
# ws_url = "wss://..."           # auto-detected from register response
# allow_from = "uid1,uid2"       # restrict to specific users
```

### 4. Run

```bash
cc-connect -config config.toml
```

### Multi-account (multiple bots)

```toml
# Bot A
[[projects.platforms]]
type = "dmwork"

[projects.platforms.options]
bot_token = "bf_token_a"
api_url = "https://your-dmwork-server.example.com/api"
account_id = "bot_a"

# Bot B
[[projects.platforms]]
type = "dmwork"

[projects.platforms.options]
bot_token = "bf_token_b"
api_url = "https://your-dmwork-server.example.com/api"
account_id = "bot_b"
```

### systemd (recommended for production)

```ini
[Unit]
Description=cc-connect
After=network-online.target

[Service]
Type=simple
ExecStart=/path/to/cc-connect -config /path/to/config.toml
WorkingDirectory=/home/user/.cc-connect
Restart=on-failure
RestartSec=10
Environment="PATH=/usr/local/bin:/usr/bin:/bin"

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now cc-connect
```

## Configuration Reference

| Option | Required | Description |
|--------|----------|-------------|
| `bot_token` | Yes | Bot token from BotFather (`bf_` prefix) |
| `api_url` | Yes | DMWork server API URL |
| `account_id` | No | Account label for multi-bot (default: `"default"`) |
| `ws_url` | No | WebSocket URL override (auto-detected if omitted) |
| `allow_from` | No | Comma-separated UIDs to restrict access |

## API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/bot/register` | POST | Register bot, get IM credentials |
| `/v1/bot/sendMessage` | POST | Send text/media messages |
| `/v1/bot/typing` | POST | Send typing indicator |
| `/v1/bot/readReceipt` | POST | Send read receipt |
| `/v1/bot/heartbeat` | POST | REST heartbeat (backup) |
| `/v1/bot/file/upload` | POST | Upload small files (<300KB, multipart) |
| `/v1/bot/upload/credentials` | GET | Get COS STS credentials for large file upload |

## File Upload Strategy

- **< 300KB**: Uses `POST /v1/bot/file/upload` (simple multipart form)
- **≥ 300KB**: Uses STS temporary credentials → COS SDK `putObject` direct upload (bypasses nginx size limits, supports up to 100MB)

Note: The DMWork nginx `client_max_body_size` is typically configured at 512KB. Large file uploads must use the COS direct upload path to avoid `413 Request Entity Too Large` errors.

## WuKongIM Binary Protocol

The WebSocket client implements the WuKongIM binary protocol (proto version 4):

| Packet Type | Code | Direction | Purpose |
|-------------|------|-----------|---------|
| CONNECT | 1 | Client→Server | Authenticate with DH public key |
| CONNACK | 2 | Server→Client | Return server key + reason code |
| RECV | 5 | Server→Client | Incoming message (encrypted) |
| RECVACK | 6 | Client→Server | Acknowledge received message |
| PING | 7 | Client→Server | Heartbeat (30s interval) |
| PONG | 8 | Server→Client | Heartbeat response |
| DISCONNECT | 9 | Server→Client | Server-initiated disconnect |

**Encryption flow**:
1. Client generates Curve25519 key pair, sends public key in CONNECT packet
2. Server returns its public key in CONNACK
3. Both sides derive shared secret via Curve25519 DH → base64 → MD5 → first 16 chars = AES-128-CBC key
4. All RECV payloads are AES-128-CBC encrypted with PKCS7 padding

## Session Key Format

| Channel Type | Session Key |
|-------------|-------------|
| DM (type=1) | `dmwork:dm:<peer_uid>` |
| Group (type=2) | `dmwork:group:<channel_id>` |
| Community Topic (type=5) | `dmwork:group:<channel_id>` |

## Interface Compliance

```go
core.Platform                      // Name, Start, Reply, Send, Stop
core.ImageSender                   // SendImage
core.FileSender                    // SendFile
core.ReplyContextReconstructor     // ReconstructReplyCtx (cron support)
core.FormattingInstructionProvider // FormattingInstructions
```

## Testing

Unit test:

```bash
go test ./platform/dmwork/ -v
```

Integration test (requires real bot token):

```bash
# Set DMWORK_BOT_TOKEN and DMWORK_API_URL env vars
go test ./platform/dmwork/ -v -tags=integration
```

## Dependencies

- `github.com/gorilla/websocket` — WebSocket client
- `golang.org/x/crypto/curve25519` — Curve25519 DH key exchange
- `github.com/tencentyun/cos-go-sdk-v5` — COS file upload with STS credentials

## About DMWork / Octo

DMWork is the WuKongIM-based instant messaging platform by MiningLamp Technology (明略科技), marketed as **Octo IM**. It provides enterprise messaging with bot APIs, group management, file sharing, and real-time communication via the WuKongIM binary WebSocket protocol.

- Protocol: WuKongIM (binary WebSocket with Curve25519 encryption)
- Cloud storage: Tencent COS (with STS temporary credentials)
- Bot management: BotFather (`/newbot`, `/disconnect`, `/quickstart`)
- Source & docs: https://www.npmjs.com/package/openclaw-channel-dmwork

## License

MIT (same as cc-connect)
