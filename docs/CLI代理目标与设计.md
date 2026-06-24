# CLI Agents Target Design

> Status: active target
> Updated: 2026-06-24

## 1. Current assessment

CLI Agents must be refocused. It is a Codex / Claude Code / OpenCode runtime workbench, not a generic OpenClaw agent/profile/persona management UI and not a terminal manager.

## 2. Product goal

CLI Agents should answer:

- Is Codex / Claude Code / OpenCode installed and usable?
- Which gateway/model config will each CLI use?
- Which Agent run should the user inspect, stop or resume through its owning runtime?
- What Agent Runs are active or failed?
- Which terminal/chat/IM source created each run?
- What evidence proves what happened?

## 3. Owned objects

### CLI runtime

Per CLI:

- id: codex / claude-code / opencode
- binary path and version
- install status
- config path and selected model/provider when detectable
- gateway endpoint readiness
- context/compaction capability if detectable from official config or local state

### Agent terminal reference

Terminal is owned by IDE / terminal backend. CLI Agents may only show terminal-sourced Agent Runs and evidence links:

- source terminal session id
- CLI type when inferred
- cwd/workspace
- status
- recent output/error summary
- link to IDE terminal for generic terminal operations

### Agent Run

Read-only projection from terminal, IM and Chat:

- source: terminal / im-channel / chat
- source session id
- CLI/agent id
- model/provider/route scope when known
- workspace
- lifecycle status
- error
- evidence links

Agent Runs should not include ordinary idle Chat history rows.

## 4. OpenClaw boundary

OpenClaw is a substrate and compatibility target. In CLI Agents it may appear only as:

- dependency/runtime status
- config compatibility indicator
- link to Recovery or Platforms
- one supported client app connection if routed through Model Gateway

It should not dominate the page as Persona/OpenClaw Agent administration.

## 5. Required frontend flows

P0:

1. CLI readiness overview for Codex / Claude Code / OpenCode.
2. Gateway readiness per CLI.
3. Launch command/session flow per CLI.
4. Agent Runs list as primary runtime table.
5. Terminal sessions list and controls.
6. Evidence links back to terminal, IM and Chat.
7. Clear separation from OpenClaw platform/recovery support.

P1:

- Detect CLI config file paths.
- Show context/compaction settings when known.
- Model switch handoff to Model Gateway App Connections.
- Stop/retry run boundary where backend can prove ownership.

## 6. Non-goals

- Do not edit IM accounts or bindings here.
- Do not edit provider secrets here.
- Do not recreate OpenClaw generic agents/channels UI.
- Do not manage generic terminal tabs, shell sessions, resize/input, or terminal deletion here; those belong to IDE / terminal.
- Do not infer unsupported CLI context behavior from guesswork.
