# Tracevane Codex project context

Use this as the short project brief before planning or implementing File Manager, Online Editor, File Surface, IDE Workbench, terminal, LSP/Git/debug, or theme work.

## Product target

Tracevane is building two related but separate editing products:

1. **File Manager Online Editor / File Surface**
   - Fast file open/edit/preview from File Manager.
   - Monaco for text/code; media/PDF/binary use the same File Surface preview shell.
   - May add a lightweight Mini Explorer in M3.
   - Must not grow into a full IDE: no ActivityBar, Dockview workbench, project terminal, Git, LSP, or debug.

2. **Standalone IDE Workbench**
   - Project-level VS Code/Cursor-like workbench.
   - ActivityBar, SideBar Explorer, Editor Area, Panel Area, StatusBar, Dockview editor groups, layout persistence and reset.
   - Terminal, Problems, Output, LSP, Git and Debug are staged after the layout foundation.

Both products share lower-level core services, not full product shells.

## Current stage map

- Done: M1 Online Editor base.
- Done: M1.x Online Editor window/tab/save safety/status/entry enhancements.
- Done: Monaco-first cleanup.
- Done: M2/M2.x unified File Surface and media previews.
- Done: M3 Online Editor Mini Explorer + Shared Explorer Core.
- Done: M4 IDE Workbench Layout Foundation.
- Done: M5 Real Terminal Foundation.
- Done: M5.x Terminal Split / Group / Panel Placement.
- Done: M5.y / M5.5 IDE Editor Foundation.
- Done: M5.y-F Shared File Surface + IDE Editor Preferences.
- Done: M5.y-G IDE Preview StatusBar + Hex Editor Foundation.
- Done: M5.y-H IDE Layout Reset / Empty State / Header Actions.
- Done: M6-A Watcher / Search / Problems / Output research and minimal implementation plan.
- Done: M6-B Watcher Foundation.
- Done: M6-C Search Foundation.
- Done: M6-D Diff / Conflict Flow.
- Done: M6-E Problems / Output Foundation.
- Done: M6-F M6 watcher/search/diff/problems/output acceptance/docs closeout.
- Done: M7-A LSP / Git / Debug research and minimal implementation plan.
- Done: M7-B single-language JSON diagnostics to existing Problems/Output.
- Done: M7-C LSP hover/completion/definition foundation.
- Done: M7-D Git status + Explorer decoration + Source Control View.
- Done: M7-E-A Git Diff Foundation.
- Done: M7-E-B Git stage / unstage foundation.
- Done: M7-E-C Git commit foundation.
- Done: M7-E-D Git branch / upstream status foundation.
- Done: M7 Git acceptance closeout.
- Done: M7-F-A Debug Adapter Protocol research and minimal implementation plan.
- Done: M7-F-B Debug Gateway skeleton + Debug View shell.
- Done: M7-F-C Breakpoints + editor reveal foundation.
- Done: M7-F-D minimal real adapter proof.
- Done: M7-F-E Debug acceptance closeout.
- Done: M7.x-A Debug hardening plan.
- Done: M7.x-B Debug lifecycle foundation.
- Done: M7.x-C Launch profile / config foundation.
- Done: M7.x-D Real Node inspector adapter minimal.
- Done: M7.x-E Debug controls / scopes foundation.
- Done: M7.x-F Debug Console watch / evaluate foundation.
- Done: M7.x-G Debug hardening acceptance closeout.
- Done: M7.y-A LSP / Git / Debug integration hardening plan.
- Done: M7.y-B TypeScript / JavaScript LSP diagnostics foundation.
- Done: M7.y-C TypeScript / JavaScript LSP interaction expansion plan.
- Done: M7.y-D TypeScript / JavaScript hover and definition foundation.
- Done: M7.y-E TypeScript / JavaScript completion foundation.
- Done: M7.y-F LSP interaction acceptance closeout.
- Done: M7.z-A LSP / Git / Debug post-M7 enhancement plan.
- Done: M7.z-B Advanced LSP references foundation.
- Done: M7.z-C LSP rename / formatting / code actions plan.
- Done: M7.z-D Git remote operations foundation plan.
- Done: M7.z-E Git remote operations foundation hardening.
- Done: M7.z-F LSP WorkspaceEdit preview/apply foundation.
- Done: M7.z-G LSP rename / formatting / code actions UI foundation.
- Done: M7.z-H Git branch / stash UI foundation.
- Done: M7.z-I Git branch / stash hardening and acceptance closeout.
- Done: M7.z-J LSP / Git / Debug enhancement acceptance closeout.
- Done: M8-A IDE stabilization and release-candidate plan.
- Done: M8-B RC smoke matrix runner / documentation cleanup foundation.
- Done: M8-C RC quick gate execution and blocker triage.
- Done: M8-D full/domain RC matrix execution and blocker triage.
- Done: M8-E RC acceptance baseline and CI gate decision.
- Done: M8-F RC release checklist and post-M8 roadmap freeze.
- Done: M8-G RC signoff and release-candidate handoff.
- Done: M9-A post-M8 roadmap prioritization and branch-hygiene / release packaging decision.
- Done: M9-B Git branch management safety plan.
- Done: M9-C Git branch management guarded implementation.
- Done: M9-D Git graph / blame read-only foundation.
- Done: M10-A LSP semantic tokens / workspace symbols foundation plan.
- Done: M10-B LSP semantic tokens guarded implementation.
- Done: M10-C LSP workspace symbols foundation.
- Done: M10-D LSP semantic/workspace symbols acceptance closeout.
- Done: M11-A post-M10 IDE intelligence roadmap and release gate plan.
- Done: M11-B IDE Command Palette / Go to Symbol shell foundation.
- Done: M11-C watcher-backed symbol index research and minimal plan.
- Done: M11-C-B watcher-backed symbol index guarded implementation.
- Done: M11-D multi-language LSP provider research plan.
- Done: M11-E-A provider registry extraction.
- Done: M11-E-B JSON official language service migration.
- Next: M11-E-C HTML/CSS lightweight language services guarded implementation.

