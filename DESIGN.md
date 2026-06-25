# Tracevane Design Contract

> Updated: 2026-06-25
> Current direction: Workspace-first Industrial Studio.

Tracevane is a local-first AI Agent Workspace and connectivity control layer. The primary product experience is now Workspace: files, editor, preview, terminal, Git, evidence and Agent handoff in one responsive work surface.

## Design direction

Use **Industrial Studio / Local Ops IDE**:

- calm but professional;
- dense without clutter;
- clear panes, rows, tables, editors and inspectors;
- strong responsive behavior for PC and mobile;
- minimal decorative glass in information-dense zones;
- no card walls or explanation-heavy half-built pages.

Authoritative details live in:

- `docs/整体目标.md`
- `docs/Workspace目标.md`
- `docs/Workspace设计文档.md`
- `docs/Workspace前端架构.md`
- `docs/界面设计守则.md`

## Product IA rule

Do not mix these concepts:

| Concept | Owner |
| --- | --- |
| Files/editor/preview/terminal/Git/evidence | Workspace |
| shell session / PTY | Workspace Terminal |
| Codex/Claude/OpenCode runtime readiness and Agent Runs | CLI Agents |
| Provider/model/protocol routing | Model Gateway |
| IM account/bot/binding/delivery | IM Channels |
| third-party platform-native management | Platform |

## Workspace shape

Desktop:

```text
Activity | Explorer | Editor Stage | Inspector
         |          | Bottom Panel
```

Mobile:

```text
Top Bar
Main Stage
Bottom Mode Nav
Action Sheet / Fullscreen panels
```

## Hard rules

- `/files` must not pretend to be file management if it is read-only.
- Terminal is not CLI Agents.
- Unimplemented tabs should not appear as visible placeholders.
- Fixed preview pane should become contextual Inspector.
- Every right-click or hover action needs a mobile/touch alternative.
- Dangerous writes require confirmation and evidence.
- PC and mobile must both be verified before claiming completion.
