import type { TerminalResourceTransferPayload } from './terminal-resource-transfer';

export type TerminalPreviewPlacement = 'top' | 'right' | 'bottom';

export interface TerminalFilePreviewTab {
  id: string;
  rootId: string;
  path: string;
  absolutePath: string;
  name: string;
}

export interface TerminalFilePreviewTabWindow<T extends Pick<TerminalFilePreviewTab, 'id'>> {
  startIndex: number;
  endIndex: number;
  visibleTabs: T[];
  hiddenBeforeCount: number;
  hiddenAfterCount: number;
  hiddenCount: number;
}

export interface TerminalFilePreviewSnapshot {
  tabs: TerminalFilePreviewTab[];
  activeTabId: string;
}

const TERMINAL_FILE_PREVIEW_SNAPSHOT_VERSION = 1;
export const TERMINAL_FILE_PREVIEW_SNAPSHOT_LIMIT = 32;

export function createTerminalFilePreviewId(rootId: string, filePath: string): string {
  return `${String(rootId || '').trim()}::${String(filePath || '').trim()}`;
}

export function createTerminalFilePreviewTab(
  payload: TerminalResourceTransferPayload,
): TerminalFilePreviewTab | null {
  if (payload.kind !== 'file') return null;
  const rootId = String(payload.rootId || '').trim();
  const filePath = String(payload.path || '').trim();
  if (!rootId || !filePath) return null;
  return {
    id: createTerminalFilePreviewId(rootId, filePath),
    rootId,
    path: filePath,
    absolutePath: String(payload.absolutePath || '').trim(),
    name: String(payload.name || filePath.split('/').pop() || filePath).trim(),
  };
}

export function parseTerminalFilePreviewSnapshot(
  raw: string | null | undefined,
): TerminalFilePreviewSnapshot | null {
  const normalizedRaw = String(raw || '').trim();
  if (!normalizedRaw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizedRaw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const record = parsed as {
    tabs?: unknown;
    activeTabId?: unknown;
  };
  if (!Array.isArray(record.tabs)) return null;

  const tabs = normalizeTerminalFilePreviewTabs(record.tabs);
  if (!tabs.length) return null;

  const requestedActiveTabId = String(record.activeTabId || '').trim();
  const activeTabId = tabs.some((tab) => tab.id === requestedActiveTabId)
    ? requestedActiveTabId
    : tabs[0]?.id || '';
  return { tabs, activeTabId };
}

export function serializeTerminalFilePreviewSnapshot(
  tabs: readonly TerminalFilePreviewTab[],
  activeTabId: string,
): string {
  const normalizedTabs = normalizeTerminalFilePreviewTabs(tabs);
  if (!normalizedTabs.length) return '';

  const normalizedActiveTabId = String(activeTabId || '').trim();
  const snapshot: TerminalFilePreviewSnapshot & { version: number } = {
    version: TERMINAL_FILE_PREVIEW_SNAPSHOT_VERSION,
    tabs: normalizedTabs,
    activeTabId: normalizedTabs.some((tab) => tab.id === normalizedActiveTabId)
      ? normalizedActiveTabId
      : normalizedTabs[0]?.id || '',
  };
  return JSON.stringify(snapshot);
}

export function resolveNextTerminalFilePreviewTabId(
  tabs: readonly Pick<TerminalFilePreviewTab, 'id'>[],
  activeTabId: string,
  direction: number,
): string {
  const ids = tabs
    .map((tab) => String(tab.id || '').trim())
    .filter(Boolean);
  if (ids.length <= 1) return '';

  const activeIndex = ids.indexOf(String(activeTabId || '').trim());
  if (activeIndex < 0) {
    return direction < 0 ? ids[ids.length - 1] || '' : ids[0] || '';
  }

  const offset = direction < 0 ? -1 : 1;
  return ids[(activeIndex + offset + ids.length) % ids.length] || '';
}

export function resolveTerminalFilePreviewTabWindow<T extends Pick<TerminalFilePreviewTab, 'id'>>(
  tabs: readonly T[],
  activeTabId: string,
  limit: number,
): TerminalFilePreviewTabWindow<T> {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  const tabCount = tabs.length;
  if (tabCount <= normalizedLimit) {
    return {
      startIndex: 0,
      endIndex: tabCount,
      visibleTabs: [...tabs],
      hiddenBeforeCount: 0,
      hiddenAfterCount: 0,
      hiddenCount: 0,
    };
  }

  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId));
  const activeOffset = Math.floor((normalizedLimit - 1) / 2);
  const maxStart = Math.max(0, tabCount - normalizedLimit);
  const startIndex = clampNumber(activeIndex - activeOffset, 0, maxStart);
  const endIndex = Math.min(tabCount, startIndex + normalizedLimit);
  return {
    startIndex,
    endIndex,
    visibleTabs: tabs.slice(startIndex, endIndex),
    hiddenBeforeCount: startIndex,
    hiddenAfterCount: Math.max(0, tabCount - endIndex),
    hiddenCount: Math.max(0, tabCount - (endIndex - startIndex)),
  };
}

function normalizeTerminalFilePreviewTabs(input: readonly unknown[]): TerminalFilePreviewTab[] {
  const tabs: TerminalFilePreviewTab[] = [];
  const seenIds = new Set<string>();

  for (const value of input) {
    const tab = normalizeTerminalFilePreviewTab(value);
    if (!tab || seenIds.has(tab.id)) continue;
    seenIds.add(tab.id);
    tabs.push(tab);
    if (tabs.length >= TERMINAL_FILE_PREVIEW_SNAPSHOT_LIMIT) break;
  }

  return tabs;
}

function normalizeTerminalFilePreviewTab(input: unknown): TerminalFilePreviewTab | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Partial<TerminalFilePreviewTab>;
  const rootId = String(record.rootId || '').trim();
  const filePath = String(record.path || '').trim();
  if (!rootId || !filePath) return null;
  return {
    id: createTerminalFilePreviewId(rootId, filePath),
    rootId,
    path: filePath,
    absolutePath: String(record.absolutePath || '').trim(),
    name: String(record.name || filePath.split('/').pop() || filePath).trim(),
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
