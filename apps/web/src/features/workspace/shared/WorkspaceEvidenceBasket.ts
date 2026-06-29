export type WorkspaceEvidenceSource =
  | "document"
  | "ai-context"
  | "terminal"
  | "git"
  | "verification"
  | "agent";

export type WorkspaceEvidenceKind =
  | "context"
  | "diff"
  | "command"
  | "log"
  | "verification"
  | "artifact";

export const WORKSPACE_EVIDENCE_BASKET_STORAGE_KEY =
  "tracevane.workspace.evidence-basket.v1";
export const TRACEVANE_WORKSPACE_EVIDENCE_BASKET_EVENT =
  "tracevane:workspace-evidence-basket-updated";
export const WORKSPACE_EVIDENCE_BASKET_LIMIT = 80;

export type WorkspaceEvidenceBasketAction =
  | "append"
  | "remove"
  | "clear"
  | "replace";

export interface WorkspaceEvidenceRecord {
  id: string;
  source: WorkspaceEvidenceSource;
  kind: WorkspaceEvidenceKind;
  title: string;
  summary: string;
  refs: Record<string, unknown>;
  createdAt: string;
}

export interface WorkspaceEvidenceInput {
  source: WorkspaceEvidenceSource;
  kind: WorkspaceEvidenceKind;
  title: string;
  summary?: string;
  refs?: Record<string, unknown>;
  id?: string;
}

export interface WorkspaceEvidenceBasketUpdateDetail {
  action: WorkspaceEvidenceBasketAction;
  records: WorkspaceEvidenceRecord[];
  appended?: WorkspaceEvidenceRecord;
  removed?: WorkspaceEvidenceRecord | null;
}

export type WorkspaceEvidenceBasketSubscriber = (
  detail: WorkspaceEvidenceBasketUpdateDetail,
) => void;

export function buildWorkspaceEvidenceRecord(
  input: WorkspaceEvidenceInput,
): WorkspaceEvidenceRecord {
  const id = input.id || `${input.source}:${input.kind}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    source: input.source,
    kind: input.kind,
    title: input.title.trim() || "Workspace evidence",
    summary: input.summary?.trim() || "No summary provided",
    refs: input.refs ?? {},
    createdAt: new Date().toISOString(),
  };
}

export function readWorkspaceEvidenceBasket(): WorkspaceEvidenceRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(WORKSPACE_EVIDENCE_BASKET_STORAGE_KEY) ||
        "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWorkspaceEvidenceRecord);
  } catch {
    return [];
  }
}

export function writeWorkspaceEvidenceBasket(
  records: WorkspaceEvidenceRecord[],
): WorkspaceEvidenceRecord[] {
  const next = records.slice(0, WORKSPACE_EVIDENCE_BASKET_LIMIT);
  if (typeof window === "undefined") return next;
  window.localStorage.setItem(
    WORKSPACE_EVIDENCE_BASKET_STORAGE_KEY,
    JSON.stringify(next),
  );
  return next;
}

export function appendWorkspaceEvidence(
  input: WorkspaceEvidenceInput,
): WorkspaceEvidenceBasketUpdateDetail | null {
  if (typeof window === "undefined") return null;
  const record = buildWorkspaceEvidenceRecord(input);
  const records = readWorkspaceEvidenceBasket().filter(
    (item) => item.id !== record.id,
  );
  const next = writeWorkspaceEvidenceBasket([record, ...records]);
  return dispatchWorkspaceEvidenceBasketUpdate({
    action: "append",
    records: next,
    appended: record,
  });
}

export function removeWorkspaceEvidence(
  recordId: string,
): WorkspaceEvidenceBasketUpdateDetail | null {
  if (typeof window === "undefined") return null;
  const records = readWorkspaceEvidenceBasket();
  const removed = records.find((item) => item.id === recordId) ?? null;
  const next = writeWorkspaceEvidenceBasket(
    records.filter((item) => item.id !== recordId),
  );
  return dispatchWorkspaceEvidenceBasketUpdate({
    action: "remove",
    records: next,
    removed,
  });
}

export function clearWorkspaceEvidenceBasket(): WorkspaceEvidenceBasketUpdateDetail | null {
  if (typeof window === "undefined") return null;
  const next = writeWorkspaceEvidenceBasket([]);
  return dispatchWorkspaceEvidenceBasketUpdate({
    action: "clear",
    records: next,
  });
}

export function replaceWorkspaceEvidenceBasket(
  records: WorkspaceEvidenceRecord[],
): WorkspaceEvidenceBasketUpdateDetail | null {
  if (typeof window === "undefined") return null;
  const next = writeWorkspaceEvidenceBasket(records);
  return dispatchWorkspaceEvidenceBasketUpdate({
    action: "replace",
    records: next,
  });
}

export function subscribeWorkspaceEvidenceBasket(
  subscriber: WorkspaceEvidenceBasketSubscriber,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onUpdate = (event: Event) => {
    subscriber((event as CustomEvent<WorkspaceEvidenceBasketUpdateDetail>).detail);
  };
  window.addEventListener(TRACEVANE_WORKSPACE_EVIDENCE_BASKET_EVENT, onUpdate);
  return () =>
    window.removeEventListener(
      TRACEVANE_WORKSPACE_EVIDENCE_BASKET_EVENT,
      onUpdate,
    );
}

export function exportWorkspaceEvidenceBundle(
  records: WorkspaceEvidenceRecord[],
): string {
  return records
    .map((record, index) => [
      `# Evidence ${index + 1}: ${record.title}`,
      `source: ${record.source}`,
      `kind: ${record.kind}`,
      `createdAt: ${record.createdAt}`,
      "",
      record.summary,
      "",
      "```json",
      JSON.stringify(record.refs, null, 2),
      "```",
    ].join("\n"))
    .join("\n\n---\n\n");
}

function dispatchWorkspaceEvidenceBasketUpdate(
  detail: WorkspaceEvidenceBasketUpdateDetail,
): WorkspaceEvidenceBasketUpdateDetail {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(TRACEVANE_WORKSPACE_EVIDENCE_BASKET_EVENT, { detail }),
    );
  }
  return detail;
}

export function isWorkspaceEvidenceRecord(
  value: unknown,
): value is WorkspaceEvidenceRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<WorkspaceEvidenceRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.source === "string" &&
    typeof record.kind === "string" &&
    typeof record.title === "string" &&
    typeof record.summary === "string" &&
    typeof record.createdAt === "string" &&
    Boolean(record.refs) &&
    typeof record.refs === "object"
  );
}
