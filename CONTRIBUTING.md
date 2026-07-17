# Contributing to Tracevane

Thank you for helping improve Tracevane. Please keep each contribution focused,
reviewable, and limited to one clearly described problem or feature.

## Set up the repository

Use a supported Node.js version and install the locked dependency graph from the
repository root:

```sh
npm ci
```

Do not commit generated build output, local configuration, credentials, tokens,
or other secrets.

## Validate changes

Before opening a pull request, run the public-surface test and validate both the
API and web workspaces:

```sh
node --test tests/system/open-source-surfaces.test.mjs
npm run typecheck:api
npm run typecheck:web
npm run build:api
npm run build:web
```

Run any additional focused tests that cover the behavior you changed. If a
required check cannot run in your environment, explain why in the pull request.

## Open a pull request

Describe the problem, the chosen solution, and how you verified it. Keep the PR
scope clear: avoid unrelated refactors, formatting churn, generated artifacts,
or dependency changes. Link related Issues and include screenshots or logs when
they materially help reviewers. Redact all sensitive values from examples and
diagnostic output.

## Engineering rules

Tracevane follows a reuse-first engineering posture:

1. Prefer native browser/Node/TypeScript APIs, existing project utilities and
   already-installed dependencies before custom code.
2. Keep diffs small, reviewable and reversible.
3. Prefer deletion and consolidation over new wrapper layers.
4. Do not introduce new dependencies without a clear, verified reason.
5. Preserve user-visible behavior unless the task explicitly changes it.

## Research-first gate

Before changing external contracts or user-visible behavior in Gateway, Channel
Connectors, CLI Agent runners, providers, SDK/API integrations, protocols,
IDE/editor runtime, terminal runtime, file-management workflows or platform
substrates:

1. Check current official docs/specs/API references/SDK docs/changelogs first.
2. Use active GitHub repositories/issues/discussions second.
3. Treat community reports/examples only as operational failure-mode evidence.
4. If a contract cannot be verified, keep the feature explicitly unsupported
   instead of silently half-working.
5. Record the research in the relevant implementation, design, checklist or
   progress document before or with the code change.

For purely local refactors, documentation cleanup or tests that do not change
contracts, keep the change small and verify locally.
