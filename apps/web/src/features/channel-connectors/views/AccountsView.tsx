import * as React from "react";
import {
  AlertTriangle,
  GitBranch,
  Pencil,
  Plus,
  RadioTower,
  Trash2,
  Zap,
} from "lucide-react";

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
import { Input } from "@/design/ui/input";
import { toast } from "@/design/ui/sonner";
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
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";

import {
  useApplyChannelConnectorsConfigMutation,
  useChannelConnectorsConfigQuery,
  useChannelConnectorsStatusQuery,
  useRunFeishuTransportSmokeMutation,
  useRunOctoTransportSmokeMutation,
} from "@/lib/query/channel-connectors";
import type { ChannelConnectorPlatformBinding } from "../types";
import type { ChannelConnectorsViewProps } from "./types";
import { AccountEditor } from "./BindingEditor";
import {
  channelConnectorAccountKey as accountKey,
  groupChannelConnectorAccounts as groupAccounts,
  runtimeAccountState,
} from "./account-runtime";

function smokeLabel(binding: ChannelConnectorPlatformBinding): string {
  if (binding.platform === "feishu") return "tenant-token";
  if (binding.platform === "octo") return "register";
  return "未验证";
}

function credentialState(binding: ChannelConnectorPlatformBinding): {
  label: string;
  variant: "ok" | "warn" | "mute";
} {
  const metadata = binding.metadata ?? {};
  const hasValue = (key: string) =>
    typeof metadata[key] === "string" && String(metadata[key]).trim().length > 0;
  if (binding.platform === "feishu") {
    if (!(hasValue("appId") || binding.accountId) || !hasValue("appSecret")) {
      return { label: "缺少飞书凭据", variant: "warn" };
    }
    return { label: "凭据已保存", variant: "ok" };
  }
  if (binding.platform === "octo") {
    if (!hasValue("apiUrl") || !hasValue("botToken")) {
      return { label: "缺少 Octo 连接", variant: "warn" };
    }
    return { label: "连接配置已保存", variant: "ok" };
  }
  return Object.keys(metadata).length > 0
    ? { label: "metadata", variant: "warn" }
    : { label: "未填写", variant: "mute" };
}

