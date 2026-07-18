import * as React from "react";
import { Archive, RefreshCw, RotateCcw } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";
import { toast } from "@/design/ui/sonner";

import {
  useRecoveryBackupsQuery,
  useRestoreRecoveryBackupMutation,
} from "@/lib/query/recovery";
import type { OpenClawRecoveryBackupSummary } from "../types";
import { Panel, PanelHead, formatTime } from "@/design/ui/panel";
import { Pager, formatBytes } from "./shared";

const PAGE_SIZE = 8;

/**
 * Backups list + guarded restore.
 *
 * SAFETY POLICY (locked): restore REWRITES the live config. It is gated behind
 * a strong confirmation that NAMES the backup and states it overwrites the
 * current config (the backend backs up the current config first). The dialog
 * renders the restore result (which backup was restored, the refreshed state's
 * status) as evidence — never one-click, never fake success.
 */
export function BackupsView() {
  const [page, setPage] = React.useState(1);
  const backupsQuery = useRecoveryBackupsQuery(page, PAGE_SIZE);
  const restoreMutation = useRestoreRecoveryBackupMutation();

  const [confirm, setConfirm] = React.useState<OpenClawRecoveryBackupSummary | null>(null);
  const [evidence, setEvidence] = React.useState<{
    backup: OpenClawRecoveryBackupSummary;
    restoredId: string | null;
    statusAfter: string;
  } | null>(null);

  const data = backupsQuery.data;
  const backups = data?.backups ?? [];
  const pagination = data?.pagination;
  const pending = restoreMutation.isPending;

  const runRestore = (backup: OpenClawRecoveryBackupSummary) => {
    restoreMutation.mutate(
      { backupId: backup.id },
      {
        onSuccess: (result) => {
          if (result.ok) {
            setEvidence({
              backup,
              restoredId: result.restoredBackup?.id ?? backup.id,
              statusAfter: result.state.status,
            });
            toast.success("已恢复配置备份", {
              description: `${backup.fileName} · 恢复后状态 ${result.state.status}`,
            });
          } else {
            toast.error("恢复失败", { description: result.error || "恢复未成功完成。" });
          }
        },
        onError: (error) => toast.error("恢复失败", { description: error.message }),
        onSettled: () => setConfirm(null),
      },
    );
  };

  return (
    <div className="grid gap-[18px]">
      <Panel>
        <PanelHead
          title="配置备份与回滚"
          sub="恢复会覆盖当前配置；后端会先备份当前配置"
          action={
            <Button variant="ghost" size="sm" onClick={() => void backupsQuery.refetch()}>
              <RefreshCw className={backupsQuery.isFetching ? "animate-spin" : undefined} />
              刷新
            </Button>
          }
        />
        {backupsQuery.isLoading ? (
          <div className="py-1.5" role="status" aria-busy="true">
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : backupsQuery.error ? (
          <ErrorState
            title="无法加载备份"
            description={backupsQuery.error.message}
            action={
              <Button variant="outline" size="sm" onClick={() => void backupsQuery.refetch()}>
                重试
              </Button>
            }
          />
        ) : backups.length === 0 ? (
          <EmptyState
            icon={<Archive />}
            title="暂无备份"
            description="没有可回滚的备份时，恢复动作无法执行。"
          />
        ) : (
          <>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {backups.map((backup) => (
                <div
                  key={backup.id}
                  className="grid gap-2.5 rounded-md border border-line bg-panel-2 p-3.5 transition-colors duration-[var(--dur-1)] ease-[var(--ease-standard)] hover:border-line-2"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
                      <Archive />
                    </span>
                    <div className="min-w-0 flex-1">
                      <strong
                        className="block truncate text-base text-ink-strong"
                        title={backup.fileName || backup.id}
                      >
                        {backup.fileName || backup.id}
                      </strong>
                      <span className="text-2xs text-subtle">
                        {formatTime(backup.createdAt)}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirm(backup)}
                      disabled={pending}
                    >
                      <RotateCcw />
                      恢复
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Badge variant="mute">{backup.reason || "backup"}</Badge>
                    <span>{formatBytes(backup.sizeBytes)}</span>
                  </div>
                </div>
              ))}
            </div>
            {pagination && (
              <Pager
                page={pagination.page}
                totalPages={pagination.totalPages}
                totalEntries={pagination.totalEntries}
                hasPreviousPage={pagination.hasPreviousPage}
                hasNextPage={pagination.hasNextPage}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => p + 1)}
                pending={backupsQuery.isFetching}
              />
            )}
          </>
        )}
      </Panel>

      {/* Evidence from the most recent restore. */}
      {evidence && (
        <Panel>
          <PanelHead title="恢复证据" sub="最近一次恢复的结果" />
          <div className="grid gap-1.5 p-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="ok">已恢复</Badge>
              <span className="truncate text-ink-strong">{evidence.backup.fileName}</span>
            </div>
            <p className="text-muted">
              <span className="text-subtle">恢复的备份 id：</span>
              <code className="break-all font-mono text-xs text-ink-strong">{evidence.restoredId}</code>
            </p>
            <p className="text-muted">
              <span className="text-subtle">恢复后平台守护状态：</span>
              {evidence.statusAfter}
            </p>
          </div>
        </Panel>
      )}

      {/* Strong restore confirmation. */}
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && !pending && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-warning-soft text-warning [&_svg]:size-4">
              <RotateCcw />
            </span>
            <DialogTitle>恢复配置备份</DialogTitle>
          </DialogHeader>
          <DialogBody>
            将使用备份
            <strong className="text-ink-strong"> {confirm?.fileName} </strong>
            （{formatTime(confirm?.createdAt)}）覆盖当前 OpenClaw 配置。后端会在覆盖前先备份当前配置，并返回恢复结果作为证据。该操作可能影响正在运行的会话凭据。确认恢复？
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={pending}>
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => confirm && runRestore(confirm)}
              disabled={pending}
            >
              {pending ? "恢复中…" : "确认恢复"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
