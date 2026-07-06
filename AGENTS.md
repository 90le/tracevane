# Tracevane Guardrails

This file applies to the whole Tracevane workspace.

Tracevane 的默认工程姿态是：**先复用，后自建；先用清晰的小改动解决真实问题，后考虑抽象；能一行可靠解决的事情，不写十行；已有成熟方案能解决的问题，不重复造轮子。**

## Practical Engineering Contract

Before coding, choose the lightest reliable path that satisfies the requirement.

1. Prefer the simplest correct solution.
   - If a platform API, existing utility, current dependency, or focused package solves the problem clearly, use it.
   - If one well-named call can express the behavior, do not replace it with hand-written mapping, parser, state machine, adapter, or custom abstraction.
   - If a small existing component can be extended safely, do not create a parallel component tree.
2. Do not over-engineer early.
   - Do not introduce framework-scale abstractions for one route, one component, or one narrow workflow.
   - Do not add generic managers, registries, adapters, factories, or orchestration layers unless at least two real call sites need the boundary now.
   - Do not split code merely to look architectural; split when it improves ownership, tests, readability, or reuse.
3. Prefer deletion and consolidation.
   - Remove obsolete code instead of wrapping around it.
   - Replace bespoke logic with native APIs or verified dependencies when that reduces risk.
   - Merge duplicate flows when they express the same product behavior.
4. Keep wrappers thin.
   - A wrapper may adapt Tracevane types, styling, accessibility labels, permissions, telemetry, or error handling.
   - A wrapper must not recreate a dependency’s internal rules unless Tracevane has a tested product-specific reason.
5. Keep diffs reviewable.
   - Make the smallest change that actually completes the task.
   - Preserve existing behavior unless the task explicitly changes it.
   - Protect user-visible behavior with focused tests or smoke checks.

## Reuse-First Engineering Principle

Tracevane should not spend engineering effort rebuilding mature, well-maintained primitives that can be safely reused. The objective is not to minimize line count blindly; it is to minimize long-term product risk, maintenance burden, defects, and cognitive load while keeping the implementation explicit and verifiable.

Search in this order:

1. Native browser / Node / TypeScript capability.
2. Existing Tracevane utility, component, service, hook, test helper, or design token.
3. Already-installed dependency.
4. Focused maintained package.
5. Custom code.

Use custom code only when at least one condition is true:

- The behavior is Tracevane-specific product logic or security-sensitive boundary logic.
- Existing libraries are stale, unmaintained, incompatible, too broad, too large, incorrectly licensed, or unsafe for the trust boundary.
- A dependency would make the architecture harder to reason about than a small local implementation.
- Performance, offline behavior, accessibility, privacy, or data-control requirements cannot be met through the reusable option.

Rules:

1. Avoid broad or heavy dependencies for small problems. Prefer focused packages, tree-shakable imports, route-level lazy loading, or existing primitives.
2. Do not copy third-party source into the repo as a shortcut. Depend on the package when appropriate, or implement a deliberately small project-specific abstraction when direct dependency use is unsuitable.
3. New dependencies are allowed only after checking license, maintenance activity, package size/bundle impact, security posture, peer dependency compatibility, API stability, and why existing alternatives are insufficient.
4. During review, treat unnecessary bespoke code as technical debt. Deleting local complexity in favor of a verified primitive is a valid improvement.
5. Verification must cover the chosen reuse boundary: type compatibility, build output, runtime smoke, regression tests, and any bundle-size or performance risk introduced by the dependency.

## Research-First Gate, Applied Pragmatically

Research-first is mandatory for changing external contracts or user-visible product behavior, but it should not become ceremony for obvious local refactors.

### Must research before implementation

Before starting or changing any feature, adapter, provider, SDK/API integration, Channel Connector, CLI Agent runner, IM workflow, Gateway protocol route, IDE/editor integration, terminal runtime, UI workflow, or other user-visible behavior that depends on external contracts:

1. Verify the current external landscape before designing the implementation.
   - Official docs/specs/API references/SDK docs/changelogs first.
   - Active GitHub repositories/issues/discussions second.
   - Community reports/examples only for operational failure modes.
2. Record the research in the relevant goal, progress, checklist, design, or implementation doc before or with the code change.
3. Prefer official and directly verified contracts over memory, old local snapshots, or third-party implementations.
4. If network access is unavailable, do not invent a contract. Use only already documented verified contracts, mark stale-data risk explicitly, and keep unsupported routes explicit until verified.
5. Implement only after comparing current external evidence with the local TypeScript/runtime boundary.
6. User-visible behavior must be protected by regression tests and, when behavior depends on real services or CLIs, focused smoke verification.

