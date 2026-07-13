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
