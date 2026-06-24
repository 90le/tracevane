import * as React from "react";
import { ChevronDown, Save } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/design/ui/sheet";
import { toast } from "@/design/ui/sonner";

import { useSaveChannelConnectorsConfigMutation } from "@/lib/query/channel-connectors";
import type {
  ChannelConnectorsNativeConfig,
  ChannelConnectorAgentProfile,
  ChannelConnectorPlatformBinding,
  ChannelConnectorPlatformId,
} from "../types";

type EditorMode = "create" | "edit";

interface AccountState {
  id: string;
  platform: ChannelConnectorPlatformId;
  displayName: string;
  enabled: boolean;
  accountId: string;
  botId: string;
  appId: string;
  appSecret: string;
  verificationToken: string;
  encryptKey: string;
  apiUrl: string;
  botToken: string;
  wsUrl: string;
  corpId: string;
  corpSecret: string;
  agentId: string;
  token: string;
  encodingAesKey: string;
  metadataJson: string;
  advancedOpen: boolean;
}

interface RouteState {
  displayName: string;
  agentProfileId: string;
  enabled: boolean;
  peerKind: string;
  peerId: string;
  sessionMode: string;
  busyGuard: boolean;
  attachmentStaging: boolean;
  allowlist: string;
  adminUsers: string;
  disabledCommands: string;
}

const ACCOUNT_METADATA_KEYS = new Set([
  "appId",
  "appSecret",
  "verificationToken",
  "encryptKey",
  "apiUrl",
  "botToken",
  "wsUrl",
  "corpId",
  "corpSecret",
  "agentId",
  "token",
  "encodingAesKey",
  "aesKey",
]);

const ROUTE_METADATA_KEYS = new Set([
  "peerKind",
  "peerId",
  "sessionMode",
  "busyGuard",
  "attachmentStaging",
]);

function createBindingId(platform: ChannelConnectorPlatformId): string {
  return `${platform}-${Date.now().toString(36)}`;
}

function defaultPlatform(platforms: ChannelConnectorPlatformId[]): ChannelConnectorPlatformId {
  return platforms.includes("feishu") ? "feishu" : platforms[0] || "octo";
}

function readMeta(binding: ChannelConnectorPlatformBinding | null, key: string): string {
  const value = binding?.metadata?.[key];
  return typeof value === "string" ? value : "";
}

function readMetaBool(binding: ChannelConnectorPlatformBinding | null, key: string, fallback: boolean): boolean {
  const value = binding?.metadata?.[key];
  return typeof value === "boolean" ? value : fallback;
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

function stripKeys(metadata: Record<string, unknown>, keys: Set<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !keys.has(key)));
}

function mergeString(target: Record<string, unknown>, key: string, value: string) {
  const trimmed = value.trim();
  if (trimmed) target[key] = trimmed;
}

function toAccountState(
  binding: ChannelConnectorPlatformBinding | null,
  platforms: ChannelConnectorPlatformId[],
): AccountState {
  const platform = binding?.platform ?? defaultPlatform(platforms);
  return {
    id: binding?.id ?? createBindingId(platform),
    platform,
    displayName: binding?.displayName ?? "",
    enabled: binding?.enabled ?? true,
    accountId: binding?.accountId ?? "",
    botId: binding?.botId ?? "",
    appId: readMeta(binding, "appId"),
    appSecret: readMeta(binding, "appSecret"),
    verificationToken: readMeta(binding, "verificationToken"),
    encryptKey: readMeta(binding, "encryptKey"),
    apiUrl: readMeta(binding, "apiUrl"),
    botToken: readMeta(binding, "botToken"),
    wsUrl: readMeta(binding, "wsUrl"),
    corpId: readMeta(binding, "corpId"),
    corpSecret: readMeta(binding, "corpSecret"),
    agentId: readMeta(binding, "agentId"),
    token: readMeta(binding, "token"),
    encodingAesKey: readMeta(binding, "encodingAesKey") || readMeta(binding, "aesKey"),
    metadataJson: JSON.stringify(stripKeys(binding?.metadata ?? {}, ACCOUNT_METADATA_KEYS), null, 2),
    advancedOpen: false,
  };
}

