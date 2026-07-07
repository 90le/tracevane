export interface IdeEditorRuntimeHandle {
  save: () => Promise<boolean>;
  focus: () => void;
  runAction?: (actionId: string) => void;
}

const runtimeHandles = new Map<string, IdeEditorRuntimeHandle>();

export function registerIdeEditorRuntimeHandle(
  tabId: string,
  handle: IdeEditorRuntimeHandle,
): () => void {
  runtimeHandles.set(tabId, handle);
  return () => {
    if (runtimeHandles.get(tabId) === handle) runtimeHandles.delete(tabId);
  };
}

export async function saveIdeEditorTab(tabId: string): Promise<boolean> {
  const handle = runtimeHandles.get(tabId);
  if (!handle) return true;
  return handle.save();
}

export function focusIdeEditorTab(tabId: string): void {
  runtimeHandles.get(tabId)?.focus();
}

export function runIdeEditorAction(tabId: string, actionId: string): void {
  const handle = runtimeHandles.get(tabId);
  if (!handle?.runAction) return;
  handle.runAction(actionId);
}
