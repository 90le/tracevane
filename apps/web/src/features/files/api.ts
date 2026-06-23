import { toast } from "@/design/ui/sonner";
import {
  useArchiveFilesMutation,
  useCopyFileMutation,
  useCreateDirectoryMutation,
  useCreateFileMutation,
  useDeleteFilesMutation,
  useMoveFileMutation,
  useRenameFileMutation,
  useUnarchiveFileMutation,
  useUploadFilesMutation,
  useWriteFileContentMutation,
} from "@/lib/query/files";
import type {
  FilesCreateDirectoryPayload,
  FilesCreateFilePayload,
  FilesDeletePayload,
  FilesMutationResponse,
  FilesRenamePayload,
  FilesTransferPayload,
  FilesUploadItemPayload,
  FilesWritePayload,
} from "../../../../../types/files";

/**
 * Reusable file-operations primitive — a single orchestration hook that wraps
 * every Files write mutation in {@link @/lib/query/files} and surfaces unified
 * success/error evidence (sonner toasts) so UI surfaces (the Workspace IDE
 * Explorer, the future full `/files` manager) don't each reimplement the
 * toast plumbing.
 *
 * Every exposed function:
 *  - accepts a small, ergonomic ctx object + the user-facing inputs;
 *  - maps those onto the exact wire payload from `types/files.ts`;
 *  - awaits the corresponding mutation hook's `mutateAsync`;
 *  - toasts `"<action>成功"` with the first affected path (or the input name)
 *    on success and `"<action>失败"` with the error message on failure;
 *  - returns the raw {@link FilesMutationResponse} (and rethrows on error so
 *    callers can chain `.then`/`await` for post-success work like navigation).
 *
 * This file contains NO UI/JSX — it is a logic/orchestration hook only.
 */

// --- ctx shapes (ergonomic; mapped onto wire payloads internally) -----------

interface DirectoryCtx {
  rootId: string;
  directoryPath?: string;
}

interface PathCtx {
  rootId: string;
  path: string;
}

interface TransferDest {
  destinationRootId: string;
  destinationDirectoryPath?: string;
  nextName?: string;
  overwrite?: boolean;
}

interface RemoveCtx {
  rootId: string;
  paths: string[];
}

interface ArchiveCtx {
  rootId: string;
  directoryPath?: string;
  paths: string[];
}

interface UnarchiveCtx {
  rootId: string;
  archivePath: string;
  directoryPath?: string;
  destinationDirectoryPath?: string;
}

// --- helpers ---------------------------------------------------------------

/** Centralized success/failure evidence so wrappers stay one-line. */
function withEvidence<T extends FilesMutationResponse>(
  action: string,
  fallbackDescription: string,
  run: () => Promise<T>,
): Promise<T> {
  return run()
    .then((r) => {
      toast.success(`${action}成功`, {
        description: r.affectedPaths?.[0] ?? fallbackDescription,
      });
      return r;
    })
    .catch((e: unknown) => {
      toast.error(`${action}失败`, {
        description: e instanceof Error ? e.message : String(e),
      });
      throw e;
    });
}

// --- the hook --------------------------------------------------------------

/**
 * Unified file-operations hook. Returns typed async functions that perform the
 * underlying mutation and surface success/error toasts. Each function rethrows
 * on failure so callers can react; on success it resolves to the raw
 * {@link FilesMutationResponse}.
 */
