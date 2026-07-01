import type { EditorDirtyState } from "./types";

export function createCleanDirtyState(content: string, modifiedAt: string | null): EditorDirtyState {
  return {
    saveState: "clean",
    dirty: false,
    lastSavedContent: content,
    lastSavedModifiedAt: modifiedAt,
    error: null,
  };
}

export function markDirtyStateChanged(state: EditorDirtyState, currentContent: string): EditorDirtyState {
  const dirty = currentContent !== state.lastSavedContent;
  return {
    ...state,
    dirty,
    saveState: dirty ? "dirty" : "clean",
    error: dirty ? null : state.error,
  };
}

export function markDirtyStateSaving(state: EditorDirtyState): EditorDirtyState {
  return { ...state, saveState: "saving", error: null };
}

export function markDirtyStateSaved(
  state: EditorDirtyState,
  content: string,
  modifiedAt: string | null,
): EditorDirtyState {
  return {
    ...state,
    saveState: "saved",
    dirty: false,
    lastSavedContent: content,
    lastSavedModifiedAt: modifiedAt,
    error: null,
  };
}

export function markDirtyStateError(state: EditorDirtyState, error: unknown): EditorDirtyState {
  return {
    ...state,
    saveState: "error",
    dirty: true,
    error: error instanceof Error ? error.message : String(error),
  };
}
