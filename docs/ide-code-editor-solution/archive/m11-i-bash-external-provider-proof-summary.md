# M11-I Bash external provider proof summary

Date: 2026-07-08

## Scope

M11-I adds Bash as the second real external language-server provider proof after YAML. It reuses the existing `ExternalLanguageServerGateway`, server-side allowlisted profiles, root/cwd guard, lifecycle/status snapshot, diagnostics routing, and the M11-H IDE provider status UI.

## Completed

- Added pinned dependency `bash-language-server@5.6.0`.
- Added a server-side allowlisted `bash` external provider profile:
  - command: current Node executable;
  - args: `bash-language-server/out/cli.js start`;
  - languages: `shell`, `shellscript`, `bash`, `sh`;
  - capability: diagnostics;
  - bounded initialize/request/shutdown budgets.
- Scoped the Bash provider `PATH` to Node's directory plus `/usr/bin:/bin` so initialization does not scan the entire developer shell PATH.
- Added Bash provider metadata to the LSP provider registry and shared LSP provider id type.
- Routed `.sh`/Bash/shell diagnostics requests through the existing external gateway.
- Kept Bash diagnostics tolerant of provider request-timeout/no-shellcheck cases by returning a normalized empty diagnostics array instead of treating absence of shellcheck parity as a product failure.
- Extended the IDE external provider status smoke to verify both YAML and Bash profiles are visible.
- Added `test:system:lsp-bash-provider` for real Bash LS lifecycle and service routing proof.

## Boundaries preserved

M11-I intentionally does not:

- add provider install/start/stop/restart UI;
- expose arbitrary provider command/args to the frontend;
- add a second LSP API;
- implement provider pools, restart/backoff, or long-lived process reuse;
- promise full shellcheck parity;
- add Pyright, Go, Rust, Java, Vue, Svelte, or any heavy provider;
- change Git force/merge/rebase, Debug parity, Terminal, or File Manager Online Editor product shells.

## Verification

- `npm run typecheck:web -- --pretty false`
- `npm run typecheck:api -- --pretty false`
- `npm run test:system:lsp-external-gateway`
- `npm run test:system:lsp-yaml-provider`
- `npm run test:system:lsp-bash-provider`
- `TRACEVANE_WEB_PORT=5225 TRACEVANE_API_PORT=3916 npm run smoke:ide:lsp-provider-status`
- `git diff --check`

## Dependency / audit note

Installing `bash-language-server@5.6.0` caused `npm install` to report the current dependency tree has 13 audit findings (1 low, 3 moderate, 9 high). This stage did not run `npm audit fix` or `npm audit fix --force`; dependency security policy and provider installation/version governance are deferred to M11-J.

## Next

M11-J should define external provider installer/version policy: dependency vs user-installed binary, version pinning, license/size/security checks, offline fallback, workspace trust, and when heavy providers such as Pyright can enter the product.