export function useFileOperations() {
  const writeM = useWriteFileContentMutation();
  const mkdirM = useCreateDirectoryMutation();
  const createFileM = useCreateFileMutation();
  const renameM = useRenameFileMutation();
  const copyM = useCopyFileMutation();
  const moveM = useMoveFileMutation();
  const deleteM = useDeleteFilesMutation();
  const archiveM = useArchiveFilesMutation();
  const unarchiveM = useUnarchiveFileMutation();
  const uploadM = useUploadFilesMutation();

  /** Create a directory under a root (+ optional parent path). */
  function createDirectory(
    ctx: DirectoryCtx,
    name: string,
  ): Promise<FilesMutationResponse> {
    const payload: FilesCreateDirectoryPayload = {
      rootId: ctx.rootId,
      directoryPath: ctx.directoryPath,
      name,
    };
    return withEvidence("创建目录", name, () => mkdirM.mutateAsync(payload));
  }

  /** Create a file (optionally seeded with content). */
  function createFile(
    ctx: DirectoryCtx,
    name: string,
    content?: string,
  ): Promise<FilesMutationResponse> {
    const payload: FilesCreateFilePayload = {
      rootId: ctx.rootId,
      directoryPath: ctx.directoryPath,
      name,
      content,
    };
    return withEvidence("创建文件", name, () => createFileM.mutateAsync(payload));
  }

  /** Rename a path (keeps the parent; changes the final segment). */
  function rename(
    ctx: PathCtx,
    nextName: string,
  ): Promise<FilesMutationResponse> {
    const payload: FilesRenamePayload = {
      rootId: ctx.rootId,
      path: ctx.path,
      nextName,
    };
    return withEvidence("重命名", nextName, () => renameM.mutateAsync(payload));
  }

  /** Copy a path into (possibly) another root / directory, optionally renamed. */
  function copy(
    ctx: PathCtx,
    dest: TransferDest,
  ): Promise<FilesMutationResponse> {
    const payload: FilesTransferPayload = {
      sourceRootId: ctx.rootId,
      sourcePath: ctx.path,
      destinationRootId: dest.destinationRootId,
      destinationDirectoryPath: dest.destinationDirectoryPath,
      nextName: dest.nextName,
      overwrite: dest.overwrite,
    };
    return withEvidence(
      "复制",
      dest.nextName ?? ctx.path,
      () => copyM.mutateAsync(payload),
    );
  }

  /** Move a path into (possibly) another root / directory, optionally renamed. */
  function move(
    ctx: PathCtx,
    dest: TransferDest,
  ): Promise<FilesMutationResponse> {
    const payload: FilesTransferPayload = {
      sourceRootId: ctx.rootId,
      sourcePath: ctx.path,
      destinationRootId: dest.destinationRootId,
      destinationDirectoryPath: dest.destinationDirectoryPath,
      nextName: dest.nextName,
      overwrite: dest.overwrite,
    };
    return withEvidence(
      "移动",
      dest.nextName ?? ctx.path,
      () => moveM.mutateAsync(payload),
    );
  }

  /** Delete one or more paths under a root. */
  function remove(ctx: RemoveCtx): Promise<FilesMutationResponse> {
    const payload: FilesDeletePayload = {
      rootId: ctx.rootId,
      paths: ctx.paths,
    };
    return withEvidence(
      "删除",
      ctx.paths[0] ?? "",
      () => deleteM.mutateAsync(payload),
    );
  }

  /** Archive one or more paths into a single archive under a root. */
  function archive(
    ctx: ArchiveCtx,
    name: string,
  ): Promise<FilesMutationResponse> {
    const payload = {
      rootId: ctx.rootId,
      directoryPath: ctx.directoryPath,
      paths: ctx.paths,
      name,
    };
    return withEvidence("归档", name, () => archiveM.mutateAsync(payload));
  }

  /** Unarchive a single archive (optionally into a different directory). */
  function unarchive(ctx: UnarchiveCtx): Promise<FilesMutationResponse> {
    const payload = {
      rootId: ctx.rootId,
      archivePath: ctx.archivePath,
      directoryPath: ctx.directoryPath,
      destinationDirectoryPath: ctx.destinationDirectoryPath,
    };
    return withEvidence(
      "解归档",
      ctx.archivePath,
      () => unarchiveM.mutateAsync(payload),
    );
  }

  /** Overwrite a file's content (the IDE save path). */
  function saveContent(
    ctx: PathCtx,
    content: string,
  ): Promise<FilesMutationResponse> {
    const payload: FilesWritePayload = {
      rootId: ctx.rootId,
      path: ctx.path,
      content,
    };
    return withEvidence("保存", ctx.path, () => writeM.mutateAsync(payload));
  }

  /** Upload one or more base64-encoded files under a root (+ optional path). */
  function upload(
    ctx: DirectoryCtx,
    items: FilesUploadItemPayload[],
  ): Promise<FilesMutationResponse> {
    const payload = {
      rootId: ctx.rootId,
      directoryPath: ctx.directoryPath,
      files: items,
    };
    return withEvidence(
      "上传",
      items[0]?.fileName ?? "",
      () => uploadM.mutateAsync(payload),
    );
  }

  return {
    createDirectory,
    createFile,
    rename,
    copy,
    move,
    remove,
    archive,
    unarchive,
    saveContent,
    upload,
  };
}
