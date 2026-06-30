# Tracevane Guardrails

This file applies to the whole Tracevane workspace.

Tracevane 的默认工程姿态是：**先复用，后自建；先用清晰的小改动解决真实问题，后考虑抽象；能一行可靠解决的事情，不写十行；已有成熟方案能解决的问题，不重复造轮子。**

## Practical Engineering Contract

Before coding, choose the lightest reliable path that satisfies the requirement.

1. Prefer the simplest correct solution.
   - If a platform API, existing utility, current dependency, or focused package solves the problem clearly, use it.
   - If one well-named call can express the behavior, do not replace it with hand-written mapping, parser, state machine, adapter, or custom abstraction.
   - If a small existing component can be extended safely, do not create a parallel component tree.
2. Do not over-engineer early.
   - Do not introduce framework-scale abstractions for one route, one component, or one narrow workflow.
   - Do not add generic managers, registries, adapters, factories, or orchestration layers unless at least two real call sites need the boundary now.
   - Do not split code merely to look architectural; split when it improves ownership, tests, readability, or reuse.
3. Prefer deletion and consolidation.
   - Remove obsolete code instead of wrapping around it.
   - Replace bespoke logic with native APIs or verified dependencies when that reduces risk.
   - Merge duplicate flows when they express the same product behavior.
4. Keep wrappers thin.
   - A wrapper may adapt Tracevane types, styling, accessibility labels, permissions, telemetry, or error handling.
   - A wrapper must not recreate a dependency’s internal rules unless Tracevane has a tested product-specific reason.
5. Keep diffs reviewable.
   - Make the smallest change that actually completes the task.
   - Preserve existing behavior unless the task explicitly changes it.
   - Protect user-visible behavior with focused tests or smoke checks.

## Reuse-First Engineering Principle

Tracevane should not spend engineering effort rebuilding mature, well-maintained primitives that can be safely reused. The objective is not to minimize line count blindly; it is to minimize long-term product risk, maintenance burden, defects, and cognitive load while keeping the implementation explicit and verifiable.

Search in this order:

1. Native browser / Node / TypeScript capability.
2. Existing Tracevane utility, component, service, hook, test helper, or design token.
3. Already-installed dependency.
4. Focused maintained package.
5. Custom code.

Use custom code only when at least one condition is true:

- The behavior is Tracevane-specific product logic or security-sensitive boundary logic.
- Existing libraries are stale, unmaintained, incompatible, too broad, too large, incorrectly licensed, or unsafe for the trust boundary.
- A dependency would make the architecture harder to reason about than a small local implementation.
- Performance, offline behavior, accessibility, privacy, or data-control requirements cannot be met through the reusable option.

Rules:

1. Avoid broad or heavy dependencies for small problems. Prefer focused packages, tree-shakable imports, route-level lazy loading, or existing primitives.
2. Do not copy third-party source into the repo as a shortcut. Depend on the package when appropriate, or implement a deliberately small project-specific abstraction when direct dependency use is unsuitable.
3. New dependencies are allowed only after checking license, maintenance activity, package size/bundle impact, security posture, peer dependency compatibility, API stability, and why existing alternatives are insufficient.
4. During review, treat unnecessary bespoke code as technical debt. Deleting local complexity in favor of a verified primitive is a valid improvement.
5. Verification must cover the chosen reuse boundary: type compatibility, build output, runtime smoke, regression tests, and any bundle-size or performance risk introduced by the dependency.

## Research-First Gate, Applied Pragmatically

Research-first is mandatory for changing external contracts or user-visible product behavior, but it should not become ceremony for obvious local refactors.

### Must research before implementation

Before starting or changing any feature, adapter, provider, SDK/API integration, Channel Connector, CLI Agent runner, IM workflow, Gateway protocol route, IDE/editor integration, terminal runtime, UI workflow, or other user-visible behavior that depends on external contracts:

1. Verify the current external landscape before designing the implementation.
   - Official docs/specs/API references/SDK docs/changelogs first.
   - Active GitHub repositories/issues/discussions second.
   - Community reports/examples only for operational failure modes.
2. Record the research in the relevant goal, progress, checklist, design, or implementation doc before or with the code change.
3. Prefer official and directly verified contracts over memory, old local snapshots, or third-party implementations.
4. If network access is unavailable, do not invent a contract. Use only already documented verified contracts, mark stale-data risk explicitly, and keep unsupported routes explicit until verified.
5. Implement only after comparing current external evidence with the local TypeScript/runtime boundary.
6. User-visible behavior must be protected by regression tests and, when behavior depends on real services or CLIs, focused smoke verification.

Keep `docs/研究先行开发清单.md` updated whenever Gateway, Channel Connectors, CLI Agent runner, provider, SDK, protocol, IDE/editor runtime, terminal runtime, or user-facing workflow scope changes. Commits that intentionally rely on an unverified or temporary contract must record that limitation in commit trailers.

### Research is not required for every tiny change

Do not pause for external research when the task is clearly local and the contract is already known, for example:

- Renaming local variables, extracting a small helper, deleting dead code, or simplifying an existing branch.
- Reusing an already-installed dependency according to an already-verified local pattern.
- Styling changes that only map to existing `theme.css` tokens and documented design rules.
- Updating docs to reflect already-reviewed project decisions.
- Adding tests for current local behavior without changing product/API contracts.

In these cases, proceed directly, keep the diff small, and verify locally.

## Decision Protocol for Implementation Work

1. Define the capability precisely: input/output contract, failure modes, accessibility requirements, performance budget, persistence and security boundaries.
2. Check whether the project already has the solution. Prefer existing utilities, services, hooks, components, test helpers, dependencies, and documented design tokens.
3. If a reusable solution exists, integrate it through the thinnest practical adapter.
4. If custom code is needed, document why reuse was rejected and keep the implementation intentionally small, tested, and replaceable.
5. Verify with the smallest sufficient evidence: typecheck, targeted unit/system test, smoke test, screenshot, or build as appropriate to the risk.

## Design and UI Implementation Rules

1. `docs/界面设计守则.md`, `DESIGN.md`, and `apps/web/src/design/theme.css` are the design source of truth.
2. Do not invent a second styling system for Monaco, xterm, Dockview, diff, Problems, Output, or other IDE/editor surfaces. Map them to Aurora CSS variables through a centralized adapter.
3. Prefer existing shared UI primitives before creating new component APIs.
4. Deep and light themes must both remain readable. Dense surfaces such as code editors, terminals, logs, tables, and diffs use solid panels, clear borders, and restrained shadows.
5. Mobile/touch alternatives are required for right-click, hover, and drag-only actions.

## Completion Standard

Before claiming completion:

- Confirm the task scope is satisfied.
- Confirm no unrelated files were intentionally changed.
- Run the smallest sufficient verification for the risk level.
- Report changed files, verification evidence, and any known risks or not-tested gaps.
