# OpenClaw Studio

OpenClaw Studio 是一个基于 OpenClaw 插件系统的 Web 管理控制台扩展。

当前项目已从早期恢复阶段进入“管理域稳定 + Chat Runtime 活跃 + 文档重新对齐”的状态。

## 当前阶段

当前以以下领域为正式范围：

- `agents`
- `channels`
- `skills`
- `cron`
- `terminal`
- `config`
- `chat`
- `system`

当前仍待继续推进：

- `dashboard`
- `codex-stack`
- `dreaming`
- `files`
- `plugins`

当前暂缓：

- `room`
- `workflow`

## 文档入口

当前以这 6 份中文文档为主线：

1. [docs/产品需求.md](docs/产品需求.md)
2. [docs/系统架构.md](docs/系统架构.md)
3. [docs/当前进展.md](docs/当前进展.md)
4. [docs/聊天设计方案.md](docs/聊天设计方案.md)
5. [docs/聊天契约.md](docs/聊天契约.md)
6. [docs/混合渲染方案.md](docs/混合渲染方案.md)

补充文档：

- [docs/聊天会话策略.md](docs/聊天会话策略.md)
- [docs/聊天开放门槛.md](docs/聊天开放门槛.md)
- [docs/界面设计守则.md](docs/界面设计守则.md)
- [docs/富消息使用说明.md](docs/富消息使用说明.md)
- [docs/chat-official-parity.md](docs/chat-official-parity.md)

## 目录结构

```text
openclaw-studio/
  apps/
    api/
    web-vue/
  docs/
  lib/
  resources/
  scripts/
  tests/
  types/
  index.ts
  openclaw.plugin.json
  package.json
  tsconfig.json
```

## 开发命令

```bash
npm install
npm run build
npm run dev:web
npm run dev:api
npm run dev:restart
npm run typecheck
npm run test:chat
npm run test:chat:web
npm run test:system
```

## 说明

- `npm run dev:web` 使用 Vite 开发服务器（默认 `http://127.0.0.1:5176`），并在 dev 中间件里挂载 Studio API。
- `npm run dev:api` 会先编译后端，再启动独立 Studio API。
- `npm run test:chat` 已包含 chat 后端主测试与 `test:chat:web`。
- `npm run test:chat:web` 覆盖 markdown rendering、chat runtime view model、session list view model、slash commands 等前端 contract 回归。
- `chat` 前端正文渲染已从旧 `marked` 补丁链路迁移为 `unified + remark + rehype` 主链，并补有最小回归测试覆盖 raw HTML / 混排 / fenced html/svg/mermaid 场景。
