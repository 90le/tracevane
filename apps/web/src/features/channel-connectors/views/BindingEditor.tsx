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
  ChannelConnectorPlatformId,
} from "../types";

/** Editable subset of a platform binding — identity, transport, access. */
interface EditorState {
  id: string;
  platform: ChannelConnectorPlatformId;
  displayName: string;
  agentProfileId: string;
  enabled: boolean;
  accountId: string;
  botId: string;
  allowlist: string;
  adminUsers: string;
  disabledCommands: string;
  metadataJson: string;
}

function createBindingId(platform: ChannelConnectorPlatformId): string {
  return `${platform}-${Date.now().toString(36)}`;
}

function defaultPlatform(platforms: ChannelConnectorPlatformId[]): ChannelConnectorPlatformId {
  return platforms.includes("feishu") ? "feishu" : platforms[0] || "octo";
}

function toEditorState(
  binding: ChannelConnectorPlatformBinding | null,
  defaults: { agentProfileId: string; platforms: ChannelConnectorPlatformId[] },
): EditorState {
  const platform = binding?.platform ?? defaultPlatform(defaults.platforms);
  return {
    id: binding?.id ?? createBindingId(platform),
    platform,
    displayName: binding?.displayName ?? "",
    agentProfileId: binding?.agentProfileId ?? defaults.agentProfileId,
    enabled: binding?.enabled ?? true,
    accountId: binding?.accountId ?? "",
    botId: binding?.botId ?? "",
    allowlist: (binding?.allowlist ?? []).join(", "),
    adminUsers: (binding?.adminUsers ?? []).join(", "),
    disabledCommands: (binding?.disabledCommands ?? []).join(", "),
    metadataJson: JSON.stringify(binding?.metadata ?? {}, null, 2),
  };
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseMetadata(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("metadata 必须是 JSON object");
  }
  return parsed as Record<string, unknown>;
}

