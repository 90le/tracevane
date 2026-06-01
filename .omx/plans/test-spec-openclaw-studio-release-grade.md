# OpenClaw Studio release-grade test spec

## Static Gates

- `git diff --check`
- `npm run typecheck`
- `npm run build:web`
- `npm run test:system` for broad release slices when runtime cost is acceptable.
- Targeted system tests for each edited feature.

## Codex Stack Gates

- No required smoke model list may hardcode `glm-5.1`, `kimi-k2.6`, or any two-model assumption.
- UI default model fields must hydrate from `profile.defaultModel`, current Codex model, OpenClaw/default model discovery, or user selection.
- If no target model is known, smoke matrix and CPA attach must fail with a clear "choose target model" error instead of choosing a historical default.
- Compact Proxy must require a request model or explicit `COMPACT_DEFAULT_MODEL`/`CODEX_MODEL`; it must not silently inject a stale provider-specific model.
- CPA attach requires a fresh passing smoke matrix for the current target model and all required checks.
- Force CPA path must remain explicit and warn about ordinary, streaming, long-task, and compaction risks.
- Official ChatGPT route restore must preserve CPA provider configuration and restore official auth backup when present.
- Switching to CPA must preserve official ChatGPT auth backup and write local CPA auth only after the chosen path is confirmed.
- Health-check and install output must render in floating output surfaces, not permanent page cards.

## UI Gates

- Each major page maps to one architecture in `DESIGN.md`: Setup / Repair Wizard, Workspace Strip, Health Action Lane, Split Inspector, Runtime Console, Runtime Workspace, Conversation Workspace, or Data Review.
- No page reintroduces duplicate topbar/sidebar/search navigation.
- No global context panel returns unless it is an actionable editor or inspector.
- Light and dark modes avoid pure white and pure black dominant canvases.
- New feature styles live in the owning feature stylesheet unless they are shared primitives.

## API Gates

- Mutating Codex Stack operations are single-flight or otherwise guarded from duplicate execution.
- Job status is refresh-safe and carries readable logs plus failure cause.
- Version/capability checks distinguish latest OpenClaw behavior from low-version fallback.
- Proxy policy exposes loopback readiness and explains TUN/VPN risks.

## Performance Gates

- Cached routes must not apply stale responses after leaving the route.
- Global shell work must not start fixed polling on every page.
- Long logs and terminal output do not block the main UI.

## Live Smoke Gates

- Frontend dev preview responds.
- Backend health endpoint responds.
- Frontend `/api/system/health` proxy path responds.
- Codex Stack summary loads.
- Health check opens floating output and can rerun.
- Smoke matrix can be initiated only against the current target model.

## Completion Evidence

Any completion claim must record:

- Commands run and pass/fail status.
- Files changed.
- Runtime smoke evidence if applicable.
- Known unverified areas.
- Residual release risks.

## Verified Regression Set

Keep these checks green for the current release-grade effort:

- `npm run build:api`
- `node --test --test-reporter=dot tests/system/codex-stack-service.test.mjs`
- `node --test --test-reporter=dot tests/system/compact-proxy.test.mjs tests/system/studio-web-codex-stack-workspace.test.mjs`
- `bash -n resources/codex-stack/codex-docs/resources/scripts/auto-setup.sh && bash -n resources/codex-stack/codex-docs-dmwork/resources/scripts/auto-setup.sh`
- `node --check resources/codex-stack/codex-docs/resources/cpa-config-templates/compact-proxy.mjs && node --check resources/codex-stack/codex-docs-dmwork/resources/cpa-config-templates/compact-proxy.mjs`
- `npm run typecheck:web`
- `npm run build:web`
- Live preview checks for `http://127.0.0.1:3761/api/system/health` and `http://127.0.0.1:5176/`.
