# Tracevane release-grade PRD

## Goal

Bring `tracevane` to a release-grade extension that can be delivered to normal users and customer machines, not only maintained on the local development workstation.

This goal covers frontend, backend, feature behavior, performance, compatibility, Tracevane Gateway routing, model and provider configuration, health checks, logs, setup recovery, CSS ownership, old feature cleanup, and release evidence.

## Continuous Optimization Objective

Optimize the Tracevane extension end to end until it is safe to publish for real users:

- Align the extension with the latest OpenClaw behavior while keeping low-version compatibility through capability detection, defensive fallbacks, and clear upgrade/repair paths.
- Redesign the frontend as a calm operational workbench instead of a dense card wall, using `DESIGN.md` and the installed design skills as the product/UI contract.
- Make first install, reinstall/update, repair, health check, model validation, Tracevane Gateway route selection, and official provider restore work as one guided workflow.
- Keep backend APIs resilient under refresh, duplicate clicks, paused services, missing config, TUN/VPN proxy interception, and heterogeneous customer model catalogs.
- Remove stale or confusing surfaces, consolidate CSS ownership into shared/feature stylesheets, and preserve automated verification evidence for every slice.

## Non-negotiable Principles

- Treat the current worktree and runtime behavior as authoritative; do not assume older conversation context is correct.
- Keep compatibility with the latest OpenClaw and supported older versions through capability detection and fallback behavior.
- Preserve useful behavior while replacing unfriendly UI layout, visual grouping, and copy density.
- Do not use hardcoded third-party model names as required smoke targets or user defaults. The user's configured default or selected target model is authoritative.
- Never auto-route a CLI/tool through Tracevane Gateway unless the selected provider and protocol checks are fresh and passing.
- Keep official provider auth and Tracevane Gateway auth separately recoverable.
- Keep domestic gateway paths direct by default; OpenAI/ChatGPT paths may use proxy configuration.
- Prefer deletion, consolidation, and feature-owned CSS over new override layers.

## Milestones

### M1. Tracevane Gateway release path

- First-use install, reinstall, repair, health check, smoke validation, and Tracevane Gateway route switching are one guided workflow.
- Smoke validation uses the current target model and required protocol checks: OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, streaming, tool-use, and long-task readiness where applicable.
- Force routing remains explicit and displays concrete risk instead of pretending the route is stable.
- TUN/VPN/loopback proxy risks are detected or explained with repair action.
- Watchdog and legacy inspection state are hidden or auto-managed unless they are actionable.

### M2. DuoYuan Tracevane Ops frontend

- Follow `DESIGN.md` as the canonical UI contract.
- Replace card walls with setup/repair wizards, runtime strips, health action lanes, split inspectors, runtime consoles, data review panes, floating logs, and focused action rows.
- Remove duplicate navigation and non-actionable context panels.
- Light and dark themes are tuned together and remain readable.

### M3. CSS ownership cleanup

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
- Required checks include relevant system tests, typecheck, web build, live health, and targeted Tracevane Gateway smoke where safe.
- Completion requires machine-readable audit evidence and explicit residual-risk review.

## Current Priority

Start with Tracevane Gateway because it blocks safe customer use:

1. Keep unsafe hardcoded model fallbacks out of UI defaults and smoke target selection.
2. Make setup/recovery/control pages match Setup / Repair Wizard and Runtime Console patterns.
3. Make Gateway routing state explicit and recoverable.
4. Keep smoke gate conservative and force path explicit.

## Verified Progress

- Earlier gateway work removed channel-based GLM/Kimi fallback from smoke/attach target selection. Target model now comes from user/profile/current OpenClaw default/provider catalog, and missing target model blocks smoke/attach with actionable guidance.
- Earlier daemon work made model-less requests fail clearly instead of silently using a stale provider-specific model.
- `7023bbc`, `bc033c7`, and prior CSS cleanup commits removed the last real Vue component `<style>` blocks from `chat-v2` and deleted stale legacy Chat implementation files.
- Tracevane Gateway now replaces the legacy page direction. New work must build provider, app connection, runtime, and diagnostics surfaces as fresh product surfaces.

## Remaining High-Risk Work

- Build the new Tracevane Gateway management surface after the legacy page and API are retired.
- Verify official provider restore and Gateway route attach against real user auth files without losing backups.
- Keep removing page-level CSS accumulation and card-wall layout from remaining modules outside Chat.
- Add compatibility evidence against latest OpenClaw plus at least one lower-version fixture or mocked capability matrix.
- Run targeted live Gateway smoke only when the selected target model, gateway, and proxy mode are safe to exercise.

## Acceptance

- A normal user can install, repair, validate, and choose Tracevane Gateway or official provider routes without understanding internal service names first.
- Model validation follows the selected/current model, not a fixed historical list.
- The main Tracevane pages no longer look like dense card stacks or duplicated nav surfaces.
- API and frontend errors are actionable and retryable where possible.
- Typecheck, build, and relevant system tests pass.
- Remaining risks are recorded before any release claim.
