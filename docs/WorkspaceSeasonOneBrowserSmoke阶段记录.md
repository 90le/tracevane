# Workspace Season One Browser Smoke 阶段记录

日期：2026-06-29

## 目的

Season One 已有结构验收和实验路由，但第一季目标要求电脑、平板、手机都要真实可用。因此本阶段新增 Playwright 浏览器 smoke，用真实 Chromium 在三个视口打开 `#/workspace/season-one` 并检查核心布局区域。

## 覆盖视口

- desktop：1440×900
- tablet：1024×768
- phone：390×844，mobile viewport

## 验收内容

- frame、topbar、primary stage、bottom panel 可见。
- desktop 显示 activity / resources / context rail。
- tablet 显示 activity / resources，不强制显示 context rail。
- phone 隐藏多列 rail，显示 mobile task switcher。
- 页面包含 Season One、Primary Stage、Evidence、Run panel 文案。
- 不允许水平溢出。
- 不允许 pageerror。

## 运行方式

```bash
python /home/binbin/.agents/skills/webapp-testing/scripts/with_server.py \
  --server "exec bash scripts/dev-web-smoke.sh" \
  --port 5176 \
  -- node tests/workspace/workspace-season-one-responsive.smoke.mjs
```

也可以在已有前端服务时运行：

```bash
TRACEVANE_WEB_SMOKE_URL=http://127.0.0.1:5176 node tests/workspace/workspace-season-one-responsive.smoke.mjs
```