## Required reading by task

Always read these before changing matching scope:

- Overall editor/IDE direction: `docs/ide-code-editor-solution/00-README.md`, `08-实施阶段验收与风险.md`.
- File Manager Online Editor / File Surface: `03-文件管理器在线编辑器方案.md`, `10-monaco-first-online-editor-strategy.md`, `12-file-surface-unification-and-monaco-gap-plan.md`.
- Completed Mini Explorer / Shared Explorer Core record: `13-mini-explorer-shared-explorer-plan.md`, plus `01`, `02`, `05`, `06`.
- IDE Workbench layout / IDE Editor Foundation: `04-独立IDE工作台方案.md`, `05-前端实现方案.md`, `09-IDE参考行为与术语对照.md`, `archive/m5y-a-ide-editor-foundation-plan.md`, `archive/m5y-execution-summary.md`, `archive/m5y-g-editor-preview-statusbar-hex-summary.md`, and `archive/m5y-h-layout-reset-empty-action-summary.md`.
- Completed Watcher / Search / Problems / Output: `06-后端服务与接口方案.md`, `07-终端运行语言服务Git方案.md`, `08`, `archive/m6-a-watcher-search-problems-output-plan.md`, and `archive/m6-execution-summary.md`.
- Terminal / LSP / Git / Debug: `07-终端运行语言服务Git方案.md`, `06-后端服务与接口方案.md`, `08`, and `archive/m7-a-lsp-git-debug-plan.md` / `archive/m7-b-lsp-diagnostics-summary.md` / `archive/m7-c-lsp-interaction-summary.md` / `archive/m7-d-git-status-source-control-summary.md` / `archive/m7-e-a-git-diff-foundation-summary.md` / `archive/m7-e-b-git-stage-unstage-summary.md` / `archive/m7-e-c-git-commit-foundation-summary.md` / `archive/m7-e-d-git-branch-upstream-summary.md` / `archive/m7-git-execution-summary.md` / `archive/m7-f-a-debug-adapter-plan.md` / `archive/m7-f-b-debug-foundation-summary.md` / `archive/m7-f-c-debug-breakpoints-summary.md` / `archive/m7-f-d-debug-adapter-proof-summary.md` / `archive/m7-f-debug-execution-summary.md` / `archive/m7x-a-debug-hardening-plan.md` / `archive/m7x-b-debug-lifecycle-summary.md` / `archive/m7x-c-debug-launch-profile-summary.md` / `archive/m7x-d-debug-node-inspector-summary.md` / `archive/m7x-e-debug-controls-scopes-summary.md` / `archive/m7x-f-debug-watch-evaluate-summary.md` / `archive/m7x-debug-hardening-execution-summary.md` / `archive/m7y-a-lsp-git-debug-integration-plan.md` / `archive/m7y-b-typescript-javascript-lsp-diagnostics-summary.md` / `archive/m7y-c-typescript-javascript-lsp-interaction-plan.md` / `archive/m7y-d-typescript-javascript-hover-definition-summary.md` / `archive/m7y-e-typescript-javascript-completion-summary.md` / `archive/m7y-f-lsp-interaction-acceptance-summary.md` / `archive/m7z-a-lsp-git-debug-enhancement-plan.md` / `archive/m7z-b-lsp-references-summary.md` / `archive/m7z-c-lsp-rename-format-code-actions-plan.md` / `archive/m7z-d-git-remote-operations-plan.md` / `archive/m7z-e-git-remote-foundation-summary.md` / `archive/m7z-f-lsp-workspace-edit-summary.md` / `archive/m7z-g-lsp-rename-format-code-actions-summary.md` / `archive/m7z-h-git-branch-stash-ui-summary.md` / `archive/m7z-i-git-branch-stash-hardening-summary.md` / `archive/m7z-j-lsp-git-debug-enhancement-acceptance-summary.md` / `archive/m8-a-ide-stabilization-rc-plan.md` / `archive/m8-b-rc-smoke-matrix-runner-summary.md` / `archive/m8-c-rc-quick-gate-summary.md` / `archive/m8-d-full-domain-rc-matrix-summary.md` / `archive/m8-e-rc-acceptance-baseline-summary.md` / `archive/m8-f-rc-release-checklist-summary.md` / `archive/m8-g-rc-signoff-handoff-summary.md` / `archive/m9-a-post-m8-roadmap-branch-hygiene-plan.md` / `archive/m9-b-git-branch-management-safety-plan.md` / `archive/m9-c-git-branch-management-guarded-implementation-summary.md` / `archive/m9-d-git-graph-blame-readonly-summary.md` / `archive/m10-a-lsp-semantic-tokens-workspace-symbols-plan.md` / `archive/m10-b-lsp-semantic-tokens-summary.md` / `archive/m10-c-lsp-workspace-symbols-summary.md` / `archive/m10-d-lsp-semantic-workspace-symbols-acceptance-summary.md` / `archive/m11-a-post-m10-ide-intelligence-roadmap-plan.md` / `archive/m11-b-command-palette-go-to-symbol-summary.md` / `archive/m11-c-watcher-backed-symbol-index-plan.md` / `archive/m11-c-b-watcher-backed-symbol-index-summary.md` / `archive/m11-d-multi-language-lsp-provider-plan.md` / `archive/m11-e-a-provider-registry-summary.md` / `archive/m11-e-b-json-language-service-summary.md`.
- Visual/theme work: `14-视觉主题与设计系统适配.md`, `DESIGN.md`, `docs/界面设计守则.md`, `apps/web/src/design/theme.css`.

