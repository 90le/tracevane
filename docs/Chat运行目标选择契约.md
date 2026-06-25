# Chat 运行目标选择契约

> 更新：2026-06-26
> 状态：Active contract

## 定位

统一 Agent Chat 的默认目标是和本地 CLI Agent 对话：Codex CLI、Claude Code、OpenCode 等。OpenClaw 平台 Agent 是兼容平台运行目标，不是默认的新建会话心智。

## 新建/编辑会话规则

- 默认运行器是 `native-cli / codex`。
- Native CLI 选项必须通过 CLI 代理的本地二进制检测结果确认可用后才能选择。
- 未安装、未知、检测中的 CLI 运行器不能被选中，也不能保存为新建/编辑会话的 runtime target。
- 后端同样拒绝不在白名单内的 native CLI agent。当前白名单是 `codex`、`claude-code`、`opencode`；未来新增 CLI agent 时，必须同时补前端选择、后端运行适配、测试与文档。
- OpenClaw 平台 Agent 保留为 `openclaw-gateway / openclaw` 兼容选项，由平台自身管理可用性。

## 用户体验

- 每个运行目标卡片显示状态：可用、未安装、未知、检测中、平台。
- 不可用选项显示禁用态和原因。
- 保存时仍有防线：如果当前选中的运行器不可用，阻止提交并提示去 CLI 代理页面安装或配置。

## 验证

- `tests/chat/session-list-view-source.test.mjs` 锁定默认 Codex、二进制状态展示、不可用 CLI 禁用、保存前 gate。
- `tests/chat/service.session-actions.test.mjs` 锁定后端 create/patch 对 unsupported native CLI agent 的拒绝与注册表不污染。
- `npm run build:web` 验证前端类型与生产构建。
