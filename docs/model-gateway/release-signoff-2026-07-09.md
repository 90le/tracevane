# Model Gateway Release Signoff - 2026-07-09

## Verdict

当前配置达到可签收状态：`glm-4.7`、`gpt-5.4`、`claude-sonnet-4-6` 三个代表模型已经分别覆盖 `codex`、`claude-code`、`opencode` 三个 agent scope，并通过正式 3x3 representative matrix 的全部 route/tool/stream/tool-result/compatibility/malformed/error smoke。

这里的 100% 按 `README.md` 定义执行：每个能力必须是 `native`、`adapted-lossless`、`adapted-degraded`、`path-handoff`、`direct-upload` 或 `unsupported-explicit`。不是所有上游都原生支持所有能力。

## Current Providers

| Provider | Status |
| --- | --- |
| `codex-account` | enabled, active for `codex` / `claude-code` / `opencode` / `openclaw`, `openai_responses`, health `closed`; representative model `gpt-5.4` verified |
| `api-key-provider` | enabled, health `closed`; endpoint `anthropic` is `anthropic_messages`, endpoint `chat` is `openai_chat` |
| `glm` | enabled, health `closed`; endpoint `coding-anthropic` is `anthropic_messages`, endpoint `coding-chat` is `openai_chat`; representative model `glm-4.7` verified |

## Live Evidence

| Area | Result | Evidence |
| --- | --- | --- |
| Representative 3x3 matrix | PASS | `.omx/state/model-gateway/representative-matrix-final-green-2026-07-09.json` and `.omx/state/model-gateway/representative-matrix-final-green-2026-07-09.md`: 9/9 route proofs and 99/99 smoke probes passed |
| Codex account protocol matrix | PASS | `scripts/smoke-model-gateway-protocol-matrix.mjs --codex-provider codex-account --codex-models gpt-5.5 --skip-glm`: route/tool/stream-tool/tool-result/compatibility/malformed/error groups all 3/3 |
| Report artifacts | PASS | `.omx/state/model-gateway/protocol-acceptance-codex-account-gpt-5.5.json` and `.omx/state/model-gateway/protocol-acceptance-codex-account-gpt-5.5.md` |
| API-key Anthropic endpoint | PASS | `api-key-provider` + `claude-code` selected endpoint `anthropic`, route `anthropic_messages`, upstream `/v1/messages`, HTTP 200 |
| API-key Chat endpoint | PASS | `api-key-provider` + `opencode` selected endpoint `chat`, route `openai_chat_completions`, upstream `/v1/chat/completions`, HTTP 200 |
| Codex account vision direct upload | PASS | `POST /api/model-gateway/providers/codex-account/test` with `kind=vision` returned HTTP 200, `responsePreview: "red"` |
| Codex account media inventory | PASS | `smoke-model-gateway-account-media.mjs --require-image-generation`: catalog includes image generation, 11 audio models, 3 realtime models; image edits and Codex account audio return explicit 501 |
| Codex account image generation | PASS | `gpt-image-2` live smoke returned HTTP 200 with `imageCount: 1`, `hasUsage: true`, provider `codex-account` |
| Real CLI runner | PASS | `codex`, `claude-code`, `opencode` each completed 3 shell tool calls and 3 tool outputs through the runner with final replies using `gpt-5.4` |
| Native CLI sessions | PASS | Claude/OpenCode strict native session smoke passed normal, tool, file manifest, visual native image handoff, compact, and stop cancellation |
| Attachment/fallback regressions | PASS | Focused tests cover Responses `input_file` preservation, large-file direct upload routing, non-vision visual fallback, auto-vision routing, video path/staging evidence |

## Representative Model Matrix

新增代表模型矩阵 runner：`scripts/smoke-model-gateway-representative-matrix.mjs`。它按 `glm-4.7`、`gpt-5.4`、`claude-sonnet-4-6` 三个模型覆盖 `codex`、`claude-code`、`opencode` 三个 agent scope，并默认执行 route、tool、stream tool、tool result、stream tool result、compatibility/MCP-shaped、malformed history、structured error、stream error smoke。

