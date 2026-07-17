import * as React from "react";
import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  Eye,
  History,
  Pencil,
  RotateCcw,
  Route,
  ServerCog,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/design/ui/tabs";
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
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";
import { CodeBlock, DiffView } from "@/shared/diff/DiffView";
import { cn } from "@/design/lib/utils";
import { toast } from "@/design/ui/sonner";

import {
  getAppConnectionBackup,
  useAppConnectionBackupsQuery,
  useApplyModelGatewayAppConnectionMutation,
  useModelGatewayAppConnectionsQuery,
  useModelGatewayProvidersQuery,
  useRollbackModelGatewayAppConnectionMutation,
  useUpdateModelGatewayAppConnectionProfileMutation,
} from "@/lib/query/model-gateway";
import type {
  ModelGatewayAppConnection,
  ModelGatewayAppConnectionBackup,
  ModelGatewayActiveRouteStatus,
  ModelGatewayAppConnectionId,
  ModelGatewayProviderView,
} from "../types";
import type { ModelGatewayViewProps } from "./types";
import { formatModelBudgetPair } from "../budget-format";
import {
  GatewayMark,
  GatewayMetricCard,
  providerIdentityFromText,
  type GatewayComparison,
} from "./GatewayUi";

const LIVE_COMPARISON: GatewayComparison = {
  label: "实时",
  tone: "primary",
  direction: "flat",
};

