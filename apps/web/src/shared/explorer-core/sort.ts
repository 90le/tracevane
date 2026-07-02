import type { FileEntrySummary } from "../../../../../types/files";
import type { ExplorerSortKey, ExplorerSortState } from "./types";

export const EXPLORER_DEFAULT_SORT: ExplorerSortState = {
  key: "name",
  direction: "asc",
};

const EXPLORER_NAME_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function sortExplorerEntries<T extends FileEntrySummary>(
  entries: readonly T[],
  sort: ExplorerSortState = EXPLORER_DEFAULT_SORT,
): T[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const directoryRank =
        Number(right.entry.kind === "directory") - Number(left.entry.kind === "directory");
      if (directoryRank !== 0) return directoryRank;

      const valueCompare = compareExplorerEntryValue(left.entry, right.entry, sort.key);
      if (valueCompare !== 0) {
        return sort.direction === "asc" ? valueCompare : -valueCompare;
      }

      const nameCompare = EXPLORER_NAME_COLLATOR.compare(left.entry.name, right.entry.name);
      if (nameCompare !== 0) return nameCompare;
      return left.index - right.index;
    })
    .map(({ entry }) => entry);
}

export function compareExplorerEntryValue(
  left: FileEntrySummary,
  right: FileEntrySummary,
  key: ExplorerSortKey,
): number {
  if (key === "size") return (left.size ?? 0) - (right.size ?? 0);
  if (key === "modified") return timestamp(left.modifiedAt) - timestamp(right.modifiedAt);
  if (key === "type") return EXPLORER_NAME_COLLATOR.compare(entryType(left), entryType(right));
  if (key === "permissions") {
    return EXPLORER_NAME_COLLATOR.compare(
      `${left.mode} ${left.permissions}`,
      `${right.mode} ${right.permissions}`,
    );
  }
  if (key === "owner") {
    return (left.uid ?? -1) - (right.uid ?? -1) || (left.gid ?? -1) - (right.gid ?? -1);
  }
  return EXPLORER_NAME_COLLATOR.compare(left.name, right.name);
}

function entryType(entry: FileEntrySummary): string {
  return entry.kind === "directory" ? "directory" : entry.ext || "file";
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
