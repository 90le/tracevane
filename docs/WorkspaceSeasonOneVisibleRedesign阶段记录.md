# Workspace Season One Visible Redesign 阶段记录

日期：2026-06-29

## 为什么这一阶段必须调整方向

用户指出：前面虽然持续推进了 Season One 架构，但默认 IDE 观感没有明显变化，容易变成继续修补旧框架。这个反馈成立。第一季目标不是把旧 Workbench 慢慢修好，而是建立一个可见、强观点、可逐步替换主入口的新 Workspace 前端。

## 本阶段做了什么

- 清理了中断留下的 terminal-status 半成品，避免把未验证接线混进提交。
- 强化 `WorkspaceSeasonOneFrame` 的整体视觉基底：深色工业工作室、青色 command deck、玻璃资源栏、底部运行台、状态条反差。
- 强化 `WorkspaceSeasonOneFramePreview` 的可见产品宣言：
  - `Rebuild Studio`
  - `Legacy shell replacement`
  - `Command Deck`
  - `Desktop command deck / Tablet split studio / Phone focus stack`
- 给这些可见重设计意图增加 DOM/data 锚点，后续视觉 QA 和切换主入口时能直接验收。

## 设计方向

继续采用 `Industrial Studio / Local Ops IDE`，但不再只停留在结构：

- 顶栏是全局 Command Deck，不是普通导航条；
- 左侧是 task context map，不是文件树墙；
- 主舞台强调一件工作产物，代码、写作、AI review 并排；
- 右侧 evidence rail 是审批驾驶舱；
- 底部 run panel 是 terminal/tests/evidence 运行台；
- 手机/平板/桌面是产品模型的一等公民，不是 CSS 事后补丁。

## 验收

- System composition test 锁定 Rebuild Studio / Legacy replacement / viewport manifest。
- Browser smoke 锁定 desktop/tablet/phone 都能看到新重设计锚点，且无横向溢出。

## 下一步

下一阶段必须推进“主入口切换策略”：在不提交别人脏改动的前提下，让 `/workspace` 或导航默认路径能进入 Season One 候选界面；如果现有 router/AppShell 文件仍有他人修改，需要先精确隔离 patch 或等待冲突窗口。
