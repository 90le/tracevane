# P0 Remote Code Editing Mainline Audit Plan

## 状态

进行中。承接 M13-I 产品 pivot 决策。P0-A 自动化主链路 baseline 已完成，见 [`p0-a-mainline-validation-baseline-summary.md`](./p0-a-mainline-validation-baseline-summary.md)；下一步进入 P0-B Mainline Gap Audit。

## 目标

用真实远程项目在线改代码路径审计 Tracevane IDE，而不是继续按“补 IDE parity 功能”推进。

目标不是新增大功能，而是找出阻塞产品可用性的 P0/P1 问题，并形成最小修复队列。

## 审计主路径

```txt
进入 /ide
→ 选择/打开 workspace
→ Explorer 浏览文件树
→ 打开文本/code 文件
→ 打开媒体/二进制/大文件边界文件
→ Search / Quick Open 查找文件和文本
→ 查看 Problems / provider status
→ hover / definition 高频路径
→ 修改文件并形成 dirty 状态
→ 保存 / 保存失败 / 外部修改 / readonly / deleted 文件处理
→ Git status / diff / stage / commit
→ Terminal 执行简单命令并复制粘贴
→ 刷新页面后检查 layout / tabs / sessions / workspace 状态
```

## 审计维度

### 1. 打开与浏览

- `/ide` / `/ide/:workspaceId` 是否稳定进入。
- Explorer 是否保留 workspace / 当前目录 / 展开状态。
- 文件打开是否区分 preview / pinned / multi-tab。
- 目录、文件、隐藏文件、大文件、权限错误是否有明确状态。

### 2. 编辑与保存安全

- Monaco 文本编辑是否稳定。
- dirty 标识是否准确。
- tab 关闭保护是否有效。
- 保存成功 / 失败 / 冲突 / 外部修改 / readonly / deleted 是否不会丢内容。
- layout reset 是否只重置布局，不误关文件或终端 session。

### 3. 预览与边界文件

- 图片、视频、音频、PDF、hex/binary 是否走 shared File Surface / IDE Preview 边界。
- 不支持文件是否给出清晰解释。
- 大文件是否避免卡死，是否提示限制和可选操作。

### 4. Search / Quick Open / Symbols

- 文件名搜索、文本搜索、Quick Open、workspace symbols 是否对真实项目可用。
- 搜索错误、空结果、忽略规则、binary skip 是否解释清楚。
- 结果点击是否能正确 reveal/open。

### 5. Problems / Provider Status / LSP 高频路径

- Problems 是否显示 JSON/TS/JS/HTML/CSS/ESLint 等主流 Web 栈结果。
- provider status 是否展示 configured / degraded / missing binary / missing marker / unsupported version。
- hover / definition 对 TS/JS/JSON/HTML/CSS/Go/Rust 已有路径是否不会破坏主链路。
- Go/Rust heavy provider 更深能力继续后置。

### 6. Git 最小闭环

- status / diff / stage / unstage / commit 是否可靠。
- branch/upstream 状态是否可见。
- dangerous operations 是否被明确后置或受 guard 保护。

### 7. Terminal 基础使用

- session 创建、输入、输出、resize、close/kill 是否稳定。
- copy/paste、粘贴图片/文件降级、拖文件插入路径等高频问题是否列入修复队列。
- terminal advanced layout 不作为本阶段主目标。

## 输出物

P0-A 已产出自动化 baseline。完整 P0 audit 完成后还必须产出：

1. P0 blocker list：会导致无法完成远程改代码主链路、丢数据、误保存、白屏或安全越界的问题。
2. P1 friction list：高频但不阻塞的体验问题。
3. Parking-lot list：IDE parity、长尾语言、危险 Git、Debug parity、Terminal advanced layout。
4. Targeted smoke/test plan：每个 P0/P1 修复对应的最小验证。
5. 下一阶段 P1 Mainline Hardening 切片建议。

## 不做事项

P0 audit 不做：

- 新 provider runtime。
- clangd/Java rich interactions。
- Go/Rust deeper interactions。
- Debug parity。
- Dangerous Git operations。
- Terminal advanced layout。
- 新的 Files/LSP/Git/Terminal API。
- 大规模重写 UI。

## 推荐验证

审计阶段优先运行已有 targeted smokes，而不是一开始跑完整 RC matrix：

```bash
npm run typecheck:web -- --pretty false
npm run typecheck:api -- --pretty false
npm run smoke:ide:workbench-layout
npm run smoke:ide:editor-foundation
npm run smoke:ide:search-foundation
npm run smoke:ide:problems-output
npm run smoke:ide:git-source-control
npm run smoke:ide:terminal-foundation
```

如果某些脚本不存在，以 `package.json` 当前脚本为准并记录缺口，不临时伪造大而全 smoke。