export function AccountsView({ selectedBinding }: ChannelConnectorsViewProps) {
  const configQuery = useChannelConnectorsConfigQuery();
  const statusQuery = useChannelConnectorsStatusQuery({
    refetchInterval: 10_000,
  });
  const applyMutation = useApplyChannelConnectorsConfigMutation();
  const feishuSmoke = useRunFeishuTransportSmokeMutation();
  const octoSmoke = useRunOctoTransportSmokeMutation();

  const [query, setQuery] = React.useState("");
  const [editing, setEditing] =
    React.useState<ChannelConnectorPlatformBinding | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleteTarget, setDeleteTarget] =
    React.useState<ChannelConnectorPlatformBinding | null>(null);

  const configResponse = configQuery.data;
  const config = configResponse?.config ?? null;
  const bindings = config?.platformBindings ?? [];
  const accountGroups = React.useMemo(
    () => groupAccounts(bindings),
    [bindings],
  );
  const defaultAgentProfileId =
    config?.defaultAgentProfileId || config?.agentProfiles[0]?.id || "default";
  const supportedPlatforms = configResponse?.supportedPlatforms ?? [];

  React.useEffect(() => {
    if (!selectedBinding || !bindings.length) return;
    const match = bindings.find((binding) => binding.id === selectedBinding);
    if (match) setEditing(match);
  }, [bindings, selectedBinding]);

  if (configQuery.isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <Skeleton className="h-12 w-full" />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }
  if (configQuery.error) {
    return (
      <ErrorState
        title="无法加载平台账号"
        description={configQuery.error.message}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void configQuery.refetch()}
          >
            重试
          </Button>
        }
      />
    );
  }

  const filtered = accountGroups.filter((group) => {
    const binding = group.representative;
    const routeIds = group.bindings.map((item) => item.id).join(" ");
    const haystack =
      `${binding.displayName} ${binding.id} ${routeIds} ${binding.platform} ${binding.accountId} ${binding.botId ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const runSmoke = (binding: ChannelConnectorPlatformBinding) => {
    if (binding.platform === "feishu") {
      feishuSmoke.mutate(
        { bindingId: binding.id, action: "tenant-token" },
        {
          onSuccess: (result) => {
            const description =
              result.transport.error ||
              `HTTP ${result.transport.statusCode ?? "ok"}`;
            if (result.transport.ok) {
              toast.success("飞书凭据验证通过", { description });
            } else {
              toast.error("飞书账号测试失败", { description });
            }
          },
          onError: (error) =>
            toast.error("飞书账号测试失败", { description: error.message }),
        },
      );
      return;
    }
    if (binding.platform === "octo") {
      octoSmoke.mutate(
        { bindingId: binding.id, action: "register" },
        {
          onSuccess: (result) => {
            const description =
              result.transport.error ||
              `HTTP ${result.transport.statusCode ?? "ok"}`;
            if (result.transport.ok) {
              toast.success("Octo 注册验证通过", { description });
            } else {
              toast.error("Octo 账号测试失败", { description });
            }
          },
          onError: (error) =>
            toast.error("Octo 账号测试失败", { description: error.message }),
        },
      );
      return;
    }
    toast.info("该平台暂无 verified smoke", { description: binding.platform });
  };

  const deleteAccount = () => {
    if (!config || !deleteTarget) return;
    applyMutation.mutate(
      {
        expectedUpdatedAt: config.updatedAt,
        reloadMode: "when-idle",
        rollbackOnFailure: true,
        config: {
          ...config,
          updatedAt: new Date().toISOString(),
          platformBindings: config.platformBindings.filter(
            (item) => accountKey(item) !== accountKey(deleteTarget),
          ),
        },
      },
      {
        onSuccess: (result) => {
          const reload = result.reload;
          if (reload.status === "applied") {
            toast.success("已删除平台账号并应用", { description: deleteTarget.id });
          } else if (reload.status === "pending") {
            toast.info("已删除平台账号，等待任务结束后应用", {
              description: `当前运行中 ${reload.activeRuns + reload.activeTurns} 个任务/turn。`,
            });
          } else if (reload.status === "restart-required") {
            toast.warning("账号已删除，需要重启消息守护", {
              description: reload.restartRequiredReason || deleteTarget.id,
            });
          } else if (result.rolledBack) {
            toast.error("删除应用失败，已自动回滚", {
              description: reload.error || deleteTarget.id,
            });
          } else {
            toast.warning("账号已删除，等待消息守护启动", {
              description: reload.error || deleteTarget.id,
            });
          }
          setDeleteTarget(null);
          void configQuery.refetch();
          void statusQuery.refetch();
        },
        onError: (error) =>
          toast.error("删除失败", { description: error.message }),
      },
    );
  };

  const smokePending = feishuSmoke.isPending || octoSmoke.isPending;
  const enabledCount = accountGroups.filter((group) =>
    group.bindings.some((binding) => binding.enabled),
  ).length;
  const verifiedSmokeCount = accountGroups.filter(
    (group) =>
      group.representative.platform === "feishu" ||
      group.representative.platform === "octo",
  ).length;
  const missingCredentialCount = accountGroups.filter(
    (group) => credentialState(group.representative).variant !== "ok",
  ).length;

  return (
    <div className="grid gap-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink-strong">平台账号</h2>
          <p className="text-sm text-muted">
            只管理 IM 平台身份与凭据；一个账号可以被路由页配置成不同 Agent
            入口。
          </p>
        </div>
        <Input
          className="w-full sm:w-72"
          placeholder="搜索平台 / 账号 / bot"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <Plus />
          新建平台账号
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="rounded-sm border border-line bg-panel-2 p-3">
          <div className="text-xs text-subtle">账号身份</div>
          <div className="text-xl font-semibold text-ink-strong">
            {accountGroups.length}
          </div>
        </div>
        <div className="rounded-sm border border-line bg-panel-2 p-3">
          <div className="text-xs text-subtle">已启用</div>
          <div className="text-xl font-semibold text-ink-strong">
            {enabledCount}
          </div>
        </div>
        <div className="rounded-sm border border-line bg-panel-2 p-3">
          <div className="text-xs text-subtle">可测试平台</div>
          <div className="text-xl font-semibold text-ink-strong">
            {verifiedSmokeCount}
          </div>
        </div>
        <div className="rounded-sm border border-line bg-panel-2 p-3">
          <div className="text-xs text-subtle">缺少凭据</div>
          <div className="text-xl font-semibold text-ink-strong">
            {missingCredentialCount}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="暂无平台账号"
          description="创建平台账号后，再在“绑定路由”选择它触发 Agent。"
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreating(true)}
            >
              <Plus />
              新建平台账号
            </Button>
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-md border border-line bg-panel shadow-sm sm:hidden">
            {filtered.map((group) => {
              const binding = group.representative;
              const cred = credentialState(binding);
              const runtimeState = runtimeAccountState(
                group,
                statusQuery.data?.runtime,
              );
              const canSmoke =
                binding.platform === "feishu" || binding.platform === "octo";
              const enabledRoutes = group.bindings.filter(
                (item) => item.enabled,
              ).length;
              return (
                <section
                  key={group.key}
                  className="grid gap-3 border-b border-line p-3 last:border-b-0"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted">
                      <RadioTower className="size-4" />
                    </span>
                    <span className="grid min-w-0 flex-1">
                      <strong className="truncate text-ink-strong">
                        {binding.displayName || binding.id}
                      </strong>
                      <span className="truncate text-sm text-muted">
                        {binding.platform} · acct {binding.accountId || "—"}
                      </span>
                    </span>
                    <Badge
                      variant={runtimeState.variant}
                      title={runtimeState.description}
                      aria-label="账号运行状态"
                    >
                      {runtimeState.label}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={cred.variant}>{cred.label}</Badge>
                    <Badge variant="outline">
                      <GitBranch className="size-3" />
                      {enabledRoutes}/{group.bindings.length} 路由
                    </Badge>
                    <Badge variant={canSmoke ? "info" : "mute"}>
                      {smokeLabel(binding)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1 border-t border-line pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => runSmoke(binding)}
                      disabled={!canSmoke || smokePending}
                    >
                      <Zap />
                      测试
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(binding)}
                    >
                      <Pencil />
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red hover:bg-red-soft"
                      onClick={() => setDeleteTarget(binding)}
                    >
                      <Trash2 />
                      删除
                    </Button>
                  </div>
                </section>
              );
            })}
          </div>
          <div className="hidden sm:block">
            <Table>
          <TableHeader>
            <TableRow>
              <TableHead>平台账号</TableHead>
              <TableHead>凭据</TableHead>
              <TableHead>路由</TableHead>
              <TableHead>测试</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">动作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((group) => {
              const binding = group.representative;
              const cred = credentialState(binding);
              const runtimeState = runtimeAccountState(
                group,
                statusQuery.data?.runtime,
              );
              const canSmoke =
                binding.platform === "feishu" || binding.platform === "octo";
              const enabledRoutes = group.bindings.filter(
                (item) => item.enabled,
              ).length;
              return (
                <TableRow key={group.key}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 place-items-center rounded-[9px] bg-panel-3 text-muted">
                        <RadioTower className="size-4" />
                      </span>
                      <span className="grid min-w-0">
                        <strong className="truncate text-ink-strong">
                          {binding.displayName || binding.id}
                        </strong>
                        <span className="truncate text-sm text-muted">
                          {binding.platform} · acct {binding.accountId || "—"}
                          {binding.botId ? ` · bot ${binding.botId}` : ""}
                        </span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={cred.variant}>{cred.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      <GitBranch className="size-3" />
                      {enabledRoutes}/{group.bindings.length} 路由
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={canSmoke ? "info" : "mute"}>
                      {smokeLabel(binding)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={runtimeState.variant}
                      title={runtimeState.description}
                    >
                      {runtimeState.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => runSmoke(binding)}
                        disabled={!canSmoke || smokePending}
                      >
                        <Zap />
                        测试
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(binding)}
                      >
                        <Pencil />
                        编辑账号
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red hover:bg-red-soft"
                        onClick={() => setDeleteTarget(binding)}
                      >
                        <Trash2 />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
            </Table>
          </div>
        </>
      )}

      <AccountEditor
        open={creating || editing != null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        binding={editing}
        config={config}
        supportedPlatforms={supportedPlatforms}
        defaultAgentProfileId={defaultAgentProfileId}
        onSaved={() => {
          void configQuery.refetch();
          void statusQuery.refetch();
        }}
      />

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-red-soft text-red">
              <AlertTriangle className="size-4" />
            </span>
            <DialogTitle>删除平台账号</DialogTitle>
          </DialogHeader>
          <DialogBody>
            删除{" "}
            <strong className="text-ink-strong">
              {deleteTarget?.displayName || deleteTarget?.id}
            </strong>{" "}
            会移除同一平台账号身份下的所有绑定路由，不删除历史日志。
          </DialogBody>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              disabled={applyMutation.isPending}
            >
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={deleteAccount}
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
