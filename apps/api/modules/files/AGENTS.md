# Files API rules

This file applies under `apps/api/modules/files/`.

## Boundary

The Files API is the trusted backend boundary for File Manager, File Surface, Mini Explorer and future IDE Explorer. Frontend code must send root/workspace ids plus relative paths; this module must enforce root guards and permissions.

## Contracts to check before changes

- `types/files.ts` for the shared request/response contracts.
- `apps/web/src/features/file-manager/AGENTS.md` for the frontend consumer boundaries.

## Implementation rules

- Never trust frontend paths. Reject path traversal and workspace/root escapes.
- Preserve dirty/save conflict contracts: expected mtime/version/size checks, explicit 409 conflict, no silent overwrite.
- Rename/move/delete behavior must support open editor synchronization and deleted-dirty recovery flows.
- Do not create a second file API for Mini Explorer or IDE Explorer unless a documented contract gap requires it.

## Verification

- `npm run typecheck:api` or `npm run typecheck`.
- Relevant `tests/system/files-service.test.mjs` coverage or a focused service/API check when the full system test is unavailable.
- File-manager smokes when frontend-visible file behavior changes.
