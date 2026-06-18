# Tracevane Workspace IDE Goal

> Status: active goal
> Updated: 2026-06-18

## 1. Intent

Workspace IDE is the long-term replacement for the current terminal-only maintenance surface.

The goal is not to clone a full desktop IDE. The goal is an IDE-grade local Agent workspace where a user can inspect, edit, run, preview, ask AI to change, approve diffs, and verify results without leaving Tracevane.

Workspace IDE should become the primary place where Codex, Claude Code, OpenCode and OpenClaw work on real local projects.

## 2. Product Position

Current docs previously classified Terminal as support/debug only. That is too narrow.

New direction:

- Workspace IDE is core.
- Terminal is one panel inside Workspace IDE.
- Files are not only attachments; they are workspace source, artifacts and evidence.
- Chat is not a generic chat clone; it should hand off selected files, preview state, terminal output and diffs into Workspace IDE.
- Dashboard shows what needs attention; Workspace IDE is where the user does the work and verifies the result.

## 3. Core User Loops

### Edit and Preview

1. Open project file.
2. Edit Markdown, HTML, CSS, Vue, TypeScript or config.
3. See live Markdown/HTML/web preview.
4. Capture preview state, screenshot, console errors and source hints as evidence.
5. Ask AI to adjust selected content or visual region.
6. Review diff, approve or reject, then rerun preview.

### Run and Repair

1. Start dev server or task.
2. Watch terminal output, logs, ports and process status.
3. Detect failure and attach logs to an Agent task.
4. Let AI propose a fix.
5. Review file diff and command plan before high-risk writes.
6. Verify through tests, preview, or smoke.

### Agent Workbench

1. Select Agent profile and model.
2. Provide project context from files, terminal, preview and prior traces.
3. Run task in Codex/Claude Code/OpenCode.
4. Track tool calls, approvals, generated files and terminal output.
5. Preserve evidence and rollback path.

## 4. Target Layout

```text
Activity Bar
  Files / Search / Git / Tasks / Preview / Agents

Explorer
  project tree, search results, artifacts, sessions

Editor
  multi-tab code editor, Markdown editor, HTML editor, diff editor

Preview / Inspector
  Markdown preview, HTML preview, local web app iframe, screenshot, selected element metadata

Bottom Panel
  terminal, logs, problems, tool calls, ports, task output

AI Panel
  current file/selection/preview/terminal-aware Agent actions
```

## 5. Architecture Direction

- Editor: browser code editor component with diff support and explicit file save semantics.
- Files: source of truth remains local filesystem through Tracevane API; browser storage is cache only.
- Preview: local preview server/iframe for HTML and web apps; Markdown preview uses sanitized rendering and resource resolver.
- Preview evidence: console errors, screenshot, URL, selected DOM metadata and source guesses should be attached to Agent runs.
- Terminal/tasks: PTY remains available, but named tasks, logs, process state and ports should be first-class records.
- Git: changed files and hunks should be visible before AI edits are approved.
- AI actions: every file-changing AI action should produce a plan/diff and be reversible where practical.

## 6. External Contract Notes

Verified on 2026-06-18:

- VS Code for the Web proves browser IDE UX is viable, but official docs call out browser limitations versus desktop. Tracevane should not assume browser surfaces can replace all desktop/runtime capabilities.
- Monaco Editor is the official browser editor behind VS Code and is a good fit for text/code/diff editing, but it is an editor component, not a full IDE architecture by itself.
- VS Code Webview and Custom Editor docs validate the pattern of preview/custom editors implemented as isolated browser views that communicate with host logic by messages.
- WebContainers show that browser-side Node runtimes are possible, but browser/runtime support and isolation requirements make them an optional future acceleration path. Tracevane should first use local OS processes and daemon-managed tasks because it is local-first and already controls host runtime.

Primary sources checked:

- https://code.visualstudio.com/docs/remote/vscode-web
- https://microsoft.github.io/monaco-editor/
- https://code.visualstudio.com/api/extension-guides/webview
- https://code.visualstudio.com/api/extension-guides/custom-editors
- https://webcontainers.io/guides/introduction
- https://webcontainers.io/api

## 7. Phasing

### P1: Workspace Shell

- Unify files, editor tabs, terminal panel and Git summary.
- Add Markdown preview and diff review.
- Add Agent actions scoped to current file/selection.

### P2: Live Preview and Evidence

- Add HTML/static preview and local web app iframe preview.
- Capture console errors and screenshots.
- Link preview evidence to Agent runs.
- Add preview-to-source hints where reliable.

### P3: Preview-Time Editing

- Support selected text/element edits from preview.
- Route changes through explicit source diffs.
- Add AI visual edit loop with screenshot/evidence context.

### P4: Advanced Runtime

- Named task orchestration.
- Port/process inspector.
- Optional browser runtime experiments if local-process workflow has clear gaps.

## 8. Non-Goals

- Do not clone the full VS Code desktop product.
- Do not depend on VS Code proprietary remote/server components.
- Do not expose secrets to preview iframes.
- Do not make browser storage the only source of truth for project files.
- Do not allow AI file writes without diff/approval in high-risk paths.
