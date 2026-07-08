# Tracevane IDE long-term goal

Status: Active execution contract
Created: 2026-07-08
Primary docs: `../docs/ide-code-editor-solution/15-远程代码工作台产品聚焦与长期执行机制.md`
Current next stage: P1-A-5 Persistence / terminal clipboard checklist

## Goal prompt

Tracevane IDE 长期推进：以“远程项目在线代码工作台”为产品主线，持续完成未收口阶段；每个阶段必须先更新/核对 `.codex` 项目上下文与 `docs/ide-code-editor-solution` 文档架构，必要时归档/删除过期计划，随后实施最小可验证切片，运行对应验证，提交 Lore commit，并更新下一阶段入口。


## Goal lifecycle

- The active Codex goal can be created by the agent when the user asks for a long-running Tracevane IDE goal and no active goal exists.
- Once the runtime goal exists, do not recreate it for every stage. Keep the runtime goal broad and update this file's `Current next stage`, `.codex/project-context.md`, `docs/ide-code-editor-solution/00-README.md`, and the active stage/archive docs instead.
- If the runtime goal objective text mentions an older starting point, treat this file's `Current next stage` as the live handoff pointer. The objective remains the durable umbrella; stage movement is tracked in repository files and Lore commits.
- Create a replacement runtime goal only after the old long-term goal is truly complete, blocked under the goal rules, or explicitly retired by the user.

## Product north star

Tracevane should become a safe online code workbench for remote server / panel workflows, not a browser clone of VS Code.

Default priority order:

1. Open, browse, edit, save, dirty, conflict, readonly and large-file safety.
2. Search, Quick Open, symbols, Problems, diagnostics, hover and definition.
3. Mainstream Web stack quality: TS/JS/JSON/HTML/CSS/ESLint.
4. Minimal Git loop: status, diff, stage and commit.
5. Provider status, trust, allowlist, root guard and degraded reasons.

Default parking lot unless a stage proves direct value to the mainline:

- Full browser VS Code parity.
- Dangerous Git flows such as force push, merge, rebase and complex conflict wizards.
- Heavy Debug parity.
- Advanced Terminal view movement / layout polish.
- Deeper Go/Rust/Java/clangd rich interactions beyond current proofs.

## Stage execution rules

For every stage:

1. Read `AGENTS.md`, this file, `.codex/project-context.md`, and relevant `docs/ide-code-editor-solution/*` docs.
2. State the product outcome first: what user workflow is improved and what is deliberately not being built.
3. Prefer a small acceptance slice over broad capability expansion.
4. Reuse existing shared cores: Files API, File Surface, editor-core, explorer-core, LSP/Git/Debug/Terminal services and Aurora tokens.
5. Do not create duplicate APIs, duplicate product shells, or parity-only abstractions.
6. Run the smallest sufficient verification for the risk class.
7. Commit with Lore trailers.
8. Update docs and this goal/context if the next stage changes.

## Current queue

1. P1-A-5 Persistence / terminal clipboard checklist: verify layout/open-tab/terminal persistence boundaries and close terminal clipboard/file-paste mainline checks.
2. P1 remaining product hardening slices after persistence/clipboard acceptance.
3. P2 UX Simplification: remove or park UI that distracts from the mainline.
4. Parking-lot review: revisit Go/Rust/clangd/Java deeper interactions only after the remote-code mainline is stable.

## Stop condition

Do not mark the long-term goal complete until Tracevane has a verified release-candidate online code workbench that can safely browse, edit, save, search, inspect diagnostics and perform minimal Git operations on a remote workspace, with clear degraded states and no known release-blocking data-loss or trust-boundary bugs.

## Completed decision updates

- 2026-07-08: M13-I completed. Go/Rust guarded hover + definition proofs are accepted as templates; deeper toolchain rich interactions are parked; next stage is P0 Remote Code Editing Mainline Audit.

- 2026-07-08: P0-A automated mainline validation baseline completed. Typecheck, workbench/editor/save/search/problems/git/terminal smokes passed; next stage is P0-B Mainline Gap Audit.

- 2026-07-08: P0-B Mainline Gap Audit completed. No new automated P0 blocker found; P1-A now focuses on Explorer real-workflow validation, stale user-facing copy cleanup, edge-file/responsive/persistence coverage, and terminal clipboard manual QA.

- 2026-07-08: P1-A Mainline UX Hardening Plan completed. Next implementation slice is P1-A-1 user-facing stale copy cleanup, followed by Explorer, editor edge-file, responsive, persistence and terminal clipboard hardening checks.

- 2026-07-08: P1-A-1 stale copy cleanup completed. IDE user-visible copy no longer exposes stale M/P stage names or placeholder language in the audited workbench surfaces; P1-A-2 Explorer mainline workflow is complete; next stage is P1-A-3 Editor edge-files workflow.

- 2026-07-08: P1-A-2 Explorer mainline workflow completed. Added `smoke:ide:explorer-mainline` covering long-directory scrolling, keyboard copy/cut/paste, pointer drag move, upload dialog reuse, and terminal path insertion; next stage is P1-A-3 Editor edge-files workflow.

- 2026-07-08: P1-A-3 Editor edge-files workflow completed. Added `smoke:ide:editor-edge-files` covering Monaco text, readonly, truncated large text, shared image preview, binary Hex preview, small initial Hex loading, explicit load-more, and deleted opened tab handling; next stage is P1-A-4 Responsive layout workflow.

- 2026-07-08: P1-A-4 Responsive layout workflow completed. Added `smoke:ide:responsive-mainline` covering 390px mobile Explorer overlay, EditorDock open, Search, Source Control, Run/Debug, Problems/Output/Terminal panel switching, and no horizontal overflow; next stage is P1-A-5 Persistence / terminal clipboard checklist.