2026-07-09 final live run 输出：

- JSON report: `.omx/state/model-gateway/representative-matrix-final-green-2026-07-09.json`
- Markdown report: `.omx/state/model-gateway/representative-matrix-final-green-2026-07-09.md`
- Overall: PASS.
- Route proofs: 9/9 passed.
- Smoke groups: route, tool, stream tool, tool result, stream tool result, compatibility, stream compatibility, malformed, stream malformed, error, stream error all passed 9/9.
- Total failed smokes: 0.
- Setup/restore/expectation issues: 0.

Representative findings:

| Representative | Result |
| --- | --- |
| `gpt-5.4` via `codex-account` | PASS across `codex`, `claude-code`, `opencode` and all smoke groups |
| `glm-4.7` via `glm` | PASS across `codex`, `claude-code`, `opencode` and all smoke groups; final run used smoke pacing to avoid upstream 429 rate limits |
| `claude-sonnet-4-6` via `api-key-provider` | PASS across `codex`, `claude-code`, `opencode` and all smoke groups |

## Capability Matrix

| Capability | Current state |
| --- | --- |
| Responses route for Codex | `native` / passthrough through `codex-account` |
| Anthropic route for Claude Code | `adapted-lossless` from Codex account Responses, and `native` on `api-key-provider` endpoint `anthropic` |
| Chat route for OpenCode | `adapted-lossless` from Codex account Responses, and `native` on `api-key-provider` endpoint `chat` |
| Text, non-streaming and streaming | PASS across three scopes in protocol matrix |
| Function/custom tool call | PASS across three scopes in protocol matrix |
| Tool result round trip | PASS across three scopes in protocol matrix |
| Streaming tool call/result | PASS across three scopes in protocol matrix |
| Error and streaming error normalization | PASS across three scopes in protocol matrix |
| MCP/compatibility fields | PASS for compatibility cleanup, malformed tool/MCP history degradation, cache/annotation/container-style fields; real external MCP server invocation remains a separate integration smoke if required |
| CLI images | `path-handoff`: native CLI smoke proves local image path/native image argument is passed to Claude/OpenCode; this is not Gateway direct upload |
| Gateway image input | `direct-upload`: provider vision smoke sends protocol-native image content and verifies visual recognition |
| Ordinary files to CLI | `path-handoff`: native CLI smoke proves file manifest/path behavior |
| Ordinary file input to Gateway | `direct-upload` contract covered by service tests for Responses `input_file` URL/file id/base64 preservation |
| Large files | PASS for direct-upload routing decision in Channel Connector transport smoke; Files API provider upload remains provider-specific evidence, not a universal claim |
| Non-vision model image fallback | explicit degradation contract is covered by channel connector tests; must never claim the model saw an image when only a path was handed off |
| Video | default `path-handoff`/file strategy; no video-understanding upstream support is claimed |
| Audio | Codex account audio routes are `unsupported-explicit` in current gateway; audio direct support requires a real audio file upload endpoint/provider proof |
| Image generation | PASS: `gpt-image-2` live generation succeeded through `codex-account` |

## Fixes Closed During Signoff

1. Codex account provider vision smoke now applies the same Responses normalization used by normal Codex account requests: `stream: true`, `store: false`, and `include: ["reasoning.encrypted_content"]`.
2. Provider vision result parsing now reads JSON payloads from SSE frames, including `event: response.created` followed by `event: response.completed`, instead of relying on a truncated raw preview.
3. Native OpenAI Chat and Anthropic Messages passthrough now degrade malformed tool history into safe text before upstream, preventing strict upstream 400s.
4. Active route base/compatibility/malformed smoke no longer includes opportunistic `tool_choice:auto`; tool behavior is verified by dedicated tool smoke groups.
5. Active route smoke treats upstream 429/rate-limit/capacity messages as transient and supports `--smoke-delay-ms`; the final matrix used this to avoid false negatives from GLM rate limiting.

