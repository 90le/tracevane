# M11-H IDE external provider status UI foundation summary

Date: 2026-07-08

## Scope

M11-H completes a read-only IDE status surface for the external LSP provider foundation from M11-F/M11-G. It surfaces the existing server-side `/api/lsp/status.externalProviders` payload inside the IDE Workbench without creating a second LSP API or adding provider lifecycle controls.

## Completed

- Added a frontend LSP status client/hook for `GET /api/lsp/status`.
- Added IDE StatusBar external provider summary with tone-aware status:
  - internal only
  - stopped
  - available/starting
  - attention for crashed/degraded/unavailable
- Added a read-only external provider status dialog from the StatusBar.
- Added a Command Palette entry: `显示外部 LSP Provider 状态`.
- The dialog shows allowlisted profile/runtime status details such as provider id, languages, capabilities, runtime state, reason, pid/timestamps, lastError and stderrTail when available.
- Added `smoke:ide:lsp-provider-status` to prove the StatusBar and Command Palette entries can open the YAML external provider status view.

## Boundaries preserved

M11-H intentionally does not:

- add a new external provider;
- implement the Bash provider proof;
- install provider dependencies;
- start/stop/restart providers from the UI;
- expose provider command/args in the UI;
- add a second LSP API;
- change the backend provider allowlist/root-guard/lifecycle contract.

## Verification

- `npm run typecheck:web -- --pretty false`
- `TRACEVANE_WEB_PORT=5225 TRACEVANE_API_PORT=3916 npm run smoke:ide:lsp-provider-status`
- `git diff --check`

## Next

M11-I should implement the next external provider proof as a narrow Bash provider slice, reusing the existing external language server gateway and the status UI added here. It should not broaden into automatic provider installation, arbitrary command entry, or one-shot all-language support.