function metadataHint(platform: ChannelConnectorPlatformId): string {
  if (platform === "feishu") {
    return '常用字段：{"appId":"...","appSecret":"...","verificationToken":"...","encryptKey":"..."}';
  }
  if (platform === "octo") {
    return '常用字段：{"apiUrl":"...","botToken":"...","wsUrl":"..."}';
  }
  if (platform === "wecom") {
    return '常用字段：{"corpId":"...","corpSecret":"...","agentId":"...","token":"...","aesKey":"..."}';
  }
  return "填写该平台 transport 需要的 JSON 字段；返回的敏感值会显示为 [redacted]，直接保存不会清空真实值。";
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
 * we confirm + show evidence (updatedAt) before applying. The API preserves
 * previously stored secrets when redacted placeholders are submitted back.
 */
export function BindingEditor({
  open,
  onOpenChange,
  binding,
  config,
  agentProfileIds,
  supportedPlatforms,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binding: ChannelConnectorPlatformBinding | null;
  config: ChannelConnectorsNativeConfig | null;
  agentProfileIds: string[];
  supportedPlatforms: ChannelConnectorPlatformId[];
  onSaved?: () => void;
}) {
  const saveMutation = useSaveChannelConnectorsConfigMutation();
  const [state, setState] = React.useState<EditorState | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const isCreating = binding == null;

  React.useEffect(() => {
    if (!open || !config) return;
    setState(
      toEditorState(binding, {
        agentProfileId: config.defaultAgentProfileId || agentProfileIds[0] || "default",
        platforms: supportedPlatforms,
      }),
    );
    setConfirming(false);
  }, [agentProfileIds, binding, config, open, supportedPlatforms]);

  if (!config || !state) return null;

  const patch = (next: Partial<EditorState>) =>
    setState((prev) => (prev ? { ...prev, ...next } : prev));

  const buildNextConfig = (): ChannelConnectorsNativeConfig => {
    const metadata = parseMetadata(state.metadataJson);
    const id = state.id.trim();
    const nextBinding: ChannelConnectorPlatformBinding = {
      ...(binding ?? {
        id,
        platform: state.platform,
        displayName: "",
        agentProfileId: state.agentProfileId,
        enabled: true,
        accountId: "",
        botId: null,
        allowlist: [],
        adminUsers: [],
        disabledCommands: [],
      }),
      id,
      platform: state.platform,
      displayName: state.displayName.trim() || id,
      agentProfileId: state.agentProfileId,
      enabled: state.enabled,
      accountId: state.accountId.trim(),
      botId: state.botId.trim() ? state.botId.trim() : null,
      allowlist: splitList(state.allowlist),
      adminUsers: splitList(state.adminUsers),
      disabledCommands: splitList(state.disabledCommands),
      metadata,
    };
    return {
      ...config,
      updatedAt: new Date().toISOString(),
      platformBindings: binding
        ? config.platformBindings.map((b) => (b.id === binding.id ? nextBinding : b))
        : [...config.platformBindings, nextBinding],
    };
  };

  const handleConfirm = () => {
    if (!state.id.trim()) {
      toast.error("绑定 ID 不能为空");
      return;
    }
    if (!state.accountId.trim()) {
      toast.error("账号 ID 不能为空");
      return;
    }
    if (isCreating && config.platformBindings.some((b) => b.id === state.id.trim())) {
      toast.error("绑定 ID 已存在", { description: "请换一个唯一 ID。" });
      return;
    }
    try {
      buildNextConfig();
      setConfirming(true);
    } catch (error) {
      toast.error("metadata JSON 无效", { description: error instanceof Error ? error.message : String(error) });
    }
  };

  const handleSave = () => {
    let nextConfig: ChannelConnectorsNativeConfig;
    try {
      nextConfig = buildNextConfig();
    } catch (error) {
      toast.error("metadata JSON 无效", { description: error instanceof Error ? error.message : String(error) });
      setConfirming(false);
      return;
    }
    saveMutation.mutate(
      { config: nextConfig },
      {
        onSuccess: (result) => {
          toast.success(isCreating ? "已新建平台绑定" : "已保存绑定配置", {
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
          <DialogTitle>{isCreating ? "新建平台绑定" : `编辑绑定 · ${binding?.platform}`}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="绑定 ID" hint="稳定配置键；创建后建议不要频繁修改">
              <Input
                value={state.id}
                onChange={(e) => patch({ id: e.target.value })}
                disabled={!isCreating}
              />
            </Field>
            <Field label="平台">
              <select
                value={state.platform}
                onChange={(e) => {
                  const platform = e.target.value as ChannelConnectorPlatformId;
                  patch({ platform, id: isCreating ? createBindingId(platform) : state.id });
                }}
                disabled={!isCreating}
                className="h-9 w-full rounded-sm border border-line bg-panel-2 px-[11px] text-base text-ink-strong outline-none focus-visible:border-primary-line focus-visible:shadow-[var(--ring)] disabled:opacity-60"
              >
                {supportedPlatforms.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </Field>
          </div>
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
            <Field label="账号 ID" hint="平台账号/租户/机器人账号标识">
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
          <Field label="Transport metadata JSON" hint={metadataHint(state.platform)}>
            <textarea
              value={state.metadataJson}
              onChange={(e) => patch({ metadataJson: e.target.value })}
              spellCheck={false}
              className="min-h-[110px] w-full rounded-sm border border-line bg-panel-2 px-[11px] py-2 font-mono text-sm text-ink-strong outline-none focus-visible:border-primary-line focus-visible:shadow-[var(--ring)]"
              placeholder={'{"appId":"...","appSecret":"..."}'}
            />
          </Field>
          <div className="rounded-sm border border-line bg-panel-2 p-3 text-xs text-muted">
            敏感字段会在读取时脱敏；看到 <code>[redacted]</code> 时直接保存不会清空真实 token。
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
                onClick={handleConfirm}
                disabled={pending || !state.accountId.trim() || !state.id.trim()}
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
      {binding.metadata && Object.keys(binding.metadata).length > 0 && (
        <Badge variant="outline">metadata {Object.keys(binding.metadata).length}</Badge>
      )}
    </div>
  );
}
