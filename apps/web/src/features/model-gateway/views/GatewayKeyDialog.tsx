import * as React from "react";
import { AlertTriangle, Eye, EyeOff, KeyRound, RefreshCw } from "lucide-react";

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
import { Badge } from "@/design/ui/badge";
import { toast } from "@/design/ui/sonner";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";

import {
  useModelGatewayClientAuthQuery,
  useUpdateModelGatewayClientAuthMutation,
} from "@/lib/query/model-gateway";
import type { ModelGatewayClientAuthView } from "../types";

/** Format an ISO timestamp into a short local string, or a dash. */
function fmtTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

type Mode = "view" | "edit" | "confirm-generate";

/**
 * Gateway client-key management. The local Gateway client key is what lets CLIs
 * authenticate against the relay. Key rotation (generate / replace) is treated
 * as a sensitive write: it requires explicit confirmation because every
 * existing client must be re-pointed at the new key.
 *
 * Extracted from OverviewView to keep the cockpit lean; bound to
 * `useModelGatewayClientAuthQuery` + `useUpdateModelGatewayClientAuthMutation`.
 */
export function GatewayKeyDialog({
  open,
  onOpenChange,
  onMutated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after any successful write so the parent can refetch status. */
  onMutated?: () => void;
}) {
  const authQuery = useModelGatewayClientAuthQuery({ enabled: open });
  const updateMutation = useUpdateModelGatewayClientAuthMutation();

  const [mode, setMode] = React.useState<Mode>("view");
  const [draft, setDraft] = React.useState("");
  const [reveal, setReveal] = React.useState(false);

  // Reset transient UI whenever the dialog is (re)opened.
  React.useEffect(() => {
    if (open) {
      setMode("view");
      setDraft("");
      setReveal(false);
    }
  }, [open]);

  const clientAuth: ModelGatewayClientAuthView | undefined = authQuery.data?.clientAuth;
  const revealedKey = authQuery.data?.revealedKey;
  const secret = clientAuth?.secret;
  const configured = Boolean(secret?.hasSecret);
  const enabled = clientAuth?.enabled ?? false;

  const handleResult = (revealed: string | null, message: string) => {
    onMutated?.();
    if (revealed) {
      toast.success(message, { description: `新密钥：${revealed} — 请立即复制并更新所有客户端` });
    } else {
      toast.success(message);
    }
    setMode("view");
    setDraft("");
    void authQuery.refetch();
  };

  const generate = () => {
    updateMutation.mutate(
      { generate: true, enabled: true },
      {
        onSuccess: (data) => handleResult(data.revealedKey, "已生成新网关密钥"),
        onError: (error) => toast.error("生成失败", { description: error.message }),
      },
    );
  };

  const saveManual = () => {
    const apiKey = draft.trim();
    if (!apiKey) {
      toast.error("请输入密钥内容");
      return;
    }
    updateMutation.mutate(
      { apiKey, enabled: true },
      {
        onSuccess: (data) => handleResult(data.revealedKey, "已更新网关密钥"),
        onError: (error) => toast.error("更新失败", { description: error.message }),
      },
    );
  };

  const toggleEnabled = (next: boolean) => {
    updateMutation.mutate(
      { enabled: next },
      {
        onSuccess: () => {
          onMutated?.();
          toast.success(next ? "已启用网关密钥校验" : "已停用网关密钥校验");
          void authQuery.refetch();
        },
        onError: (error) => toast.error("操作失败", { description: error.message }),
      },
    );
  };

  const pending = updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(520px,94vw)]">
        <DialogHeader>
          <span className="grid size-8 place-items-center rounded-[9px] bg-primary-soft text-primary [&_svg]:size-4">
            <KeyRound />
          </span>
          <DialogTitle>网关密钥</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          {authQuery.isLoading ? (
            <LoadingState title="加载密钥状态…" />
          ) : authQuery.error ? (
            <ErrorState
              title="无法加载密钥状态"
              description={authQuery.error.message}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void authQuery.refetch()}
                >
                  重试
                </Button>
              }
            />
          ) : (
            <>
              <p className="text-sm text-muted">
                本地网关密钥用于 CLI 客户端认证。轮换或修改后，所有已接入的客户端都需要更新密钥才能继续连接。
              </p>

              {/* Current key state — masked summary only. */}
              <div className="grid gap-2 rounded-sm border border-line bg-panel-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-subtle">状态</span>
                  <Badge variant={configured ? (enabled ? "ok" : "warn") : "mute"}>
                    {configured ? (enabled ? "已配置 · 已启用" : "已配置 · 已停用") : "未配置"}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-sm bg-panel-3 px-2 py-1 font-mono text-sm text-ink-strong">
                    {reveal && revealedKey
                      ? revealedKey
                      : secret?.masked ?? (configured ? "••••••••" : "未设置")}
                  </code>
                  {revealedKey && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={reveal ? "隐藏密钥" : "显示密钥"}
                      title={reveal ? "隐藏密钥" : "显示密钥"}
                      onClick={() => setReveal((v) => !v)}
                    >
                      {reveal ? <EyeOff /> : <Eye />}
                    </Button>
                  )}
                </div>
                <span className="text-xs text-subtle">
                  更新于 {fmtTime(secret?.updatedAt ?? clientAuth?.updatedAt ?? null)}
                  {secret?.length ? ` · ${secret.length} 字符` : ""}
                </span>
              </div>

              {mode === "edit" && (
                <div className="grid gap-2">
                  <label className="text-sm text-ink-strong" htmlFor="gateway-key-input">
                    手动输入新密钥
                  </label>
                  <Input
                    id="gateway-key-input"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="粘贴或输入密钥"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <p className="flex items-center gap-1.5 text-xs text-warning">
                    <AlertTriangle className="size-3.5" />
                    替换密钥后现有客户端需同步更新，否则将无法连接。
                  </p>
                </div>
              )}

              {mode === "confirm-generate" && (
                <p className="flex items-start gap-1.5 rounded-sm border border-line bg-warning-soft p-3 text-sm text-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  生成新密钥会立即作废旧密钥，所有现有客户端必须更新后才能继续连接。确认生成？
                </p>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {mode === "view" && !authQuery.isLoading && !authQuery.error && (
            <>
              {configured && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mr-auto"
                  onClick={() => toggleEnabled(!enabled)}
                  disabled={pending}
                >
                  {enabled ? "停用校验" : "启用校验"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMode("edit")}
                disabled={pending}
              >
                手动修改
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setMode("confirm-generate")}
                disabled={pending}
              >
                <RefreshCw />
                生成新密钥
              </Button>
            </>
          )}
          {mode === "edit" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setMode("view")} disabled={pending}>
                取消
              </Button>
              <Button variant="danger" size="sm" onClick={saveManual} disabled={pending}>
                {pending ? "保存中…" : "确认替换"}
              </Button>
            </>
          )}
          {mode === "confirm-generate" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setMode("view")} disabled={pending}>
                取消
              </Button>
              <Button variant="danger" size="sm" onClick={generate} disabled={pending}>
                {pending ? "生成中…" : "确认生成并轮换"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