Keep `docs/研究先行开发清单.md` updated whenever Gateway, Channel Connectors, CLI Agent runner, provider, SDK, protocol, IDE/editor runtime, terminal runtime, or user-facing workflow scope changes. Commits that intentionally rely on an unverified or temporary contract must record that limitation in commit trailers.

### Research is not required for every tiny change

Do not pause for external research when the task is clearly local and the contract is already known, for example:

- Renaming local variables, extracting a small helper, deleting dead code, or simplifying an existing branch.
- Reusing an already-installed dependency according to an already-verified local pattern.
- Styling changes that only map to existing `theme.css` tokens and documented design rules.
- Updating docs to reflect already-reviewed project decisions.
- Adding tests for current local behavior without changing product/API contracts.

In these cases, proceed directly, keep the diff small, and verify locally.

## Decision Protocol for Implementation Work

1. Define the capability precisely: input/output contract, failure modes, accessibility requirements, performance budget, persistence and security boundaries.
2. Check whether the project already has the solution. Prefer existing utilities, services, hooks, components, test helpers, dependencies, and documented design tokens.
3. If a reusable solution exists, integrate it through the thinnest practical adapter.
4. If custom code is needed, document why reuse was rejected and keep the implementation intentionally small, tested, and replaceable.
5. Verify with the smallest sufficient evidence: typecheck, targeted unit/system test, smoke test, screenshot, or build as appropriate to the risk.

## Design and UI Implementation Rules

1. `docs/界面设计守则.md`, `DESIGN.md`, and `apps/web/src/design/theme.css` are the design source of truth.
2. Do not invent a second styling system for Monaco, xterm, Dockview, diff, Problems, Output, or other IDE/editor surfaces. Map them to Aurora CSS variables through a centralized adapter.
3. Prefer existing shared UI primitives before creating new component APIs.
4. Deep and light themes must both remain readable. Dense surfaces such as code editors, terminals, logs, tables, and diffs use solid panels, clear borders, and restrained shadows.
5. Mobile/touch alternatives are required for right-click, hover, and drag-only actions.

## Codex Surfaces Policy

Use the smallest Codex customization surface that solves the project problem:

| Surface | Use in Tracevane | Do not use for |
| --- | --- | --- |
| `AGENTS.md` | Durable repo rules, phase boundaries, required docs, verification commands, review expectations | Long implementation plans or historical progress logs |
| Nested `AGENTS.md` | Narrow rules for docs, File Manager, editor-core, Files API, Terminal runtime | Rules that should apply repo-wide |
| `.codex/config.toml` | Stable Codex settings for this trusted repo: instruction budget, bounded subagent fan-out, low-risk MCP docs lookup | Secrets, personal model/provider choices, approval/sandbox policy, broad hooks, or experimental behavior |
| `.codex/agents/*.toml` | Narrow project subagents that are explicitly spawned for read-only scope/theme audits | Replacing normal implementation, generic installed roles, or automatic delegation |
| `.agents/skills` | Reusable repo workflows such as Tracevane IDE stage classification and verification | One-off task notes or large docs that belong under `docs/` |
| MCP | Current external documentation or authorized external systems | Reading local repo files that shell/search can inspect faster |
| Hooks | Mechanical guardrails only after they are worth trust-review friction | Long tests, automatic source edits, telemetry, or duplicate global OMX hooks |
| Plugins | Distributable bundles when a workflow should be shared across repos/users | Single-repo instructions already handled by AGENTS/skills |

Current project decisions:

- Root and nested `AGENTS.md` are the main control surface.
- `.codex/config.toml` intentionally stays conservative: increased project-doc budget, bounded subagent limits, and public OpenAI Docs MCP only.
- Project custom agents are read-only auditors (`tracevane-ide-scope`, `tracevane-theme-auditor`) and should be spawned only when explicitly useful.
- Project skills live under `.agents/skills`; use `$tracevane-ide-workflow` for IDE/editor implementation tasks.
- No project-local hooks are enabled yet; `.codex/hooks/README.md` defines the future hook policy.
- No project plugin is needed yet. Create a plugin only if Tracevane workflows need distribution outside this repo.

## Codex Project Context for IDE / Editor Work

When a task touches File Manager, Online Editor, File Surface, Mini Explorer, IDE Workbench, Monaco, Dockview, xterm, terminal runtime, watcher/search, Problems/Output, LSP, Git, Debug, or visual theme integration, use the repo skill `$tracevane-ide-workflow` when available and treat the IDE documentation package as the implementation contract, not as optional background.

