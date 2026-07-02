import * as React from "react";
import { useFilesBrowseQuery } from "@/lib/query/files";
import { normalizeExplorerPath, toExplorerEntry } from "./path";
import { EXPLORER_DEFAULT_SORT, sortExplorerEntries } from "./sort";
import type {
  ExplorerDirectoryOptions,
  ExplorerDirectoryResult,
  ExplorerLocation,
  ExplorerSortKey,
} from "./types";

function apiSortKeyFor(sortKey: ExplorerSortKey): "name" | "size" | "modifiedAt" {
  if (sortKey === "modified") return "modifiedAt";
  if (sortKey === "name" || sortKey === "size") return sortKey;
  return "name";
}

export function useExplorerDirectory(
  options: ExplorerDirectoryOptions,
): ExplorerDirectoryResult {
  const location = React.useMemo<ExplorerLocation>(
    () => ({
      rootId: options.rootId ?? "",
      directoryPath: normalizeExplorerPath(options.directoryPath),
    }),
    [options.directoryPath, options.rootId],
  );
  const sort = options.sort ?? EXPLORER_DEFAULT_SORT;
  const apiSortKey = apiSortKeyFor(sort.key);

  const query = useFilesBrowseQuery(
    location.rootId
      ? {
          rootId: location.rootId,
          path: location.directoryPath,
          hidden: options.hidden,
          page: options.page,
          pageSize: options.pageSize,
          sortKey: apiSortKey,
          sortDirection: sort.direction,
        }
      : null,
    { enabled: Boolean(location.rootId) && (options.enabled ?? true) },
  );

  const entries = React.useMemo(
    () =>
      sortExplorerEntries(query.data?.entries ?? [], sort).map((entry) =>
        toExplorerEntry(entry, location),
      ),
    [location, query.data?.entries, sort],
  );

  return {
    location,
    root: query.data?.root ?? null,
    absolutePath: query.data?.absolutePath ?? "",
    parentPath: query.data?.parentPath ?? null,
    breadcrumbs: query.data?.breadcrumbs ?? [],
    counts: query.data?.counts ?? null,
    pagination: query.data?.pagination ?? null,
    entries,
    checkedAt: query.data?.checkedAt ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ?? null,
    refresh: query.refetch,
    raw: query.data ?? null,
  };
}
