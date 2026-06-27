# Tracevane Guardrails

This file applies to the whole Tracevane workspace.

## Research-First Implementation Gate

Before starting or changing any feature, adapter, provider, SDK/API integration, Channel Connector, CLI Agent runner, IM workflow, Gateway protocol route, UI workflow, or user-visible behavior:

1. Verify the current external landscape on the web before designing the implementation. Check official docs/specs/API references/SDK docs/changelogs first, then active GitHub repositories/issues/discussions, then community reports or examples for operational failure modes.
2. Record the research in the relevant goal, progress, or checklist doc before or with the code change: sources checked, date, stable contracts found, rejected options, known risks, and the verification plan.
3. Prefer official and directly verified contracts over memory, old local snapshots, or third-party implementations. Historical projects and migration sources are archival context only; they are not implementation authority or required migration targets.
4. If network access is unavailable, do not invent a contract. Use only already documented verified contracts, mark the stale-data risk explicitly, and keep unsupported routes explicit until they are verified.
5. Implement only after comparing current external evidence with the local TypeScript/runtime boundary. User-visible behavior must be protected by regression tests and, when behavior depends on real services or CLIs, by focused smoke verification.

Keep `docs/研究先行开发清单.md` updated whenever Gateway, Channel Connectors, CLI Agent runner, provider, SDK, protocol, or user-facing workflow scope changes. Commits that intentionally rely on an unverified or temporary contract must record that limitation in commit trailers.

## Reuse-First Engineering Principle

Tracevane should not spend engineering effort rebuilding mature, well-maintained primitives that can be safely reused. Before writing custom code for a non-core problem, evaluate whether the platform, the current dependency graph, or a focused open-source package already provides the capability. The objective is not to minimize line count blindly; it is to minimize long-term product risk, maintenance burden, defects, and cognitive load while keeping the implementation explicit and verifiable.

1. Prefer native browser/Node APIs, existing project utilities, and already-installed dependencies before adding new code or new packages.
2. If a stable library can solve a problem with a narrow API surface, use it instead of maintaining large hand-written mappings, parsers, polyfills, visual assets, adapters, or state machines inside Tracevane.
3. Treat concise reuse as a design advantage: if a verified dependency call or platform API can express the behavior clearly, do not replace it with tens or hundreds of lines of bespoke code unless Tracevane has a real product-specific requirement that the reusable option cannot satisfy.
4. Use custom code only when at least one of these conditions is true:
   - The behavior is Tracevane-specific product logic or security-sensitive boundary logic.
   - Existing libraries are stale, unmaintained, incompatible, too broad, too large, incorrectly licensed, or unsafe for the trust boundary.
   - A dependency would make the architecture harder to reason about than a small local implementation.
   - Performance, offline behavior, accessibility, or data-control requirements cannot be met through the reusable option.
5. New dependencies are allowed only after research records license, maintenance activity, package size/bundle impact, security posture, peer dependency compatibility, API stability, and why existing alternatives are insufficient.
6. Avoid broad or heavy dependencies for small problems. Prefer focused packages, tree-shakable imports, route-level lazy loading, or existing primitives when they meet the requirement with lower long-term cost.
7. Do not copy third-party source into the repo as a shortcut. Depend on the package when appropriate, or document and implement a deliberately small project-specific abstraction when direct dependency use is unsuitable.
8. Keep custom wrappers thin. A wrapper should adapt Tracevane types, styling, accessibility labels, error handling, or telemetry; it should not recreate the dependency’s internal rules unless there is a tested product reason.
9. Re-evaluate custom implementations during refactors. If later research shows a maintained library or platform API now covers an existing bespoke solution, prefer deletion and replacement over continued maintenance of local complexity.
10. Verification must cover the chosen reuse boundary: type compatibility, build output, runtime smoke, regression tests, and any bundle-size or performance risk introduced by the dependency.

Decision protocol for implementation work:

1. Define the capability precisely before coding: input/output contract, failure modes, accessibility requirements, performance budget, and persistence or security boundaries.
2. Search in this order: platform API, existing Tracevane utility, current dependency, focused maintained package, then custom code.
3. If the reusable solution is selected, integrate it through the thinnest practical adapter and keep Tracevane-owned code limited to product-specific glue.
4. If custom code is selected, document why reuse was rejected and keep the implementation intentionally small, tested, and replaceable.
5. During review, treat unnecessary bespoke code as technical debt. Deleting local complexity in favor of a verified primitive is a valid improvement.

The default engineering posture is therefore: reuse the smallest reliable thing that satisfies the requirement, document why it is safe, and reserve custom code for Tracevane-specific behavior, integration boundaries, or performance constraints that reusable primitives cannot meet.
