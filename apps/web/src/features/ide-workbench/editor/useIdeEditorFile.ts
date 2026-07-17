import { useQuery } from "@tanstack/react-query";

import { readEditorFile } from "@/shared/editor-core";
import type { EditorFileRef, EditorReadResult } from "@/shared/editor-core";

function ideEditorFileQueryKey(ref: EditorFileRef) {
  return ["ide-workbench", "editor-file", ref.rootId, ref.path] as const;
}

export function useIdeEditorFile(ref: EditorFileRef, enabled = true) {
  return useQuery<EditorReadResult, Error>({
    queryKey: ideEditorFileQueryKey(ref),
    queryFn: ({ signal }) => readEditorFile(ref, signal),
    enabled: enabled && Boolean(ref.rootId && ref.path),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}