## Verification Commands

```bash
npm run typecheck:api
npm run build:api
node --test tests/system/model-gateway-service.test.mjs tests/system/model-gateway-protocol-matrix-smoke-script.test.mjs tests/system/model-gateway-active-routes-smoke-script.test.mjs tests/system/model-gateway-account-media-smoke-script.test.mjs
node --test tests/system/channel-connectors-agent-session-driver.test.mjs tests/system/channel-connectors-codex-app-server-driver.test.mjs tests/system/channel-connectors-agent-runner-direct-script.test.mjs tests/system/channel-connectors-agent-run-live-script.test.mjs tests/system/channel-connectors-agent-sessions-live-script.test.mjs
node scripts/smoke-model-gateway-protocol-matrix.mjs --endpoint http://127.0.0.1:18796 --codex-provider codex-account --codex-models gpt-5.5 --skip-glm --timeout-ms 90000 --stage-timeout-ms 120000 --report-file .omx/state/model-gateway/protocol-acceptance-codex-account-gpt-5.5.json --markdown-report .omx/state/model-gateway/protocol-acceptance-codex-account-gpt-5.5.md --json
node scripts/smoke-model-gateway-active-routes.mjs --endpoint http://127.0.0.1:18796 --provider api-key-provider --model claude-opus-4-6 --scopes claude-code --timeout-ms 60000 --expect-endpoints claude-code=anthropic --expect-routes claude-code=anthropic_messages --expect-api-formats claude-code=anthropic_messages --json
node scripts/smoke-model-gateway-active-routes.mjs --endpoint http://127.0.0.1:18796 --provider api-key-provider --model claude-opus-4-6 --scopes opencode --timeout-ms 60000 --expect-endpoints opencode=chat --expect-routes opencode=openai_chat_completions --expect-api-formats opencode=openai_chat --json
node scripts/smoke-model-gateway-account-media.mjs --endpoint http://127.0.0.1:18796 --timeout-ms 240000 --require-image-generation --json
node scripts/smoke-model-gateway-representative-matrix.mjs --endpoint http://127.0.0.1:18796 --timeout-ms 90000 --stage-timeout-ms 900000 --stage-retries 1 --smoke-retries 3 --smoke-delay-ms 5000 --report-file .omx/state/model-gateway/representative-matrix-final-green-2026-07-09.json --markdown-report .omx/state/model-gateway/representative-matrix-final-green-2026-07-09.md --json
node scripts/smoke-channel-connectors-agent-runner-direct.mjs --agents codex,claude-code,opencode --model gpt-5.4 --timeout-ms 240000 --json
node scripts/smoke-channel-connectors-native-cli-sessions.mjs --strict --json --timeout-ms 120000
node --test --test-name-pattern "model gateway starts Codex account login and creates an account-backed provider|model gateway preserves Responses-style Chat input file parts for Responses providers|Octo upload-and-send media auto routes large files to direct upload|native Channel Connectors visual turns select Gateway vision models from catalog" tests/system/model-gateway-service.test.mjs tests/system/channel-connectors-service.test.mjs
node --test --test-name-pattern "agent run live smoke script verifies Octo tool, reply, and outbound file evidence|agent run live smoke script verifies video attachment and staged local files|agent run live smoke script treats Octo video-like files as inbound video evidence" tests/system/channel-connectors-agent-run-live-script.test.mjs
```

## Remaining Non-Claims

- Live external MCP server invocation was not separately run. The current signoff covers MCP-shaped compatibility/degradation in gateway tests and active-route compatibility smoke.
- Live Files API provider upload for large files was not run. File/path handoff, adapter preservation, and direct-upload routing decisions are signed off; provider-specific Files API upload still requires separate endpoint evidence before claiming universal direct-upload.
- Video is accepted only as `path-handoff`/staged-file evidence. No upstream video-understanding API support is claimed.
- Broad non-agent OpenAI/Claude administrative endpoints remain `unsupported-explicit`; they are outside the three CLI-agent protocol acceptance surface.
