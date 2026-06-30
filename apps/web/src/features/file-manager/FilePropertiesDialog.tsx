import * as React from "react";
import { Copy, File, Folder } from "lucide-react";

import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { toast } from "@/design/ui/sonner";
import type { FileActionsMenuTarget, FileEntrySummary } from "@/features/file-manager/file-tools";

export function FilePropertiesDialog({
  entry,
  rootLabel,
  displayPath,
  onOpenChange,
}: {
  entry: FilePropertiesEntry | undefined;
  rootLabel: string;
  displayPath: string;
  onOpenChange: (open: boolean) => void;
}) {
  if (!entry) return null;

  const properties = buildFileProperties(entry, rootLabel, displayPath);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,560px)] max-w-none overflow-hidden p-0">
        <DialogHeader className="border-b border-line bg-panel-2 px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-panel text-primary">
              {entry.kind === "directory" ? <Folder className="size-5" /> : <File className="size-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base">{entry.name}</DialogTitle>
              <p className="mt-1 truncate text-xs text-muted" title={displayPath}>{displayPath}</p>
            </div>
          </div>
        </DialogHeader>
        <DialogBody className="grid gap-4 p-4">
          <section className="rounded-md border border-line bg-panel-2 p-3">
            <div className="text-xs font-semibold text-ink-strong">基本信息</div>
            <dl className="mt-3 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
              {properties.map((property) => (
                <React.Fragment key={property.label}>
                  <dt className="text-subtle">{property.label}</dt>
                  <dd className="min-w-0 break-words text-muted" title={property.value}>{property.value}</dd>
                </React.Fragment>
              ))}
            </dl>
          </section>
          <section className="rounded-md border border-line bg-panel-2 p-3">
            <div className="text-xs font-semibold text-ink-strong">能力</div>
            <div className="mt-2 flex flex-wrap gap-2 text-2xs">
              <Capability label="可检查" enabled={entry.kind === "file" && (Boolean(entry.textLike) || Boolean(entry.imageLike) || Boolean(entry.ext))} />
              <Capability label="可编辑文本" enabled={entry.kind === "file" && Boolean(entry.textLike)} />
              <Capability label="隐藏项目" enabled={Boolean(entry.hidden)} />
              <Capability label="目录" enabled={entry.kind === "directory"} />
            </div>
          </section>
        </DialogBody>
        <DialogFooter className="border-t border-line bg-panel-2 px-4 py-3">
          <Button variant="outline" onClick={() => copyPropertyText(entry.path, "相对路径已复制")}>复制相对路径</Button>
          <Button variant="outline" onClick={() => copyPropertyText(displayPath, "显示路径已复制")}>复制显示路径</Button>
          <Button onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type FilePropertiesEntry = FileEntrySummary | (FileActionsMenuTarget & Partial<Pick<FileEntrySummary, "ext" | "size" | "modifiedAt" | "hidden" | "textLike" | "imageLike" | "mode" | "permissions" | "uid" | "gid">>);

function Capability({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span className={enabled ? "rounded-full bg-primary-soft px-2 py-0.5 text-primary" : "rounded-full bg-panel px-2 py-0.5 text-subtle"}>
      {label}{enabled ? "" : "：否"}
    </span>
  );
}

function buildFileProperties(entry: FilePropertiesEntry, rootLabel: string, displayPath: string) {
  return [
    { label: "名称", value: entry.name },
    { label: "位置", value: displayPath },
    { label: "Root", value: rootLabel || "—" },
    { label: "类型", value: entry.kind === "directory" ? "目录" : entry.ext ? `${entry.ext} 文件` : "文件" },
    { label: "大小", value: entry.kind === "file" ? formatBytes(entry.size ?? 0) : "目录大小未计算" },
    { label: "修改时间", value: entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString() : "—" },
    { label: "权限", value: entry.permissions ? `${entry.permissions} (${entry.mode ?? "—"})` : entry.mode ?? "—" },
    { label: "UID / GID", value: entry.uid != null || entry.gid != null ? `${entry.uid ?? "—"} / ${entry.gid ?? "—"}` : "—" },
    { label: "隐藏", value: entry.hidden ? "是" : "否" },
    { label: "相对路径", value: entry.path || "/" },
  ];
}

function copyPropertyText(text: string, message: string) {
  void navigator.clipboard?.writeText(text).then(() => toast.success(message)).catch((error) => {
    toast.error("复制失败", { description: error instanceof Error ? error.message : String(error) });
  });
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
