import type { TerminalTargetKind } from "../../../../../types/terminal";
import type { TerminalSessionStorageLike } from "./terminal-session-registry";

const PENDING_LAUNCH_METADATA_STORAGE_KEY =
  "tracevane.terminal.pendingLaunchMetadata";

export interface PendingTerminalLaunchMetadata {
  profileId?: string | null;
  targetKind?: TerminalTargetKind | null;
  cwd?: string | null;
  pinned?: boolean | null;
}

function normalizeSessionId(sessionId: string | null | undefined): string {
  return String(sessionId || "").trim();
}

function normalizeText(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeTargetKind(value: unknown): TerminalTargetKind | null {
  const normalized = String(value || "").trim();
  if (
    normalized === "local" ||
    normalized === "ssh" ||
    normalized === "container" ||
    normalized === "kubernetes"
  ) {
    return normalized;
  }
  return null;
}

function normalizeMetadata(
  metadata: PendingTerminalLaunchMetadata | null | undefined,
): PendingTerminalLaunchMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const normalized: PendingTerminalLaunchMetadata = {
    profileId: normalizeText(metadata.profileId),
    targetKind: normalizeTargetKind(metadata.targetKind),
    cwd: normalizeText(metadata.cwd),
    pinned: typeof metadata.pinned === "boolean" ? metadata.pinned : null,
  };
  if (
    !normalized.profileId &&
    !normalized.targetKind &&
    !normalized.cwd &&
    typeof normalized.pinned !== "boolean"
  ) {
    return null;
  }
  return normalized;
}

function readAllPendingLaunchMetadata(
  storage: TerminalSessionStorageLike | null | undefined,
): Record<string, PendingTerminalLaunchMetadata> {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(
      storage.getItem(PENDING_LAUNCH_METADATA_STORAGE_KEY) || "{}",
    ) as Record<string, PendingTerminalLaunchMetadata>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, PendingTerminalLaunchMetadata> = {};
    for (const [sessionId, metadata] of Object.entries(parsed)) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      const normalizedMetadata = normalizeMetadata(metadata);
      if (normalizedSessionId && normalizedMetadata) {
        result[normalizedSessionId] = normalizedMetadata;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeAllPendingLaunchMetadata(
  storage: TerminalSessionStorageLike | null | undefined,
  metadataBySessionId: Record<string, PendingTerminalLaunchMetadata>,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      PENDING_LAUNCH_METADATA_STORAGE_KEY,
      JSON.stringify(metadataBySessionId),
    );
  } catch {
    // Pending launch metadata is a best-effort race guard.
  }
}

export function writePendingTerminalLaunchMetadata(
  storage: TerminalSessionStorageLike | null | undefined,
  sessionId: string,
  metadata: PendingTerminalLaunchMetadata,
): void {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const normalizedMetadata = normalizeMetadata(metadata);
  if (!storage || !normalizedSessionId || !normalizedMetadata) return;
  const allMetadata = readAllPendingLaunchMetadata(storage);
  allMetadata[normalizedSessionId] = normalizedMetadata;
  writeAllPendingLaunchMetadata(storage, allMetadata);
}

export function readPendingTerminalLaunchMetadata(
  storage: TerminalSessionStorageLike | null | undefined,
  sessionId: string,
): PendingTerminalLaunchMetadata | null {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!storage || !normalizedSessionId) return null;
  return readAllPendingLaunchMetadata(storage)[normalizedSessionId] || null;
}

export function removePendingTerminalLaunchMetadata(
  storage: TerminalSessionStorageLike | null | undefined,
  sessionId: string,
): void {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!storage || !normalizedSessionId) return;
  const allMetadata = readAllPendingLaunchMetadata(storage);
  if (!allMetadata[normalizedSessionId]) return;
  delete allMetadata[normalizedSessionId];
  writeAllPendingLaunchMetadata(storage, allMetadata);
}
