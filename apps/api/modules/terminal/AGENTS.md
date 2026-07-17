# Terminal runtime rules

This file applies under `apps/api/modules/terminal/`.

## Boundary

Terminal runtime is a workspace process boundary, not a CLI Agent runner. xterm.js renders terminal UI; this module owns PTY/session lifecycle, input/output, resize, kill, cwd/runtime guards and permission checks.

## Contracts to check before changes

- `types/terminal.ts` for the shared session/input/output contracts.

## Implementation rules

- Do not expose arbitrary host shell access without workspace/runtime guardrails.
- Enforce cwd/root constraints and shell allowlists.
- Session lifecycle must handle create, input, output subscription, resize, kill, exited, disconnected and error states.
- Establish the core session lifecycle before adding split/group layout metadata.
- Do not mix Terminal runtime with Codex/Claude/OpenCode CLI Agent run management.

## Verification

- `npm run typecheck:api` or `npm run typecheck`.
- Focused lifecycle evidence for create/input/output/resize/kill/error/disconnect.
- Safety evidence for cwd/root escape rejection and permission denial.
