# Model Gateway 能力矩阵

本文是实现和验收时使用的短表。状态以代码和测试证据为准，文档不能替代测试。

## 路由层

| Route id | Public path | Provider format | 状态 |
| --- | --- | --- | --- |
| `openai_responses` | `/v1/responses` | `openai_responses` | `native` |
| `openai_responses` | `/v1/responses` | `openai_chat` | `adapted-lossless` for text/function tools; built-ins按能力降级 |
| `openai_responses` | `/v1/responses` | `anthropic_messages` | `adapted-lossless` for text/function tools; built-ins按能力降级 |
| `openai_chat_completions` | `/v1/chat/completions` | `openai_chat` | `native` |
| `openai_chat_completions` | `/v1/chat/completions` | `openai_responses` | `adapted-lossless` for text/function tools |
| `openai_chat_completions` | `/v1/chat/completions` | `anthropic_messages` | `adapted-lossless` for text/function tools |
| `anthropic_messages` | `/v1/messages`, `/claude/v1/messages` | `anthropic_messages` | `native` |
| `anthropic_messages` | `/v1/messages`, `/claude/v1/messages` | `openai_responses` | `adapted-lossless` for Claude Code text/tool loop |
| `anthropic_messages` | `/v1/messages`, `/claude/v1/messages` | `openai_chat` | `adapted-lossless` for text/function tools |
| image generation | `/v1/images/generations` | OpenAI-compatible or Codex account image route | `native` when endpoint supports it |
| image edit | `/v1/images/edits` | Codex account | `unsupported-explicit` |
| audio routes | `/v1/audio/*` | Codex account | `unsupported-explicit` |
| realtime | `/v1/realtime` | all current providers | `unsupported-explicit` |

## Agent CLI 层

| Agent | 驱动入口 | 必须证明 |
| --- | --- | --- |
| Codex CLI | `codex exec --json` 或 Codex app-server | 文本、工具进度、approval、图片 `--image` path-handoff、文件清单回传 |
| Claude Code CLI | `claude -p --input-format stream-json --output-format stream-json` | stream-json 文本、tool_use/tool_result、MCP config、permission prompt、文件/图片路径说明 |
| OpenCode CLI | `opencode run --format json` | JSON 输出、工具事件解析、MCP 配置、文件路径上下文 |

## 100% 待补齐项

这些项不是当前代码一定缺失，而是达到 release-signoff 时必须逐项有证据：

1. 三协议每个方向都有非流式、流式、tool call、tool result、error smoke。
2. MCP list/call/approval 在 Responses、Chat、Anthropic 三侧都有 native 或 degraded 证明。
3. 图片、普通文件、大文件分别有 `path-handoff` 和 `direct-upload` 测试，不混淆。
4. 非视觉模型视觉降级必须有事件和用户可见提示。
5. 视频默认按文件 path-handoff/summary 处理，除非新增视频 API 合同。
6. 音频 API 仅在直接上传文件时声称支持；Codex account audio 保持 unsupported-explicit。
7. Windows/WSL 路径上的 secrets 需要单独安全说明；自动化 chmod 断言必须运行在支持 Unix mode 的测试根。
8. 任意新增 provider/endpoint profile 必须更新 `docs/研究先行开发清单.md` 和本矩阵。
9. live smoke 失败必须暴露脱敏 `diagnostics.network`，至少能区分上游不可达、代理不可达、超时和 HTTP 非 2xx。
10. release signoff 必须保存 protocol matrix JSON/Markdown 报告，并包含 route、tool、MCP/compatibility、附件/降级边界。
