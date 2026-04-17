import { ref } from "vue";

export type ConfirmDialogTone = "default" | "danger";

export interface ConfirmDialogOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmDialogTone;
}

interface ActiveConfirmDialogState extends ConfirmDialogOptions {
  resolve: (accepted: boolean) => void;
}

export const activeConfirmDialog = ref<ActiveConfirmDialogState | null>(null);

export function confirm(options: ConfirmDialogOptions): Promise<boolean> {
  if (activeConfirmDialog.value) {
    const previous = activeConfirmDialog.value;
    activeConfirmDialog.value = null;
    previous.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    activeConfirmDialog.value = {
      confirmText: "确认",
      cancelText: "取消",
      tone: "default",
      ...options,
      resolve,
    };
  });
}

export function useConfirmDialog() {
  return {
    confirm,
  };
}

export function confirmAccept(): void {
  if (!activeConfirmDialog.value) return;
  const current = activeConfirmDialog.value;
  activeConfirmDialog.value = null;
  current.resolve(true);
}

export function confirmCancel(): void {
  if (!activeConfirmDialog.value) return;
  const current = activeConfirmDialog.value;
  activeConfirmDialog.value = null;
  current.resolve(false);
}
