import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Save,
  ScanQrCode,
  Zap,
  X,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/design/ui/sheet";
import { toast } from "@/design/ui/sonner";

import {
  useCancelFeishuAppRegistrationMutation,
  useApplyChannelConnectorsConfigMutation,
  useChannelConnectorBindingSecretsQuery,
  useFeishuAppRegistrationQuery,
  useRunFeishuTransportSmokeMutation,
  useRunOctoTransportSmokeMutation,
  useStartFeishuAppRegistrationMutation,
} from "@/lib/query/channel-connectors";
import {
  useModelGatewayModelsQuery,
  useModelGatewayProvidersQuery,
} from "@/lib/query/model-gateway";
import type {
  ChannelConnectorsNativeConfig,
  ChannelConnectorsApplyNativeConfigResponse,
  ChannelConnectorAgentProfile,
  ChannelConnectorPlatformBinding,
  ChannelConnectorPlatformId,
  ChannelConnectorAgentId,
  ChannelConnectorPermissionMode,
  ChannelConnectorFeishuAppRegistrationStatus,
  ChannelConnectorFeishuAppRegistrationTenant,
  ChannelConnectorFeishuAppRegistrationSessionResponse,
} from "../types";
import {
  CHANNEL_CONNECTOR_DEFAULT_FEISHU_API_URL as DEFAULT_FEISHU_API_URL,
  CHANNEL_CONNECTOR_DEFAULT_LARK_API_URL as DEFAULT_LARK_API_URL,
  CHANNEL_CONNECTOR_DEFAULT_OCTO_API_URL as DEFAULT_OCTO_API_URL,
  CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS,
  CHANNEL_CONNECTOR_RUNTIME_AGENT_METADATA,
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
  agentSessionDriver: string;
  feishuProgressCardEntryLimit: string;
  stageOctoUrlAttachments: boolean;
  attachmentMaxBytes: string;
  allowPrivateAttachmentUrls: boolean;
  cosUploadBaseUrl: string;
  octoUploadStrategy: string;
  octoDirectUploadMinBytes: string;
  metadataJson: string;
  advancedOpen: boolean;
}

type AccountValidationErrors = Partial<
  Record<"id" | "accountId" | "apiUrl" | "appId" | "appSecret" | "botToken" | "metadataJson", string>
>;

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
  routeAgent: ChannelConnectorAgentId;
  routeModel: string;
  routeWorkDir: string;
  routePermissionMode: ChannelConnectorPermissionMode;
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
  "agentSessionDriver",
  "feishuProgressCardEntryLimit",
  "stageOctoUrlAttachments",
  "attachmentMaxBytes",
  "allowPrivateAttachmentUrls",
  "cosUploadBaseUrl",
  "octoUploadStrategy",
  "octoDirectUploadMinBytes",
]);

const ROUTE_METADATA_KEYS = new Set([
  "peerKind",
  "peerId",
  "sessionMode",
  "busyGuard",
  "attachmentStaging",
  "routeAgent",
  "routeModel",
  "routeWorkDir",
  "routePermissionMode",
]);

const REDACTED_SECRET_VALUE = "[redacted]";
const SECRET_MASK = "****************";
function defaultPlatformApiUrl(platform: ChannelConnectorPlatformId): string {
  if (platform === "feishu") return DEFAULT_FEISHU_API_URL;
  if (platform === "octo") return DEFAULT_OCTO_API_URL;
  return "";
}

function createBindingId(platform: ChannelConnectorPlatformId): string {
  return `${platform}-${Date.now().toString(36)}`;
}

function accountIdentityKey(
  binding: Pick<
    ChannelConnectorPlatformBinding,
    "platform" | "accountId" | "botId"
  >,
): string {
  return [binding.platform, binding.accountId || "", binding.botId || ""].join(
    "::",
  );
}

function defaultPlatform(
  platforms: ChannelConnectorPlatformId[],
): ChannelConnectorPlatformId {
  return platforms.includes("feishu") ? "feishu" : platforms[0] || "octo";
}

function readMeta(
  binding: ChannelConnectorPlatformBinding | null,
  key: string,
): string {
  const value = binding?.metadata?.[key];
  return typeof value === "string" ? value : "";
}

function readMetaBool(
  binding: ChannelConnectorPlatformBinding | null,
  key: string,
  fallback: boolean,
): boolean {
  const value = binding?.metadata?.[key];
  return typeof value === "boolean" ? value : fallback;
}

function readMetaStringOrNumber(
  binding: ChannelConnectorPlatformBinding | null,
  key: string,
): string {
  const value = binding?.metadata?.[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
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

function stripKeys(
  metadata: Record<string, unknown>,
  keys: Set<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !keys.has(key)),
  );
}

function mergeString(
  target: Record<string, unknown>,
  key: string,
  value: string,
) {
  const trimmed = value.trim();
  if (trimmed) target[key] = trimmed;
}

function mergeNumberString(
  target: Record<string, unknown>,
  key: string,
  value: string,
) {
  const trimmed = value.trim();
  if (!trimmed) return;
  const number = Number(trimmed);
  target[key] = Number.isFinite(number) ? number : trimmed;
}

function mergeSecretString(
  target: Record<string, unknown>,
  existing: Record<string, unknown> | undefined,
  key: string,
  value: string,
) {
  const trimmed = value.trim();
  if (trimmed) {
    target[key] = trimmed;
  } else if (existing?.[key] === REDACTED_SECRET_VALUE) {
    target[key] = REDACTED_SECRET_VALUE;
  }
}

function applyRevealedSecret(
  currentValue: string,
  secrets: Record<string, string>,
  ...keys: string[]
): string {
  if (currentValue !== REDACTED_SECRET_VALUE) return currentValue;
  for (const key of keys) {
    const secret = secrets[key]?.trim();
    if (secret) return secret;
  }
  return currentValue;
}

function feishuRegistrationTerminal(
  status: ChannelConnectorFeishuAppRegistrationStatus | null | undefined,
): boolean {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "expired"
  );
}

function feishuRegistrationStatusLabel(
  status: ChannelConnectorFeishuAppRegistrationStatus | null | undefined,
): string {
  switch (status) {
    case "qr-ready":
      return "等待扫码";
    case "polling":
      return "等待确认";
    case "slow-down":
      return "轮询降速";
    case "domain-switched":
      return "已切换 Lark 域";
    case "succeeded":
      return "已绑定";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "expired":
      return "已过期";
    default:
      return "未开始";
  }
}

async function copyToClipboard(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(label);
  } catch (error) {
    toast.error("复制失败", {
      description: error instanceof Error ? error.message : String(error),
    });
  }
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
    apiUrl: readMeta(binding, "apiUrl") || defaultPlatformApiUrl(platform),
    botToken: readMeta(binding, "botToken"),
    wsUrl: readMeta(binding, "wsUrl"),
    corpId: readMeta(binding, "corpId"),
    corpSecret: readMeta(binding, "corpSecret"),
    agentId: readMeta(binding, "agentId"),
    token: readMeta(binding, "token"),
    encodingAesKey:
      readMeta(binding, "encodingAesKey") || readMeta(binding, "aesKey"),
    agentSessionDriver: readMeta(binding, "agentSessionDriver") || "persistent",
    feishuProgressCardEntryLimit:
      readMetaStringOrNumber(binding, "feishuProgressCardEntryLimit") || "8",
    stageOctoUrlAttachments: readMetaBool(
      binding,
      "stageOctoUrlAttachments",
      true,
    ),
    attachmentMaxBytes: readMeta(binding, "attachmentMaxBytes") || "128mb",
    allowPrivateAttachmentUrls: readMetaBool(
      binding,
      "allowPrivateAttachmentUrls",
      false,
    ),
    cosUploadBaseUrl: readMeta(binding, "cosUploadBaseUrl"),
    octoUploadStrategy: readMeta(binding, "octoUploadStrategy"),
    octoDirectUploadMinBytes:
      readMetaStringOrNumber(binding, "octoDirectUploadMinBytes"),
    metadataJson: JSON.stringify(
      stripKeys(binding?.metadata ?? {}, ACCOUNT_METADATA_KEYS),
      null,
      2,
    ),
    advancedOpen: false,
  };
}

