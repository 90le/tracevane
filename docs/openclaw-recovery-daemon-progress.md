# OpenClaw 自愈守护进程进度

> 状态：核心实现已完成；等待目标 OS smoke
> 更新：2026-06-12
> 文档规则：只保留当前状态、验证和下一步；过期细节看 git。

## 当前状态

- 独立 recovery daemon 入口、模块、状态文件、事件 jsonl、备份目录、repair lock 已实现。
- `/api/openclaw-recovery/*` 管理 API 已接入。
- daemon 健康循环使用轻量 loopback probe，持续失败超过策略阈值后才进入修复。
- 本机 loopback fallback 控制面提供 status、events、backups、manual run、backup restore，并使用本地 token。
- `/system` 已改成轻量概览。
- `/system/recovery` 已提供 daemon service、轻量探测、手动修复、事件和备份。
- 修复管线已覆盖配置 prune、插件隔离、旧 install record 清理、Studio web bundle 检查/重建、CLI manifest/shim/npm 重装、gateway 深探测、gateway service 托管修复、残留进程安全接管和失败回滚。

## 当前边界

- Recovery daemon 是独立专项，不属于 Studio Gateway 或 Channel Connectors。
- 当前主线开发不应把 recovery 逻辑塞进 Gateway/Channel daemon。
- 发布前仍需要真实目标 OS supervisor smoke。

## 最近验证

历史已通过：

- recovery/system 隔离 TypeScript 编译。
- `tests/system/openclaw-recovery-contract.test.mjs`
- `tests/system/studio-web-system-runtime-shell.test.mjs`
- `git diff --check`

本轮文档清理未修改 recovery 代码，未重跑 recovery runtime smoke。

## 下一步

1. Linux `systemd --user`、macOS launchd、Windows scheduled task/service install/start/restart smoke。
2. 真实 gateway service 损坏样本验证。
3. 真实 CLI 缺失/包损坏样本验证。
4. 真实 Studio web dist 损坏样本验证。