function toRouteState(
  binding: ChannelConnectorPlatformBinding | null,
  defaultAgentProfileId: string,
): RouteState {
  return {
    displayName: binding?.displayName ?? "",
    agentProfileId: binding?.agentProfileId ?? defaultAgentProfileId,
    enabled: binding?.enabled ?? true,
    peerKind: readMeta(binding, "peerKind") || "private",
    peerId: readMeta(binding, "peerId") || "*",
    sessionMode: readMeta(binding, "sessionMode") || "persistent",
    busyGuard: readMetaBool(binding, "busyGuard", true),
    attachmentStaging: readMetaBool(binding, "attachmentStaging", true),
    allowlist: (binding?.allowlist ?? []).join(", "),
    adminUsers: (binding?.adminUsers ?? []).join(", "),
    disabledCommands: (binding?.disabledCommands ?? []).join(", "),
  };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-ink-strong">{label}</span>
      {children}
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </label>
  );
}

function SelectField({
  label,
  hint,
  value,
  onChange,
  children,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-9 w-full rounded-sm border border-line bg-panel-2 px-[11px] text-base text-ink-strong outline-none focus-visible:border-primary-line focus-visible:shadow-[var(--ring)] disabled:opacity-60"
      >
        {children}
      </select>
    </Field>
  );
}

