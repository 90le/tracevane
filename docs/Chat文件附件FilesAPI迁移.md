# Chat 文件附件 Files API 迁移记录

> 更新：2026-06-26
> 状态：Active contract

## 目标

统一 Agent Chat 不再拥有独立的文件二进制上传协议。文件目录加载、上传、预览、下载统一归 Files / FileManager / Workspace 域；Chat 只消费可发送给 Agent 的结构化资源引用。

## 当前合同

- 目录加载：`GET /api/files/summary` + `GET /api/files/browse`。
- 上传：`POST /api/files/uploads/init`、`PUT /api/files/uploads/:uploadId/chunks/:chunkIndex`、`POST /api/files/uploads/complete`。
- 预览/下载：`GET /api/files/download?rootId=...&path=...`。
- Chat 发送附件：新建/上传/目录选择统一发送 `files:<rootId>:<path>`；后端仅为历史消息和平台回放兼容已有 `workspace:` / legacy `uploads:` 引用解析。

## 已删除的旧合同

- 删除 `/api/chat/sessions/:sessionKey/upload` HTTP route。
- 删除 Chat route 内 multipart/base64 文件解析器。
- 删除 `ChatService.uploadFile*` 服务方法。
- 删除 `ChatFileUploadRequest` 类型。

## 决策

拒绝保留 Chat 专用 upload 作为备用入口，因为备用入口会让前后端长期存在两套上传、存储、预览 URL 和权限边界，后续 CLI Agent / 平台 Agent 附件处理会再次混乱。

## 验证

- `tests/chat/chat-files-api-boundary.test.mjs`：锁定前端上传走 Files API，并锁定后端不再暴露旧 Chat upload owner。
- `tests/chat/conversation-view-source.test.mjs`：锁定 Chat 目录选择、附件预览和发送 ref 都走 Files root。
- `tests/chat/media-bridge.test.mjs`：锁定 `files:` refs 可解析为 native attachment。
- `npm run build:api`
- `npm run build:web`
