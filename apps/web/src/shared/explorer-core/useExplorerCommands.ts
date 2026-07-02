import * as React from "react";
import { useFileOperations } from "@/features/file-manager/file-tools/fileOperations";
import { normalizeExplorerPath } from "./path";
import type { FilesMutationResponse } from "../../../../../types/files";
import type {
  ExplorerCommandOptions,
  ExplorerCommands,
  ExplorerFileRef,
  ExplorerLocation,
  ExplorerOpenTarget,
  ExplorerTransferTarget,
} from "./types";

export function useExplorerCommands(
  options: ExplorerCommandOptions = {},
): ExplorerCommands {
  const operations = useFileOperations();
  const { onAfterMutation, onOpenFile } = options;

  const afterMutation = React.useCallback(
    async <T extends FilesMutationResponse>(result: T): Promise<T> => {
      await onAfterMutation?.(result);
      return result;
    },
    [onAfterMutation],
  );

  const openFile = React.useCallback(
    async (target: ExplorerOpenTarget) => {
      await onOpenFile?.({
        ...target,
        path: normalizeExplorerPath(target.path),
      });
    },
    [onOpenFile],
  );

  const createDirectory = React.useCallback(
    (location: ExplorerLocation, name: string) =>
      operations
        .createDirectory(
          {
            rootId: location.rootId,
            directoryPath: normalizeExplorerPath(location.directoryPath),
          },
          name,
        )
        .then(afterMutation),
    [afterMutation, operations],
  );

  const createFile = React.useCallback(
    (location: ExplorerLocation, name: string, content?: string) =>
      operations
        .createFile(
          {
            rootId: location.rootId,
            directoryPath: normalizeExplorerPath(location.directoryPath),
          },
          name,
          content,
        )
        .then(afterMutation),
    [afterMutation, operations],
  );

  const rename = React.useCallback(
    (target: ExplorerFileRef, nextName: string) =>
      operations
        .rename(
          { rootId: target.rootId, path: normalizeExplorerPath(target.path) },
          nextName,
        )
        .then(afterMutation),
    [afterMutation, operations],
  );

  const copy = React.useCallback(
    (target: ExplorerFileRef, destination: ExplorerTransferTarget) =>
      operations
        .copy(
          { rootId: target.rootId, path: normalizeExplorerPath(target.path) },
          {
            destinationRootId: destination.destinationRootId,
            destinationDirectoryPath: normalizeExplorerPath(
              destination.destinationDirectoryPath,
            ),
            nextName: destination.nextName,
            overwrite: destination.overwrite,
          },
        )
        .then(afterMutation),
    [afterMutation, operations],
  );

  const move = React.useCallback(
    (target: ExplorerFileRef, destination: ExplorerTransferTarget) =>
      operations
        .move(
          { rootId: target.rootId, path: normalizeExplorerPath(target.path) },
          {
            destinationRootId: destination.destinationRootId,
            destinationDirectoryPath: normalizeExplorerPath(
              destination.destinationDirectoryPath,
            ),
            nextName: destination.nextName,
            overwrite: destination.overwrite,
          },
        )
        .then(afterMutation),
    [afterMutation, operations],
  );

  const remove = React.useCallback(
    (input: { rootId: string; paths: string[]; permanent?: boolean }) =>
      operations
        .remove({
          rootId: input.rootId,
          paths: input.paths.map((path) => normalizeExplorerPath(path)),
          permanent: input.permanent,
        })
        .then(afterMutation),
    [afterMutation, operations],
  );

  return {
    openFile,
    createDirectory,
    createFile,
    rename,
    copy,
    move,
    remove,
  };
}