## Non-negotiable implementation rules

- Do not merge File Manager Online Editor and Standalone IDE into one mega page.
- Share `explorer-core`, file identity, file operations, Monaco model lifecycle, dirty/save/conflict logic and command semantics where appropriate.
- Do not share bloated product containers such as one giant `<Explorer mode="mini|ide|file-manager" />` with many flags.
- Monaco is not a textarea. Keep file contents in Monaco models; React state stores metadata and view state only.
- xterm.js is terminal UI only; command execution belongs to backend PTY/WebSocket with workspace/runtime guardrails.
- Dockview/layout solves workbench layout only; it does not own FileService, SaveService or Monaco models.
- Theme implementation must use Aurora tokens from `theme.css` through adapters for Monaco/xterm/Dockview/diff/Problems/Output. Do not copy VS Code/Terminal default colors.
- Every stage must state what it does not do and preserve future IDE free-layout capability.

## Verification shortcuts

Use the smallest sufficient proof for the changed surface:

- Docs-only: markdown link check + `git diff --check`.
- Type-level frontend change: `npm run typecheck:web`.
- Root type safety: `npm run typecheck`.
- Online Editor/File Surface: `npm run smoke:file-manager:online-editor`, `npm run smoke:file-manager:online-editor-responsive`, `npm run smoke:file-manager:media-preview`, and relevant Monaco/media/Hex smokes.
- File operations: `npm run smoke:file-manager:file-operations` and targeted system tests or focused API checks.
- Theme changes: verify both light and dark on File Manager, File Surface/Monaco, and any IDE/terminal/panel surface touched.
- Terminal/backend runtime changes: include lifecycle evidence for create/input/output/resize/kill/error/disconnect and cwd/root guard.
- M6 watcher/search/problems/output changes are complete; regression changes must still prove watcher path events, editor/explorer refresh behavior, search result jump, Problems data rendering, Output channel rendering, and dirty/conflict protection.
- M7 LSP/Git/Debug changes must start from research/contract planning before implementation and prove diagnostics/status/debug events through the existing Problems/Output/editor reveal foundations.
