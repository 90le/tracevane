import { readFile, writeFileContent } from "@/lib/api/files";
import type { FilesReadParams } from "@/lib/api/files";
import type { EditorFileRef, EditorReadResult, EditorSaveRequest, EditorSaveResult } from "./types";
import { editorDocumentId, editorTitleForPath } from "./identity";
import { languageForPath } from "./language";

function isReadonlyByPermissions(permissions: string | null | undefined): boolean {
  if (!permissions) return false;
  const symbolic = permissions.trim();
  return symbolic.length >= 4 && !symbolic.slice(1).includes("w");
}

export async function readEditorFile(
  ref: EditorFileRef,
  signal?: AbortSignal,
  options?: Pick<FilesReadParams, "offset" | "limit">,
): Promise<EditorReadResult> {
  const raw = await readFile({ rootId: ref.rootId, path: ref.path, ...options }, signal);
  return {
    raw,
    snapshot: {
      id: editorDocumentId(ref),
      ref,
      content: raw.content ?? "",
      metadata: {
        name: raw.name || editorTitleForPath(raw.path),
        language: languageForPath(raw.path),
        readonly: !raw.editable || isReadonlyByPermissions(raw.permissions),
        textLike: raw.textLike,
        truncated: raw.truncated,
        size: raw.size,
        modifiedAt: raw.modifiedAt,
        mimeType: raw.mimeType,
        permissions: raw.permissions,
      },
      readAt: raw.checkedAt,
    },
  };
}

export async function saveEditorFile(request: EditorSaveRequest): Promise<EditorSaveResult> {
  const response = await writeFileContent({
    rootId: request.rootId,
    path: request.path,
    content: request.content,
    expectedModifiedAt: request.expectedModifiedAt,
    expectedSize: request.expectedSize,
    force: request.force,
  });
  return {
    ref: { rootId: request.rootId, path: request.path },
    response,
    savedAt: new Date().toISOString(),
  };
}