function platformChangePatch(
  state: AccountState,
  platform: ChannelConnectorPlatformId,
): Partial<AccountState> {
  return {
    platform,
    id: createBindingId(platform),
    accountId: "",
    botId: "",
    appId: "",
    appSecret: "",
    verificationToken: "",
    encryptKey: "",
    apiUrl: defaultPlatformApiUrl(platform),
    botToken: "",
    wsUrl: "",
    corpId: "",
    corpSecret: "",
    agentId: "",
    token: "",
    encodingAesKey: "",
    feishuProgressCardEntryLimit: "8",
    stageOctoUrlAttachments: true,
    attachmentMaxBytes: "128mb",
    allowPrivateAttachmentUrls: false,
    cosUploadBaseUrl: "",
    octoUploadStrategy: "",
    octoDirectUploadMinBytes: "",
    metadataJson: "{}",
    advancedOpen: state.advancedOpen,
  };
}

function accountValidationErrors(
  state: AccountState,
  requireCredentials = false,
): AccountValidationErrors {
  const errors: AccountValidationErrors = {};
  if (!state.id.trim()) errors.id = "配置 ID 不能为空";
  const accountId = state.accountId.trim() || (state.platform === "feishu" ? state.appId.trim() : "");
  if (!accountId) errors.accountId = "账号 ID 不能为空";
  const apiUrl = state.apiUrl.trim() || defaultPlatformApiUrl(state.platform);
  if (apiUrl) {
    try {
      const parsed = new URL(apiUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        errors.apiUrl = "API URL 必须使用 http 或 https";
      }
      if (parsed.username || parsed.password || parsed.hash) {
        errors.apiUrl = "API URL 不能包含账号密码或片段";
      }
    } catch {
      errors.apiUrl = "API URL 格式无效";
    }
  }
  try {
    parseMetadata(state.metadataJson);
  } catch (error) {
    errors.metadataJson = error instanceof Error ? error.message : "metadata JSON 无效";
  }
  if (state.enabled || requireCredentials) {
    if (state.platform === "feishu") {
      if (!state.appId.trim()) errors.appId = "App ID 不能为空";
      if (!state.appSecret.trim()) errors.appSecret = "App Secret 不能为空";
    }
    if (state.platform === "octo") {
      if (!apiUrl) errors.apiUrl = "API URL 不能为空";
      if (!state.botToken.trim()) errors.botToken = "Bot Token 不能为空";
    }
  }
  return errors;
}

function accountValidationError(
  state: AccountState,
  requireCredentials = false,
): string | null {
  return Object.values(accountValidationErrors(state, requireCredentials))[0] ?? null;
}

function toRouteState(
  binding: ChannelConnectorPlatformBinding | null,
  defaultAgentProfileId: string,
  profile: ChannelConnectorAgentProfile | undefined,
): RouteState {
  const rawAgent = readMeta(binding, "routeAgent") || profile?.agent || "codex";
  const routeAgent = (
    CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS as readonly string[]
  ).includes(rawAgent)
    ? (rawAgent as ChannelConnectorAgentId)
    : "codex";
  const rawPermissionMode =
    readMeta(binding, "routePermissionMode") ||
    profile?.permissionMode ||
    "suggest";
  const routePermissionMode = (
    ["suggest", "read-only", "auto-edit", "full-auto", "plan", "yolo"] as const
  ).includes(rawPermissionMode as ChannelConnectorPermissionMode)
    ? (rawPermissionMode as ChannelConnectorPermissionMode)
    : "suggest";
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
    routeAgent,
    routeModel: readMeta(binding, "routeModel") || profile?.model || "",
    routeWorkDir: readMeta(binding, "routeWorkDir") || profile?.workDir || "",
    routePermissionMode,
  };
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-ink-strong">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="text-xs text-red">{error}</span>
      ) : hint ? (
        <span className="text-xs text-subtle">{hint}</span>
      ) : null}
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