function FormSection({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-sm border border-line bg-panel-2 p-3">
      <div>
        <h4 className="text-sm font-semibold text-ink-strong">{title}</h4>
        {sub && <p className="mt-0.5 text-xs text-subtle">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function toggleInput(
  checked: boolean,
  onChange: (checked: boolean) => void,
  label: string,
  sub?: string,
) {
  return (
    <label className="flex items-center gap-2 rounded-sm border border-line bg-panel px-3 py-2 text-sm text-ink-strong">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--primary)]"
      />
      <span className="grid">
        <strong>{label}</strong>
        {sub && <span className="text-xs font-normal text-subtle">{sub}</span>}
      </span>
    </label>
  );
}

function PlatformCredentialFields({
  state,
  patch,
}: {
  state: AccountState;
  patch: (next: Partial<AccountState>) => void;
}) {
  if (state.platform === "feishu") {
    return (
      <>
        <FormSection title="应用凭据" sub="用于 tenant_access_token 与发送能力；保存后敏感值只显示 [redacted]。">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="App ID"><Input value={state.appId} onChange={(e) => patch({ appId: e.target.value })} /></Field>
            <Field label="App Secret"><Input value={state.appSecret} onChange={(e) => patch({ appSecret: e.target.value })} /></Field>
          </div>
          <Field label="Bot ID" hint="可选；没有独立 bot 时可留空。">
            <Input value={state.botId} onChange={(e) => patch({ botId: e.target.value })} />
          </Field>
        </FormSection>
        <FormSection title="事件回调" sub="回调 URL 由守护服务提供；这里保存飞书校验字段。">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Verification Token"><Input value={state.verificationToken} onChange={(e) => patch({ verificationToken: e.target.value })} /></Field>
            <Field label="Encrypt Key"><Input value={state.encryptKey} onChange={(e) => patch({ encryptKey: e.target.value })} /></Field>
          </div>
          <div className="rounded-sm border border-line bg-panel px-3 py-2 text-sm text-muted">Callback URL：由守护诊断页展示和复制。</div>
        </FormSection>
      </>
    );
  }
  if (state.platform === "octo") {
    return (
      <FormSection title="连接" sub="Octo 当前有 verified register transport smoke。">
        <Field label="API URL"><Input value={state.apiUrl} onChange={(e) => patch({ apiUrl: e.target.value })} placeholder="https://..." /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bot Token"><Input value={state.botToken} onChange={(e) => patch({ botToken: e.target.value })} /></Field>
          <Field label="WebSocket URL" hint="可选"><Input value={state.wsUrl} onChange={(e) => patch({ wsUrl: e.target.value })} /></Field>
        </div>
      </FormSection>
    );
  }
  if (state.platform === "wecom") {
    return (
      <>
        <FormSection title="应用凭据" sub="WeCom 字段模板已提供；真实 smoke 需等待后端 adapter 验证。">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Corp ID"><Input value={state.corpId} onChange={(e) => patch({ corpId: e.target.value })} /></Field>
            <Field label="Agent ID"><Input value={state.agentId} onChange={(e) => patch({ agentId: e.target.value })} /></Field>
          </div>
          <Field label="Secret"><Input value={state.corpSecret} onChange={(e) => patch({ corpSecret: e.target.value })} /></Field>
        </FormSection>
        <FormSection title="事件回调" sub="保存 Token / EncodingAESKey；当前不声明测试可用。">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Token"><Input value={state.token} onChange={(e) => patch({ token: e.target.value })} /></Field>
            <Field label="EncodingAESKey"><Input value={state.encodingAesKey} onChange={(e) => patch({ encodingAesKey: e.target.value })} /></Field>
          </div>
        </FormSection>
      </>
    );
  }
  return (
    <FormSection title="未验证平台" sub="该平台暂无 verified adapter/smoke；可保存为停用草稿，但不要假装已可用。">
      <div className="rounded-sm border border-amber bg-amber-soft p-3 text-sm text-amber">
        {state.platform} 目前未接入可验证字段模板。请保持停用，等待 adapter 完成。
      </div>
    </FormSection>
  );
}

function buildAccountMetadata(binding: ChannelConnectorPlatformBinding | null, state: AccountState) {
  const base = stripKeys(binding?.metadata ?? {}, ACCOUNT_METADATA_KEYS);
  const advanced = parseMetadata(state.metadataJson);
  const next = { ...base, ...advanced };
  mergeString(next, "appId", state.appId);
  mergeString(next, "appSecret", state.appSecret);
  mergeString(next, "verificationToken", state.verificationToken);
  mergeString(next, "encryptKey", state.encryptKey);
  mergeString(next, "apiUrl", state.apiUrl);
  mergeString(next, "botToken", state.botToken);
  mergeString(next, "wsUrl", state.wsUrl);
  mergeString(next, "corpId", state.corpId);
  mergeString(next, "corpSecret", state.corpSecret);
  mergeString(next, "agentId", state.agentId);
  mergeString(next, "token", state.token);
  mergeString(next, "encodingAesKey", state.encodingAesKey);
  return next;
}

function buildRouteMetadata(binding: ChannelConnectorPlatformBinding | null, state: RouteState) {
  const next = stripKeys(binding?.metadata ?? {}, ROUTE_METADATA_KEYS);
  next.peerKind = state.peerKind;
  next.peerId = state.peerId.trim() || "*";
  next.sessionMode = state.sessionMode;
  next.busyGuard = state.busyGuard;
  next.attachmentStaging = state.attachmentStaging;
  return next;
}

function useSaveBinding({
  config,
  binding,
  mode,
  onSaved,
  onOpenChange,
}: {
  config: ChannelConnectorsNativeConfig | null;
  binding: ChannelConnectorPlatformBinding | null;
  mode: EditorMode;
  onSaved?: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const saveMutation = useSaveChannelConnectorsConfigMutation();
  const save = React.useCallback(
    (nextBinding: ChannelConnectorPlatformBinding, label: string) => {
      if (!config) return;
      const exists = config.platformBindings.some((item) => item.id === nextBinding.id);
      if (mode === "create" && exists) {
        toast.error("绑定 ID 已存在", { description: nextBinding.id });
        return;
      }
      saveMutation.mutate(
        {
          config: {
            ...config,
            updatedAt: new Date().toISOString(),
            platformBindings: binding
              ? config.platformBindings.map((item) => (item.id === binding.id ? nextBinding : item))
              : [...config.platformBindings, nextBinding],
          },
        },
        {
          onSuccess: (result) => {
            toast.success(label, { description: `更新于 ${new Date(result.config.updatedAt).toLocaleString()}` });
            onSaved?.();
            onOpenChange(false);
          },
          onError: (error) => toast.error("保存失败", { description: error.message }),
        },
      );
    },
    [binding, config, mode, onOpenChange, onSaved, saveMutation],
  );
  return { save, pending: saveMutation.isPending };
}

export function AccountEditor({
  open,
  onOpenChange,
  binding,
  config,
  supportedPlatforms,
  defaultAgentProfileId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binding: ChannelConnectorPlatformBinding | null;
  config: ChannelConnectorsNativeConfig | null;
  supportedPlatforms: ChannelConnectorPlatformId[];
  defaultAgentProfileId: string;
  onSaved?: () => void;
}) {
  const mode: EditorMode = binding ? "edit" : "create";
  const [state, setState] = React.useState<AccountState | null>(null);
  const { save, pending } = useSaveBinding({ config, binding, mode, onSaved, onOpenChange });

  React.useEffect(() => {
    if (open) setState(toAccountState(binding, supportedPlatforms));
  }, [binding, open, supportedPlatforms]);

  if (!state || !config) return null;
  const patch = (next: Partial<AccountState>) => setState((prev) => (prev ? { ...prev, ...next } : prev));
  const canSmoke = state.platform === "feishu" || state.platform === "octo";

  const handleSave = () => {
    if (!state.id.trim() || !state.accountId.trim()) {
      toast.error("账号 ID 和绑定 ID 不能为空");
      return;
    }
    try {
      const metadata = buildAccountMetadata(binding, state);
      const nextBinding: ChannelConnectorPlatformBinding = {
        ...(binding ?? {
          id: state.id.trim(),
          platform: state.platform,
          displayName: state.displayName.trim() || state.id.trim(),
          agentProfileId: defaultAgentProfileId,
          enabled: true,
          accountId: state.accountId.trim(),
          botId: null,
          allowlist: [],
          adminUsers: [],
          disabledCommands: [],
        }),
        id: state.id.trim(),
        platform: state.platform,
        displayName: state.displayName.trim() || state.id.trim(),
        enabled: state.enabled,
        accountId: state.accountId.trim(),
        botId: state.botId.trim() || null,
        metadata,
      };
      save(nextBinding, mode === "create" ? "已新建平台账号" : "已保存平台账号");
    } catch (error) {
      toast.error("高级 metadata JSON 无效", { description: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(value) => !pending && onOpenChange(value)}>
      <SheetContent className="w-[min(860px,94vw)] sm:max-w-[860px]">
        <SheetHeader className="items-start pr-12">
          <div>
            <SheetTitle>{mode === "create" ? "新建平台账号" : `编辑平台账号 · ${binding?.platform}`}</SheetTitle>
            <p className="mt-1 text-sm text-subtle">凭据、回调和平台级连接配置；保存后敏感字段会脱敏。</p>
          </div>
        </SheetHeader>
        <SheetBody className="gap-4">
          <FormSection title="基础信息" sub="一个 IM 平台里的 bot/app/account 身份。">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="配置 ID" hint="稳定键；创建后不建议修改。">
                <Input value={state.id} disabled={mode === "edit"} onChange={(e) => patch({ id: e.target.value })} />
              </Field>
              <SelectField
                label="平台"
                value={state.platform}
                onChange={(value) => {
                  const platform = value as ChannelConnectorPlatformId;
                  patch({ platform, id: mode === "create" ? createBindingId(platform) : state.id });
                }}
                disabled={mode === "edit"}
              >
                {supportedPlatforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
              </SelectField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="显示名称"><Input value={state.displayName} onChange={(e) => patch({ displayName: e.target.value })} /></Field>
              <Field label="账号 ID"><Input value={state.accountId} onChange={(e) => patch({ accountId: e.target.value })} /></Field>
            </div>
            {toggleInput(state.enabled, (enabled) => patch({ enabled }), "启用此平台账号", "未验证平台建议先保持停用")}
          </FormSection>

          <PlatformCredentialFields state={state} patch={patch} />

          <section className="rounded-sm border border-line bg-panel-2">
            <button
              type="button"
              onClick={() => patch({ advancedOpen: !state.advancedOpen })}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-ink-strong"
            >
              <ChevronDown className={cn("size-4 transition-transform", state.advancedOpen && "rotate-180")} />
              高级 metadata JSON
              <Badge variant="outline" className="ml-auto">advanced</Badge>
            </button>
            {state.advancedOpen && (
              <div className="grid gap-2 border-t border-line p-3">
                <textarea
                  value={state.metadataJson}
                  onChange={(e) => patch({ metadataJson: e.target.value })}
                  className="min-h-[120px] w-full rounded-sm border border-line bg-panel px-[11px] py-2 font-mono text-sm text-ink-strong outline-none focus-visible:border-primary-line focus-visible:shadow-[var(--ring)]"
                  spellCheck={false}
                />
                <p className="text-xs text-subtle">只放平台模板未覆盖的高级字段；看到 [redacted] 时直接保存不会清空真实 secret。</p>
              </div>
            )}
          </section>

          {!canSmoke && (
            <div className="rounded-sm border border-amber bg-amber-soft p-3 text-sm text-amber">
              当前平台没有 verified transport smoke；“保存并测试”不会显示为可用能力。
            </div>
          )}
        </SheetBody>
        <SheetFooter className="justify-end bg-panel/95">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={pending || !state.id.trim() || !state.accountId.trim()}>
            <Save />
            {pending ? "保存中…" : "保存"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function RouteEditor({
  open,
  onOpenChange,
  binding,
  config,
  agentProfiles,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binding: ChannelConnectorPlatformBinding | null;
  config: ChannelConnectorsNativeConfig | null;
  agentProfiles: ChannelConnectorAgentProfile[];
  onSaved?: () => void;
}) {
  const [state, setState] = React.useState<RouteState | null>(null);
  const { save, pending } = useSaveBinding({ config, binding, mode: "edit", onSaved, onOpenChange });
  const defaultAgentProfileId = config?.defaultAgentProfileId || agentProfiles[0]?.id || "default";

  React.useEffect(() => {
    if (open) setState(toRouteState(binding, defaultAgentProfileId));
  }, [binding, defaultAgentProfileId, open]);

  if (!binding || !state || !config) return null;
  const patch = (next: Partial<RouteState>) => setState((prev) => (prev ? { ...prev, ...next } : prev));
  const selectedProfile = agentProfiles.find((profile) => profile.id === state.agentProfileId);

  const handleSave = () => {
    const nextBinding: ChannelConnectorPlatformBinding = {
      ...binding,
      displayName: state.displayName.trim() || binding.displayName || binding.id,
      enabled: state.enabled,
      agentProfileId: state.agentProfileId,
      allowlist: splitList(state.allowlist),
      adminUsers: splitList(state.adminUsers),
      disabledCommands: splitList(state.disabledCommands),
      metadata: buildRouteMetadata(binding, state),
    };
    save(nextBinding, "已保存绑定路由");
  };

  return (
    <Sheet open={open} onOpenChange={(value) => !pending && onOpenChange(value)}>
      <SheetContent className="w-[min(860px,94vw)] sm:max-w-[860px]">
        <SheetHeader className="items-start pr-12">
          <div>
            <SheetTitle>编辑绑定路由</SheetTitle>
            <p className="mt-1 text-sm text-subtle">只配置 IM 来源 → Agent Profile；平台 token/appSecret 请到“平台账号”编辑。</p>
          </div>
        </SheetHeader>
        <SheetBody className="gap-4">
          <FormSection title="基础与来源" sub={`${binding.platform} · ${binding.accountId}`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="路由名称"><Input value={state.displayName} onChange={(e) => patch({ displayName: e.target.value })} /></Field>
              <SelectField label="来源类型" value={state.peerKind} onChange={(peerKind) => patch({ peerKind })}>
                <option value="private">私聊</option>
                <option value="group">群聊</option>
                <option value="channel">频道</option>
                <option value="thread">Thread</option>
              </SelectField>
            </div>
            <Field label="来源 ID" hint="* 表示匹配该账号下所有来源，需谨慎。">
              <Input value={state.peerId} onChange={(e) => patch({ peerId: e.target.value })} />
            </Field>
            {toggleInput(state.enabled, (enabled) => patch({ enabled }), "启用此绑定路由")}
          </FormSection>

          <FormSection title="Agent 目标" sub="模型路由归 Model Gateway 管理，这里只读预览。">
            <SelectField label="Agent Profile" value={state.agentProfileId} onChange={(agentProfileId) => patch({ agentProfileId })}>
              {!agentProfiles.some((profile) => profile.id === state.agentProfileId) && <option value={state.agentProfileId}>{state.agentProfileId}</option>}
              {agentProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.agent}</option>)}
            </SelectField>
            <div className="grid gap-2 rounded-sm border border-line bg-panel p-3 text-sm text-muted sm:grid-cols-2">
              <span>Agent：<strong className="text-ink-strong">{selectedProfile?.agent ?? "—"}</strong></span>
              <span>模型：<strong className="text-ink-strong">{selectedProfile?.model ?? "默认路由"}</strong></span>
              <span className="sm:col-span-2">工作目录：<strong className="text-ink-strong">{selectedProfile?.workDir ?? "—"}</strong></span>
            </div>
          </FormSection>

          <FormSection title="权限策略" sub="逗号或换行分隔。">
            <Field label="allowlist"><Input value={state.allowlist} onChange={(e) => patch({ allowlist: e.target.value })} placeholder="uid1, uid2" /></Field>
            <Field label="adminUsers"><Input value={state.adminUsers} onChange={(e) => patch({ adminUsers: e.target.value })} placeholder="uid1, uid2" /></Field>
            <Field label="disabledCommands"><Input value={state.disabledCommands} onChange={(e) => patch({ disabledCommands: e.target.value })} placeholder="/reset, /stop" /></Field>
          </FormSection>

          <FormSection title="会话策略" sub="当前写入 metadata，守护实现按已支持字段解释。">
            <SelectField label="会话模式" value={state.sessionMode} onChange={(sessionMode) => patch({ sessionMode })}>
              <option value="persistent">持久会话</option>
              <option value="one-shot">单次会话</option>
            </SelectField>
            <div className="grid gap-2 sm:grid-cols-2">
              {toggleInput(state.busyGuard, (busyGuard) => patch({ busyGuard }), "busy guard", "会话忙时排队/保护")}
              {toggleInput(state.attachmentStaging, (attachmentStaging) => patch({ attachmentStaging }), "附件暂存", "附件先落盘再交给 Agent")}
            </div>
          </FormSection>
        </SheetBody>
        <SheetFooter className="justify-end bg-panel/95">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={pending}>
            <Save />
            {pending ? "保存中…" : "保存"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function BindingBadges({ binding }: { binding: ChannelConnectorPlatformBinding }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline">{binding.platform}</Badge>
      <Badge variant="outline">acct {binding.accountId || "—"}</Badge>
      {binding.botId && <Badge variant="outline">bot {binding.botId}</Badge>}
      <Badge variant="outline">{binding.allowlist.length} 允许</Badge>
      <Badge variant="outline">{binding.adminUsers.length} 管理员</Badge>
      {binding.metadata && Object.keys(binding.metadata).length > 0 && <Badge variant="outline">metadata {Object.keys(binding.metadata).length}</Badge>}
    </div>
  );
}