/** Status pill from live `configured` + issues. */
function connectionStatus(connection: ModelGatewayAppConnection): {
  variant: "ok" | "warn" | "bad" | "mute";
  label: string;
} {
  if (connection.issues.length > 0) return { variant: "bad", label: "有问题" };
  if (connection.configured) return { variant: "ok", label: "已应用" };
  return { variant: "warn", label: "未应用" };
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function activeRouteForConnection(
  connection: ModelGatewayAppConnection,
  activeRoutes: ModelGatewayActiveRouteStatus[],
): ModelGatewayActiveRouteStatus | null {
  return activeRoutes.find((route) => route.scope === connection.appScope) ?? null;
}

function modelForRoute(
  route: ModelGatewayActiveRouteStatus | null,
  providers: ModelGatewayProviderView[],
) {
  if (!route?.resolvedProviderId || !route.resolvedModel) return null;
  const resolvedModel = route.resolvedModel;
  const provider = providers.find((item) => item.id === route.resolvedProviderId);
  return provider?.models?.models.find(
    (item) => item.id === resolvedModel || item.aliases?.includes(resolvedModel),
  ) ?? null;
}

function routeBudgetSummary(
  route: ModelGatewayActiveRouteStatus | null,
  providers: ModelGatewayProviderView[],
): string | null {
  const model = modelForRoute(route, providers);
  return formatModelBudgetPair({
    contextWindow: model?.contextWindow,
    maxOutputTokens: model?.maxOutputTokens,
  });
}

/** Pending write descriptor for the confirmation flow. */
type ConfirmState =
  | { kind: "apply"; id: ModelGatewayAppConnectionId }
  | { kind: "apply-edit"; id: ModelGatewayAppConnectionId; content: string }
  | { kind: "rollback"; id: ModelGatewayAppConnectionId; backupId: string | null; from: string }
  | null;

interface WriteResult {
  kind: "apply" | "rollback";
  label: string;
  backupPath: string | null;
  restoredFrom: string | null;
}

/**
 * Connection detail sheet: code viewer (current vs. proposed), source editing
 * (seeded from the proposed preview) and multi-version rollback (lists backups,
 * diffs a selected version against the current on-disk content). All writes are
 * raised through the parent confirmation flow — this sheet only stages intent.
 */
function ConnectionDetailSheet({
  connection,
  onClose,
  onApply,
  onApplyEdit,
  onRollback,
}: {
  connection: ModelGatewayAppConnection | null;
  onClose: () => void;
  onApply: (id: ModelGatewayAppConnectionId) => void;
  onApplyEdit: (id: ModelGatewayAppConnectionId, content: string) => void;
  onRollback: (id: ModelGatewayAppConnectionId, backupId: string | null, from: string) => void;
}) {
  const appId = connection?.id ?? null;
  const currentContent = connection?.currentContent ?? null;
  const proposed = connection?.preview.content ?? "";
  const format = connection?.preview.format ?? null;

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  // Lazily-loaded backup content keyed by backupId (for diffing a version).
  const [selectedBackupId, setSelectedBackupId] = React.useState<string | null>(null);
  const [backupContent, setBackupContent] = React.useState<string | null>(null);
  const [backupLoading, setBackupLoading] = React.useState(false);
  const [backupError, setBackupError] = React.useState<string | null>(null);

  const backupsQuery = useAppConnectionBackupsQuery(appId);

  // Reset transient state when the connection changes / sheet closes.
  React.useEffect(() => {
    setEditing(false);
    setDraft(proposed);
    setSelectedBackupId(null);
    setBackupContent(null);
    setBackupError(null);
    setBackupLoading(false);
    // We intentionally key the reset on the connection id only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  const loadBackup = React.useCallback(
    (backup: ModelGatewayAppConnectionBackup) => {
      if (!appId) return;
      setSelectedBackupId(backup.id);
      setBackupContent(null);
      setBackupError(null);
      setBackupLoading(true);
      getAppConnectionBackup(appId, backup.id)
        .then((res) => setBackupContent(res.content))
        .catch((error: unknown) =>
          setBackupError(error instanceof Error ? error.message : "读取备份失败"),
        )
        .finally(() => setBackupLoading(false));
    },
    [appId],
  );

  const draftDirty = editing && draft.trim().length > 0 && draft !== proposed;
  const draftEmpty = editing && draft.trim().length === 0;

  return (
    <Sheet open={Boolean(connection)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-2xl">
        {connection && (
          <>
            <SheetHeader>
              <div className="min-w-0">
                <SheetTitle>{connection.label}</SheetTitle>
                <SheetDescription>查看 / 编辑将写入的配置，或回滚到历史版本（敏感字段已脱敏）。</SheetDescription>
              </div>
            </SheetHeader>
            <SheetBody>
              <div className="grid gap-1">
                <span className="text-xs uppercase tracking-wide text-subtle">目标配置文件</span>
                <code className="break-all rounded-sm bg-panel-3 px-2 py-1.5 font-mono text-sm text-ink-strong">
                  {connection.target.path}
                </code>
                <span className="text-xs text-subtle">
                  格式：{connection.preview.format.toUpperCase()} ·{" "}
                  {connection.target.exists ? "文件已存在（写入前会先备份）" : "文件不存在（将新建）"}
                </span>
              </div>

              {connection.issues.length > 0 && (
                <div className="grid gap-1 rounded-md border border-line bg-danger-soft p-3 text-sm text-danger">
                  {connection.issues.map((issue, i) => (
                    <span key={i}>{issue}</span>
                  ))}
                </div>
              )}

              <Tabs defaultValue="code">
                <TabsList>
                  <TabsTrigger value="code">
                    <Eye className="size-3.5" />
                    内容
                  </TabsTrigger>
                  <TabsTrigger value="edit">
                    <Pencil className="size-3.5" />
                    编辑
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    <History className="size-3.5" />
                    历史版本
                  </TabsTrigger>
                </TabsList>

                {/* --- Code viewer: current on-disk + proposed diff -------- */}
                <TabsContent value="code" className="grid gap-3">
                  {currentContent !== null ? (
                    <DiffView
                      base={currentContent}
                      proposed={proposed}
                      format={format}
                      redacted
                      label="当前文件 → 将写入"
                      maxHeightClassName="max-h-[32vh]"
                    />
                  ) : (
                    <div className="text-xs text-subtle">目标文件当前不存在，下面是将新建写入的内容。</div>
                  )}
                  <CodeBlock
                    content={proposed}
                    format={format}
                    redacted
                    label="将写入的内容（预览）"
                    maxHeightClassName="max-h-[32vh]"
                  />
                  {currentContent !== null && (
                    <CodeBlock
                      content={currentContent}
                      format={format}
                      redacted
                      label="当前磁盘内容"
                      maxHeightClassName="max-h-[28vh]"
                    />
                  )}
                </TabsContent>

                {/* --- Source editing ------------------------------------- */}
                <TabsContent value="edit" className="grid gap-2">
                  {!editing ? (
                    <div className="grid gap-2">
                      <p className="text-sm text-muted">
                        直接编辑将写入的源文件内容。保存会<strong className="text-ink-strong">直接写入</strong>{" "}
                        <code className="break-all font-mono text-xs">{connection.target.path}</code>
                        ，写入前会先备份、可回滚。
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-self-start"
                        onClick={() => {
                          setDraft(proposed);
                          setEditing(true);
                        }}
                      >
                        <Pencil />
                        开始编辑
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <textarea
                        className="min-h-[40vh] w-full resize-y rounded-md border border-line bg-panel-3 p-3 font-mono text-xs leading-relaxed text-ink outline-none focus-visible:border-primary-line focus-visible:shadow-[var(--ring)]"
                        value={draft}
                        spellCheck={false}
                        onChange={(e) => setDraft(e.target.value)}
                      />
                      {draftEmpty && (
                        <span className="text-xs text-danger">内容不能为空。</span>
                      )}
                      {!draftDirty && !draftEmpty && (
                        <span className="text-xs text-subtle">内容与预览一致，无需保存。</span>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={!draftDirty}
                          onClick={() => appId && onApplyEdit(appId, draft)}
                        >
                          <Upload />
                          保存（应用编辑）
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDraft(proposed);
                            setEditing(false);
                          }}
                        >
                          取消
                        </Button>
                      </div>
                      {draftDirty && (
                        <DiffView
                          base={currentContent ?? ""}
                          proposed={draft}
                          format={format}
                          label="当前文件 → 编辑后"
                          maxHeightClassName="max-h-[28vh]"
                        />
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* --- Multi-version rollback ----------------------------- */}
                <TabsContent value="history" className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted">历史备份版本（最新在前）。</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!connection.canRollback}
                      onClick={() =>
                        appId &&
                        onRollback(appId, null, connection.lastBackupPath ?? "最近一次备份")
                      }
                    >
                      <RotateCcw />
                      回滚到最新备份
                    </Button>
                  </div>

                  {backupsQuery.isLoading ? (
                    <LoadingState title="加载历史版本…" />
                  ) : backupsQuery.error ? (
                    <ErrorState
                      title="无法加载历史版本"
                      description={backupsQuery.error.message}
                      action={
                        <Button variant="outline" size="sm" onClick={() => void backupsQuery.refetch()}>
                          重试
                        </Button>
                      }
                    />
                  ) : (backupsQuery.data?.backups.length ?? 0) === 0 ? (
                    <EmptyState title="暂无历史版本" description="该客户端配置文件还没有产生过备份。" />
                  ) : (
                    <div className="grid gap-1.5">
                      {backupsQuery.data?.backups.map((backup) => {
                        const active = selectedBackupId === backup.id;
                        return (
                          <div
                            key={backup.id}
                            className={cn(
                              "grid gap-2 rounded-md border border-line p-2.5",
                              active && "border-primary-line bg-panel-2",
                            )}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="grid min-w-0 gap-0.5">
                                <span className="text-sm text-ink-strong">
                                  {formatTimestamp(backup.createdAt)}
                                </span>
                                <span className="text-xs text-subtle">
                                  {backup.format.toUpperCase()} · {formatBytes(backup.size)}
                                </span>
                              </div>
                              <div className="flex shrink-0 gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => loadBackup(backup)}
                                >
                                  <Eye />
                                  对比
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    appId &&
                                    onRollback(
                                      appId,
                                      backup.id,
                                      `${formatTimestamp(backup.createdAt)}（${backup.id}）`,
                                    )
                                  }
                                >
                                  <ArchiveRestore />
                                  回滚到此版本
                                </Button>
                              </div>
                            </div>
                            {active && (
                              <>
                                {backupLoading ? (
                                  <span className="text-xs text-subtle">读取备份内容…</span>
                                ) : backupError ? (
                                  <span className="text-xs text-danger">{backupError}</span>
                                ) : backupContent !== null ? (
                                  <DiffView
                                    base={currentContent ?? ""}
                                    proposed={backupContent}
                                    format={backup.format}
                                    redacted
                                    label="当前文件 → 该备份版本"
                                    maxHeightClassName="max-h-[30vh]"
                                  />
                                ) : null}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </SheetBody>
            <SheetFooter>
              <Button
                variant="primary"
                size="sm"
                disabled={!connection.canApply}
                onClick={() => appId && onApply(appId)}
              >
                <Upload />
                应用网关路由
              </Button>
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
 * Confirmation dialog for dangerous writes (apply / apply-edit / rollback). It
 * NAMES the target config file and the backup/restore behavior before the write
 * runs. The apply paths render a `DiffView` (current → proposed/edited) so the
 * exact change is visible at confirm time.
 */
function ConfirmWriteDialog({
  state,
  connection,
  pending,
  onConfirm,
  onClose,
}: {
  state: ConfirmState;
  connection: ModelGatewayAppConnection | null;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const open = Boolean(state && connection);
  const kind = state?.kind ?? null;
  const isEdit = kind === "apply-edit";
  const current = connection?.currentContent ?? "";
  const proposed =
    state?.kind === "apply-edit"
      ? state.content
      : connection?.preview.content ?? "";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {state && connection && (
          <>
            <DialogHeader>
              <DialogTitle className={cn(isEdit && "flex items-center gap-2 text-danger")}>
                {isEdit && <AlertTriangle className="size-5" />}
                {kind === "apply"
                  ? "应用网关路由"
                  : kind === "apply-edit"
                    ? "确认写入编辑内容"
                    : "回滚网关路由"}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <DialogDescription className="grid gap-2">
                {isEdit ? (
                  <span className="text-danger">
                    将<strong>直接写入</strong>编辑后的源文件内容到 <strong>{connection.label}</strong>。
                  </span>
                ) : (
                  <span>
                    即将{kind === "apply" ? "写入" : "回滚"} <strong>{connection.label}</strong> 的配置文件：
                  </span>
                )}
                <code className="break-all rounded-sm bg-panel-3 px-2 py-1.5 font-mono text-sm text-ink-strong">
                  {connection.target.path}
                </code>
                {kind === "rollback" ? (
                  <span>
                    将从备份
                    {state.kind === "rollback" && state.from ? (
                      <code className="mx-1 break-all rounded-sm bg-panel-3 px-1.5 py-0.5 font-mono text-xs">
                        {state.from}
                      </code>
                    ) : (
                      " "
                    )}
                    恢复该文件。<strong>当前文件会先备份</strong>，再写入所选版本，可再次回滚。
                  </span>
                ) : connection.target.exists ? (
                  <span>
                    <strong>当前文件会先备份</strong>，再写入新内容；JSON 由服务端校验。备份路径将在完成后显示，可回滚。
                  </span>
                ) : (
                  <span>目标文件当前不存在，将新建并写入内容。</span>
                )}
                {(kind === "apply" || kind === "apply-edit") && (
                  <DiffView
                    base={current}
                    proposed={proposed}
                    format={connection.preview.format}
                    redacted={kind === "apply"}
                    label={isEdit ? "当前文件 → 编辑后" : "当前文件 → 将写入"}
                    maxHeightClassName="max-h-[34vh]"
                  />
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
                {pending
                  ? "执行中…"
                  : kind === "apply"
                    ? "确认应用"
                    : kind === "apply-edit"
                      ? "确认写入"
                      : "确认回滚"}
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
  activeRoute: ModelGatewayActiveRouteStatus | null;
  providers: ModelGatewayProviderView[];
  availableModels: string[];
  highlighted: boolean;
  rowRef?: React.Ref<HTMLTableRowElement>;
  onOpen: () => void;
  onApply: () => void;
  onRollback: () => void;
  onSelectModel: (model: string) => void;
  modelPending: boolean;
}

function ConnectionRow({
  connection,
  activeRoute,
  providers,
  availableModels,
  highlighted,
  rowRef,
  onOpen,
  onApply,
  onRollback,
  onSelectModel,
  modelPending,
}: ConnectionRowProps) {
  const status = connectionStatus(connection);
  const budget = routeBudgetSummary(activeRoute, providers);
  const routeProviderIdentity = activeRoute?.resolvedProviderName
    ? providerIdentityFromText(activeRoute.resolvedProviderName)
    : null;
  const routeLine = activeRoute
    ? [
      activeRoute.resolvedProviderName,
      activeRoute.resolvedModel,
      activeRoute.resolvedEndpointProfileName ?? activeRoute.routeId,
      budget,
    ].filter(Boolean).join(" · ")
    : "当前 active route 未解析";
  return (
    <TableRow
      ref={rowRef}
      data-state={highlighted ? "selected" : undefined}
      className={cn(highlighted && "scroll-mt-24")}
    >
      <TableCell>
        <div className="flex min-w-0 items-start gap-2.5">
          <GatewayMark identity={providerIdentityFromText(connection.label)} size="md" />
          <div className="grid min-w-0 gap-1">
            <strong className="truncate text-base text-ink-strong">{connection.label}</strong>
            <code className="truncate font-mono text-sm text-muted" title={connection.target.path}>
              {connection.target.path}
            </code>
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-subtle">
              <Badge variant="outline">{connection.appScope}</Badge>
              <span className="inline-flex items-center gap-1">
                <Route className="size-3" />
                {connection.protocol}
              </span>
              <span className="inline-flex min-w-0 items-center gap-1">
                <ServerCog className="size-3" />
                <span className="truncate" title={connection.endpoint}>{connection.endpoint}</span>
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
              {routeProviderIdentity ? (
                <GatewayMark identity={routeProviderIdentity} size="sm" />
              ) : (
                <Route className="size-3 shrink-0 text-subtle" />
              )}
              <span className="truncate" title={routeLine}>
                实际路由：{routeLine}
              </span>
            </span>
          </div>
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
          <Button variant="ghost" size="sm" onClick={onOpen}>
            <Eye />
            详情
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
                <CheckCircle2 className="size-5 text-success" />
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
                <div className="grid gap-3">
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
                  {result.backupPath && (
                    <div className="grid gap-1">
                      <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-subtle">
                        <ArchiveRestore className="size-3.5" />
                        回滚前已备份当前文件
                      </span>
                      <code className="break-all rounded-sm bg-panel-3 px-2 py-1.5 font-mono text-sm text-ink-strong">
                        {result.backupPath}
                      </code>
                    </div>
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
 * resolved model. A detail sheet exposes a code viewer (current vs. proposed
 * diff), source editing (seeded from the proposed preview), and multi-version
 * rollback (lists backups, diffs a selected version against the current file).
 * Apply / apply-edit / rollback are dangerous writes and go through a
 * confirmation dialog that NAMES the target file + backup behavior and shows a
 * diff at confirm time; the backupPath / restoredFrom evidence is surfaced
 * afterward. A `?app=` deep link highlights and scrolls the matching row. No
 * data is fabricated — everything comes from the query + mutation responses.
 */
export function AppConnectionsView({ selectedApp }: ModelGatewayViewProps) {
  const connectionsQuery = useModelGatewayAppConnectionsQuery();
  const providersQuery = useModelGatewayProvidersQuery();
  const applyMutation = useApplyModelGatewayAppConnectionMutation();
  const rollbackMutation = useRollbackModelGatewayAppConnectionMutation();
  const profileMutation = useUpdateModelGatewayAppConnectionProfileMutation();

  const [detailId, setDetailId] = React.useState<ModelGatewayAppConnectionId | null>(null);
  const [confirm, setConfirm] = React.useState<ConfirmState>(null);
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

  const isLoading = connectionsQuery.isLoading || providersQuery.isLoading;
  const error = connectionsQuery.error ?? providersQuery.error;

  if (isLoading) {
    return (
      <div className="grid gap-4" role="status" aria-busy="true">
        <div className="grid gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="rounded-md border border-line bg-panel">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="无法加载客户端接入"
        description={error.message}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void connectionsQuery.refetch();
              void providersQuery.refetch();
            }}
          >
            重试
          </Button>
        }
      />
    );
  }

  const data = connectionsQuery.data;
  const connections = data?.connections ?? [];
  const availableModels = data?.availableModels ?? [];
  const activeRoutes = providersQuery.data?.activeRoutes ?? [];
  const providerList = providersQuery.data?.providers ?? [];
  const configuredConnectionCount = connections.filter((connection) => connection.configured).length;
  const attentionConnectionCount = connections.filter(
    (connection) => !connection.configured || connection.issues.length > 0,
  ).length;
  const writableConnectionCount = connections.filter((connection) => connection.canApply).length;

  const detailConnection = detailId
    ? connections.find((c) => c.id === detailId) ?? null
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
    const conn = connections.find((c) => c.id === confirm.id);
    const label = conn?.label ?? confirm.id;

    if (confirm.kind === "apply" || confirm.kind === "apply-edit") {
      const payload = confirm.kind === "apply-edit" ? { content: confirm.content } : {};
      applyMutation.mutate(
        { appId: confirm.id, payload },
        {
          onSuccess: (res) => {
            setConfirm(null);
            setResult({ kind: "apply", label, backupPath: res.backupPath, restoredFrom: null });
            toast.success(`已应用 · ${label}`);
          },
          onError: (error) => toast.error("应用失败", { description: error.message }),
        },
      );
    } else {
      const payload = confirm.backupId ? { backupId: confirm.backupId } : {};
      rollbackMutation.mutate(
        { appId: confirm.id, payload },
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
      <section className="overflow-hidden rounded-md border border-primary-line/40 bg-panel shadow-sm">
        <div className="grid gap-4 border-b border-line bg-[color-mix(in_srgb,var(--primary)_4%,var(--panel))] p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="ok">{configuredConnectionCount} 个已应用</Badge>
              <Badge variant={attentionConnectionCount > 0 ? "warn" : "outline"}>
                {attentionConnectionCount} 个待处理
              </Badge>
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-ink-strong">客户端接入控制台</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-muted">
              把网关路由应用到本地 CLI 客户端。每行展示 Agent scope、协议、Gateway endpoint 和当前实际 active route；写入、编辑和回滚仍先展示差异与备份证据。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void connectionsQuery.refetch();
              void providersQuery.refetch();
            }}
          >
            <RotateCcw />
            刷新状态
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 min-[620px]:grid-cols-2 xl:grid-cols-4">
          <GatewayMetricCard
            icon={<Route />}
            tone="primary"
            label="客户端入口"
            value={`${connections.length}`}
            sub="Codex / Claude Code / OpenCode / OpenClaw"
            accent="clients"
            meter={connections.length > 0 ? 1 : 0}
            comparison={LIVE_COMPARISON}
          />
          <GatewayMetricCard
            icon={<CheckCircle2 />}
            tone="teal"
            label="已应用配置"
            value={`${configuredConnectionCount}`}
            sub={`${connections.length} 个入口中已写入网关路由`}
            accent="applied"
            meter={connections.length > 0 ? configuredConnectionCount / connections.length : 0}
            comparison={LIVE_COMPARISON}
          />
          <GatewayMetricCard
            icon={<AlertTriangle />}
            tone="violet"
            label="待处理"
            value={`${attentionConnectionCount}`}
            sub={`${writableConnectionCount} 个入口当前可写入`}
            accent="risk"
            meter={connections.length > 0 ? attentionConnectionCount / connections.length : 0}
            comparison={{
              ...LIVE_COMPARISON,
              tone: attentionConnectionCount > 0 ? "warn" : "good",
            }}
          />
          <GatewayMetricCard
            icon={<ServerCog />}
            tone="primary"
            label="可选模型"
            value={`${availableModels.length}`}
            sub="客户端可绑定的网关模型目录"
            accent="models"
            meter={availableModels.length > 0 ? 1 : 0}
            comparison={LIVE_COMPARISON}
          />
        </div>
      </section>

      {connections.length === 0 ? (
        <EmptyState
          title="暂无客户端接入"
          description="未检测到可接入的客户端（Codex / Claude Code / OpenCode / OpenClaw）。"
        />
      ) : (
        <Table className="table-fixed">
          <colgroup>
            <col className="w-[46%]" />
            <col className="w-[20%]" />
            <col className="w-[12%]" />
            <col />
          </colgroup>
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
                  activeRoute={activeRouteForConnection(connection, activeRoutes)}
                  providers={providerList}
                  availableModels={availableModels}
                  highlighted={highlighted}
                  rowRef={highlighted ? highlightRef : undefined}
                  modelPending={modelPendingId === connection.id}
                  onOpen={() => setDetailId(connection.id)}
                  onApply={() => setConfirm({ kind: "apply", id: connection.id })}
                  onRollback={() =>
                    setConfirm({
                      kind: "rollback",
                      id: connection.id,
                      backupId: null,
                      from: connection.lastBackupPath ?? "最近一次备份",
                    })
                  }
                  onSelectModel={(model) => handleSelectModel(connection.id, model)}
                />
              );
            })}
          </TableBody>
        </Table>
      )}

      <ConnectionDetailSheet
        connection={detailConnection}
        onClose={() => setDetailId(null)}
        onApply={(id) => setConfirm({ kind: "apply", id })}
        onApplyEdit={(id, content) => setConfirm({ kind: "apply-edit", id, content })}
        onRollback={(id, backupId, from) =>
          setConfirm({ kind: "rollback", id, backupId, from })
        }
      />
      <ConfirmWriteDialog
        state={confirm}
        connection={confirmConnection}
        pending={writePending}
        onConfirm={handleConfirm}
        onClose={() => setConfirm(null)}
      />
      <ResultSheet result={result} onClose={() => setResult(null)} />
    </div>
  );
}
