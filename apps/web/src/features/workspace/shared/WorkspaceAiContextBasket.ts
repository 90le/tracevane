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

export interface WorkspaceAiContextBasketUpdateDetail {
  items: WorkspaceAiContextBasketItem[];
  added: WorkspaceAiContextBasketItem;
}

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
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    WORKSPACE_AI_CONTEXT_BASKET_STORAGE_KEY,
    JSON.stringify(items.slice(0, WORKSPACE_AI_CONTEXT_BASKET_LIMIT)),
  );
}

export function addDocumentToAiContextBasket(
  input: WorkspaceAiDocumentContextInput,
): WorkspaceAiContextBasketUpdateDetail | null {
  if (typeof window === "undefined") return null;
  const nextItem = buildDocumentAiContextBasketItem(input);
  const items = readWorkspaceAiContextBasket().filter(
    (item) => item.id !== nextItem.id,
  );
  const next = [nextItem, ...items].slice(0, WORKSPACE_AI_CONTEXT_BASKET_LIMIT);
  writeWorkspaceAiContextBasket(next);
  const detail: WorkspaceAiContextBasketUpdateDetail = {
    items: next,
    added: nextItem,
  };
  window.dispatchEvent(
    new CustomEvent(TRACEVANE_WORKSPACE_AI_CONTEXT_BASKET_EVENT, { detail }),
  );
  return detail;
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
