# Workspace Season One Responsive 验收锚点

日期：2026-06-29

## 目的

用户明确要求第一季重构必须覆盖电脑、平板、手机，而不是继续修旧桌面 IDE。因此本阶段新增 Season One 专属响应式结构验收，锁定三种视口形态的最低产品契约。

## 验收锚点

- Desktop ≥ 1280：必须存在 activity rail、resource column、primary stage、context/evidence rail、bottom panel、status bar。
- Tablet 768–1279：必须保留 activity rail + resources + primary stage，但 context rail 不应强制常驻。
- Phone < 768：必须使用 mobile task switcher，不允许 persistent multi-column layout。
- Mobile task switcher 必须覆盖 Files、Stage、AI、Evidence、Run。
- `/workspace/season-one` 必须保持为可打开实验路由。

## 验证

```bash
node --test tests/system/workspace-season-one-responsive-contract.test.mjs tests/system/workspace-season-one-preview-route.test.mjs
```

## 后续

下一步应该补 Playwright 视觉截图验收：desktop 1440×900、tablet 1024×768、phone 390×844，对 `/workspace/season-one` 做实际渲染检查。
