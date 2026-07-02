# Project hooks policy

No project-local Codex hooks are enabled right now.

Why:

- The user-level OMX hooks already provide session/tool lifecycle integration.
- Project hooks require trust review and run automatically, so they should be added only when mechanical enforcement is worth the friction.
- This repo currently benefits more from `AGENTS.md`, repo skills, targeted tests and smoke commands than from automatic hook scripts.

Allowed future hooks:

- Read-only `PreToolUse` policy that warns before destructive file operations outside the workspace.
- `Stop` hook that prints a reminder when IDE/editor files changed without any verification evidence.
- `UserPromptSubmit` hook that detects pasted secrets, if implemented without logging sensitive content.

Do not add hooks that:

- Modify source files automatically.
- Run long builds/tests on every turn.
- Send repo content to external services.
- Duplicate existing OMX global hooks.
