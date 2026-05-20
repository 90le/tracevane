---
name: "dmwork"
description: "DMWork 群协作 — @mention、私聊、群聊消息发送"
---

# DMWork 协作

## 发消息
群聊回复自动投递，不需要额外命令。

## @mention
在回复文本中写 @名字（如 @小丘Codex），系统自动解析为真实 mention。只在需要对方回复时使用。

## 私聊
```bash
cc-connect send -p <project> -s "dmwork:dm:<uid>" -m "消息"
```

## 群聊主动发消息
```bash
cc-connect send -p <project> -s "dmwork:group:<groupId>" -m "消息"
```

## 协作原则
- 群聊中不要输出模型名、token 用量、工作目录等技术元信息
- 判断该找谁协作，不要无脑 @所有人
- 复杂/敏感内容私聊讨论，结论回群同步
- 等对方回复再继续，不连发 @
