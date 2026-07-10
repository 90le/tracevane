import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Activity,
  Bot,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RadioTower,
  Route,
  ScanQrCode,
  ShieldCheck,
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
  useApplyChannelConnectorsV3ConfigMutation,
  useCancelFeishuAppRegistrationMutation,
  useChannelConnectorAccountSecretsQuery,
  useChannelConnectorsStatusQuery,
  useChannelConnectorsV3ConfigQuery,
  useFeishuAppRegistrationQuery,
  usePlanChannelConnectorsV3ConfigMutation,
  usePreviewChannelConnectorV3RoutingMutation,
  useRunFeishuTransportSmokeMutation,
  useRunOctoTransportSmokeMutation,
  useStartFeishuAppRegistrationMutation,
} from "@/lib/query/channel-connectors";
import {
  CHANNEL_CONNECTOR_DEFAULT_FEISHU_API_URL,
  CHANNEL_CONNECTOR_DEFAULT_LARK_API_URL,
  CHANNEL_CONNECTOR_DEFAULT_OCTO_API_URL,
  type ChannelConnectorAccount,
  type ChannelConnectorAccountLifecycle,
  type ChannelConnectorDeliveryPeerKind,
  type ChannelConnectorDeliveryPolicy,
  type ChannelConnectorDeliveryTarget,
  type ChannelConnectorFeishuAppRegistrationSessionResponse,
  type ChannelConnectorFeishuAppRegistrationStatus,
  type ChannelConnectorFeishuAppRegistrationTenant,
  type ChannelConnectorPlatformBinding,
  type ChannelConnectorSourceRule,
  type ChannelConnectorsDaemonRuntimeStatus,
  type ChannelConnectorsV3Config,
  type ChannelConnectorsV3ConfigPlanResponse,
} from "../types";
import type { ChannelConnectorsViewProps } from "./types";
import { FormField, SecretInput, SelectInput, TextareaInput, ToggleField } from "./V3Fields";
import { V3PlanDialog } from "./V3PlanDialog";