Before planning or editing that scope, read `.codex/project-context.md` and then read the relevant files under `docs/ide-code-editor-solution/`:

- Start with `00-README.md` and `08-实施阶段验收与风险.md` to identify the current phase and acceptance boundary.
- For Online Editor / File Surface work, read `03-文件管理器在线编辑器方案.md`, `10-monaco-first-online-editor-strategy.md`, and `12-file-surface-unification-and-monaco-gap-plan.md`.
- For M3 Mini Explorer / Shared Explorer Core, read `13-mini-explorer-shared-explorer-plan.md` plus the shared-core/backend/frontend docs that it references.
- For standalone IDE layout, read `04-独立IDE工作台方案.md`, `05-前端实现方案.md`, and `09-IDE参考行为与术语对照.md`.
- For terminal, Problems/Output, LSP, Git, or Debug, read `07-终端运行语言服务Git方案.md`, `06-后端服务与接口方案.md`, and the matching stage in `08`.
- For any visual, theme, Monaco/xterm/Dockview/diff/Problems/Output styling work, read `14-视觉主题与设计系统适配.md`, `DESIGN.md`, `docs/界面设计守则.md`, and inspect `apps/web/src/design/theme.css`.

Stage boundaries are mandatory:

```txt
Done: M1 Online Editor base
Done: M1.x Online Editor enhancements
Done: Monaco-first cleanup
Done: M2/M2.x unified File Surface and media preview
Done: M3 Online Editor Mini Explorer + Shared Explorer Core
Done: M4 IDE Workbench Layout Foundation
Done: M5 Real Terminal Foundation
Done: M5.x Terminal Split / Group / Panel Placement
Done: M5.y / M5.5 IDE Editor Foundation
Next: M6 Watcher / Search / Problems / Output
Later: M7 LSP / Git / Debug
```

Do not pull future-stage functionality forward unless the user explicitly changes the stage target. In particular:

- M3 must not introduce ActivityBar, Dockview, terminal, Git, LSP, Debug, Problems, Output, or a full IDE SideBar shell.
- M4 must not pretend to have real terminal, LSP, Git, Debug, Problems diagnostics, Output channels, or full View Movement; it is the Workbench Layout Foundation.
- M5 is complete: real terminal lifecycle and safety are proven at foundation level.
- M5.x is complete: terminal split/group, bottom/right placement, profile selection, persistence and clipboard-path bridge are accepted terminal layout foundations.
- M5.y is complete: IDE EditorDock now has real Monaco-backed file editing, dirty/save/close protection, preview/pinned tabs, tab menus, file panel splits, and Explorer rename/move/delete path sync while reusing shared/editor-core and Files API.
- M6 must close watcher/search/problems/output foundations before M7 LSP/Git/Debug.

Shared architecture rules:

- Share lower-level core: file identity, FileService adapters, EditorService, Monaco model lifecycle, dirty/save/conflict logic, explorer-core data/path/sort/operation primitives, and CommandService semantics.
- Do not share bloated product shells. Avoid one huge component controlled by `mode=mini|ide|file-manager` and many feature flags.
- Monaco owns text editing behavior; React owns shell, lifecycle, metadata and commands. Do not store full file contents in long-lived React state.
- Dockview owns workbench layout; it must not own file IO, save semantics, or Monaco model lifecycle.
- xterm.js owns terminal rendering only; backend PTY/WebSocket owns process execution with workspace/root/runtime guards.
- Theme implementation must map Aurora CSS variables from `theme.css` through centralized adapters for Monaco, xterm, Dockview, diff, Problems and Output. Do not copy VS Code themes or terminal default colors into business components.

Verification expectations by scope:

- Docs-only changes: run markdown link checks for touched docs and `git diff --check`.
- Frontend TypeScript changes: run `npm run typecheck:web` or a narrower equivalent if documented.
- Shared/root TypeScript changes: run `npm run typecheck`.
- Online Editor/File Surface changes: run `npm run smoke:file-manager:online-editor` and, when layout/theme/responsive behavior changes, `npm run smoke:file-manager:online-editor-responsive`.
- File operation changes: run relevant file-manager smokes and targeted backend/system checks.
- Theme changes: verify both light and dark for every touched dense surface.
- Terminal/runtime changes: prove create/input/output/resize/kill/disconnect/error behavior and cwd/root guard.

## Completion Standard

Before claiming completion:

- Confirm the task scope is satisfied.
- Confirm no unrelated files were intentionally changed.
- Run the smallest sufficient verification for the risk level.
- Report changed files, verification evidence, and any known risks or not-tested gaps.
