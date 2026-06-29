# Tracevane Design Contract

> Updated: 2026-06-25
> Current direction: Workspace-first Industrial Studio.

Tracevane is a local-first AI Agent Workspace and connectivity control layer. The primary product experience is now Workspace plus a unified Agent Session layer: files, editor, preview, terminal, Git, evidence and Agent handoff in one responsive work surface, while all human↔Agent conversation is routed through one Agent 会话 surface instead of platform-specific chat pages.

**North Star correction (2026-06-29):** the default Workspace must be a real IDE / AI writing workbench, not a Season One explanation page, poster, card wall, or static concept mock. Visual ambition is welcome only when files, editor/reader, terminal/run state, Git/diff, AI context, evidence review, keyboard control, and responsive production workflows remain primary on screen.

## Design direction

Use **Industrial Studio / Local Ops IDE**:

- calm but professional;
- dense without clutter;
- clear panes, rows, tables, editors and inspectors;
- strong responsive behavior for PC and mobile;
- minimal decorative glass in information-dense zones;
- no card walls or explanation-heavy half-built pages;
- no default Workspace screen dominated by giant slogans, design manifest copy, or non-operational mock panels.

Authoritative details live in:

- `docs/整体目标.md`
- `docs/Workspace目标.md`
- `docs/Workspace设计文档.md`
- `docs/Workspace前端架构.md`
- `docs/界面设计守则.md`

## Product IA rule

Do not mix these concepts:

| Concept                                                                      | Owner              |
| ---------------------------------------------------------------------------- | ------------------ |
| Files/editor/preview/terminal/Git/evidence                                   | Workspace          |
| shell session / PTY                                                          | Workspace Terminal |
| Codex/Claude/OpenCode runtime readiness and Agent Runs                       | CLI Agents         |
| Human↔Agent conversation across Codex/Claude/OpenCode/OpenClaw/custom agents | Agent 会话         |
| Provider/model/protocol routing                                              | Model Gateway      |
| IM account/bot/binding/delivery                                              | IM Channels        |
| third-party platform-native management                                       | Platform           |

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

- `/workspace` must look and behave like a real IDE/workbench on first load; onboarding or Season One explanation copy may exist only as secondary help/empty-state content.
- `/files` must not pretend to be file management if it is read-only.
- Terminal is not CLI Agents.
- Fixed three-column admin shells are not the product baseline; use one Primary Stage plus contextual Drawer/Sheet/Bottom Sheet.
- Unimplemented tabs should not appear as visible placeholders.
- Fixed preview pane should become contextual Inspector.
- Every right-click or hover action needs a mobile/touch alternative.
- Dangerous writes require confirmation and evidence.
- PC and mobile must both be verified before claiming completion.
