export type WorkspaceAiContextKind = "document";
export type WorkspaceAiContextDocumentMode = "source" | "preview" | "split" | "visual";

export const WORKSPACE_AI_CONTEXT_BASKET_STORAGE_KEY =
  "tracevane.workspace.ai-context-basket.v1";
export const TRACEVANE_WORKSPACE_AI_CONTEXT_BASKET_EVENT =
  "tracevane:workspace-ai-context-basket-updated";
export const WORKSPACE_AI_CONTEXT_BASKET_LIMIT = 24;

export interface WorkspaceAiDocumentStats {
  lines: number;
  words: number;
  characters: number;
  readingMinutes: number;
}

export interface WorkspaceAiContextBasketItem {
  id: string;
  kind: WorkspaceAiContextKind;
  path: string;
  title: string;
  mode: WorkspaceAiContextDocumentMode;
  editable: boolean;
  textLike: boolean;
  stats: WorkspaceAiDocumentStats;
  context: string;
  addedAt: string;
}

export type WorkspaceAiContextBasketAction =
  | "add"
  | "remove"
  | "clear"
  | "replace";

export interface WorkspaceAiContextBasketUpdateDetail {
  action: WorkspaceAiContextBasketAction;
  items: WorkspaceAiContextBasketItem[];
  added?: WorkspaceAiContextBasketItem;
  removed?: WorkspaceAiContextBasketItem | null;
}

export type WorkspaceAiContextBasketSubscriber = (
  detail: WorkspaceAiContextBasketUpdateDetail,
) => void;

export interface WorkspaceAiDocumentContextInput {
  path: string;
  mode: WorkspaceAiContextDocumentMode;
  editable: boolean;
  textLike: boolean;
  stats: WorkspaceAiDocumentStats;
}

export function summarizeDocumentForAi(content: string): WorkspaceAiDocumentStats {
  const trimmed = content.trim();
  const lines = content.length ? content.split(/\r\n|\r|\n/).length : 0;
  const latinWords = trimmed.match(/[A-Za-z0-9_]+(?:[-'][A-Za-z0-9_]+)*/g)?.length ?? 0;
  const cjkUnits = trimmed.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const words = latinWords + cjkUnits;
  return {
    lines,
    words,
    characters: content.length,
    readingMinutes: Math.max(1, Math.ceil(Math.max(words, content.length / 5) / 220)),
  };
}

export function formatDocumentAiContext({
  path,
  mode,
  editable,
  textLike,
  stats,
}: WorkspaceAiDocumentContextInput): string {
  return [
    "@document",
    `path: ${path}`,
    `mode: ${mode}`,
    `editable: ${editable ? "yes" : "no"}`,
    `textLike: ${textLike ? "yes" : "no"}`,
    `lines: ${stats.lines}`,
    `wordsOrCjkUnits: ${stats.words}`,
    `characters: ${stats.characters}`,
    `readingMinutes: ${stats.readingMinutes}`,
    "intent: use the current Tracevane document tab as AI coding/writing context; preserve user control and require diff/review before risky edits",
  ].join("\n");
}

export function buildDocumentAiContextBasketItem({
  path,
  mode,
  editable,
  textLike,
  stats,
}: WorkspaceAiDocumentContextInput): WorkspaceAiContextBasketItem {
  const title = path.split("/").pop() || path;
  return {
    id: `document:${path}`,
    kind: "document",
    path,
    title,
    mode,
    editable,
    textLike,
    stats,
    context: formatDocumentAiContext({ path, mode, editable, textLike, stats }),
    addedAt: new Date().toISOString(),
  };
}

export function readWorkspaceAiContextBasket(): WorkspaceAiContextBasketItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(WORKSPACE_AI_CONTEXT_BASKET_STORAGE_KEY) ||
        "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWorkspaceAiContextBasketItem);
  } catch {
    return [];
  }
}

export function writeWorkspaceAiContextBasket(
  items: WorkspaceAiContextBasketItem[],
): WorkspaceAiContextBasketItem[] {
  const next = items.slice(0, WORKSPACE_AI_CONTEXT_BASKET_LIMIT);
  if (typeof window === "undefined") return next;
  window.localStorage.setItem(
    WORKSPACE_AI_CONTEXT_BASKET_STORAGE_KEY,
    JSON.stringify(next),
  );
  return next;
}

export function subscribeWorkspaceAiContextBasket(
  subscriber: WorkspaceAiContextBasketSubscriber,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onUpdate = (event: Event) => {
    subscriber((event as CustomEvent<WorkspaceAiContextBasketUpdateDetail>).detail);
  };
  window.addEventListener(TRACEVANE_WORKSPACE_AI_CONTEXT_BASKET_EVENT, onUpdate);
  return () =>
    window.removeEventListener(
      TRACEVANE_WORKSPACE_AI_CONTEXT_BASKET_EVENT,
      onUpdate,
    );
}

function dispatchWorkspaceAiContextBasketUpdate(
  detail: WorkspaceAiContextBasketUpdateDetail,
): WorkspaceAiContextBasketUpdateDetail {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(TRACEVANE_WORKSPACE_AI_CONTEXT_BASKET_EVENT, { detail }),
    );
  }
  return detail;
}

export function addDocumentToAiContextBasket(
  input: WorkspaceAiDocumentContextInput,
): WorkspaceAiContextBasketUpdateDetail | null {
  if (typeof window === "undefined") return null;
  const nextItem = buildDocumentAiContextBasketItem(input);
  const items = readWorkspaceAiContextBasket().filter(
    (item) => item.id !== nextItem.id,
  );
  const next = writeWorkspaceAiContextBasket([nextItem, ...items]);
  return dispatchWorkspaceAiContextBasketUpdate({
    action: "add",
    items: next,
    added: nextItem,
  });
}

export function removeWorkspaceAiContextBasketItem(
  itemId: string,
): WorkspaceAiContextBasketUpdateDetail | null {
  if (typeof window === "undefined") return null;
  const items = readWorkspaceAiContextBasket();
  const removed = items.find((item) => item.id === itemId) ?? null;
  const next = writeWorkspaceAiContextBasket(
    items.filter((item) => item.id !== itemId),
  );
  return dispatchWorkspaceAiContextBasketUpdate({
    action: "remove",
    items: next,
    removed,
  });
}

export function clearWorkspaceAiContextBasket(): WorkspaceAiContextBasketUpdateDetail | null {
  if (typeof window === "undefined") return null;
  const next = writeWorkspaceAiContextBasket([]);
  return dispatchWorkspaceAiContextBasketUpdate({
    action: "clear",
    items: next,
  });
}

export function replaceWorkspaceAiContextBasket(
  items: WorkspaceAiContextBasketItem[],
): WorkspaceAiContextBasketUpdateDetail | null {
  if (typeof window === "undefined") return null;
  const next = writeWorkspaceAiContextBasket(items);
  return dispatchWorkspaceAiContextBasketUpdate({
    action: "replace",
    items: next,
  });
}

export function exportWorkspaceAiContextBundle(
  items: WorkspaceAiContextBasketItem[],
): string {
  return items
    .map((item, index) => [
      `# Context ${index + 1}: ${item.title}`,
      item.context,
    ].join("\n"))
    .join("\n\n---\n\n");
}

export function isWorkspaceAiContextBasketItem(
  value: unknown,
): value is WorkspaceAiContextBasketItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<WorkspaceAiContextBasketItem>;
  return (
    item.kind === "document" &&
    typeof item.id === "string" &&
    typeof item.path === "string" &&
    typeof item.title === "string" &&
    typeof item.context === "string" &&
    typeof item.addedAt === "string"
  );
}
