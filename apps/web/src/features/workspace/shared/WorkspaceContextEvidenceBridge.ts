import type { WorkspaceAiContextBasketItem } from "./WorkspaceAiContextBasket";
import {
  appendWorkspaceEvidence,
  type WorkspaceEvidenceBasketUpdateDetail,
  type WorkspaceEvidenceInput,
} from "./WorkspaceEvidenceBasket";

export interface WorkspaceAiContextEvidenceRef {
  contextId: string;
  path: string;
  title: string;
  mode: WorkspaceAiContextBasketItem["mode"];
  editable: boolean;
  textLike: boolean;
  stats: WorkspaceAiContextBasketItem["stats"];
  context: string;
  addedAt: string;
}

export function buildWorkspaceEvidenceInputFromAiContext(
  item: WorkspaceAiContextBasketItem,
): WorkspaceEvidenceInput {
  return {
    id: `ai-context:${item.id}`,
    source: "ai-context",
    kind: "context",
    title: `AI context · ${item.title}`,
    summary: [
      `Document context for ${item.path}`,
      `mode=${item.mode}`,
      `${item.stats.lines} lines`,
      `${item.stats.words} words/CJK units`,
      `${item.stats.readingMinutes} min read`,
    ].join(" · "),
    refs: buildWorkspaceAiContextEvidenceRef(item),
  };
}

export function buildWorkspaceAiContextEvidenceRef(
  item: WorkspaceAiContextBasketItem,
): WorkspaceAiContextEvidenceRef {
  return {
    contextId: item.id,
    path: item.path,
    title: item.title,
    mode: item.mode,
    editable: item.editable,
    textLike: item.textLike,
    stats: item.stats,
    context: item.context,
    addedAt: item.addedAt,
  };
}

export function buildWorkspaceEvidenceInputsFromAiContextBasket(
  items: WorkspaceAiContextBasketItem[],
): WorkspaceEvidenceInput[] {
  return items.map(buildWorkspaceEvidenceInputFromAiContext);
}

export function appendAiContextToWorkspaceEvidence(
  item: WorkspaceAiContextBasketItem,
): WorkspaceEvidenceBasketUpdateDetail | null {
  return appendWorkspaceEvidence(buildWorkspaceEvidenceInputFromAiContext(item));
}

export function appendAiContextBasketToWorkspaceEvidence(
  items: WorkspaceAiContextBasketItem[],
): WorkspaceEvidenceBasketUpdateDetail | null {
  let latest: WorkspaceEvidenceBasketUpdateDetail | null = null;
  for (const item of [...items].reverse()) {
    latest = appendAiContextToWorkspaceEvidence(item);
  }
  return latest;
}