const REDACTED = "[redacted]";
const MANAGED_ADVANCED_KEYS = new Set([
  "feishuProgressCardEntryLimit",
  "stageOctoUrlAttachments",
  "attachmentMaxBytes",
  "cosUploadBaseUrl",
  "octoUploadStrategy",
  "octoDirectUploadMinBytes",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textValue(source: Record<string, unknown>, key: string, fallback = ""): string {
  const value = source[key];
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function boolValue(source: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = source[key];
  if (typeof value === "boolean") return value;
  return value == null ? fallback : ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function numberValue(source: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(source[key]);
  return Number.isFinite(value) ? value : fallback;
}

function splitList(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}

function accountTemplate(platform: "feishu" | "octo", hasTarget: boolean): ChannelConnectorAccount {
  const id = `${platform}-${Date.now().toString(36)}`;
  return {
    id,
    platform,
    displayName: platform === "feishu" ? "新飞书机器人" : "新 Octo 账号",
    lifecycle: hasTarget ? "draft" : "draft",
    externalAccountId: null,
    botId: null,
    credentials: {},
    transport: {
      apiUrl: platform === "feishu"
        ? CHANNEL_CONNECTOR_DEFAULT_FEISHU_API_URL
        : CHANNEL_CONNECTOR_DEFAULT_OCTO_API_URL,
    },
    security: { allowPrivateAttachmentUrls: false, allowedAttachmentHosts: [] },
    advanced: platform === "feishu"
      ? { feishuProgressCardEntryLimit: 8 }
      : { stageOctoUrlAttachments: true },
  };
}

function policyTemplate(accountId: string, targetId: string): ChannelConnectorDeliveryPolicy {
  return {
    id: `${accountId}-delivery`,
    accountRef: accountId,
    defaultTargetRef: targetId,
    defaultSessionPolicy: { mode: "persistent", busyGuard: true, attachmentStaging: true },
    defaultAccessPolicy: {
      allowlist: [],
      adminUsers: [],
      disabledCommands: [],
      mentionRequired: false,
    },
    rules: [],
  };
}

function ruleTemplate(targetId: string): ChannelConnectorSourceRule {
  return {
    id: `rule-${Date.now().toString(36)}`,
    name: "来源例外",
    enabled: true,
    match: { peer: { kind: "group" } },
    targetRef: targetId,
  };
}

function unknownAdvanced(advanced: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(advanced).filter(([key]) => !MANAGED_ADVANCED_KEYS.has(key)));
}

function replaceAccountAndPolicy(
  config: ChannelConnectorsV3Config,
  account: ChannelConnectorAccount,
  policy: ChannelConnectorDeliveryPolicy,
): ChannelConnectorsV3Config {
  const accounts = [...config.accounts];
  const accountIndex = accounts.findIndex((candidate) => candidate.id === account.id);
  if (accountIndex >= 0) accounts[accountIndex] = account;
  else accounts.push(account);
  const deliveryPolicies = config.deliveryPolicies.filter((candidate) => candidate.accountRef !== account.id);
  deliveryPolicies.push({ ...policy, accountRef: account.id });
  return { ...config, accounts, deliveryPolicies };
}

function secretValue(credentials: Record<string, unknown>, key: string): string {
  const value = textValue(credentials, key);
  return value === REDACTED ? "" : value;
}

function setSecret(account: ChannelConnectorAccount, key: string, value: string): ChannelConnectorAccount {
  return { ...account, credentials: { ...account.credentials, [key]: value } };
}

function registrationTerminal(status: ChannelConnectorFeishuAppRegistrationStatus | null | undefined): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled" || status === "expired";
}

function registrationLabel(status: ChannelConnectorFeishuAppRegistrationStatus | null | undefined): string {
  if (!status) return "未开始";
  const labels: Record<ChannelConnectorFeishuAppRegistrationStatus, string> = {
    "qr-ready": "等待扫码",
    polling: "等待确认",
    "slow-down": "等待平台",
    "domain-switched": "已切换账号域",
    succeeded: "授权成功",
    failed: "授权失败",
    cancelled: "已取消",
    expired: "已过期",
  };
  return labels[status];
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  toast.success("已复制授权链接");
}

function accountRuntimeState(
  account: ChannelConnectorAccount,
  runtime: ChannelConnectorsDaemonRuntimeStatus | null | undefined,
): { label: string; variant: "ok" | "warn" | "mute" | "info"; detail: string } {
  if (account.lifecycle !== "enabled") return { label: account.lifecycle === "draft" ? "草稿" : "已停用", variant: "mute", detail: "账号未启动连接" };
  if (runtime?.reachable !== true) return { label: "守护离线", variant: "warn", detail: runtime?.error || "无法读取消息守护" };
  if (account.platform === "feishu") {
    const connection = runtime.feishuConnectionDetails.find((item) => item.accountId === account.id || item.externalAccountId === account.externalAccountId);
    if (!connection) return { label: "等待应用", variant: "info", detail: "运行时尚未加载此账号" };
    if (connection.connected && connection.ingressVerified) return { label: "已收消息", variant: "ok", detail: "长连接与真实入站均已验证" };
    if (connection.connected) return { label: "连接待验证", variant: "warn", detail: "长连接已建立，尚未收到真实事件" };
    return { label: "连接异常", variant: "warn", detail: connection.lastError || connection.state };
  }
  if (account.platform === "octo") {
    const connection = runtime.octoConnectionDetails.find((item) => item.accountId === account.id || item.externalAccountId === account.externalAccountId);
    if (!connection) return { label: "等待应用", variant: "info", detail: "运行时尚未加载此账号" };
    return connection.connected
      ? { label: "已连接", variant: "ok", detail: "Octo WebSocket 已连接" }
      : { label: "连接异常", variant: "warn", detail: connection.lastError || connection.restHeartbeatLastError || connection.state };
  }
  return { label: "未检测", variant: "mute", detail: "平台暂无运行时探针" };
}

function smokeBinding(account: ChannelConnectorAccount, policy: ChannelConnectorDeliveryPolicy): ChannelConnectorPlatformBinding {
  const appId = textValue(account.credentials, "appId")
    || account.externalAccountId
    || textValue(account.transport, "appId");
  return {
    id: `${account.id}:default`,
    platform: account.platform,
    accountId: account.externalAccountId || account.id,
    botId: account.botId,
    displayName: account.displayName,
    agentProfileId: policy.defaultTargetRef,
    enabled: account.lifecycle === "enabled",
    allowlist: [...policy.defaultAccessPolicy.allowlist],
    adminUsers: [...policy.defaultAccessPolicy.adminUsers],
    disabledCommands: [...policy.defaultAccessPolicy.disabledCommands],
    metadata: {
      ...account.transport,
      ...account.advanced,
      ...account.credentials,
      ...(account.platform === "feishu" ? { appId } : {}),
      allowPrivateAttachmentUrls: account.security.allowPrivateAttachmentUrls,
      allowedAttachmentHosts: account.security.allowedAttachmentHosts,
      channelAccountId: account.id,
      peerKind: "private",
      peerId: "*",
    },
  };
}

function RuleEditor({
  rule,
  targets,
  onChange,
  onDelete,
}: {
  rule: ChannelConnectorSourceRule;
  targets: ChannelConnectorDeliveryTarget[];
  onChange: (rule: ChannelConnectorSourceRule) => void;
  onDelete: () => void;
}) {
  const access = rule.accessPolicy ?? {};
  return (
    <div className="grid gap-3 rounded-sm border border-line bg-panel p-3">
      <div className="flex items-center gap-2">
        <Route className="size-4 text-primary" />
        <Input className="h-8 min-w-0 flex-1" value={rule.name} onChange={(event) => onChange({ ...rule, name: event.target.value })} aria-label="规则名称" />
        <Button type="button" variant="ghost" size="icon" className="size-8 text-red" title="删除例外" aria-label="删除例外" onClick={onDelete}><Trash2 /></Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="来源类型">
          <SelectInput value={rule.match.peer.kind} onChange={(event) => onChange({ ...rule, match: { ...rule.match, peer: { ...rule.match.peer, kind: event.target.value as ChannelConnectorDeliveryPeerKind } } })}>
            <option value="private">私聊</option><option value="group">群聊</option><option value="channel">频道</option>
          </SelectInput>
        </FormField>
        <FormField label="来源 ID" hint="留空匹配该类型全部来源。">
          <Input value={rule.match.peer.id ?? ""} onChange={(event) => onChange({ ...rule, match: { ...rule.match, peer: { ...rule.match.peer, id: event.target.value.trim() || undefined } } })} placeholder="oc_xxx / user id" />
        </FormField>
        <FormField label="投递工作区">
          <SelectInput value={rule.targetRef} onChange={(event) => onChange({ ...rule, targetRef: event.target.value })}>{targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</SelectInput>
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="指定发送者" hint="可选，进一步缩小规则范围。"><Input value={rule.match.senderId ?? ""} onChange={(event) => onChange({ ...rule, match: { ...rule.match, senderId: event.target.value.trim() || undefined } })} /></FormField>
        <FormField label="指定线程" hint="可选。"><Input value={rule.match.threadId ?? ""} onChange={(event) => onChange({ ...rule, match: { ...rule.match, threadId: event.target.value.trim() || undefined } })} /></FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="规则 allowlist" hint="只能收紧账号默认 allowlist。"><Input value={(access.allowlist || []).join(", ")} onChange={(event) => onChange({ ...rule, accessPolicy: { ...access, allowlist: splitList(event.target.value) } })} /></FormField>
        <FormField label="额外禁用命令"><Input value={(access.disabledCommands || []).join(", ")} onChange={(event) => onChange({ ...rule, accessPolicy: { ...access, disabledCommands: splitList(event.target.value) } })} /></FormField>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ToggleField checked={rule.enabled} onChange={(enabled) => onChange({ ...rule, enabled })} label="启用此例外" />
        <ToggleField checked={rule.match.mentionRequired === true} onChange={(checked) => onChange({ ...rule, match: { ...rule.match, mentionRequired: checked ? true : undefined } })} label="必须 @机器人" />
      </div>
    </div>
  );
}

function FeishuAuthorization({
  account,
  onAuthorized,
}: {
  account: ChannelConnectorAccount;
  onAuthorized: (result: NonNullable<ChannelConnectorFeishuAppRegistrationSessionResponse["result"]>) => void;
}) {
  const [tenant, setTenant] = React.useState<ChannelConnectorFeishuAppRegistrationTenant>(textValue(account.transport, "apiUrl").includes("larksuite") ? "lark" : "feishu");
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const applied = React.useRef<string | null>(null);
  const start = useStartFeishuAppRegistrationMutation();
  const cancel = useCancelFeishuAppRegistrationMutation();
  const query = useFeishuAppRegistrationQuery(sessionId, {
    enabled: Boolean(sessionId),
    retry: 1,
    refetchInterval: (current) => registrationTerminal(current.state.data?.status) ? false : 2_000,
  });
  const registration = query.data ?? start.data ?? null;

  React.useEffect(() => {
    if (registration?.status !== "succeeded" || !registration.result) return;
    if (applied.current === registration.sessionId) return;
    applied.current = registration.sessionId;
    onAuthorized(registration.result);
    toast.success("飞书授权成功", { description: "App ID 与 App Secret 已回填，可继续校验和保存。" });
  }, [registration, onAuthorized]);

  const canCancel = Boolean(registration && !registrationTerminal(registration.status));
  const qrUrl = registration?.qrUrl || "";
  return (
    <div className="grid gap-3 rounded-sm border border-line bg-panel p-3">
      <div className="flex flex-wrap items-end gap-2">
        <FormField label="账号域" className="min-w-44">
          <SelectInput value={tenant} disabled={canCancel} onChange={(event) => setTenant(event.target.value === "lark" ? "lark" : "feishu")}><option value="feishu">Feishu · 中国区</option><option value="lark">Lark · 国际区</option></SelectInput>
        </FormField>
        <Button type="button" variant="outline" size="sm" disabled={start.isPending || canCancel} onClick={() => start.mutate({ tenant, appName: account.displayName }, { onSuccess: (result) => setSessionId(result.sessionId), onError: (error) => toast.error("生成飞书授权链接失败", { description: error.message }) })}>
          {start.isPending ? <Loader2 className="animate-spin" /> : <ScanQrCode />}
          生成扫码授权
        </Button>
        {canCancel && <Button type="button" variant="ghost" size="sm" disabled={cancel.isPending} onClick={() => sessionId && cancel.mutate(sessionId)}><Trash2 />取消</Button>}
        <Badge variant={registration?.status === "succeeded" ? "ok" : registration?.error ? "warn" : "outline"}>{registrationLabel(registration?.status)}</Badge>
      </div>
      {qrUrl && (
        <div className="grid gap-4 border-t border-line pt-3 sm:grid-cols-[208px_minmax(0,1fr)] sm:items-center">
          <div className="mx-auto grid size-[208px] place-items-center rounded-sm border border-line bg-white p-2">
            <QRCodeSVG value={qrUrl} title="飞书授权二维码" size={190} level="M" marginSize={2} className="size-full" />
          </div>
          <div className="grid min-w-0 gap-3">
            <div><strong className="text-sm text-ink-strong">使用手机飞书/Lark 扫码</strong><p className="mt-1 text-sm text-muted">在手机端确认创建应用；成功后凭据会自动回填。二维码由本机根据授权链接生成。</p></div>
            <code className="block truncate rounded-sm bg-panel-2 px-2 py-1 text-xs text-muted">{qrUrl}</code>
            <div className="flex flex-wrap gap-2"><Button type="button" size="sm" onClick={() => void copyText(qrUrl)}><Copy />复制链接</Button><Button type="button" variant="outline" size="sm" onClick={() => window.open(qrUrl, "_blank", "noopener,noreferrer")}><ExternalLink />打开链接</Button></div>
          </div>
        </div>
      )}
      {registration?.error && <p className="rounded-sm border border-amber/40 bg-amber-soft p-2 text-sm text-amber">{registration.error}</p>}
    </div>
  );
}

function AccountEditor({
  open,
  account,
  policy,
  targets,
  secrets,
  secretsLoading,
  planning,
  onOpenChange,
  onPlan,
}: {
  open: boolean;
  account: ChannelConnectorAccount | null;
  policy: ChannelConnectorDeliveryPolicy | null;
  targets: ChannelConnectorDeliveryTarget[];
  secrets: Record<string, string> | null;
  secretsLoading: boolean;
  planning: boolean;
  onOpenChange: (open: boolean) => void;
  onPlan: (account: ChannelConnectorAccount, policy: ChannelConnectorDeliveryPolicy) => void;
}) {
  const creating = account == null;
  const [draft, setDraft] = React.useState<ChannelConnectorAccount>(() => accountTemplate("feishu", targets.length > 0));
  const [draftPolicy, setDraftPolicy] = React.useState<ChannelConnectorDeliveryPolicy>(() => policyTemplate("pending", targets[0]?.id || ""));
  const [advancedJson, setAdvancedJson] = React.useState("{}");
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [advancedError, setAdvancedError] = React.useState<string | null>(null);
  const [preflight, setPreflight] = React.useState<{ ok: boolean; message: string } | null>(null);
  const feishuSmoke = useRunFeishuTransportSmokeMutation();
  const octoSmoke = useRunOctoTransportSmokeMutation();
  const preview = usePreviewChannelConnectorV3RoutingMutation();
  const [previewPeerKind, setPreviewPeerKind] = React.useState<ChannelConnectorDeliveryPeerKind>("private");
  const [previewPeerId, setPreviewPeerId] = React.useState("sample-peer");
  const [previewSender, setPreviewSender] = React.useState("sample-user");

  React.useEffect(() => {
    const next = account ? structuredClone(account) : accountTemplate("feishu", targets.length > 0);
    const nextPolicy = policy
      ? structuredClone(policy)
      : policyTemplate(next.id, targets[0]?.id || "");
    setDraft(next);
    setDraftPolicy({ ...nextPolicy, accountRef: next.id });
    setAdvancedJson(JSON.stringify(unknownAdvanced(next.advanced), null, 2));
    setAdvancedOpen(false);
    setAdvancedError(null);
    setPreflight(null);
  }, [open, account, policy, targets]);

  React.useEffect(() => {
    if (!secrets || !account) return;
    setDraft((current) => current.id === account.id
      ? { ...current, credentials: { ...current.credentials, ...secrets } }
      : current);
  }, [secrets, account]);

  const patch = (value: Partial<ChannelConnectorAccount>) => setDraft((current) => ({ ...current, ...value }));
  const setCredential = (key: string, value: string) => setDraft((current) => setSecret(current, key, value));
  const apiUrl = textValue(draft.transport, "apiUrl", draft.platform === "feishu" ? CHANNEL_CONNECTOR_DEFAULT_FEISHU_API_URL : CHANNEL_CONNECTOR_DEFAULT_OCTO_API_URL);
  const feishuAppId = textValue(draft.credentials, "appId")
    || draft.externalAccountId
    || textValue(draft.transport, "appId");
  const enabled = draft.lifecycle === "enabled";
  const defaultTarget = targets.find((target) => target.id === draftPolicy.defaultTargetRef);
  const credentialsReady = draft.platform === "feishu"
    ? Boolean(feishuAppId && textValue(draft.credentials, "appSecret"))
    : Boolean(textValue(draft.credentials, "botToken") && apiUrl);
  const valid = Boolean(draft.id.trim() && draft.displayName.trim() && draftPolicy.defaultTargetRef && (!enabled || credentialsReady));

  const switchPlatform = (platform: "feishu" | "octo") => {
    const next = accountTemplate(platform, targets.length > 0);
    setDraft({ ...next, id: draft.id, displayName: platform === "feishu" ? "新飞书机器人" : "新 Octo 账号" });
    setAdvancedJson("{}");
    setPreflight(null);
  };

  const runSmoke = () => {
    const binding = smokeBinding(draft, draftPolicy);
    setPreflight(null);
    if (draft.platform === "feishu") {
      feishuSmoke.mutate({ action: "tenant-token", binding }, {
        onSuccess: (result) => setPreflight({ ok: result.transport.ok === true, message: result.transport.error || `HTTP ${result.transport.statusCode ?? "ok"}` }),
        onError: (error) => setPreflight({ ok: false, message: error.message }),
      });
    } else if (draft.platform === "octo") {
      octoSmoke.mutate({ action: "register", binding }, {
        onSuccess: (result) => setPreflight({ ok: result.transport.ok === true, message: result.transport.error || `HTTP ${result.transport.statusCode ?? "ok"}` }),
        onError: (error) => setPreflight({ ok: false, message: error.message }),
      });
    }
  };

  const buildAndPlan = () => {
    let unmanaged: Record<string, unknown>;
    try {
      const parsed = JSON.parse(advancedJson || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("高级 JSON 必须是对象");
      unmanaged = parsed;
      setAdvancedError(null);
    } catch (error) {
      setAdvancedError(error instanceof Error ? error.message : "高级 JSON 无效");
      setAdvancedOpen(true);
      return;
    }
    const managed: Record<string, unknown> = draft.platform === "feishu"
      ? { feishuProgressCardEntryLimit: numberValue(draft.advanced, "feishuProgressCardEntryLimit", 8) }
      : {
          stageOctoUrlAttachments: boolValue(draft.advanced, "stageOctoUrlAttachments", true),
          attachmentMaxBytes: textValue(draft.advanced, "attachmentMaxBytes"),
          cosUploadBaseUrl: textValue(draft.advanced, "cosUploadBaseUrl"),
          octoUploadStrategy: textValue(draft.advanced, "octoUploadStrategy"),
          octoDirectUploadMinBytes: numberValue(draft.advanced, "octoDirectUploadMinBytes", 0),
        };
    onPlan({ ...draft, externalAccountId: draft.externalAccountId || (draft.platform === "feishu" ? feishuAppId || null : draft.id), advanced: { ...unmanaged, ...managed } }, { ...draftPolicy, accountRef: draft.id });
  };

  const runPreview = () => {
    const candidateAccount = { ...draft, lifecycle: draft.lifecycle === "draft" ? "enabled" as const : draft.lifecycle };
    preview.mutate({
      config: {
        version: 3,
        updatedAt: new Date().toISOString(),
        agentSessionPolicy: { maxSessions: 8, maxConcurrentTurns: 4, idleTimeoutMs: 600_000, busyStrategy: "reject", queueMaxRecords: 200, queueMaxAgeMs: 86_400_000 },
        accounts: [candidateAccount],
        targets,
        deliveryPolicies: [{ ...draftPolicy, accountRef: draft.id }],
      },
      context: { accountId: draft.id, peer: { kind: previewPeerKind, id: previewPeerId || "sample-peer" }, senderId: previewSender || "sample-user", threadId: null, botMentioned: true },
    });
  };

  const handleFeishuAuthorized = React.useCallback((result: NonNullable<ChannelConnectorFeishuAppRegistrationSessionResponse["result"]>) => {
    setDraft((current) => ({
      ...current,
      externalAccountId: result.appId,
      credentials: { ...current.credentials, appId: result.appId, appSecret: result.appSecret },
      transport: { ...current.transport, apiUrl: result.apiUrl },
      lifecycle: "enabled",
    }));
  }, []);

  const smokePending = feishuSmoke.isPending || octoSmoke.isPending;
  const previewResult = preview.data?.result ?? null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94vh] w-[min(980px,97vw)] flex-col">
        <DialogHeader><DialogTitle>{creating ? "新建渠道账号" : `编辑渠道账号 · ${account?.displayName ?? ""}`}</DialogTitle></DialogHeader>
        <DialogBody className="grid min-h-0 gap-5 overflow-y-auto">
          <section className="grid gap-3">
            <div><h3 className="font-semibold text-ink-strong">身份与状态</h3><p className="text-sm text-subtle">账号只保存平台身份、凭据和连接参数；Agent 配置属于工作区。</p></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="平台"><SelectInput value={draft.platform} disabled={!creating} onChange={(event) => switchPlatform(event.target.value === "octo" ? "octo" : "feishu")}><option value="feishu">飞书 / Lark</option><option value="octo">Octo</option></SelectInput></FormField>
              <FormField label="账号 ID" hint="创建后保持稳定。"><Input value={draft.id} disabled={!creating} onChange={(event) => { const id = event.target.value.trim(); patch({ id }); setDraftPolicy((current) => ({ ...current, accountRef: id, id: creating ? `${id}-delivery` : current.id })); }} /></FormField>
              <FormField label="显示名称"><Input value={draft.displayName} onChange={(event) => patch({ displayName: event.target.value })} /></FormField>
              <FormField label="生命周期"><SelectInput value={draft.lifecycle} onChange={(event) => patch({ lifecycle: event.target.value as ChannelConnectorAccountLifecycle })}><option value="draft">草稿</option><option value="enabled">启用</option><option value="disabled">停用</option></SelectInput></FormField>
            </div>
          </section>

          {draft.platform === "feishu" && (
            <section className="grid gap-3 border-t border-line pt-4">
              <div><h3 className="font-semibold text-ink-strong">扫码授权或手动配置</h3><p className="text-sm text-subtle">两种方式等价；授权成功后所有字段仍可查看和自由修改。</p></div>
              <FeishuAuthorization account={draft} onAuthorized={handleFeishuAuthorized} />
              {secretsLoading && !creating && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" />正在读取已保存密钥以支持明文回显…</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="App ID"><Input autoComplete="off" value={feishuAppId} onChange={(event) => { const appId = event.target.value; setCredential("appId", appId); patch({ externalAccountId: appId || null, transport: { ...draft.transport, appId } }); }} /></FormField>
                <FormField label="App Secret"><SecretInput label="App Secret" value={secretValue(draft.credentials, "appSecret")} onChange={(value) => setCredential("appSecret", value)} disabled={secretsLoading} /></FormField>
                <FormField label="Verification Token"><SecretInput label="Verification Token" value={secretValue(draft.credentials, "verificationToken")} onChange={(value) => setCredential("verificationToken", value)} disabled={secretsLoading} /></FormField>
                <FormField label="Encrypt Key"><SecretInput label="Encrypt Key" value={secretValue(draft.credentials, "encryptKey")} onChange={(value) => setCredential("encryptKey", value)} disabled={secretsLoading} /></FormField>
                <FormField label="Bot ID" hint="没有独立 bot ID 时可留空。"><Input value={draft.botId ?? ""} onChange={(event) => patch({ botId: event.target.value.trim() || null })} /></FormField>
                <FormField label="飞书 API URL" hint="显式保存，不依赖 placeholder。"><Input type="url" autoComplete="off" value={apiUrl} onChange={(event) => patch({ transport: { ...draft.transport, apiUrl: event.target.value } })} /></FormField>
                <FormField label="进度卡动态条数" hint="范围 1-30。"><Input type="number" min={1} max={30} value={numberValue(draft.advanced, "feishuProgressCardEntryLimit", 8)} onChange={(event) => patch({ advanced: { ...draft.advanced, feishuProgressCardEntryLimit: Math.min(30, Math.max(1, Number(event.target.value) || 8)) } })} /></FormField>
              </div>
            </section>
          )}

          {draft.platform === "octo" && (
            <section className="grid gap-3 border-t border-line pt-4">
              <div><h3 className="font-semibold text-ink-strong">Octo 连接</h3><p className="text-sm text-subtle">API URL 始终是受控值，浏览器密码管理器不会用凭据覆盖它。</p></div>
              {secretsLoading && !creating && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" />正在读取已保存密钥以支持明文回显…</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="API URL"><Input type="url" autoComplete="off" value={apiUrl} onChange={(event) => patch({ transport: { ...draft.transport, apiUrl: event.target.value } })} /></FormField>
                <FormField label="WebSocket URL" hint="可选；留空由注册响应决定。"><Input type="url" autoComplete="off" value={textValue(draft.transport, "wsUrl")} onChange={(event) => patch({ transport: { ...draft.transport, wsUrl: event.target.value } })} /></FormField>
                <FormField label="Bot Token"><SecretInput label="Bot Token" value={secretValue(draft.credentials, "botToken")} onChange={(value) => setCredential("botToken", value)} disabled={secretsLoading} /></FormField>
                <FormField label="Bot ID"><Input value={draft.botId ?? ""} onChange={(event) => patch({ botId: event.target.value.trim() || null })} /></FormField>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <ToggleField checked={boolValue(draft.advanced, "stageOctoUrlAttachments", true)} onChange={(checked) => patch({ advanced: { ...draft.advanced, stageOctoUrlAttachments: checked } })} label="暂存 URL 附件" description="下载到受控目录后再交给 Agent。" />
                <ToggleField checked={draft.security.allowPrivateAttachmentUrls} onChange={(checked) => patch({ security: { ...draft.security, allowPrivateAttachmentUrls: checked } })} label="允许私网附件 URL" description="仅在信任 Octo 附件来源时开启；默认拒绝内网地址以防 SSRF。" />
              </div>
              <FormField label="允许的附件主机" hint="逗号或换行分隔；即使允许私网，也建议限定主机。"><TextareaInput className="min-h-16" value={draft.security.allowedAttachmentHosts.join("\n")} onChange={(event) => patch({ security: { ...draft.security, allowedAttachmentHosts: splitList(event.target.value) } })} /></FormField>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FormField label="附件最大体积"><Input value={textValue(draft.advanced, "attachmentMaxBytes")} placeholder="128mb" onChange={(event) => patch({ advanced: { ...draft.advanced, attachmentMaxBytes: event.target.value } })} /></FormField>
                <FormField label="COS 上传 Base URL"><Input type="url" autoComplete="off" value={textValue(draft.advanced, "cosUploadBaseUrl")} onChange={(event) => patch({ advanced: { ...draft.advanced, cosUploadBaseUrl: event.target.value } })} /></FormField>
                <FormField label="上传策略"><SelectInput value={textValue(draft.advanced, "octoUploadStrategy")} onChange={(event) => patch({ advanced: { ...draft.advanced, octoUploadStrategy: event.target.value } })}><option value="">默认</option><option value="direct">direct</option><option value="multipart">multipart</option></SelectInput></FormField>
                <FormField label="直传最小字节"><Input type="number" min={0} value={numberValue(draft.advanced, "octoDirectUploadMinBytes", 0)} onChange={(event) => patch({ advanced: { ...draft.advanced, octoDirectUploadMinBytes: Math.max(0, Number(event.target.value) || 0) } })} /></FormField>
              </div>
            </section>
          )}

          <section className="grid gap-3 border-t border-line pt-4">
            <div><h3 className="font-semibold text-ink-strong">默认投递</h3><p className="text-sm text-subtle">未命中来源例外的全部消息都会进入这个 Agent 工作区。</p></div>
            {targets.length === 0 ? <div className="rounded-sm border border-amber/40 bg-amber-soft p-3 text-sm text-amber">尚无 Agent 工作区。请先创建工作区，再启用账号。</div> : (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="默认 Agent 工作区"><SelectInput value={draftPolicy.defaultTargetRef} onChange={(event) => setDraftPolicy((current) => ({ ...current, defaultTargetRef: event.target.value }))}>{targets.map((target) => <option key={target.id} value={target.id}>{target.name} · {target.runtime.agent}</option>)}</SelectInput></FormField>
                <div className="rounded-sm border border-line bg-panel p-3 text-sm"><div className="flex items-center gap-2 text-ink-strong"><Bot className="size-4 text-primary" />{defaultTarget?.name || "未选择"}</div><p className="mt-1 truncate text-xs text-muted" title={defaultTarget?.workspace.workDir}>{defaultTarget?.workspace.workDir || "—"}</p></div>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              <ToggleField checked={draftPolicy.defaultSessionPolicy.busyGuard} onChange={(checked) => setDraftPolicy((current) => ({ ...current, defaultSessionPolicy: { ...current.defaultSessionPolicy, busyGuard: checked } }))} label="繁忙保护" />
              <ToggleField checked={draftPolicy.defaultSessionPolicy.attachmentStaging} onChange={(checked) => setDraftPolicy((current) => ({ ...current, defaultSessionPolicy: { ...current.defaultSessionPolicy, attachmentStaging: checked } }))} label="附件暂存" />
              <ToggleField checked={draftPolicy.defaultAccessPolicy.mentionRequired} onChange={(checked) => setDraftPolicy((current) => ({ ...current, defaultAccessPolicy: { ...current.defaultAccessPolicy, mentionRequired: checked } }))} label="默认必须 @机器人" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="默认 allowlist"><Input value={draftPolicy.defaultAccessPolicy.allowlist.join(", ")} onChange={(event) => setDraftPolicy((current) => ({ ...current, defaultAccessPolicy: { ...current.defaultAccessPolicy, allowlist: splitList(event.target.value) } }))} /></FormField>
              <FormField label="管理员"><Input value={draftPolicy.defaultAccessPolicy.adminUsers.join(", ")} onChange={(event) => setDraftPolicy((current) => ({ ...current, defaultAccessPolicy: { ...current.defaultAccessPolicy, adminUsers: splitList(event.target.value) } }))} /></FormField>
              <FormField label="禁用命令"><Input value={draftPolicy.defaultAccessPolicy.disabledCommands.join(", ")} onChange={(event) => setDraftPolicy((current) => ({ ...current, defaultAccessPolicy: { ...current.defaultAccessPolicy, disabledCommands: splitList(event.target.value) } }))} /></FormField>
            </div>
          </section>

          <section className="grid gap-3 border-t border-line pt-4">
            <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><h3 className="font-semibold text-ink-strong">来源例外</h3><p className="text-sm text-subtle">只为特殊群聊、私聊、线程或发送者选择不同工作区；其余消息继续走默认投递。</p></div><Button type="button" variant="outline" size="sm" disabled={!targets.length} onClick={() => setDraftPolicy((current) => ({ ...current, rules: [...current.rules, ruleTemplate(current.defaultTargetRef)] }))}><Plus />添加例外</Button></div>
            {draftPolicy.rules.length === 0 ? <p className="rounded-sm border border-dashed border-line p-3 text-sm text-muted">全部消息使用默认工作区，没有来源例外。</p> : draftPolicy.rules.map((rule, index) => <RuleEditor key={rule.id} rule={rule} targets={targets} onChange={(next) => setDraftPolicy((current) => ({ ...current, rules: current.rules.map((candidate, candidateIndex) => candidateIndex === index ? next : candidate) }))} onDelete={() => setDraftPolicy((current) => ({ ...current, rules: current.rules.filter((_, candidateIndex) => candidateIndex !== index) }))} />)}
          </section>

          <section className="grid gap-3 border-t border-line pt-4">
            <div><h3 className="font-semibold text-ink-strong">分发预览</h3><p className="text-sm text-subtle">输入一个来源，查看最终工作区、命中规则和访问决策。</p></div>
            <div className="grid gap-3 sm:grid-cols-4"><FormField label="来源类型"><SelectInput value={previewPeerKind} onChange={(event) => setPreviewPeerKind(event.target.value as ChannelConnectorDeliveryPeerKind)}><option value="private">私聊</option><option value="group">群聊</option><option value="channel">频道</option></SelectInput></FormField><FormField label="来源 ID"><Input value={previewPeerId} onChange={(event) => setPreviewPeerId(event.target.value)} /></FormField><FormField label="发送者"><Input value={previewSender} onChange={(event) => setPreviewSender(event.target.value)} /></FormField><div className="flex items-end"><Button type="button" variant="outline" className="w-full" disabled={preview.isPending || !targets.length} onClick={runPreview}><Route />模拟解析</Button></div></div>
            {previewResult && <div className={`rounded-sm border p-3 text-sm ${previewResult.ok ? "border-green/30 bg-green-soft text-green" : "border-amber/40 bg-amber-soft text-amber"}`}>{previewResult.ok ? <>最终投递到 <strong>{targets.find((target) => target.id === previewResult.resolution.targetId)?.name || previewResult.resolution.targetId}</strong>；{previewResult.resolution.explanation}</> : previewResult.message}</div>}
          </section>

          <section className="grid gap-3 border-t border-line pt-4">
            <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setAdvancedOpen((current) => !current)}><span className="font-semibold text-ink-strong">高级平台 JSON</span><Badge variant="outline">advanced</Badge><span className="ml-auto text-muted">{advancedOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</span></button>
            {advancedOpen && <FormField label="未界面化扩展字段" hint="常用配置已由上方控件维护；这里保留未来平台扩展。"><TextareaInput className="min-h-40 font-mono" value={advancedJson} onChange={(event) => setAdvancedJson(event.target.value)} />{advancedError && <span role="alert" className="text-xs text-red">{advancedError}</span>}</FormField>}
          </section>

          <section className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button type="button" variant="outline" size="sm" disabled={!credentialsReady || smokePending || secretsLoading} onClick={runSmoke}>{smokePending ? <Loader2 className="animate-spin" /> : <Zap />}验证平台凭据</Button>
            {preflight && <Badge variant={preflight.ok ? "ok" : "warn"}>{preflight.ok ? "凭据验证通过" : "验证失败"} · {preflight.message}</Badge>}
            {enabled && !preflight?.ok && <span className="text-xs text-subtle">保存成功不代表已能收消息；启用后还需在运行中心验证真实入站。</span>}
          </section>
        </DialogBody>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button><Button variant="primary" disabled={!valid || planning || secretsLoading} onClick={buildAndPlan}><ShieldCheck />检查并保存</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function V3AccountsView({ selectedAccount, goToView }: ChannelConnectorsViewProps) {
  const configQuery = useChannelConnectorsV3ConfigQuery();
  const statusQuery = useChannelConnectorsStatusQuery({ refetchInterval: 10_000 });
  const planMutation = usePlanChannelConnectorsV3ConfigMutation();
  const applyMutation = useApplyChannelConnectorsV3ConfigMutation();
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<ChannelConnectorAccount | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleteAccount, setDeleteAccount] = React.useState<ChannelConnectorAccount | null>(null);
  const [plan, setPlan] = React.useState<ChannelConnectorsV3ConfigPlanResponse | null>(null);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [pendingCandidate, setPendingCandidate] = React.useState<ChannelConnectorsV3Config | null>(null);
  const config = configQuery.data?.config ?? null;
  const secretsQuery = useChannelConnectorAccountSecretsQuery(editing?.id, { enabled: Boolean(editing), staleTime: 0, retry: 1 });

  React.useEffect(() => {
    if (!config) return;
    const account = selectedAccount
      ? config.accounts.find((candidate) => candidate.id === selectedAccount)
      : null;
    if (account) setEditing(account);
  }, [config, selectedAccount]);

  if (configQuery.isLoading) return <div className="grid gap-4" role="status" aria-busy="true"><Skeleton className="h-12 w-full" /><SkeletonRow /><SkeletonRow /></div>;
  if (configQuery.error || !config) return <ErrorState title="无法加载渠道账号" description={configQuery.error?.message || "v3 配置不可用"} action={<Button variant="outline" size="sm" onClick={() => void configQuery.refetch()}>重试</Button>} />;

  const filtered = config.accounts.filter((account) => `${account.displayName} ${account.id} ${account.platform} ${account.externalAccountId || ""} ${account.botId || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const enabledCount = config.accounts.filter((account) => account.lifecycle === "enabled").length;
  const issueCount = config.accounts.filter((account) => accountRuntimeState(account, statusQuery.data?.runtime).variant === "warn").length;
  const policies = new Map(config.deliveryPolicies.map((policy) => [policy.accountRef, policy]));
  const targets = new Map(config.targets.map((target) => [target.id, target]));

  const requestPlan = (candidate: ChannelConnectorsV3Config) => {
    setPendingCandidate(candidate); setPlan(null); setPlanOpen(true);
    planMutation.mutate({ config: candidate, expectedRevision: configQuery.data?.revision }, { onSuccess: setPlan, onError: (error) => { setPlanOpen(false); toast.error("无法生成变更计划", { description: error.message }); } });
  };
  const applyPlan = () => {
    if (!plan?.planId || !pendingCandidate) return;
    applyMutation.mutate({ planId: plan.planId, config: pendingCandidate, reloadMode: "when-idle", rollbackOnFailure: true }, {
      onSuccess: (result) => {
        if (!result.accepted) { toast.error(result.rolledBack ? "应用失败，已自动回滚" : "应用失败", { description: result.error || result.reload.error || undefined }); return; }
        const description = result.reload.status === "pending" ? "配置已保存；无关任务继续运行，连接变更会按运行时状态应用。" : result.reload.status === "restart-required" ? result.reload.restartRequiredReason || "需要重启消息守护" : "新消息将使用新的分发快照。";
        toast.success("渠道账号已应用", { description });
        setPlanOpen(false); setEditing(null); setCreating(false); setDeleteAccount(null); setPendingCandidate(null);
        void configQuery.refetch(); void statusQuery.refetch();
      },
      onError: (error) => toast.error("应用渠道账号失败", { description: error.message }),
    });
  };
  const startCreate = () => {
    if (!config.targets.length) { toast.info("请先创建 Agent 工作区"); goToView("workspaces"); return; }
    setCreating(true);
  };

  return (
    <div className="grid gap-[18px]">
      <div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><h2 className="text-lg font-semibold text-ink-strong">渠道账号</h2><p className="text-sm text-muted">每个账号只有一个默认 Agent 工作区；特殊来源通过账号内的例外规则分发。</p></div><Input className="w-full sm:w-72" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索平台 / 账号 / bot" /><Button variant="primary" size="sm" onClick={startCreate}><Plus />新建渠道账号</Button></div>
      <dl className="grid grid-cols-2 overflow-hidden rounded-sm border border-line bg-panel sm:grid-cols-4"><div className="border-b border-r border-line p-3 sm:border-b-0"><dt className="text-xs text-subtle">渠道账号</dt><dd className="text-xl font-semibold text-ink-strong">{config.accounts.length}</dd></div><div className="border-b border-line p-3 sm:border-b-0 sm:border-r"><dt className="text-xs text-subtle">已启用</dt><dd className="text-xl font-semibold text-ink-strong">{enabledCount}</dd></div><div className="border-r border-line p-3"><dt className="text-xs text-subtle">来源例外</dt><dd className="text-xl font-semibold text-ink-strong">{config.deliveryPolicies.reduce((sum, policy) => sum + policy.rules.length, 0)}</dd></div><div className="p-3"><dt className="text-xs text-subtle">需关注</dt><dd className="text-xl font-semibold text-ink-strong">{issueCount + (configQuery.data?.validationIssues.length ?? 0)}</dd></div></dl>
      {filtered.length === 0 ? <EmptyState title="暂无渠道账号" description="创建飞书或 Octo 账号，并选择默认 Agent 工作区。" action={<Button variant="primary" size="sm" onClick={startCreate}><Plus />新建渠道账号</Button>} /> : (
        <Table><TableHeader><TableRow><TableHead>渠道账号</TableHead><TableHead>默认工作区</TableHead><TableHead>来源例外</TableHead><TableHead>运行状态</TableHead><TableHead className="text-right">动作</TableHead></TableRow></TableHeader><TableBody>{filtered.map((account) => {
          const policy = policies.get(account.id); const target = policy ? targets.get(policy.defaultTargetRef) : null; const runtime = accountRuntimeState(account, statusQuery.data?.runtime);
          return <TableRow key={account.id}><TableCell data-label="渠道账号"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-sm bg-panel-3 text-muted"><RadioTower className="size-4" /></span><span className="grid min-w-0"><strong className="truncate text-ink-strong">{account.displayName}</strong><span className="truncate text-xs text-muted">{account.platform} · {account.externalAccountId || account.id}</span></span></div></TableCell><TableCell data-label="默认工作区">{target ? <button type="button" className="text-left" onClick={() => goToView("workspaces", { target: target.id })}><span className="text-sm font-medium text-ink-strong hover:text-primary">{target.name}</span><span className="block max-w-64 truncate text-xs text-muted">{target.workspace.workDir}</span></button> : <Badge variant="warn">未配置</Badge>}</TableCell><TableCell data-label="来源例外"><Badge variant={policy?.rules.length ? "info" : "mute"}>{policy?.rules.length || 0} 条</Badge></TableCell><TableCell data-label="运行状态"><Badge variant={runtime.variant} title={runtime.detail}>{runtime.label}</Badge></TableCell><TableCell data-label="动作"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="编辑账号" aria-label="编辑账号" onClick={() => setEditing(account)}><Pencil /></Button><Button variant="ghost" size="icon" title="打开运行中心" aria-label="打开运行中心" onClick={() => goToView("runtime", { account: account.id })}><Activity /></Button><Button variant="ghost" size="icon" className="text-red" title="删除账号" aria-label="删除账号" onClick={() => setDeleteAccount(account)}><Trash2 /></Button></div></TableCell></TableRow>;
        })}</TableBody></Table>
      )}

      <AccountEditor open={creating || editing != null} account={editing} policy={editing ? policies.get(editing.id) || null : null} targets={config.targets} secrets={secretsQuery.data?.secrets || null} secretsLoading={Boolean(editing) && secretsQuery.isLoading} planning={planMutation.isPending} onOpenChange={(open) => { if (!open) { setCreating(false); setEditing(null); } }} onPlan={(account, policy) => requestPlan(replaceAccountAndPolicy(config, account, policy))} />
      <Dialog open={deleteAccount != null} onOpenChange={(open) => { if (!open) setDeleteAccount(null); }}><DialogContent><DialogHeader><DialogTitle>删除渠道账号</DialogTitle></DialogHeader><DialogBody>将删除 <strong className="text-ink-strong">{deleteAccount?.displayName}</strong>、其连接配置和全部来源例外。Agent 工作区不会被删除。</DialogBody><DialogFooter><Button variant="ghost" onClick={() => setDeleteAccount(null)}>取消</Button><Button variant="danger" onClick={() => deleteAccount && requestPlan({ ...config, accounts: config.accounts.filter((account) => account.id !== deleteAccount.id), deliveryPolicies: config.deliveryPolicies.filter((policy) => policy.accountRef !== deleteAccount.id) })}><Trash2 />检查并删除</Button></DialogFooter></DialogContent></Dialog>
      <V3PlanDialog plan={plan} open={planOpen} applying={applyMutation.isPending} onOpenChange={setPlanOpen} onConfirm={applyPlan} />
    </div>
  );
}
