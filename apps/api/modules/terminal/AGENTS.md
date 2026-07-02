# Terminal runtime rules

This file applies under `apps/api/modules/terminal/`.

## Boundary

Terminal runtime is a workspace process boundary, not a CLI Agent runner. xterm.js renders terminal UI; this module owns PTY/session lifecycle, input/output, resize, kill, cwd/runtime guards and permission checks.

## Required docs before changes

- `docs/ide-code-editor-solution/07-终端运行语言服务Git方案.md`
- `docs/ide-code-editor-solution/06-后端服务与接口方案.md`
- M5/M5.x sections in `docs/ide-code-editor-solution/08-实施阶段验收与风险.md`

## Implementation rules

- Do not expose arbitrary host shell access without workspace/runtime guardrails.
- Enforce cwd/root constraints and shell allowlists.
- Session lifecycle must handle create, input, output subscription, resize, kill, exited, disconnected and error states.
- M5 proves real terminal foundation before M5.x split/group layout metadata.
- Do not mix Terminal runtime with Codex/Claude/OpenCode CLI Agent run management.

## Verification

- `npm run typecheck:api` or `npm run typecheck`.
- Focused lifecycle evidence for create/input/output/resize/kill/error/disconnect.
- Safety evidence for cwd/root escape rejection and permission denial.
