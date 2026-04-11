# API Foundation

当前目录已经从占位状态切换为管理控制台恢复阶段的后端基础层。

当前已接入的基础能力：

- 模块化 route 装配
- `dashboard / agents / channels / config / cron / skills / terminal / system`
- 统一 HTTP router
- 基础 SSE
- 共享类型驱动的领域返回体

后续各子代理应优先在 `modules/<domain>/` 内继续实现，不要再把领域逻辑塞回单文件。
