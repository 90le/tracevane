# OpenClaw 自愈守护进程进度

> 状态：核心实现已完成
> 更新：2026-06-05
> 文档规则：只保留当前状态、验证和下一步；过期细节直接替换，不追加流水日志。

## 当前状态

- 独立 recovery daemon 入口、模块、状态文件、事件 jsonl、备份目录、repair lock 已实现。
- `/api/openclaw-recovery/*` 管理 API 已接入 Studio API context/router。
- daemon 健康循环使用轻量 loopback probe，持续失败超过策略阈值后才进入修复。
- 本机 loopback fallback 控制面提供 status、events、backups、manual run、backup restore，并使用本地 token。
- Recovery status 会保留最近一次 service action 的 active/enabled 快照，避免“启动成功后按钮状态被轻量刷新覆盖”。
- 修复历史和配置备份支持分页读取与前端翻页。
- 修复管线已拆出配置层、插件层、CLI bootstrap/安装检查层、gateway 端口/进程发现层和失败回滚层。
- 已用真实坏配置做烟测：`tools.exec.mode` 冲突被动态删除，`openclaw config validate --json` 恢复 valid；最终 gateway probe 因烟测脚本端口写错未通过。
- `/system` 已改成轻量概览，只读取 health、recovery status、upgrade status。
- `/system/recovery` 已新增为自愈管理页，承载 daemon service、轻量探测、手动修复、事件和备份。
- `/system/events` 保留为持久事件历史，不再作为默认 System 入口，也不触发 live diagnostics。

## 进度

| 区域 | 状态 | 当前证据 | 下一步 |
| --- | --- | --- | --- |
| 目标文档 | 完成 | `docs/openclaw-recovery-daemon-goal.md` | 只有范围变化时更新 |
| 热路径清理 | 完成 | System overview、runtime summary、event list、event summary 不再调用 diagnostics | 后续改 System/Event 时防回归 |
| Recovery API | 完成 | `types/openclaw-recovery.ts`、`apps/api/modules/openclaw-recovery/*`、`/api/openclaw-recovery/*` | 增加策略配置时扩展 |
| daemon | 完成 | `apps/api/openclaw-recovery-daemon.ts` 编译通过；daemon loop 使用 `probeOpenClawGateway` | 目标 OS 上做 supervisor smoke |
| fallback 控制面 | 完成 | loopback status/events/backups/run/restore 已实现 | 需要正式 UX 时补 discovery/token 展示 |
| 事件/备份分页 | 完成 | `/api/openclaw-recovery/events|backups?page=&pageSize=` 返回分页 payload；前端上一页/下一页 | 发布前做浏览器视觉 QA |
| 修复策略 | 完成 | 配置动态 prune；插件 entry 隔离与缺失 load path 清理；CLI manifest、shim 恢复与 npm 重装兜底；gateway 残留进程安全接管；配置失败回滚；`doctor --fix` opt-in | 根据真实故障样本扩展 |
| 前端 | 完成 | `/system` 轻量化；`/system/recovery` lazy route、service 状态按钮切换、动作后刷新保护、历史/备份分页、CLI 自动修复和 gateway 接管策略展示完成 | 发布前做浏览器视觉 QA |
| 验证 | 完成 | API build、Web typecheck、Recovery/System focused tests 通过 | unrelated dirty domains 清理后重跑全量 |

## 验证

- 通过：`npm run build:api`
- 通过：`npm run typecheck:web`
- 通过：`node --test tests/system/openclaw-recovery-contract.test.mjs tests/system/openclaw-recovery-daemon.test.mjs tests/system/system-runtime-summary.test.mjs tests/system/studio-web-system-runtime-shell.test.mjs tests/system/studio-web-performance-foundation.test.mjs`
- 通过：Recovery/System 扩展子集 11 个测试。
- 未通过：`npm run test:system` 仍有 13 个失败，集中在 model-gateway、plugins、skills、studio-management、agents/channels/chat/config/confirm 等非本任务脏区；System/Recovery 相关测试已通过。

## 下一步

1. 在 Linux `systemd --user`、macOS launchd 和 Windows scheduled task 上做安装/启动/重启 smoke。
2. 增强运行时发现层，继续识别 OpenClaw gateway 的启动方式、服务托管状态和非端口类启动冲突。
3. 用真实 CLI 缺失/包损坏样本验证 npm 重装兜底。
4. unrelated dirty domains 合并或清理后重跑全量 system suite。
