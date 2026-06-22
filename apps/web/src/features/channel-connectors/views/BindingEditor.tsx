import * as React from "react";
import { AlertTriangle, Save } from "lucide-react";

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

import { useSaveChannelConnectorsConfigMutation } from "@/lib/query/channel-connectors";
import type {
  ChannelConnectorsNativeConfig,
  ChannelConnectorPlatformBinding,
} from "../types";

/** Editable subset of a platform binding — identity, transport, access. */
interface EditorState {
  displayName: string;
  agentProfileId: string;
  enabled: boolean;
  accountId: string;
  botId: string;
  allowlist: string;
  adminUsers: string;
  disabledCommands: string;
}

function toEditorState(binding: ChannelConnectorPlatformBinding): EditorState {
  return {
    displayName: binding.displayName,
    agentProfileId: binding.agentProfileId,
    enabled: binding.enabled,
    accountId: binding.accountId,
    botId: binding.botId ?? "",
    allowlist: binding.allowlist.join(", "),
    adminUsers: binding.adminUsers.join(", "),
    disabledCommands: binding.disabledCommands.join(", "),
  };
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-ink-strong">{label}</span>
      {children}
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </label>
  );
}

/**
 * Focused editor for a single platform binding. Saving rewrites the whole
 * native config with this binding patched (the API replaces the document), so
 * we confirm + show evidence (updatedAt) before applying. Restarting / live
 * application is owned by the daemon — this only writes the config.
 */
export function BindingEditor({
  open,
  onOpenChange,
  binding,
  config,
  agentProfileIds,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binding: ChannelConnectorPlatformBinding | null;
  config: ChannelConnectorsNativeConfig | null;
  agentProfileIds: string[];
  onSaved?: () => void;
}) {
  const saveMutation = useSaveChannelConnectorsConfigMutation();
  const [state, setState] = React.useState<EditorState | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  React.useEffect(() => {
    if (open && binding) {
      setState(toEditorState(binding));
      setConfirming(false);
    }
  }, [open, binding]);

  if (!binding || !config || !state) return null;

  const patch = (next: Partial<EditorState>) =>
    setState((prev) => (prev ? { ...prev, ...next } : prev));

  const buildNextConfig = (): ChannelConnectorsNativeConfig => {
    const nextBinding: ChannelConnectorPlatformBinding = {
      ...binding,
      displayName: state.displayName.trim() || binding.displayName,
      agentProfileId: state.agentProfileId,
      enabled: state.enabled,
      accountId: state.accountId.trim(),
      botId: state.botId.trim() ? state.botId.trim() : null,
      allowlist: splitList(state.allowlist),
      adminUsers: splitList(state.adminUsers),
      disabledCommands: splitList(state.disabledCommands),
    };
    return {
      ...config,
      platformBindings: config.platformBindings.map((b) =>
        b.id === binding.id ? nextBinding : b,
      ),
    };
  };

  const handleSave = () => {
    const nextConfig = buildNextConfig();
    saveMutation.mutate(
      { config: nextConfig },
      {
        onSuccess: (result) => {
          toast.success("已保存绑定配置", {
            description: `更新于 ${new Date(result.config.updatedAt).toLocaleString()}`,
          });
          onSaved?.();
          setConfirming(false);
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error("保存失败", { description: error.message });
          setConfirming(false);
        },
      },
    );
  };

  const pending = saveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <span className="grid size-8 place-items-center rounded-[9px] bg-primary-soft text-primary [&_svg]:size-4">
            <Save />
          </span>
          <DialogTitle>编辑绑定 · {binding.platform}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="显示名称">
              <Input
                value={state.displayName}
                onChange={(e) => patch({ displayName: e.target.value })}
              />
            </Field>
            <Field label="Agent 配置" hint="绑定触发的本地 Agent profile">
              <select
                value={state.agentProfileId}
                onChange={(e) => patch({ agentProfileId: e.target.value })}
                className="h-9 w-full rounded-sm border border-line bg-panel-2 px-[11px] text-base text-ink-strong outline-none focus-visible:border-primary-line focus-visible:shadow-[var(--ring)]"
              >
                {!agentProfileIds.includes(state.agentProfileId) && (
                  <option value={state.agentProfileId}>{state.agentProfileId}</option>
                )}
                {agentProfileIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="账号 ID" hint="平台账号标识（transport）">
              <Input
                value={state.accountId}
                onChange={(e) => patch({ accountId: e.target.value })}
              />
            </Field>
            <Field label="Bot ID" hint="可选；留空表示无独立 bot">
              <Input
                value={state.botId}
                onChange={(e) => patch({ botId: e.target.value })}
                placeholder="（无）"
              />
            </Field>
          </div>
          <Field label="允许列表 (allowlist)" hint="逗号或换行分隔；空表示不限制">
            <Input
              value={state.allowlist}
              onChange={(e) => patch({ allowlist: e.target.value })}
              placeholder="uid1, uid2"
            />
          </Field>
          <Field label="管理员 (adminUsers)" hint="逗号或换行分隔">
            <Input
              value={state.adminUsers}
              onChange={(e) => patch({ adminUsers: e.target.value })}
              placeholder="uid1, uid2"
            />
          </Field>
          <Field label="禁用命令 (disabledCommands)" hint="逗号或换行分隔">
            <Input
              value={state.disabledCommands}
              onChange={(e) => patch({ disabledCommands: e.target.value })}
              placeholder="/reset, /stop"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-strong">
            <input
              type="checkbox"
              checked={state.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
              className="size-4 accent-[var(--primary)]"
            />
            启用此绑定
          </label>

          {confirming && (
            <div className="grid gap-1.5 rounded-sm border border-amber bg-amber-soft p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-amber">
                <AlertTriangle className="size-4" />
                确认写入配置
              </div>
              <p className="text-xs text-muted">
                保存会重写渠道原生配置文件并影响该绑定的触发行为。守护服务会按新配置生效。确认保存？
              </p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {confirming ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                返回
              </Button>
              <Button variant="primary" size="sm" onClick={handleSave} disabled={pending}>
                {pending ? "保存中…" : "确认保存"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                取消
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setConfirming(true)}
                disabled={pending || !state.accountId.trim()}
              >
                <Save />
                保存
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Compact read-only metadata badge row for a binding. */
export function BindingBadges({ binding }: { binding: ChannelConnectorPlatformBinding }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline">{binding.platform}</Badge>
      <Badge variant="outline">acct {binding.accountId || "—"}</Badge>
      {binding.botId && <Badge variant="outline">bot {binding.botId}</Badge>}
      <Badge variant="outline">{binding.allowlist.length} 允许</Badge>
      <Badge variant="outline">{binding.adminUsers.length} 管理员</Badge>
    </div>
  );
}