function SecretInput({
  name,
  value,
  onChange,
  invalid,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const [revealed, setRevealed] = React.useState(false);
  const [hasSavedSecret, setHasSavedSecret] = React.useState(
    value === REDACTED_SECRET_VALUE,
  );
  const isSavedSecret = value === REDACTED_SECRET_VALUE;
  const displayValue = isSavedSecret ? "" : value;
  const canReveal = displayValue.length > 0;

  React.useEffect(() => {
    if (isSavedSecret) {
      setHasSavedSecret(true);
      setRevealed(false);
    }
  }, [isSavedSecret, value]);

  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <Input
          name={name}
          type={revealed && canReveal ? "text" : "password"}
          value={displayValue}
          placeholder={hasSavedSecret ? SECRET_MASK : undefined}
          onChange={(event) => onChange(event.target.value)}
          className="pr-11 font-mono"
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={invalid || undefined}
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            disabled={!canReveal}
            className="grid size-7 place-items-center rounded-sm text-muted hover:bg-panel-3 hover:text-ink-strong focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={revealed ? "隐藏明文" : "显示明文"}
            title={
              !canReveal && hasSavedSecret
                ? "已保存密钥不可从脱敏配置回显；输入新值后可显示明文。"
                : revealed
                  ? "隐藏明文"
                  : "显示明文"
            }
          >
            {revealed ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
      </div>
      <span className="text-xs text-subtle">
        {hasSavedSecret && !displayValue
          ? "已保存敏感值以掩码提示；留空保存会保留原值，直接输入即可修改。"
          : "保存前可切换明文核对；保存后列表和编辑器只回显脱敏掩码。"}
      </span>
    </div>
  );
}

function FormSection({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
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

function FeishuRegistrationPanel({
  tenant,
  onTenantChange,
  registration,
  starting,
  canceling,
  onStart,
  onCancel,
}: {
  tenant: ChannelConnectorFeishuAppRegistrationTenant;
  onTenantChange: (tenant: ChannelConnectorFeishuAppRegistrationTenant) => void;
  registration: ChannelConnectorFeishuAppRegistrationSessionResponse | null;
  starting: boolean;
  canceling: boolean;
  onStart: () => void;
  onCancel: () => void;
}) {
  const qrUrl = registration?.qrUrl ?? "";
  const status = registration?.status ?? null;
  const canCancel = registration ? !feishuRegistrationTerminal(registration.status) : false;
  const showQrCode = Boolean(qrUrl) && !feishuRegistrationTerminal(status);
  return (
    <FormSection
      title="扫码创建 / 绑定"
      sub="使用飞书官方一键建应用流程回填 App ID / App Secret；保存前仍可手动修改。"
    >
      <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
        <SelectField
          label="账号域"
          value={tenant}
          onChange={(value) => onTenantChange(value === "lark" ? "lark" : "feishu")}
          disabled={starting || canCancel}
        >
          <option value="feishu">Feishu · 中国区</option>
          <option value="lark">Lark · 国际区</option>
        </SelectField>
        <div className="flex flex-wrap items-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onStart}
            disabled={starting || canCancel}
          >
            {starting ? <Loader2 className="animate-spin" /> : <ScanQrCode />}
            {starting ? "生成中…" : "生成扫码绑定"}
          </Button>
          {canCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={canceling}
            >
              <X />
              取消扫码
            </Button>
          )}
          <Badge
            variant={
              status === "succeeded"
                ? "ok"
                : status === "failed" || status === "expired"
                  ? "warn"
                  : "outline"
            }
          >
            {feishuRegistrationStatusLabel(status)}
          </Badge>
        </div>
      </div>

      {registration && (
        <div className="grid gap-3 rounded-sm border border-line bg-panel p-3">
          {qrUrl ? (
            <>
              <div
                className={cn(
                  "grid gap-4 rounded-sm border border-line bg-panel-2 p-3",
                  showQrCode && "sm:grid-cols-[224px_minmax(0,1fr)] sm:items-center",
                )}
              >
                {showQrCode && (
                  <div className="mx-auto grid size-[224px] place-items-center rounded-sm border border-line bg-white p-2">
                    <QRCodeSVG
                      value={qrUrl}
                      title="飞书扫码绑定二维码"
                      aria-label="飞书扫码绑定二维码"
                      size={208}
                      level="M"
                      marginSize={2}
                      bgColor="#ffffff"
                      fgColor="#111827"
                      className="size-full"
                    />
                  </div>
                )}
                <div className="grid min-w-0 gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <ScanQrCode className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-strong">
                      {qrUrl}
                    </span>
                  </div>
                  <p className="text-sm text-muted">
                    {showQrCode
                      ? "请使用手机飞书/Lark 扫描二维码，并在手机端完成应用创建确认。"
                      : "本次扫码流程已结束，可重新生成二维码开始新的绑定。"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => copyToClipboard(qrUrl, "已复制扫码链接")}
                    >
                      <Copy />
                      复制链接
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(qrUrl, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink />
                      打开链接
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-subtle">
                二维码仅在本机浏览器生成，不会把授权链接发送给第三方服务；确认成功后会自动回填凭据。
              </p>
            </>
          ) : (
            <p className="text-xs text-subtle">正在等待飞书返回扫码链接。</p>
          )}
          {registration.expiresAt && (
            <p className="text-xs text-subtle">
              过期时间：{new Date(registration.expiresAt).toLocaleString()}
            </p>
          )}
          {registration.error && (
            <div className="rounded-sm border border-amber bg-amber-soft p-2 text-xs text-amber">
              {registration.error}
            </div>
          )}
          {registration.result && (
            <div className="rounded-sm border border-green bg-green-soft p-2 text-xs text-green">
              已回填 {registration.result.appId}；保存后请在开放平台核验权限、事件订阅与发布状态。
            </div>
          )}
        </div>
      )}
    </FormSection>
  );
}

function PlatformCredentialFields({
  state,
  patch,
  errors,
}: {
  state: AccountState;
  patch: (next: Partial<AccountState>) => void;
  errors: AccountValidationErrors;
}) {
  if (state.platform === "feishu") {
    return (
      <>
        <FormSection
          title="应用凭据"
          sub="用于 tenant_access_token 与发送能力；保存后敏感值只以掩码显示。"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="App ID" error={errors.appId}>
              <Input
                name="channel-feishu-app-id"
                value={state.appId}
                onChange={(e) => {
                  const appId = e.target.value;
                  patch({
                    appId,
                    ...(state.accountId.trim() === "" || state.accountId === state.appId
                      ? { accountId: appId }
                      : {}),
                  });
                }}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={Boolean(errors.appId) || undefined}
              />
            </Field>
            <Field label="App Secret" error={errors.appSecret}>
              <SecretInput
                name="channel-feishu-app-secret"
                value={state.appSecret}
                onChange={(appSecret) => patch({ appSecret })}
                invalid={Boolean(errors.appSecret)}
              />
            </Field>
          </div>
          <Field label="Bot ID" hint="可选；没有独立 bot 时可留空。">
            <Input
              value={state.botId}
              onChange={(e) => patch({ botId: e.target.value })}
            />
          </Field>
        </FormSection>
        <FormSection
          title="事件回调"
          sub="回调 URL 由守护服务提供；这里保存飞书校验字段。"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Verification Token">
              <SecretInput
                name="channel-feishu-verification-token"
                value={state.verificationToken}
                onChange={(verificationToken) => patch({ verificationToken })}
              />
            </Field>
            <Field label="Encrypt Key">
              <SecretInput
                name="channel-feishu-encrypt-key"
                value={state.encryptKey}
                onChange={(encryptKey) => patch({ encryptKey })}
              />
            </Field>
          </div>
          <div className="rounded-sm border border-line bg-panel px-3 py-2 text-sm text-muted">
            Callback URL：由守护诊断页展示和复制。
          </div>
        </FormSection>
      </>
    );
  }
  if (state.platform === "octo") {
    return (
      <FormSection
        title="连接"
        sub="Octo 当前有 verified register transport smoke。"
      >
        <Field label="API URL" error={errors.apiUrl}>
          <Input
            name="channel-octo-api-url"
            type="url"
            inputMode="url"
            value={state.apiUrl}
            onChange={(e) => patch({ apiUrl: e.target.value })}
            placeholder={DEFAULT_OCTO_API_URL}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={Boolean(errors.apiUrl) || undefined}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bot Token" error={errors.botToken}>
            <SecretInput
              name="channel-octo-bot-token"
              value={state.botToken}
              onChange={(botToken) => patch({ botToken })}
              invalid={Boolean(errors.botToken)}
            />
          </Field>
          <Field label="WebSocket URL" hint="可选">
            <Input
              name="channel-octo-websocket-url"
              type="url"
              inputMode="url"
              value={state.wsUrl}
              onChange={(e) => patch({ wsUrl: e.target.value })}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
        </div>
      </FormSection>
    );
  }
  if (state.platform === "wecom") {
    return (
      <>
        <FormSection
          title="应用凭据"
          sub="WeCom 字段模板已提供；真实 smoke 需等待后端 adapter 验证。"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Corp ID">
              <Input
                value={state.corpId}
                onChange={(e) => patch({ corpId: e.target.value })}
              />
            </Field>
            <Field label="Agent ID">
              <Input
                value={state.agentId}
                onChange={(e) => patch({ agentId: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Secret">
            <SecretInput
              name="channel-wecom-secret"
              value={state.corpSecret}
              onChange={(corpSecret) => patch({ corpSecret })}
            />
          </Field>
        </FormSection>
        <FormSection
          title="事件回调"
          sub="保存 Token / EncodingAESKey；当前不声明测试可用。"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Token">
              <SecretInput
                name="channel-wecom-token"
                value={state.token}
                onChange={(token) => patch({ token })}
              />
            </Field>
            <Field label="EncodingAESKey">
              <SecretInput
                name="channel-wecom-encoding-aes-key"
                value={state.encodingAesKey}
                onChange={(encodingAesKey) => patch({ encodingAesKey })}
              />
            </Field>
          </div>
        </FormSection>
      </>
    );
  }
  return (
    <FormSection
      title="未验证平台"
      sub="该平台暂无 verified adapter/smoke；可保存为停用草稿，但不要假装已可用。"
    >
      <div className="rounded-sm border border-amber bg-amber-soft p-3 text-sm text-amber">
        {state.platform} 目前未接入可验证字段模板。请保持停用，等待 adapter
        完成。
      </div>
    </FormSection>
  );
}

function PlatformAdvancedFields({
  state,
  patch,
  errors,
}: {
  state: AccountState;
  patch: (next: Partial<AccountState>) => void;
  errors: AccountValidationErrors;
}) {
  return (
    <FormSection
      title="运行与平台高级配置"
      sub="常用 metadata 已界面化；底部 JSON 只保留未模板化扩展字段。"
    >
      <SelectField
        label="Agent 会话驱动"
        hint="persistent 会复用原生会话；one-shot 每条消息独立运行。"
        value={state.agentSessionDriver}
        onChange={(agentSessionDriver) => patch({ agentSessionDriver })}
      >
        <option value="persistent">persistent · 持久会话</option>
        <option value="one-shot">one-shot · 单次运行</option>
      </SelectField>

      {state.platform === "feishu" && (
        <>
          <Field label="飞书 API URL" hint="默认 https://open.feishu.cn。" error={errors.apiUrl}>
            <Input
              name="channel-feishu-api-url"
              type="url"
              inputMode="url"
              value={state.apiUrl}
              onChange={(e) => patch({ apiUrl: e.target.value })}
              placeholder={DEFAULT_FEISHU_API_URL}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={Boolean(errors.apiUrl) || undefined}
            />
          </Field>
          <Field
            label="进度卡片条目数"
            hint="对应 feishuProgressCardEntryLimit，范围由守护服务限制在 1-30。"
          >
            <Input
              type="number"
              min={1}
              max={30}
              value={state.feishuProgressCardEntryLimit}
              onChange={(e) =>
                patch({ feishuProgressCardEntryLimit: e.target.value })
              }
            />
          </Field>
        </>
      )}

      {state.platform === "octo" && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {toggleInput(
              state.stageOctoUrlAttachments,
              (stageOctoUrlAttachments) => patch({ stageOctoUrlAttachments }),
              "暂存 URL 附件",
              "把 Octo URL 附件落盘后再交给 Agent",
            )}
            {toggleInput(
              state.allowPrivateAttachmentUrls,
              (allowPrivateAttachmentUrls) =>
                patch({ allowPrivateAttachmentUrls }),
              "允许私网附件 URL",
              "仅在信任 Octo 附件来源时启用",
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="附件最大体积" hint="例如 128mb、64mb 或字节数。">
              <Input
                value={state.attachmentMaxBytes}
                onChange={(e) => patch({ attachmentMaxBytes: e.target.value })}
              />
            </Field>
            <Field label="COS 上传 Base URL" hint="可选；Octo 文件直传入口。">
              <Input
                name="channel-octo-cos-upload-url"
                type="url"
                inputMode="url"
                value={state.cosUploadBaseUrl}
                onChange={(e) => patch({ cosUploadBaseUrl: e.target.value })}
                placeholder="https://..."
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="上传策略"
              hint="留空使用守护服务默认策略。"
              value={state.octoUploadStrategy}
              onChange={(octoUploadStrategy) => patch({ octoUploadStrategy })}
            >
              <option value="">默认</option>
              <option value="direct">direct</option>
              <option value="multipart">multipart</option>
            </SelectField>
            <Field label="直传最小字节数" hint="可选；小文件低于该值不走直传。">
              <Input
                type="number"
                min={0}
                value={state.octoDirectUploadMinBytes}
                onChange={(e) =>
                  patch({ octoDirectUploadMinBytes: e.target.value })
                }
              />
            </Field>
          </div>
        </>
      )}
    </FormSection>
  );
}

function modelChoicesFromProviders(
  providers: Array<{
    enabled?: boolean;
    id: string;
    models?: {
      models?: Array<{ id: string; label?: string; aliases?: string[] }>;
    };
  }>,
) {
  const byId = new Map<
    string,
    { id: string; display_name: string; providerIds: string[] }
  >();
  for (const provider of providers) {
    if (provider.enabled === false) continue;
    for (const model of provider.models?.models ?? []) {
      if (!model.id) continue;
      const existing = byId.get(model.id);
      if (existing) {
        if (!existing.providerIds.includes(provider.id))
          existing.providerIds.push(provider.id);
      } else {
        byId.set(model.id, {
          id: model.id,
          display_name: model.label || model.id,
          providerIds: [provider.id],
        });
      }
      for (const alias of model.aliases ?? []) {
        if (!alias || byId.has(alias)) continue;
        byId.set(alias, {
          id: alias,
          display_name: `${alias} → ${model.id}`,
          providerIds: [provider.id],
        });
      }
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function buildAccountMetadata(
  binding: ChannelConnectorPlatformBinding | null,
  state: AccountState,
) {
  const base = stripKeys(binding?.metadata ?? {}, ACCOUNT_METADATA_KEYS);
  const advanced = parseMetadata(state.metadataJson);
  const next = { ...base, ...advanced };
  const existing = binding?.metadata;
  mergeString(next, "agentSessionDriver", state.agentSessionDriver);
  if (state.platform === "feishu") {
    mergeString(next, "appId", state.appId);
    mergeSecretString(next, existing, "appSecret", state.appSecret);
    mergeSecretString(next, existing, "verificationToken", state.verificationToken);
    mergeSecretString(next, existing, "encryptKey", state.encryptKey);
    mergeString(next, "apiUrl", state.apiUrl || DEFAULT_FEISHU_API_URL);
    mergeNumberString(
      next,
      "feishuProgressCardEntryLimit",
      state.feishuProgressCardEntryLimit,
    );
  }
  if (state.platform === "octo") {
    mergeString(next, "apiUrl", state.apiUrl || DEFAULT_OCTO_API_URL);
    mergeSecretString(next, existing, "botToken", state.botToken);
    mergeString(next, "wsUrl", state.wsUrl);
    next.stageOctoUrlAttachments = state.stageOctoUrlAttachments;
    mergeString(next, "attachmentMaxBytes", state.attachmentMaxBytes);
    next.allowPrivateAttachmentUrls = state.allowPrivateAttachmentUrls;
    mergeString(next, "cosUploadBaseUrl", state.cosUploadBaseUrl);
    mergeString(next, "octoUploadStrategy", state.octoUploadStrategy);
    mergeNumberString(
      next,
      "octoDirectUploadMinBytes",
      state.octoDirectUploadMinBytes,
    );
  }
  if (state.platform === "wecom") {
    mergeString(next, "corpId", state.corpId);
    mergeSecretString(next, existing, "corpSecret", state.corpSecret);
    mergeString(next, "agentId", state.agentId);
    mergeSecretString(next, existing, "token", state.token);
    mergeSecretString(next, existing, "encodingAesKey", state.encodingAesKey);
  }
  return next;
}

function effectiveAccountState(state: AccountState): AccountState {
  return {
    ...state,
    accountId:
      state.accountId.trim() ||
      (state.platform === "feishu" ? state.appId.trim() : ""),
    apiUrl: state.apiUrl.trim() || defaultPlatformApiUrl(state.platform),
  };
}

function buildDraftAccountBinding(
  state: AccountState,
  binding: ChannelConnectorPlatformBinding | null,
  defaultAgentProfileId: string,
): ChannelConnectorPlatformBinding {
  return {
    ...(binding ?? {
      id: state.id.trim(),
      platform: state.platform,
      displayName: state.displayName.trim() || state.id.trim(),
      agentProfileId: defaultAgentProfileId,
      enabled: state.enabled,
      accountId: state.accountId,
      botId: null,
      allowlist: [],
      adminUsers: [],
      disabledCommands: [],
    }),
    id: state.id.trim(),
    platform: state.platform,
    displayName: state.displayName.trim() || state.id.trim(),
    enabled: state.enabled,
    accountId: state.accountId,
    botId: state.botId.trim() || null,
    metadata: buildAccountMetadata(binding, state),
  };
}

function buildRouteMetadata(
  binding: ChannelConnectorPlatformBinding | null,
  state: RouteState,
) {
  const next = Object.fromEntries(
    Object.entries(binding?.metadata ?? {}).filter(([key]) =>
      ROUTE_METADATA_KEYS.has(key),
    ),
  );
  next.peerKind = state.peerKind;
  next.peerId = state.peerId.trim() || "*";
  next.sessionMode = state.sessionMode;
  next.busyGuard = state.busyGuard;
  next.attachmentStaging = state.attachmentStaging;
  next.routeAgent = state.routeAgent;
  mergeString(next, "routeModel", state.routeModel);
  mergeString(next, "routeWorkDir", state.routeWorkDir);
  next.routePermissionMode = state.routePermissionMode;
  return next;
}

function configApplyDescription(
  result: ChannelConnectorsApplyNativeConfigResponse,
): string {
  const reload = result.reload;
  if (reload.status === "applied") return "已热重载到 IM 守护，新配置已生效。";
  if (reload.status === "pending") {
    const active = reload.activeRuns + reload.activeTurns;
    return active > 0
      ? `当前有 ${active} 个 Agent 任务/turn 运行中，任务结束后自动热重载。`
      : "已排队，daemon 空闲后自动热重载。";
  }
  if (reload.status === "restart-required") {
    return `此类变更需要重启 IM 守护：${reload.restartRequiredReason || "runtime boundary changed"}`;
  }
  if (result.rolledBack) {
    return `新配置应用失败，已恢复上一版本：${reload.error || "daemon reload failed"}`;
  }
  return `配置已保存，守护当前离线：${reload.error || "daemon unavailable"}`;
}

function toastConfigApplyResult(
  label: string,
  result: ChannelConnectorsApplyNativeConfigResponse,
): void {
  const reload = result.reload;
  const description = configApplyDescription(result);
  if (reload.status === "applied") {
    toast.success(label, { description });
  } else if (reload.status === "pending") {
    toast.info("已保存，等待任务结束后应用", { description });
  } else if (reload.status === "restart-required") {
    toast.warning("已保存，需要重启消息守护", { description });
  } else if (result.rolledBack) {
    toast.error("应用失败，已自动回滚", { description });
  } else {
    toast.warning("已保存，等待消息守护启动", { description });
  }
}

function useUnsavedEditor(
  open: boolean,
  onOpenChange: (open: boolean) => void,
) {
  const [dirty, setDirty] = React.useState(false);
  const allowCloseRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    setDirty(false);
    allowCloseRef.current = false;
  }, [open]);

  React.useEffect(() => {
    if (!open || !dirty) return;
    const protectNavigation = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectNavigation);
    return () => window.removeEventListener("beforeunload", protectNavigation);
  }, [dirty, open]);

  const requestOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (
        !nextOpen &&
        dirty &&
        !allowCloseRef.current &&
        !window.confirm("有未保存的修改，确定放弃吗？")
      ) {
        return;
      }
      onOpenChange(nextOpen);
    },
    [dirty, onOpenChange],
  );

  const closeAfterSave = React.useCallback(() => {
    allowCloseRef.current = true;
    setDirty(false);
    onOpenChange(false);
  }, [onOpenChange]);

  return { closeAfterSave, dirty, markDirty: () => setDirty(true), requestOpenChange };
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
  const applyMutation = useApplyChannelConnectorsConfigMutation();
  const save = React.useCallback(
    (nextBinding: ChannelConnectorPlatformBinding, label: string) => {
      if (!config) return;
      const exists = config.platformBindings.some(
        (item) => item.id === nextBinding.id,
      );
      if (mode === "create" && exists) {
        toast.error("绑定 ID 已存在", { description: nextBinding.id });
        return;
      }
      applyMutation.mutate(
        {
          expectedUpdatedAt: config.updatedAt,
          reloadMode: "when-idle",
          rollbackOnFailure: true,
          config: {
            ...config,
            updatedAt: new Date().toISOString(),
            platformBindings: binding
              ? config.platformBindings.map((item) =>
                  item.id === binding.id ? nextBinding : item,
                )
              : [...config.platformBindings, nextBinding],
          },
        },
        {
          onSuccess: (result) => {
            toastConfigApplyResult(label, result);
            onSaved?.();
            if (result.accepted) onOpenChange(false);
          },
          onError: (error) =>
            toast.error("保存失败", { description: error.message }),
        },
      );
    },
    [applyMutation, binding, config, mode, onOpenChange, onSaved],
  );
  return { save, pending: applyMutation.isPending };
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
  const [feishuRegistrationTenant, setFeishuRegistrationTenant] =
    React.useState<ChannelConnectorFeishuAppRegistrationTenant>("feishu");
  const [feishuRegistrationSessionId, setFeishuRegistrationSessionId] =
    React.useState<string | null>(null);
  const [preflight, setPreflight] = React.useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [validationMode, setValidationMode] = React.useState<"save" | "smoke" | null>(null);
  const unsaved = useUnsavedEditor(open, onOpenChange);
  const appliedFeishuRegistrationRef = React.useRef<string | null>(null);
  const bindingSecretsQuery = useChannelConnectorBindingSecretsQuery(
    open && binding ? binding.id : null,
    {
      staleTime: 0,
      retry: 1,
    },
  );
  const startFeishuRegistrationMutation = useStartFeishuAppRegistrationMutation();
  const cancelFeishuRegistrationMutation = useCancelFeishuAppRegistrationMutation();
  const feishuSmokeMutation = useRunFeishuTransportSmokeMutation();
  const octoSmokeMutation = useRunOctoTransportSmokeMutation();
  const feishuRegistrationQuery = useFeishuAppRegistrationQuery(
    feishuRegistrationSessionId,
    {
      enabled: open && Boolean(feishuRegistrationSessionId),
      refetchInterval: (query) =>
        feishuRegistrationTerminal(query.state.data?.status) ? false : 2_000,
      retry: 1,
    },
  );
  const { save, pending: createPending } = useSaveBinding({
    config,
    binding,
    mode,
    onSaved,
    onOpenChange: unsaved.closeAfterSave,
  });
  const accountApplyMutation = useApplyChannelConnectorsConfigMutation();
  const pending =
    createPending ||
    accountApplyMutation.isPending ||
    feishuSmokeMutation.isPending ||
    octoSmokeMutation.isPending;

  React.useEffect(() => {
    if (open) {
      setState(toAccountState(binding, supportedPlatforms));
      setFeishuRegistrationSessionId(null);
      setPreflight(null);
      setValidationMode(null);
      appliedFeishuRegistrationRef.current = null;
    }
  }, [binding, open, supportedPlatforms]);

  React.useEffect(() => {
    const registration = feishuRegistrationQuery.data;
    const result = registration?.result;
    if (!open || !registration || !result || registration.status !== "succeeded") return;
    if (appliedFeishuRegistrationRef.current === registration.sessionId) return;
    appliedFeishuRegistrationRef.current = registration.sessionId;
    setState((prev) => {
      if (!prev) return prev;
      const displayName = prev.displayName.trim() || "飞书 Agent";
      return {
        ...prev,
        platform: "feishu",
        displayName,
        accountId: result.appId,
        appId: result.appId,
        appSecret: result.appSecret,
        apiUrl: result.apiUrl,
        enabled: true,
      };
    });
    unsaved.markDirty();
    setFeishuRegistrationTenant(result.tenant);
    toast.success("飞书扫码绑定成功", {
      description: "App ID / App Secret 已回填，确认后保存平台账号。",
    });
  }, [
    feishuRegistrationQuery.data?.result,
    feishuRegistrationQuery.data?.sessionId,
    feishuRegistrationQuery.data?.status,
    open,
  ]);

  React.useEffect(() => {
    const secrets = bindingSecretsQuery.data?.secrets;
    if (!open || !binding || !secrets) return;
    setState((prev) =>
      prev
        ? {
            ...prev,
            appSecret: applyRevealedSecret(prev.appSecret, secrets, "appSecret"),
            verificationToken: applyRevealedSecret(
              prev.verificationToken,
              secrets,
              "verificationToken",
            ),
            encryptKey: applyRevealedSecret(prev.encryptKey, secrets, "encryptKey"),
            botToken: applyRevealedSecret(prev.botToken, secrets, "botToken"),
            corpSecret: applyRevealedSecret(prev.corpSecret, secrets, "corpSecret"),
            token: applyRevealedSecret(prev.token, secrets, "token"),
            encodingAesKey: applyRevealedSecret(
              prev.encodingAesKey,
              secrets,
              "encodingAesKey",
              "aesKey",
            ),
          }
        : prev,
    );
  }, [binding, bindingSecretsQuery.data?.secrets, open]);

  if (!state || !config) return null;
  const patch = (next: Partial<AccountState>) => {
    setPreflight(null);
    unsaved.markDirty();
    setState((prev) => (prev ? { ...prev, ...next } : prev));
  };
  const effectiveState = effectiveAccountState(state);
  const validationErrors = validationMode
    ? accountValidationErrors(effectiveState, validationMode === "smoke")
    : {};
  const canSmoke = state.platform === "feishu" || state.platform === "octo";
  const smokePending =
    feishuSmokeMutation.isPending || octoSmokeMutation.isPending;

  const handleStartFeishuRegistration = () => {
    startFeishuRegistrationMutation.mutate(
      {
        tenant: feishuRegistrationTenant,
        appName: state.displayName.trim() || "Tracevane Agent",
        appDescription: "Tracevane local coding agent bridge.",
      },
      {
        onSuccess: (result) => {
          setFeishuRegistrationSessionId(result.sessionId);
          toast.success("已生成飞书扫码二维码", {
            description: "请用飞书/Lark 手机端扫描并确认授权。",
          });
        },
        onError: (error) =>
          toast.error("生成扫码链接失败", { description: error.message }),
      },
    );
  };

  const handleCancelFeishuRegistration = () => {
    if (!feishuRegistrationSessionId) return;
    cancelFeishuRegistrationMutation.mutate(feishuRegistrationSessionId, {
      onSuccess: () => toast.info("已取消飞书扫码绑定"),
      onError: (error) =>
        toast.error("取消失败", { description: error.message }),
    });
  };

  const handleTestConnection = () => {
    setValidationMode("smoke");
    const validationError = accountValidationError(effectiveState, true);
    if (validationError) {
      setPreflight({ ok: false, message: validationError });
      toast.error("连接测试无法开始", { description: validationError });
      return;
    }
    let draftBinding: ChannelConnectorPlatformBinding;
    try {
      draftBinding = buildDraftAccountBinding(
        effectiveState,
        binding,
        defaultAgentProfileId,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPreflight({ ok: false, message });
      toast.error("高级 metadata JSON 无效", { description: message });
      return;
    }
    const onResult = (result: {
      transport: {
        ok: boolean | null;
        statusCode: number | null;
        error: string | null;
      };
    }) => {
      const ok = result.transport.ok === true;
      const message = ok
        ? `连接验证通过 · HTTP ${result.transport.statusCode ?? "ok"}`
        : result.transport.error ||
          `连接失败 · HTTP ${result.transport.statusCode ?? "unknown"}`;
      setPreflight({ ok, message });
      if (ok) {
        toast.success("连接验证通过", { description: message });
      } else {
        toast.error("连接测试失败", { description: message });
      }
    };
    const onError = (error: Error) => {
      setPreflight({ ok: false, message: error.message });
      toast.error("连接测试失败", { description: error.message });
    };
    if (effectiveState.platform === "feishu") {
      feishuSmokeMutation.mutate(
        { action: "tenant-token", binding: draftBinding },
        { onSuccess: onResult, onError },
      );
    } else if (effectiveState.platform === "octo") {
      octoSmokeMutation.mutate(
        { action: "register", binding: draftBinding },
        { onSuccess: onResult, onError },
      );
    }
  };

  const handleSave = () => {
    setValidationMode("save");
    const validationError = accountValidationError(effectiveState);
    if (validationError) {
      toast.error("平台账号配置不完整", { description: validationError });
      return;
    }
    try {
      const nextAccount = {
        platform: effectiveState.platform,
        accountId: effectiveState.accountId,
        botId: effectiveState.botId.trim() || null,
      };
      if (mode === "edit" && binding && config) {
        const originalKey = accountIdentityKey(binding);
        const updatedBindings = config.platformBindings.map((item) => {
          if (accountIdentityKey(item) !== originalKey) return item;
          return {
            ...item,
            platform: nextAccount.platform,
            displayName:
              effectiveState.displayName.trim() || item.displayName || item.id,
            enabled: effectiveState.enabled,
            accountId: nextAccount.accountId,
            botId: nextAccount.botId,
            metadata: buildAccountMetadata(item, effectiveState),
          };
        });
        accountApplyMutation.mutate(
          {
            expectedUpdatedAt: config.updatedAt,
            reloadMode: "when-idle",
            rollbackOnFailure: true,
            config: {
              ...config,
              updatedAt: new Date().toISOString(),
              platformBindings: updatedBindings,
            },
          },
          {
            onSuccess: (result) => {
              const count = updatedBindings.filter(
                (item) =>
                  accountIdentityKey(item) === accountIdentityKey(nextAccount),
              ).length;
              toastConfigApplyResult("已保存平台账号", result);
              if (result.reload.status === "applied") {
                toast.info("平台账号已同步", {
                  description: `已同步 ${count} 条绑定路由`,
                });
              }
              onSaved?.();
              if (result.accepted) unsaved.closeAfterSave();
            },
            onError: (error) =>
              toast.error("保存失败", { description: error.message }),
          },
        );
        return;
      }

      if (
        config.platformBindings.some(
          (item) => accountIdentityKey(item) === accountIdentityKey(nextAccount),
        )
      ) {
        toast.error("平台账号已存在", {
          description: "请在绑定路由页为现有账号新增或复制路由。",
        });
        return;
      }

      const nextBinding = buildDraftAccountBinding(
        effectiveState,
        binding,
        defaultAgentProfileId,
      );
      save(nextBinding, "已新建平台账号");
    } catch (error) {
      toast.error("高级 metadata JSON 无效", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => !pending && unsaved.requestOpenChange(value)}
    >
      <SheetContent className="w-[min(860px,94vw)] sm:max-w-[860px]">
        <SheetHeader className="items-start pr-12">
          <div>
            <SheetTitle>
              {mode === "create"
                ? "新建平台账号"
                : `编辑平台账号 · ${binding?.platform}`}
            </SheetTitle>
            <p className="mt-1 text-sm text-subtle">
              凭据、回调和平台级连接配置；保存后敏感字段会脱敏。
            </p>
          </div>
        </SheetHeader>
        <SheetBody className="gap-4">
          <FormSection
            title="基础信息"
            sub="一个 IM 平台里的 bot/app/account 身份。"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="配置 ID" hint="稳定键；创建后不建议修改。" error={validationErrors.id}>
                <Input
                  value={state.id}
                  disabled={mode === "edit"}
                  onChange={(e) => patch({ id: e.target.value })}
                  aria-invalid={Boolean(validationErrors.id) || undefined}
                />
              </Field>
              <SelectField
                label="平台"
                value={state.platform}
                onChange={(value) => {
                  const platform = value as ChannelConnectorPlatformId;
                  if (mode === "create") patch(platformChangePatch(state, platform));
                }}
                disabled={mode === "edit"}
              >
                {supportedPlatforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="显示名称">
                <Input
                  value={state.displayName}
                  onChange={(e) => patch({ displayName: e.target.value })}
                />
              </Field>
              <Field label="账号 ID" error={validationErrors.accountId}>
                <Input
                  name="channel-account-id"
                  value={state.accountId}
                  onChange={(e) => patch({ accountId: e.target.value })}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={Boolean(validationErrors.accountId) || undefined}
                />
              </Field>
            </div>
            {toggleInput(
              state.enabled,
              (enabled) => patch({ enabled }),
              "启用此平台账号",
              "未验证平台建议先保持停用",
            )}
          </FormSection>

          {state.platform === "feishu" && (
            <FeishuRegistrationPanel
              tenant={feishuRegistrationTenant}
              onTenantChange={(tenant) => {
                setFeishuRegistrationTenant(tenant);
                patch({
                  apiUrl:
                    tenant === "lark"
                      ? DEFAULT_LARK_API_URL
                      : DEFAULT_FEISHU_API_URL,
                });
              }}
              registration={feishuRegistrationQuery.data ?? null}
              starting={startFeishuRegistrationMutation.isPending}
              canceling={cancelFeishuRegistrationMutation.isPending}
              onStart={handleStartFeishuRegistration}
              onCancel={handleCancelFeishuRegistration}
            />
          )}

          <PlatformCredentialFields state={state} patch={patch} errors={validationErrors} />

          <PlatformAdvancedFields state={state} patch={patch} errors={validationErrors} />

          <section className="rounded-sm border border-line bg-panel-2">
            <button
              type="button"
              onClick={() => patch({ advancedOpen: !state.advancedOpen })}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-ink-strong"
            >
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  state.advancedOpen && "rotate-180",
                )}
              />
              高级 metadata JSON
              <Badge variant="outline" className="ml-auto">
                advanced
              </Badge>
            </button>
            {state.advancedOpen && (
              <div className="grid gap-2 border-t border-line p-3">
                <textarea
                  value={state.metadataJson}
                  onChange={(e) => patch({ metadataJson: e.target.value })}
                  className="min-h-[120px] w-full rounded-sm border border-line bg-panel px-[11px] py-2 font-mono text-sm text-ink-strong outline-none focus-visible:border-primary-line focus-visible:shadow-[var(--ring)]"
                  spellCheck={false}
                  aria-invalid={Boolean(validationErrors.metadataJson) || undefined}
                />
                {validationErrors.metadataJson ? (
                  <p role="alert" className="text-xs text-red">{validationErrors.metadataJson}</p>
                ) : (
                  <p className="text-xs text-subtle">
                    只放当前表单尚未覆盖的扩展字段；平台可用配置优先在上方表单维护。
                  </p>
                )}
              </div>
            )}
          </section>

          {!canSmoke && (
            <div className="rounded-sm border border-amber bg-amber-soft p-3 text-sm text-amber">
              当前平台暂不支持连接测试，请先保存为停用草稿。
            </div>
          )}
          {preflight && (
            <div
              role="status"
              className={cn(
                "rounded-sm border p-3 text-sm",
                preflight.ok
                  ? "border-green bg-green-soft text-green"
                  : "border-red bg-red-soft text-red",
              )}
            >
              <strong>{preflight.ok ? "连接正常" : "连接异常"}</strong>
              <span className="ml-2 break-all">{preflight.message}</span>
            </div>
          )}
        </SheetBody>
        <SheetFooter className="justify-end bg-panel/95">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => unsaved.requestOpenChange(false)}
            disabled={pending}
          >
            取消
          </Button>
          {canSmoke && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={pending}
            >
              {smokePending ? <Loader2 className="animate-spin" /> : <Zap />}
              {smokePending ? "测试中…" : "测试连接"}
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={
              pending ||
              !state.id.trim() ||
              !(state.accountId.trim() || (state.platform === "feishu" && state.appId.trim()))
            }
          >
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
  const unsaved = useUnsavedEditor(open, onOpenChange);
  const { save, pending } = useSaveBinding({
    config,
    binding,
    mode: "edit",
    onSaved,
    onOpenChange: unsaved.closeAfterSave,
  });
  const gatewayModelsQuery = useModelGatewayModelsQuery({
    enabled: open,
    staleTime: 30_000,
    retry: 1,
  });
  const gatewayProvidersQuery = useModelGatewayProvidersQuery({
    enabled: open,
    staleTime: 30_000,
    retry: 1,
  });
  const defaultAgentProfileId =
    config?.defaultAgentProfileId || agentProfiles[0]?.id || "default";

  React.useEffect(() => {
    const profileId = binding?.agentProfileId ?? defaultAgentProfileId;
    const profile = agentProfiles.find((item) => item.id === profileId);
    if (open) setState(toRouteState(binding, defaultAgentProfileId, profile));
  }, [agentProfiles, binding, defaultAgentProfileId, open]);

  if (!binding || !state || !config) return null;
  const patch = (next: Partial<RouteState>) => {
    unsaved.markDirty();
    setState((prev) => (prev ? { ...prev, ...next } : prev));
  };
  const selectedProfile = agentProfiles.find(
    (profile) => profile.id === state.agentProfileId,
  );
  const catalogModels =
    gatewayModelsQuery.data?.models ?? gatewayModelsQuery.data?.data ?? [];
  const providerModels = modelChoicesFromProviders(
    gatewayProvidersQuery.data?.providers ?? [],
  );
  const gatewayModels =
    catalogModels.length > 0 ? catalogModels : providerModels;
  const modelSourceLabel =
    catalogModels.length > 0
      ? "模型目录"
      : providerModels.length > 0
        ? "Provider 配置"
        : "手动输入";

  const handleSave = () => {
    const nextBinding: ChannelConnectorPlatformBinding = {
      ...binding,
      displayName:
        state.displayName.trim() || binding.displayName || binding.id,
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
    <Sheet
      open={open}
      onOpenChange={(value) => !pending && unsaved.requestOpenChange(value)}
    >
      <SheetContent className="w-[min(860px,94vw)] sm:max-w-[860px]">
        <SheetHeader className="items-start pr-12">
          <div>
            <SheetTitle>编辑绑定路由</SheetTitle>
            <p className="mt-1 text-sm text-subtle">
              配置平台账号 + IM 来源 → Agent Profile；同一 Agent
              Profile 可被多条渠道路由复用。
            </p>
          </div>
        </SheetHeader>
        <SheetBody className="gap-4">
          <FormSection
            title="基础与来源"
            sub={`${binding.platform} · ${binding.accountId}`}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="路由名称">
                <Input
                  value={state.displayName}
                  onChange={(e) => patch({ displayName: e.target.value })}
                />
              </Field>
              <SelectField
                label="来源类型"
                value={state.peerKind}
                onChange={(peerKind) => patch({ peerKind })}
              >
                <option value="private">私聊</option>
                <option value="group">群聊</option>
                <option value="channel">频道</option>
                <option value="thread">Thread</option>
              </SelectField>
            </div>
            <Field label="来源 ID" hint="* 表示匹配该账号下所有来源，需谨慎。">
              <Input
                value={state.peerId}
                onChange={(e) => patch({ peerId: e.target.value })}
              />
            </Field>
            {toggleInput(
              state.enabled,
              (enabled) => patch({ enabled }),
              "启用此绑定路由",
            )}
          </FormSection>

          <FormSection
            title="Agent 目标"
            sub="Agent Profile 是可复用模板；绑定路由只在需要时覆盖 Agent、模型、启动目录和权限。"
          >
            <SelectField
              label="Agent Profile 模板"
              hint="保存密钥引用与默认值；下面的路由覆盖会写入运行时配置。"
              value={state.agentProfileId}
              onChange={(agentProfileId) => {
                const profile = agentProfiles.find(
                  (item) => item.id === agentProfileId,
                );
                patch({
                  agentProfileId,
                  routeAgent: profile?.agent ?? state.routeAgent,
                  routeModel: profile?.model ?? state.routeModel,
                  routeWorkDir: profile?.workDir ?? state.routeWorkDir,
                  routePermissionMode:
                    profile?.permissionMode ?? state.routePermissionMode,
                });
              }}
            >
              {!agentProfiles.some(
                (profile) => profile.id === state.agentProfileId,
              ) && (
                <option value={state.agentProfileId}>
                  {state.agentProfileId}
                </option>
              )}
              {agentProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} · {profile.agent}
                </option>
              ))}
            </SelectField>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="路由 Agent"
                value={state.routeAgent}
                onChange={(routeAgent) =>
                  patch({ routeAgent: routeAgent as ChannelConnectorAgentId })
                }
              >
                {CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS.map((agent) => (
                  <option key={agent} value={agent}>
                    {CHANNEL_CONNECTOR_RUNTIME_AGENT_METADATA[agent].label} · {agent}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="默认模型"
                hint={
                  gatewayModelsQuery.error && providerModels.length === 0
                    ? `模型列表加载失败，可在下方手动填写：${gatewayModelsQuery.error.message}`
                    : `来自 Model Gateway ${modelSourceLabel}；留空则使用网关默认路由。`
                }
                value={state.routeModel}
                onChange={(routeModel) => patch({ routeModel })}
              >
                <option value="">网关默认路由</option>
                {state.routeModel &&
                  !gatewayModels.some(
                    (model) => model.id === state.routeModel,
                  ) && (
                    <option value={state.routeModel}>{state.routeModel}</option>
                  )}
                {gatewayModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.display_name || model.id}
                    {model.providerIds?.length
                      ? ` · ${model.providerIds.join(", ")}`
                      : ""}
                  </option>
                ))}
              </SelectField>
            </div>
            <Field
              label="手动模型 ID"
              hint="模型列表不可用或未列出别名时填写，例如 gpt-5.5 / glm-5.2。和下拉共用同一保存值。"
            >
              <Input
                value={state.routeModel}
                onChange={(e) => patch({ routeModel: e.target.value })}
                placeholder="留空 = 网关默认路由"
              />
            </Field>
            <Field
              label="默认启动目录"
              hint="每条 IM 路由独立传给 Agent；用于区分项目/仓库。"
            >
              <Input
                value={state.routeWorkDir}
                onChange={(e) => patch({ routeWorkDir: e.target.value })}
                placeholder={selectedProfile?.workDir ?? "/path/to/project"}
              />
            </Field>
            <SelectField
              label="权限模式"
              value={state.routePermissionMode}
              onChange={(routePermissionMode) =>
                patch({
                  routePermissionMode:
                    routePermissionMode as ChannelConnectorPermissionMode,
                })
              }
            >
              <option value="suggest">suggest</option>
              <option value="read-only">read-only</option>
              <option value="auto-edit">auto-edit</option>
              <option value="full-auto">full-auto</option>
              <option value="plan">plan</option>
              <option value="yolo">yolo</option>
            </SelectField>
            <div className="grid gap-2 rounded-sm border border-line bg-panel p-3 text-sm text-muted sm:grid-cols-2">
              <span>
                实际 Agent：
                <strong className="text-ink-strong">{state.routeAgent}</strong>
              </span>
              <span>
                实际模型：
                <strong className="text-ink-strong">
                  {state.routeModel || "网关默认路由"}
                </strong>
              </span>
              <span className="sm:col-span-2">
                实际目录：
                <strong className="break-all text-ink-strong">
                  {state.routeWorkDir || selectedProfile?.workDir || "—"}
                </strong>
              </span>
            </div>
          </FormSection>

          <FormSection title="权限策略" sub="逗号或换行分隔。">
            <Field label="allowlist">
              <Input
                value={state.allowlist}
                onChange={(e) => patch({ allowlist: e.target.value })}
                placeholder="uid1, uid2"
              />
            </Field>
            <Field label="adminUsers">
              <Input
                value={state.adminUsers}
                onChange={(e) => patch({ adminUsers: e.target.value })}
                placeholder="uid1, uid2"
              />
            </Field>
            <Field label="disabledCommands">
              <Input
                value={state.disabledCommands}
                onChange={(e) => patch({ disabledCommands: e.target.value })}
                placeholder="/reset, /stop"
              />
            </Field>
          </FormSection>

          <FormSection
            title="会话策略"
            sub="当前写入 metadata，守护实现按已支持字段解释。"
          >
            <SelectField
              label="会话模式"
              value={state.sessionMode}
              onChange={(sessionMode) => patch({ sessionMode })}
            >
              <option value="persistent">持久会话</option>
              <option value="one-shot">单次会话</option>
            </SelectField>
            <div className="grid gap-2 sm:grid-cols-2">
              {toggleInput(
                state.busyGuard,
                (busyGuard) => patch({ busyGuard }),
                "busy guard",
                "会话忙时排队/保护",
              )}
              {toggleInput(
                state.attachmentStaging,
                (attachmentStaging) => patch({ attachmentStaging }),
                "附件暂存",
                "附件先落盘再交给 Agent",
              )}
            </div>
          </FormSection>
        </SheetBody>
        <SheetFooter className="justify-end bg-panel/95">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => unsaved.requestOpenChange(false)}
            disabled={pending}
          >
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={pending}
          >
            <Save />
            {pending ? "保存中…" : "保存"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function BindingBadges({
  binding,
}: {
  binding: ChannelConnectorPlatformBinding;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline">{binding.platform}</Badge>
      <Badge variant="outline">acct {binding.accountId || "—"}</Badge>
      {binding.botId && <Badge variant="outline">bot {binding.botId}</Badge>}
      <Badge variant="outline">{binding.allowlist.length} 允许</Badge>
      <Badge variant="outline">{binding.adminUsers.length} 管理员</Badge>
      {binding.metadata && Object.keys(binding.metadata).length > 0 && (
        <Badge variant="outline">
          metadata {Object.keys(binding.metadata).length}
        </Badge>
      )}
    </div>
  );
}
