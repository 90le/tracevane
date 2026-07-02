# IDE / Code Editor documentation rules

This file applies under `docs/ide-code-editor-solution/`.

## Documentation source of truth

- `00-README.md` is the index and phase overview. Update it whenever adding, removing, renaming, or archiving docs.
- `08-实施阶段验收与风险.md` owns phase names, acceptance criteria, non-goals, risks and anti-drift rules.
- `09-IDE参考行为与术语对照.md` owns shared IDE terminology for AI/developer alignment.
- `14-视觉主题与设计系统适配.md` owns editor/IDE/terminal theme-token mapping.
- `archive/` contains historical execution logs; do not use archived files as current implementation entry points.

## Editing rules

- Keep phase names consistent: M3 Mini Explorer, M4 Workbench Layout Foundation, M5 Real Terminal, M5.x terminal split/group, M6 watcher/search/problems/output, M7 LSP/Git/Debug.
- When a capability moves phase or scope, update `00`, `08`, and the specific capability doc in the same change.
- Do not reintroduce root-level `m1-*`, `m2-*`, or cleanup progress files; put history under `archive/`.
- Use relative links and keep local link checks passing.
- Avoid vague future promises. State what is in scope, what is deferred, and what is explicitly not done.
- Visual/theme guidance must point to `14`, `DESIGN.md`, `docs/界面设计守则.md`, and `apps/web/src/design/theme.css`.

## Verification

For docs-only edits in this directory, run a markdown link check for this docs tree and `git diff --check` before claiming completion.
