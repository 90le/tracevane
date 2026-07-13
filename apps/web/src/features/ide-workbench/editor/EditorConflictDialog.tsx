import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";

import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { MonacoDiffPanel } from "@/shared/diff";

export interface EditorConflictDialogProps {
  open: boolean;
  path: string;
  language: string;
  diskContent: string;
  editorContent: string;
  message: string;
  busy?: boolean;
  onCancel: () => void;
  onReload: () => void | Promise<void>;
  onOverwrite: () => void | Promise<void>;
}

export function EditorConflictDialog({
  open,
  path,
  language,
  diskContent,
  editorContent,
  message,
  busy = false,
  onCancel,
  onReload,
  onOverwrite,
}: EditorConflictDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <DialogContent
        className="grid h-[min(720px,92vh)] w-[min(1120px,96vw)] grid-rows-[auto_auto_minmax(0,1fr)_auto] bg-panel p-0"
        data-ide-editor-conflict-dialog
      >
        <DialogHeader className="items-start border-b border-line px-4 pb-3 pt-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-md bg-amber-soft text-amber">
            <ShieldAlert className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base">检测到保存冲突</DialogTitle>
            <DialogDescription className="mt-1 text-sm">
              磁盘文件已变化。请先对比，再选择重新读取磁盘版本、覆盖保存当前编辑器内容或取消。
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="grid gap-2 border-b border-line bg-panel-2 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-amber">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span className="font-medium">已阻止静默覆盖。</span>
            <span className="min-w-0 truncate text-muted">{message}</span>
          </div>
          <div className="truncate rounded-md border border-line bg-canvas px-3 py-2 font-mono text-2xs text-subtle" data-ide-editor-conflict-path>
            {path}
          </div>
        </DialogBody>
        <div className="min-h-0 min-w-0 p-3" data-ide-editor-conflict-diff>
          <MonacoDiffPanel
            original={diskContent}
            modified={editorContent}
            language={language || "plaintext"}
            originalLabel="磁盘当前版本"
            modifiedLabel="当前编辑器内容"
          />
        </div>
        <DialogFooter className="border-t border-line bg-panel-2 px-4 py-3">
          <Button variant="ghost" onClick={onCancel} disabled={busy} data-ide-editor-conflict-cancel>
            取消
          </Button>
          <Button variant="outline" onClick={() => void onReload()} disabled={busy} data-ide-editor-conflict-reload>
            <RefreshCw />
            重新读取磁盘
          </Button>
          <Button variant="danger" onClick={() => void onOverwrite()} disabled={busy} data-ide-editor-conflict-overwrite>
            覆盖保存当前内容
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
