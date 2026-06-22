import * as React from "react";
import {
  ArchiveRestore,
  CheckCircle2,
  Eye,
  RotateCcw,
  Upload,
} from "lucide-react";

import { Badge } from "@/design/ui/badge";
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
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/design/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design/ui/table";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";
import { cn } from "@/design/lib/utils";
import { toast } from "@/design/ui/sonner";

import {
  useApplyModelGatewayAppConnectionMutation,
  useModelGatewayAppConnectionsQuery,
  useRollbackModelGatewayAppConnectionMutation,
  useUpdateModelGatewayAppConnectionProfileMutation,
} from "@/lib/query/model-gateway";
import type {
  ModelGatewayAppConnection,
  ModelGatewayAppConnectionId,
} from "../types";
import type { ModelGatewayViewProps } from "./types";

/** Status pill from live `configured` + issues. */
function connectionStatus(connection: ModelGatewayAppConnection): {
  variant: "ok" | "warn" | "bad" | "mute";
  label: string;
} {
  if (connection.issues.length > 0) return { variant: "bad", label: "有问题" };
  if (connection.configured) return { variant: "ok", label: "已应用" };
  return { variant: "warn", label: "未应用" };
}

/** Preview sheet: shows the exact target path and the redacted config preview. */
function PreviewSheet({
  connection,
  onClose,
}: {
  connection: ModelGatewayAppConnection | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={Boolean(connection)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {connection && (
          <>
            <SheetHeader>
              <div className="min-w-0">
                <SheetTitle>预览 · {connection.label}</SheetTitle>
                <SheetDescription>将写入的配置内容（敏感字段已脱敏）。</SheetDescription>
              </div>
            </SheetHeader>
            <SheetBody>
              <div className="grid gap-1">
                <span className="text-xs uppercase tracking-wide text-subtle">目标配置文件</span>
                <code className="break-all rounded-sm bg-panel-3 px-2 py-1.5 font-mono text-sm text-ink-strong">
                  {connection.preview.targetPath}
                </code>
                <span className="text-xs text-subtle">
                  格式：{connection.preview.format.toUpperCase()} ·{" "}
                  {connection.target.exists ? "文件已存在（应用时会先备份）" : "文件不存在（将新建）"}
                </span>
              </div>
              <div className="grid gap-1">
                <span className="text-xs uppercase tracking-wide text-subtle">内容预览</span>
                <pre className="max-h-[52vh] overflow-auto rounded-md border border-line bg-panel-3 p-3 font-mono text-xs leading-relaxed text-ink">
                  {connection.preview.content}
                </pre>
              </div>
              {connection.issues.length > 0 && (
                <div className="grid gap-1 rounded-md border border-line bg-red-soft p-3 text-sm text-red">
                  {connection.issues.map((issue, i) => (
                    <span key={i}>{issue}</span>
                  ))}
                </div>
              )}
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" size="sm" onClick={onClose} className="ml-auto">
                关闭
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Confirmation dialog for dangerous writes (apply / rollback). It NAMES the
 * target config file and the backup/restore behavior before the write runs.
 */
function ConfirmWriteDialog({
  kind,
  connection,
  pending,
  onConfirm,
  onClose,
}: {
  kind: "apply" | "rollback" | null;
  connection: ModelGatewayAppConnection | null;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const open = Boolean(kind && connection);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {kind && connection && (
          <>
            <DialogHeader>
              <DialogTitle>
                {kind === "apply" ? "应用网关路由" : "回滚网关路由"}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <DialogDescription className="grid gap-2">
                <span>
                  即将{kind === "apply" ? "写入" : "回滚"} <strong>{connection.label}</strong> 的配置文件：
                </span>
                <code className="break-all rounded-sm bg-panel-3 px-2 py-1.5 font-mono text-sm text-ink-strong">
                  {connection.target.path}
                </code>
                {kind === "apply" ? (
                  <span>
                    {connection.target.exists
                      ? "当前文件会先备份，再写入新的网关路由配置。备份路径将在完成后显示。"
                      : "目标文件当前不存在，将新建并写入网关路由配置。"}
                  </span>
                ) : (
                  <span>
                    将从最近一次备份
                    {connection.lastBackupPath ? (
                      <code className="mx-1 break-all rounded-sm bg-panel-3 px-1.5 py-0.5 font-mono text-xs">
                        {connection.lastBackupPath}
                      </code>
                    ) : (
                      " "
                    )}
                    恢复该文件，撤销网关路由接入。
                  </span>
                )}
              </DialogDescription>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
                取消
              </Button>
              <Button
                variant={kind === "apply" ? "primary" : "danger"}
                size="sm"
                onClick={onConfirm}
                disabled={pending}
              >
                {pending ? "执行中…" : kind === "apply" ? "确认应用" : "确认回滚"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ConnectionRowProps {
  connection: ModelGatewayAppConnection;
  availableModels: string[];
  highlighted: boolean;
  rowRef?: React.Ref<HTMLTableRowElement>;
  onPreview: () => void;
  onApply: () => void;
  onRollback: () => void;
  onSelectModel: (model: string) => void;
  modelPending: boolean;
}

function ConnectionRow({
  connection,
  availableModels,
  highlighted,
  rowRef,
  onPreview,
  onApply,
  onRollback,
  onSelectModel,
  modelPending,
}: ConnectionRowProps) {
  const status = connectionStatus(connection);
  return (
    <TableRow
      ref={rowRef}
      data-state={highlighted ? "selected" : undefined}
      className={cn(highlighted && "scroll-mt-24")}
    >
      <TableCell>
        <div className="grid min-w-0 gap-0.5">
          <strong className="truncate text-base text-ink-strong">{connection.label}</strong>
          <code className="truncate font-mono text-sm text-muted" title={connection.target.path}>
            {connection.target.path}
          </code>
        </div>
      </TableCell>
      <TableCell>
        <span className="mr-1.5 text-xs text-subtle sm:hidden">模型</span>
        <select
          className="h-9 max-w-[200px] rounded-sm border border-line bg-panel-2 px-2 text-sm text-ink-strong outline-none focus-visible:border-primary-line focus-visible:shadow-[var(--ring)] disabled:opacity-50"
          value={connection.model ?? ""}
          disabled={modelPending || availableModels.length === 0}
          onChange={(e) => onSelectModel(e.target.value)}
        >
          <option value="">默认（继承全局）</option>
          {availableModels.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <span className="mr-1.5 text-xs text-subtle sm:hidden">状态</span>
        <Badge variant={status.variant}>{status.label}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={onPreview}>
            <Eye />
            预览
          </Button>
          <Button
            variant={connection.configured ? "ghost" : "primary"}
            size="sm"
            onClick={onApply}
            disabled={!connection.canApply}
          >
            <Upload />
            {connection.configured ? "重新应用" : "应用"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRollback}
            disabled={!connection.canRollback}
          >
            <RotateCcw />
            回滚
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

interface WriteResult {
  kind: "apply" | "rollback";
  label: string;
  backupPath: string | null;
  restoredFrom: string | null;
}

/** Result sheet surfacing the explicit backup/restore evidence after a write. */
function ResultSheet({
  result,
  onClose,
}: {
  result: WriteResult | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={Boolean(result)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {result && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-green" />
                <SheetTitle>
                  {result.kind === "apply" ? "已应用" : "已回滚"} · {result.label}
                </SheetTitle>
              </div>
            </SheetHeader>
            <SheetBody>
              {result.kind === "apply" ? (
                <div className="grid gap-1">
                  <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-subtle">
                    <ArchiveRestore className="size-3.5" />
                    备份路径
                  </span>
                  {result.backupPath ? (
                    <code className="break-all rounded-sm bg-panel-3 px-2 py-1.5 font-mono text-sm text-ink-strong">
                      {result.backupPath}
                    </code>
                  ) : (
                    <span className="text-sm text-muted">无（目标文件原本不存在，未产生备份）。</span>
                  )}
                  <span className="text-xs text-subtle">如需撤销本次写入，可对该客户端执行「回滚」。</span>
                </div>
              ) : (
                <div className="grid gap-1">
                  <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-subtle">
                    <ArchiveRestore className="size-3.5" />
                    已从备份恢复
                  </span>
                  {result.restoredFrom ? (
                    <code className="break-all rounded-sm bg-panel-3 px-2 py-1.5 font-mono text-sm text-ink-strong">
                      {result.restoredFrom}
                    </code>
                  ) : (
                    <span className="text-sm text-muted">无可恢复的备份记录。</span>
                  )}
                </div>
              )}
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" size="sm" onClick={onClose} className="ml-auto">
                关闭
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Client App Connection child page. Lists each client (Codex / Claude Code /
 * OpenCode / OpenClaw) with its configured state, target config path and
 * resolved model. Apply and rollback are dangerous writes, so they go through a
 * confirmation dialog naming the target file + backup behavior, and surface the
 * backupPath / restoredFrom evidence afterward. A `?app=` deep link highlights
 * and scrolls the matching row. No data is fabricated — everything comes from
 * `useModelGatewayAppConnectionsQuery` and the mutation responses.
 */
export function AppConnectionsView({ selectedApp }: ModelGatewayViewProps) {
  const connectionsQuery = useModelGatewayAppConnectionsQuery();
  const applyMutation = useApplyModelGatewayAppConnectionMutation();
  const rollbackMutation = useRollbackModelGatewayAppConnectionMutation();
  const profileMutation = useUpdateModelGatewayAppConnectionProfileMutation();

  const [previewId, setPreviewId] = React.useState<ModelGatewayAppConnectionId | null>(null);
  const [confirm, setConfirm] = React.useState<{
    kind: "apply" | "rollback";
    id: ModelGatewayAppConnectionId;
  } | null>(null);
  const [result, setResult] = React.useState<WriteResult | null>(null);
  const [modelPendingId, setModelPendingId] =
    React.useState<ModelGatewayAppConnectionId | null>(null);

  const highlightRef = React.useRef<HTMLTableRowElement | null>(null);

  // Deep-link: scroll the `?app=` row into view once data is available.
  React.useEffect(() => {
    if (selectedApp && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedApp, connectionsQuery.data]);

  if (connectionsQuery.isLoading) {
    return <LoadingState title="加载客户端接入…" />;
  }

  if (connectionsQuery.error) {
    return (
      <ErrorState
        title="无法加载客户端接入"
        description={connectionsQuery.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => void connectionsQuery.refetch()}>
            重试
          </Button>
        }
      />
    );
  }

  const data = connectionsQuery.data;
  const connections = data?.connections ?? [];
  const availableModels = data?.availableModels ?? [];

  const previewConnection = previewId
    ? connections.find((c) => c.id === previewId) ?? null
    : null;
  const confirmConnection = confirm
    ? connections.find((c) => c.id === confirm.id) ?? null
    : null;

  const handleSelectModel = (id: ModelGatewayAppConnectionId, model: string) => {
    setModelPendingId(id);
    profileMutation.mutate(
      { profile: { appModels: { [id]: model || null } } },
      {
        onSuccess: () => toast.success("已更新路由模型"),
        onError: (error) => toast.error("更新失败", { description: error.message }),
        onSettled: () => setModelPendingId(null),
      },
    );
  };

  const handleConfirm = () => {
    if (!confirm) return;
    const { kind, id } = confirm;
    const conn = connections.find((c) => c.id === id);
    const label = conn?.label ?? id;
    if (kind === "apply") {
      applyMutation.mutate(
        { appId: id },
        {
          onSuccess: (res) => {
            setConfirm(null);
            setResult({
              kind: "apply",
              label,
              backupPath: res.backupPath,
              restoredFrom: null,
            });
            toast.success(`已应用 · ${label}`);
          },
          onError: (error) => toast.error("应用失败", { description: error.message }),
        },
      );
    } else {
      rollbackMutation.mutate(
        { appId: id },
        {
          onSuccess: (res) => {
            setConfirm(null);
            setResult({
              kind: "rollback",
              label,
              backupPath: res.backupPath,
              restoredFrom: res.restoredFrom,
            });
            toast.success(`已回滚 · ${label}`);
          },
          onError: (error) => toast.error("回滚失败", { description: error.message }),
        },
      );
    }
  };

  const writePending = applyMutation.isPending || rollbackMutation.isPending;

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold text-ink-strong">客户端接入</h2>
        <p className="text-sm text-muted">
          把网关路由应用到本地 CLI 客户端（写入配置文件，先预览再确认，支持回滚）。应用 / 回滚为危险写操作：会先备份目标文件，操作前后均展示目标路径与备份/恢复证据。
        </p>
      </div>

      {connections.length === 0 ? (
        <EmptyState
          title="暂无客户端接入"
          description="未检测到可接入的客户端（Codex / Claude Code / OpenCode / OpenClaw）。"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>客户端 / 配置文件</TableHead>
              <TableHead>路由模型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">动作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {connections.map((connection) => {
              const highlighted = selectedApp === connection.id;
              return (
                <ConnectionRow
                  key={connection.id}
                  connection={connection}
                  availableModels={availableModels}
                  highlighted={highlighted}
                  rowRef={highlighted ? highlightRef : undefined}
                  modelPending={modelPendingId === connection.id}
                  onPreview={() => setPreviewId(connection.id)}
                  onApply={() => setConfirm({ kind: "apply", id: connection.id })}
                  onRollback={() => setConfirm({ kind: "rollback", id: connection.id })}
                  onSelectModel={(model) => handleSelectModel(connection.id, model)}
                />
              );
            })}
          </TableBody>
        </Table>
      )}

      <PreviewSheet connection={previewConnection} onClose={() => setPreviewId(null)} />
      <ConfirmWriteDialog
        kind={confirm?.kind ?? null}
        connection={confirmConnection}
        pending={writePending}
        onConfirm={handleConfirm}
        onClose={() => setConfirm(null)}
      />
      <ResultSheet result={result} onClose={() => setResult(null)} />
    </div>
  );
}
