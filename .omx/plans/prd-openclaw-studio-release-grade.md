# OpenClaw Studio release-grade PRD

## Goal

Bring `openclaw-studio` to a release-grade extension that can be delivered to normal users and customer machines, not only maintained on the local development workstation.

This goal covers frontend, backend, feature behavior, performance, compatibility, Codex Stack, CPA/Compact/GPT routing, model and gateway configuration, health checks, logs, installation repair, CSS ownership, old feature cleanup, and release evidence.

## Continuous Optimization Objective

Optimize the Studio extension end to end until it is safe to publish for real users:

- Align the extension with the latest OpenClaw behavior while keeping low-version compatibility through capability detection, defensive fallbacks, and clear upgrade/repair paths.
- Redesign the frontend as a calm operational workbench instead of a dense card wall, using `DESIGN.md` and the installed design skills as the product/UI contract.
- Make first install, reinstall/update, repair, health check, model validation, CPA/Compact route selection, and official ChatGPT route restore work as one guided workflow.
- Keep backend APIs resilient under refresh, duplicate clicks, paused services, missing config, TUN/VPN proxy interception, and heterogeneous customer model catalogs.
- Remove stale or confusing surfaces, consolidate CSS ownership into shared/feature stylesheets, and preserve automated verification evidence for every slice.

## Non-negotiable Principles

- Treat the current worktree and runtime behavior as authoritative; do not assume older conversation context is correct.
- Keep compatibility with the latest OpenClaw and supported older versions through capability detection and fallback behavior.
- Preserve useful behavior while replacing unfriendly UI layout, visual grouping, and copy density.
- Do not use hardcoded third-party model names as required smoke targets or user defaults. The user's configured default or selected target model is authoritative.
- Never auto-attach Codex to CPA/Compact unless the smoke gate proves the target model and required checks are fresh and passing.
- Keep official ChatGPT auth and CPA auth separately recoverable.
- Keep domestic gateway paths direct by default; OpenAI/ChatGPT paths may use proxy configuration.
- Prefer deletion, consolidation, and feature-owned CSS over new override layers.

## Milestones

### M1. Codex Stack release path

- First-use install, reinstall, repair, health check, smoke validation, and CPA/GPT route switching are one guided workflow.
- Smoke validation uses the current target model and required checks: ordinary request, non-streaming, streaming, compaction, long-task readiness where applicable.
- Force CPA remains possible but displays concrete risk and does not pretend the route is stable.
- TUN/VPN/loopback proxy risks are detected or explained with repair action.
- Watchdog and legacy inspection state are hidden or auto-managed unless they are actionable.

### M2. Calm Ops OS frontend

- Follow `DESIGN.md` as the canonical UI contract.
- Replace card walls with setup/repair wizards, command centers, split inspectors, runtime consoles, data review panes, floating logs, and focused action rows.
- Remove duplicate navigation and non-actionable context panels.
- Light and dark themes are tuned together and remain readable.

### M3. CSS ownership cleanup

- Codex Stack remains free of Vue page-level `<style>` blocks.
- Migrate remaining high-impact scoped styles from `chat-v2`, `channels`, `config`, `files`, `terminal`, `system`, `cron`, and `dreaming` into feature CSS files.
- Keep `apps/web-vue/src/style.css` limited to shared tokens, shell, and reusable primitives.

### M4. Backend API stability

- API responses include clear state, cause, recovery suggestion, retryability, and job evidence for install, repair, health, logs, model validation, gateway configuration, and service control.
- Long-running jobs are recoverable after frontend refresh and avoid duplicate mutation races.
- Version and capability checks guard latest and lower OpenClaw compatibility.

### M5. Performance and cache safety

- Avoid global polling that runs on unrelated pages.
- Cancel stale route requests and prevent cached pages from applying old responses after deactivation.
- Keep terminal/log streaming responsive and avoid blocking UI during long jobs.
- Maintain route-level splitting and stable builds.

### M6. Release evidence

- Each finished slice has automated or repeatable smoke evidence.
- Required checks include relevant system tests, typecheck, web build, live health, and targeted Codex Stack smoke where safe.
- Completion requires machine-readable audit evidence and explicit residual-risk review.

## Current Priority

Start with Codex Stack because it blocks safe customer use:

1. Keep unsafe hardcoded model fallbacks out of UI defaults and smoke target selection.
2. Make install/repair/control pages match Setup / Repair Wizard and Runtime Console patterns.
3. Make CPA/GPT switching state explicit and recoverable.
4. Keep smoke gate conservative and force path explicit.

## Verified Progress

- `0c63098` removed channel-based GLM/Kimi fallback from CPA smoke/attach target selection. Target model now comes from user/profile/current Codex/OpenClaw default/provider catalog, and missing target model blocks smoke/attach with actionable guidance.
- `0c63098` updated bundled install scripts and Compact Proxy templates so installs derive `CODEX_MODEL` from OpenClaw/user configuration and model-less Compact requests fail clearly instead of silently using a stale model.
- `7023bbc`, `bc033c7`, and prior CSS cleanup commits removed the last real Vue component `<style>` blocks from `chat-v2` and deleted stale legacy Chat implementation files.
- Health check output is represented by `CodexStackCheckOutputDialog`, and background job output is represented by `CodexStackJobProgressPanel`, matching the floating/docked output requirement instead of permanent inline output cards.

## Remaining High-Risk Work

- Continue simplifying Codex Stack install/control/settings pages so first-time users see one recommended action before technical detail.
- Verify official ChatGPT route restore and CPA route attach against real user auth files without losing backups.
- Keep removing page-level CSS accumulation and card-wall layout from remaining modules outside Chat/Codex Stack.
- Add compatibility evidence against latest OpenClaw plus at least one lower-version fixture or mocked capability matrix.
- Run targeted live CPA smoke only when the selected target model, gateway, and proxy mode are safe to exercise.

## Acceptance

- A normal user can install, repair, validate, and choose CPA or official ChatGPT route without understanding internal service names first.
- Model validation follows the selected/current model, not a fixed list such as `glm-5.1` or `kimi-k2.6`.
- The main Studio pages no longer look like dense card stacks or duplicated nav surfaces.
- API and frontend errors are actionable and retryable where possible.
- Typecheck, build, and relevant system tests pass.
- Remaining risks are recorded before any release claim.
