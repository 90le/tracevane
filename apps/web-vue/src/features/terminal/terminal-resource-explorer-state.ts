export interface TerminalResourceExplorerSnapshot {
  rootId: string;
  expandedPaths: string[];
  selectedPath: string;
  showHidden: boolean;
}

const TERMINAL_RESOURCE_EXPLORER_SNAPSHOT_VERSION = 1;
export const TERMINAL_RESOURCE_EXPLORER_EXPANDED_PATH_LIMIT = 64;

export function parseTerminalResourceExplorerSnapshot(
  raw: string | null | undefined,
): TerminalResourceExplorerSnapshot | null {
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
    rootId?: unknown;
    expandedPaths?: unknown;
    selectedPath?: unknown;
    showHidden?: unknown;
  };
  const rootId = String(record.rootId || '').trim();
  if (!rootId) return null;

  return {
    rootId,
    expandedPaths: normalizeExpandedPaths(record.expandedPaths),
    selectedPath: normalizeResourcePath(String(record.selectedPath || '')),
    showHidden: record.showHidden !== false,
  };
}

export function serializeTerminalResourceExplorerSnapshot(
  input: TerminalResourceExplorerSnapshot,
): string {
  const rootId = String(input.rootId || '').trim();
  if (!rootId) return '';

  return JSON.stringify({
    version: TERMINAL_RESOURCE_EXPLORER_SNAPSHOT_VERSION,
    rootId,
    expandedPaths: normalizeExpandedPaths(input.expandedPaths),
    selectedPath: normalizeResourcePath(input.selectedPath),
    showHidden: input.showHidden !== false,
  });
}

function normalizeExpandedPaths(value: unknown): string[] {
  const rawPaths = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value)
          .filter(([, expanded]) => Boolean(expanded))
          .map(([path]) => path)
      : [];
  const expandedPaths = new Set<string>();

  for (const rawPath of rawPaths) {
    const path = normalizeResourcePath(String(rawPath || ''));
    if (!path) continue;
    const parts = path.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      expandedPaths.add(current);
      if (expandedPaths.size >= TERMINAL_RESOURCE_EXPLORER_EXPANDED_PATH_LIMIT) {
        return Array.from(expandedPaths);
      }
    }
  }

  return Array.from(expandedPaths);
}

function normalizeResourcePath(path: string): string {
  return String(path || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/g, '')
    .replace(/\/+$/g, '');
}
