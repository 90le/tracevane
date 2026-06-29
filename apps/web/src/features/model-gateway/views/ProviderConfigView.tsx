import * as React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Brain,
  Check,
  Info,
  KeyRound,
  Plug,
  Plus,
  RefreshCw,
  Route,
  ScanSearch,
  Settings2,
  Trash2,
  Wand2,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
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
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";
import { toast } from "@/design/ui/sonner";

import {
  useCreateModelGatewayProviderMutation,
  useDeleteModelGatewayProviderMutation,
  useDetectModelGatewayProviderMutation,
  useModelGatewayProviderSecretQuery,
  useModelGatewayProvidersQuery,
  useSetModelGatewayProviderSecretMutation,
  useUpdateModelGatewayProviderMutation,
} from "@/lib/query/model-gateway";
import {
  MODEL_GATEWAY_API_FORMATS,
  MODEL_GATEWAY_AUTH_STRATEGIES,
  MODEL_GATEWAY_PROVIDER_CATEGORIES,
  type ModelGatewayAppScope,
  type ModelGatewayApiFormat,
  type ModelGatewayAuthStrategy,
  type ModelGatewayProviderCategory,
  type ModelGatewayProviderView,
  type ModelGatewayUpsertProviderRequest,
} from "../types";
import type { ModelGatewayViewProps } from "./types";
import {
  ModelCatalogEditor,
  newModelRow,
  type DetectedCandidate,
  type ModelRow,
} from "./ModelCatalogEditor";
import {
  ProviderOnboardingChooser,
  type ProviderOnboardingMode,
  type ProviderSeed,
} from "./ProviderOnboardingChooser";

type Section = "guide" | "basic" | "endpoint" | "models" | "advanced";

const SECTIONS: ReadonlyArray<{ id: Section; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "guide", label: "向导", icon: Wand2 },
  { id: "basic", label: "基础", icon: Info },
  { id: "endpoint", label: "Endpoint", icon: Plug },
  { id: "models", label: "模型", icon: Box },
  { id: "advanced", label: "高级", icon: Settings2 },
];

const API_FORMAT_LABEL: Record<ModelGatewayApiFormat, string> = {
  openai_chat: "openai",
  openai_responses: "responses",
  anthropic_messages: "messages",
  gemini_native: "native",
};

// --- Editable form models --------------------------------------------------

interface EndpointRow {
  id: string;
  name: string;
  baseUrl: string;
  apiFormat: ModelGatewayApiFormat;
  authStrategy: ModelGatewayAuthStrategy;
  enabled: boolean;
}

interface FormState {
  name: string;
  category: ModelGatewayProviderCategory;
  baseUrl: string;
  apiFormat: ModelGatewayApiFormat;
  authStrategy: ModelGatewayAuthStrategy;
  enabled: boolean;
  timeoutMs: string;
  firstByteTimeoutMs: string;
  proxyUrl: string;
  tlsVerify: boolean;
  supportsThinking: boolean;
  supportsEffort: boolean;
  website: string;
  notes: string;
  endpoints: EndpointRow[];
  models: ModelRow[];
}

function emptyForm(): FormState {
  return {
    name: "",
    category: "openai-compatible",
    baseUrl: "",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
    enabled: true,
    timeoutMs: "30000",
    firstByteTimeoutMs: "8000",
    proxyUrl: "",
    tlsVerify: true,
    supportsThinking: false,
    supportsEffort: false,
    website: "",
    notes: "",
    endpoints: [],
    models: [],
  };
}

function formFromSeed(preset: ProviderSeed): FormState {
  const base = emptyForm();
  const models: ModelRow[] = preset.modelId
    ? [{ ...newModelRow(true), id: preset.modelId, alias: preset.modelAlias ?? "" }]
    : [];
  const endpoints: EndpointRow[] = preset.endpointName
    ? [
        {
          id: "",
          name: preset.endpointName,
          baseUrl: preset.baseUrl,
          apiFormat: preset.apiFormat,
          authStrategy: preset.authStrategy,
          enabled: true,
        },
      ]
    : [];
  return {
    ...base,
    name: preset.name,
    category: preset.category,
    baseUrl: preset.baseUrl,
    apiFormat: preset.apiFormat,
    authStrategy: preset.authStrategy,
    supportsThinking: preset.supportsThinking ?? false,
    supportsEffort: preset.supportsEffort ?? false,
    endpoints,
    models,
  };
}

function formFromProvider(p: ModelGatewayProviderView): FormState {
  return {
    name: p.name,
    category: p.category,
    baseUrl: p.baseUrl,
    apiFormat: p.apiFormat,
    authStrategy: p.authStrategy,
    enabled: p.enabled,
    timeoutMs: String(p.network?.timeoutMs ?? 30000),
    firstByteTimeoutMs: String(p.network?.streamingFirstByteTimeoutMs ?? 8000),
    proxyUrl: p.network?.proxyUrl ?? "",
    tlsVerify: p.network?.tlsVerify ?? true,
    supportsThinking: p.reasoning?.supportsThinking ?? false,
    supportsEffort: p.reasoning?.supportsEffort ?? false,
    website: p.metadata?.website ?? "",
    notes: p.metadata?.notes ?? "",
    endpoints: (p.endpointProfiles ?? []).map((ep) => ({
      id: ep.id,
      name: ep.name,
      baseUrl: ep.baseUrl,
      apiFormat: ep.apiFormat,
      authStrategy: ep.authStrategy,
      enabled: ep.enabled,
    })),
    models: (p.models?.models ?? []).map((m) => ({
      id: m.id,
      alias: m.aliases?.[0] ?? "",
      contextWindow: m.contextWindow != null ? String(m.contextWindow) : "",
      maxOutput: m.maxOutputTokens != null ? String(m.maxOutputTokens) : "",
      isDefault: p.models?.defaultModel === m.id,
      reasoning: m.features?.reasoning ?? false,
      vision: m.features?.vision ?? false,
      tools: m.features?.tools ?? false,
    })),
  };
}

// --- Validation ------------------------------------------------------------

interface ValidationResult {
  errors: string[];
  modelErrors: Record<number, string>;
}

function validate(form: FormState): ValidationResult {
  const errors: string[] = [];
  const modelErrors: Record<number, string> = {};

  if (!form.name.trim()) errors.push("名称不能为空。");
  if (!form.baseUrl.trim()) errors.push("默认 baseUrl 不能为空。");

  const seenIds = new Map<string, number>();
  const seenAliases = new Map<string, number>();
  form.models.forEach((m, i) => {
    const id = m.id.trim();
    if (!id) {
      modelErrors[i] = "模型 id 不能为空。";
      return;
    }
    if (seenIds.has(id)) {
      modelErrors[i] = `模型 id「${id}」重复。`;
    } else {
      seenIds.set(id, i);
    }
    const alias = m.alias.trim();
    if (alias) {
      if (seenAliases.has(alias)) {
        modelErrors[i] = `alias「${alias}」重复。`;
      } else {
        seenAliases.set(alias, i);
      }
    }
  });

  const defaultRow = form.models.find((m) => m.isDefault);
  if (defaultRow && !defaultRow.id.trim()) {
    errors.push("默认模型指向了一个空 id 的模型行。");
  }
  const defaultCount = form.models.filter((m) => m.isDefault).length;
  if (defaultCount > 1) {
    errors.push("只能有一个默认模型。");
  }

  if (Object.keys(modelErrors).length > 0) {
    errors.push("模型目录存在问题，请修复行内错误。");
  }

  return { errors, modelErrors };
}

// --- Payload ---------------------------------------------------------------

function buildPayload(form: FormState, providerId?: string): ModelGatewayUpsertProviderRequest {
  const models = form.models
    .filter((m) => m.id.trim())
    .map((m) => {
      const aliases = m.alias.trim() ? [m.alias.trim()] : [];
      return {
        id: m.id.trim(),
        aliases,
        contextWindow: m.contextWindow.trim() ? Number(m.contextWindow) : null,
        maxOutputTokens: m.maxOutput.trim() ? Number(m.maxOutput) : null,
        features: { reasoning: m.reasoning, vision: m.vision, tools: m.tools },
      };
    });

  const aliasMap: Record<string, string> = {};
  for (const m of models) {
    for (const a of m.aliases) aliasMap[a] = m.id;
  }

  const defaultRow = form.models.find((m) => m.isDefault && m.id.trim());

  return {
    provider: {
      ...(providerId ? { id: providerId } : {}),
      name: form.name.trim(),
      category: form.category,
      enabled: form.enabled,
      baseUrl: form.baseUrl.trim(),
      apiFormat: form.apiFormat,
      authStrategy: form.authStrategy,
      models: {
        defaultModel: defaultRow ? defaultRow.id.trim() : null,
        models,
        aliases: aliasMap,
      },
      reasoning: {
        supportsThinking: form.supportsThinking,
        supportsEffort: form.supportsEffort,
      },
      endpointProfiles: form.endpoints
        .filter((ep) => ep.name.trim() || ep.baseUrl.trim())
        .map((ep) => ({
          ...(ep.id ? { id: ep.id } : {}),
          name: ep.name.trim(),
          baseUrl: ep.baseUrl.trim(),
          apiFormat: ep.apiFormat,
          authStrategy: ep.authStrategy,
          enabled: ep.enabled,
        })),
      network: {
        timeoutMs: form.timeoutMs.trim() ? Number(form.timeoutMs) : 30000,
        streamingFirstByteTimeoutMs: form.firstByteTimeoutMs.trim()
          ? Number(form.firstByteTimeoutMs)
          : 8000,
        proxyUrl: form.proxyUrl.trim() ? form.proxyUrl.trim() : null,
        tlsVerify: form.tlsVerify,
      },
      metadata: {
        website: form.website.trim() || undefined,
        notes: form.notes.trim() || undefined,
      },
    },
  };
}

// --- Small field primitives ------------------------------------------------

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </label>
  );
}

function SegRadio<T extends string>({
  value,
  options,
  onChange,
  labelOf,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  labelOf?: (v: T) => string;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-sm border border-line bg-panel-2 p-1">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-[5px] px-2.5 py-1 text-sm outline-none transition-colors focus-visible:shadow-[var(--ring)]",
            value === opt ? "bg-primary-soft text-ink-strong" : "text-muted hover:text-ink",
          )}
        >
          {labelOf ? labelOf(opt) : opt}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
      <span className="grid min-w-0 flex-1">
        <strong className="text-base text-ink-strong">{label}</strong>
        {hint && <span className="text-sm text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full outline-none transition-colors focus-visible:shadow-[var(--ring)]",
          checked ? "bg-primary" : "bg-panel-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

function CfgCard({
  icon: Icon,
  title,
  sub,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-line bg-panel shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <span className="grid size-7 place-items-center rounded-[8px] bg-panel-3 text-muted [&_svg]:size-4">
          <Icon />
        </span>
        <strong className="text-md font-semibold text-ink-strong">{title}</strong>
        {sub && <span className="text-sm text-subtle">{sub}</span>}
      </div>
      <div className="grid gap-3.5 p-4">{children}</div>
    </section>
  );
}

const APP_SCOPE_LABEL: Record<ModelGatewayAppScope, string> = {
  codex: "Codex",
  "claude-code": "Claude Code",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
};

function healthLabel(health: ModelGatewayProviderView["health"] | undefined): { label: string; className: string } {
  if (!health) return { label: "未知", className: "text-muted" };
  if (health.circuitState === "open") return { label: "熔断", className: "text-red" };
  if (health.lastError || health.consecutiveFailures > 0) return { label: "异常", className: "text-amber" };
  if (health.lastSuccessAt) return { label: "最近通过", className: "text-green" };
  return { label: "未测试", className: "text-muted" };
}


function modelCapabilitySummary(models: ModelRow[]): string[] {
  const count = (pick: (m: ModelRow) => boolean) => models.filter(pick).length;
  const summary: string[] = [];
  const tools = count((m) => m.tools);
  const vision = count((m) => m.vision);
  const reasoning = count((m) => m.reasoning);
  if (tools) summary.push(`${tools} tools`);
  if (vision) summary.push(`${vision} vision`);
  if (reasoning) summary.push(`${reasoning} reasoning`);
  return summary;
}

function maxNumeric(rows: ModelRow[], pick: (m: ModelRow) => string): number | null {
  const values = rows
    .map((m) => Number(pick(m)))
    .filter((n) => Number.isFinite(n) && n > 0);
  return values.length ? Math.max(...values) : null;
}

function compactTokenCount(value: number | null): string {
  if (value == null) return "未知";
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function providerConfigWarnings(provider: ModelGatewayProviderView | null): string[] {
  if (!provider) return [];
  const warnings: string[] = [];
  if (!provider.enabled) warnings.push("Provider 已停用，不参与路由解析。");
  if (provider.authStrategy !== "none" && provider.secret && !provider.secret.hasSecret) {
    warnings.push("需要上游密钥，但当前未设置。");
  }
  for (const model of provider.models?.models ?? []) {
    const id = model.id.toLowerCase();
    if (id === "gpt-5.5" && model.contextWindow != null && model.contextWindow < 1_000_000) {
      warnings.push(provider.accountProvider?.kind === "codex"
        ? "Codex Account 当前服务端模型目录将 gpt-5.5 的可输入窗口限制在约 272K；这对应 Codex 产品面约 400K 总窗口中的 272K input + 128K output/reserved。OpenAI API 版 1M 需要 API-key/OpenAI API 路径或等待 Codex 官方开放。"
        : "gpt-5.5 上下文低于 1M，可能是旧缓存或 provider 模型目录未按 OpenAI API 能力更新。");
    }
    if (id === "gpt-5.5" && provider.accountProvider?.kind !== "codex" && model.pricing?.longContextInputThreshold === model.contextWindow) {
      warnings.push("gpt-5.5 的长上下文计费阈值不应等于 contextWindow。");
    }
  }
  const endpointOpen = (provider.endpointProfiles ?? []).filter((ep) => ep.health?.circuitState === "open");
  if (endpointOpen.length) warnings.push(`${endpointOpen.length} 个 endpoint profile 处于熔断状态。`);
  return warnings;
}

// --- Main view -------------------------------------------------------------

export function ProviderConfigView({ goToView, selectedProvider, createMode }: ModelGatewayViewProps) {
  const providersQuery = useModelGatewayProvidersQuery();
  const createMutation = useCreateModelGatewayProviderMutation();
  const updateMutation = useUpdateModelGatewayProviderMutation();
  const deleteMutation = useDeleteModelGatewayProviderMutation();
  const detectMutation = useDetectModelGatewayProviderMutation();
  const setSecretMutation = useSetModelGatewayProviderSecretMutation();

  const isCreate = createMode || !selectedProvider;
  const provider = React.useMemo(
    () =>
      selectedProvider
        ? (providersQuery.data?.providers ?? []).find((p) => p.id === selectedProvider) ?? null
        : null,
    [providersQuery.data, selectedProvider],
  );

  const secretQuery = useModelGatewayProviderSecretQuery(selectedProvider ?? "", {
    enabled: Boolean(selectedProvider),
  });

  const [section, setSection] = React.useState<Section>(isCreate ? "guide" : "basic");
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [initialized, setInitialized] = React.useState(false);
  const [hydratedKey, setHydratedKey] = React.useState<string | null>(null);
  const [showErrors, setShowErrors] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmLeave, setConfirmLeave] = React.useState(false);
  // Create-mode step 1: choose a user-facing onboarding path before the segmented form.
  const [onboardingMode, setOnboardingMode] = React.useState<ProviderOnboardingMode>("quick");
  const [onboardingChosen, setOnboardingChosen] = React.useState(false);
  // Detected-but-not-added models, surfaced as opt-in candidates.
  const [candidates, setCandidates] = React.useState<DetectedCandidate[]>([]);

  // Baseline snapshot of the hydrated form, used to detect unsaved edits.
  const baselineRef = React.useRef<string | null>(null);

  // Secret editing
  const [secretDraft, setSecretDraft] = React.useState("");
  const [revealSecret, setRevealSecret] = React.useState(false);

  // Hydrate the form whenever the create/edit target changes. This keeps the
  // post-create handoff on the same sub-view from showing stale create-state.
  React.useEffect(() => {
    if (isCreate) {
      if (hydratedKey === "create") return;
      const next = emptyForm();
      setForm(next);
      baselineRef.current = JSON.stringify(next);
      setSection("guide");
      setInitialized(true);
      setHydratedKey("create");
    } else if (provider) {
      const key = `provider:${provider.id}`;
      if (hydratedKey === key) return;
      const next = formFromProvider(provider);
      setForm(next);
      baselineRef.current = JSON.stringify(next);
      setSection("basic");
      setCandidates([]);
      setSecretDraft("");
      setInitialized(true);
      setHydratedKey(key);
    }
  }, [isCreate, provider, hydratedKey]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const startQuickCreate = () => {
    const next = emptyForm();
    setForm(next);
    baselineRef.current = JSON.stringify(next);
    setHydratedKey("create");
    setCandidates([]);
    setShowErrors(false);
    setSection("guide");
    setOnboardingMode("quick");
    setOnboardingChosen(true);
  };

  // Create-mode step 1 → step 2: prefill from a provider catalog/local/advanced seed and
  // reset the dirty baseline so a fresh seed isn't flagged as unsaved drift.
  const chooseSeed = (seed: ProviderSeed) => {
    const next = formFromSeed(seed);
    setForm(next);
    baselineRef.current = JSON.stringify(next);
    setHydratedKey("create");
    setCandidates([]);
    setShowErrors(false);
    setSection(seed.id.startsWith("advanced-") ? "basic" : "guide");
    setOnboardingChosen(true);
  };

  const validation = React.useMemo(() => validate(form), [form]);

  // Unsaved-changes guard: the form drifted from its hydrated baseline,
  // or a secret was typed but not yet applied.
  const isDirty =
    initialized &&
    (baselineRef.current !== JSON.stringify(form) || secretDraft.trim().length > 0);

  const activeRoutesForProvider = React.useMemo(() => {
    if (!provider) return [];
    return (providersQuery.data?.activeRoutes ?? []).filter(
      (route) => route.resolvedProviderId === provider.id || route.selectedProviderId === provider.id,
    );
  }, [provider, providersQuery.data?.activeRoutes]);
  const configWarnings = React.useMemo(() => providerConfigWarnings(provider), [provider]);

  const detectedRows: ModelRow[] = React.useMemo(
    () => candidates.map((c) => ({
      ...newModelRow(),
      id: c.id,
      contextWindow: c.contextWindow,
      maxOutput: c.maxOutput,
      reasoning: c.reasoning,
      vision: c.vision,
      tools: c.tools,
    })),
    [candidates],
  );
  const importableRows = detectedRows.length ? detectedRows : form.models;
  const capabilitySummary = modelCapabilitySummary(importableRows);
  const maxContext = maxNumeric(importableRows, (m) => m.contextWindow);
  const maxOutput = maxNumeric(importableRows, (m) => m.maxOutput);
  const recommendedDefault = form.models.find((m) => m.isDefault && m.id.trim())?.id.trim()
    ?? form.models.find((m) => m.id.trim())?.id.trim()
    ?? candidates[0]?.id
    ?? null;

  // Leave the config sub-view, guarding unsaved edits behind a confirm.
  const leaveToList = () => {
    if (isDirty) {
      setConfirmLeave(true);
      return;
    }
    goToView("providers");
  };

  // Loading / not-found guards (edit mode).
  if (!isCreate) {
    if (providersQuery.isLoading) {
      return (
        <div className="grid gap-4" role="status" aria-busy="true">
          <div className="flex items-start gap-3">
            <Skeleton className="size-9 rounded-sm" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }
    if (providersQuery.error) {
      return (
        <ErrorState
          title="无法加载 Provider"
          description={providersQuery.error.message}
          action={
            <Button variant="outline" size="sm" onClick={() => goToView("providers")}>
              返回列表
            </Button>
          }
        />
      );
    }
    if (!provider) {
      return (
        <EmptyState
          title="找不到该 Provider"
          description="它可能已被删除。"
          action={
            <Button variant="outline" size="sm" onClick={() => goToView("providers")}>
              返回列表
            </Button>
          }
        />
      );
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending || setSecretMutation.isPending;

  // Create-mode step 1: user-facing onboarding chooser, shown before the full form.
  // Edit mode skips this entirely.
  if (isCreate && !onboardingChosen) {
    return (
      <div className="grid gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => goToView("providers")} title="返回" aria-label="返回">
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink-strong">添加 Provider</h2>
            <p className="text-sm text-muted">先选择新建方式：快速连接、供应商目录、本地服务、账号登录或高级手动。</p>
          </div>
        </div>
        <ProviderOnboardingChooser
          selectedMode={onboardingMode}
          onSelectMode={setOnboardingMode}
          onChooseSeed={chooseSeed}
          onStartQuick={startQuickCreate}
          onStartCodexLogin={() => goToView("providers")}
        />
      </div>
    );
  }

  const handleSave = () => {
    setShowErrors(true);
    if (validation.errors.length > 0) {
      toast.error("配置存在校验错误", { description: validation.errors[0] });
      return;
    }
    const payload = buildPayload(form, provider?.id);
    if (isCreate) {
      const apiKey = secretDraft.trim();
      createMutation.mutate(payload, {
        onSuccess: (result) => {
          const providerId = result.provider.id;
          const finish = () => {
            toast.success("Provider 已创建", { description: "下一步可直接绑定到 Codex / Claude Code / OpenCode。" });
            setSecretDraft("");
            goToView("providercfg", { provider: providerId });
          };
          if (!apiKey || form.authStrategy === "none") {
            finish();
            return;
          }
          setSecretMutation.mutate(
            { providerId, payload: { apiKey } },
            {
              onSuccess: finish,
              onError: (error) => {
                toast.error("Provider 已创建，但密钥保存失败", { description: error.message });
                goToView("providercfg", { provider: providerId });
              },
            },
          );
        },
        onError: (error) => toast.error("创建失败", { description: error.message }),
      });
    } else if (provider) {
      updateMutation.mutate(
        { providerId: provider.id, payload },
        {
          onSuccess: () => {
            toast.success("配置已保存");
            goToView("providers");
          },
          onError: (error) => toast.error("保存失败", { description: error.message }),
        },
      );
    }
  };

  const handleDetect = () => {
    if (!form.baseUrl.trim()) {
      toast.error("请先填写 baseUrl");
      setSection(isCreate ? "guide" : "basic");
      return;
    }
    detectMutation.mutate(
      { baseUrl: form.baseUrl.trim(), apiKey: secretDraft.trim() || null },
      {
        onSuccess: (result) => {
          const rec = result.recommendations[0];
          if (rec) {
            setForm((f) => ({ ...f, apiFormat: rec.apiFormat, authStrategy: rec.authStrategy }));
          }
          // Surface detected models not already present as opt-in candidates
          // (preserves the old "merge not-present" set, but user-controlled).
          const existing = new Set(form.models.map((m) => m.id.trim()).filter(Boolean));
          const detected: DetectedCandidate[] = result.models
            .filter((m) => m.id && !existing.has(m.id))
            .map((m) => ({
              id: m.id,
              contextWindow: m.contextWindow != null ? String(m.contextWindow) : "",
              maxOutput: m.maxOutputTokens != null ? String(m.maxOutputTokens) : "",
              reasoning: m.features?.reasoning ?? false,
              vision: m.features?.vision ?? false,
              tools: m.features?.tools ?? false,
            }));
          setCandidates(detected);
          if (isCreate) setSection("guide");
          else if (detected.length > 0) setSection("models");
          toast.success(`探测完成 · ${result.models.length} 个模型`, {
            description: detected.length
              ? `${detected.length} 个新模型可在「模型」中加入${rec ? ` · 推荐协议 ${API_FORMAT_LABEL[rec.apiFormat]}` : ""}`
              : rec
                ? `推荐协议 ${API_FORMAT_LABEL[rec.apiFormat]}`
                : undefined,
          });
        },
        onError: (error) => toast.error("探测失败", { description: error.message }),
      },
    );
  };

  // Opt-in detected candidates: append the chosen ids as model rows.
  const addCandidates = (ids: string[]) => {
    const chosen = new Set(ids);
    const present = new Set(form.models.map((m) => m.id.trim()).filter(Boolean));
    const toAdd = candidates.filter((c) => chosen.has(c.id) && !present.has(c.id));
    if (toAdd.length === 0) return;
    setForm((f) => ({
      ...f,
      models: [
        ...f.models,
        ...toAdd.map((c) => ({
          ...newModelRow(),
          id: c.id,
          contextWindow: c.contextWindow,
          maxOutput: c.maxOutput,
          reasoning: c.reasoning,
          vision: c.vision,
          tools: c.tools,
        })),
      ],
    }));
    setCandidates((prev) => prev.filter((c) => !chosen.has(c.id)));
  };

  const handleSetSecret = () => {
    if (!provider) {
      toast("先保存 Provider 后再设置密钥", {
        description: "新建 Provider 保存后即可在此更新密钥。",
      });
      return;
    }
    setSecretMutation.mutate(
      { providerId: provider.id, payload: { apiKey: secretDraft.trim() || null } },
      {
        onSuccess: () => {
          toast.success("密钥已更新");
          setSecretDraft("");
          setRevealSecret(false);
        },
        onError: (error) => toast.error("更新密钥失败", { description: error.message }),
      },
    );
  };

  const handleDelete = () => {
    if (!provider) return;
    deleteMutation.mutate(provider.id, {
      onSuccess: () => {
        toast.success("Provider 已删除");
        setConfirmDelete(false);
        goToView("providers");
      },
      onError: (error) => {
        toast.error("删除失败", { description: error.message });
        setConfirmDelete(false);
      },
    });
  };

  // --- Section bodies ------------------------------------------------------

  const diagnosticsSection = !isCreate && provider ? (
    <CfgCard icon={ScanSearch} title="路由与诊断" sub="实际 Agent 路径，不等同于 Provider 自测">
      <div className="grid gap-2 rounded-sm border border-line bg-panel-2 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-ink">Provider smoke</span>
          <span className="text-muted">只验证该服务商默认协议端点是否能被调用。</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-ink">Active-route smoke</span>
          <span className="text-muted">按 Codex / Claude Code / OpenCode / OpenClaw 的实际 scope、模型和适配路径发起请求；Claude Code 默认走 streaming smoke。</span>
        </div>
      </div>

      {activeRoutesForProvider.length ? (
        <div className="grid gap-2">
          {activeRoutesForProvider.map((route) => (
            <div key={`${route.scope}-${route.routeId}`} className="grid gap-1.5 rounded-sm border border-line bg-panel-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink-strong">{APP_SCOPE_LABEL[route.scope]}</span>
                <span className="rounded-full bg-panel-3 px-2 py-0.5 text-xs text-muted">{route.routeId}</span>
                <span className="rounded-full bg-panel-3 px-2 py-0.5 text-xs text-muted">{route.routeMode ?? "unknown"}</span>
                {route.resolvedEndpointProfileName && (
                  <span className="rounded-full bg-panel-3 px-2 py-0.5 text-xs text-muted">{route.resolvedEndpointProfileName}</span>
                )}
              </div>
              <p className="break-all text-sm text-muted">
                {route.resolvedModel ?? "未解析模型"} · {route.resolvedApiFormat ?? "unknown"} · {route.upstreamUrl ?? "无 upstream"}
              </p>
              <p className="text-xs text-subtle">
                用户选择：{route.selectedProviderId ?? "auto"} · 实际 Provider：{route.resolvedProviderId ?? "missing"}
                {provider.id !== route.resolvedProviderId ? "（当前页 Provider 未承接这条实际请求）" : ""}
              </p>
              {route.warning && (
                <p className="flex items-start gap-1.5 text-sm text-amber">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {route.warning}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">当前没有任何 active route 解析到该 Provider。Provider 自测通过也不代表客户端实际会走这里。</p>
      )}

      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <span className={cn("rounded-full bg-panel-3 px-2 py-0.5 text-xs", healthLabel(provider.health).className)}>
            顶层 health：{healthLabel(provider.health).label}
          </span>
          {(provider.endpointProfiles ?? []).map((ep) => {
            const label = healthLabel(ep.health);
            return (
              <span key={ep.id} className={cn("rounded-full bg-panel-3 px-2 py-0.5 text-xs", label.className)}>
                {ep.name}：{label.label}
              </span>
            );
          })}
        </div>
        {configWarnings.length ? (
          <div className="grid gap-1 rounded-sm border border-amber/30 bg-amber-soft/40 p-3">
            {configWarnings.map((warning) => (
              <p key={warning} className="flex items-start gap-1.5 text-sm text-amber">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {warning}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">未发现明显配置风险；真实可用性仍以 active-route smoke 和客户端实调为准。</p>
        )}
      </div>
    </CfgCard>
  ) : null;

  const importRecommended = () => {
    const ids = candidates.slice(0, 20).map((c) => c.id);
    if (ids.length) addCandidates(ids);
  };

  const guideSection = (
    <div className="grid gap-4">
      <CfgCard icon={Wand2} title="连接向导" sub="推荐路径：填 2 项 → 自动识别 → 保存">
        <div className="rounded-sm border border-primary-line bg-primary-soft/35 p-3 text-sm text-muted">
          普通新增只需要供应商名称、Base URL 和 API Key。协议、鉴权、模型上下文、输出和 tools / vision / reasoning 能力会通过探测结果自动带入；高级网络和多 endpoint 可以保存后再调。
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="供应商名称" hint="例如 OpenRouter、硅基流动、公司内网代理。">
            <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="例如 OpenRouter" />
          </Field>
          <Field label="Provider 类型" hint="不确定时选 OpenAI-compatible。">
            <SegRadio
              value={form.category}
              options={MODEL_GATEWAY_PROVIDER_CATEGORIES}
              onChange={(v) => update("category", v)}
            />
          </Field>
        </div>
        <Field label="Base URL" hint="OpenAI 兼容服务通常形如 https://host/v1。">
          <Input value={form.baseUrl} onChange={(e) => update("baseUrl", e.target.value)} placeholder="https://api.example.com/v1" />
        </Field>
        <Field
          label="API Key"
          hint={provider ? "输入新密钥可更新；留空不改变已有密钥。" : "新建时会用于探测；保存 Provider 后仍可在基础页更新。"}
        >
          <div className="flex gap-2">
            <Input
              type={revealSecret ? "text" : "password"}
              value={secretDraft}
              onChange={(e) => setSecretDraft(e.target.value)}
              placeholder="sk-…"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setRevealSecret((v) => !v)}>
              {revealSecret ? "隐藏" : "显示"}
            </Button>
          </div>
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="primary" size="sm" onClick={handleDetect} disabled={detectMutation.isPending || !form.baseUrl.trim()}>
            {detectMutation.isPending ? <RefreshCw className="animate-spin" /> : <ScanSearch />}
            {detectMutation.isPending ? "正在识别…" : "测试连接并自动识别"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSection("basic")}>
            专家编辑完整配置
          </Button>
          <span className="text-xs text-subtle">不确定协议时先点识别，Tracevane 会推荐 API 格式和鉴权方式。</span>
        </div>
      </CfgCard>

      <CfgCard icon={Box} title="识别结果" sub="保存前审核，不要求逐行编辑">
        {importableRows.length === 0 ? (
          <div className="grid gap-2 rounded-sm border border-dashed border-line bg-panel-2 p-4 text-sm text-muted">
            <span>尚未识别模型。填写 Base URL / API Key 后点击“测试连接并自动识别”。</span>
            <span>如果供应商不支持 /models，可切到“模型”分区手动添加。</span>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-2 rounded-sm border border-line bg-panel-2 p-3 sm:grid-cols-4">
              <div>
                <div className="text-xs text-subtle">模型数</div>
                <strong className="text-lg text-ink-strong">{importableRows.length}</strong>
              </div>
              <div>
                <div className="text-xs text-subtle">最大上下文</div>
                <strong className="text-lg text-ink-strong">{compactTokenCount(maxContext)}</strong>
              </div>
              <div>
                <div className="text-xs text-subtle">最大输出</div>
                <strong className="text-lg text-ink-strong">{compactTokenCount(maxOutput)}</strong>
              </div>
              <div>
                <div className="text-xs text-subtle">默认建议</div>
                <strong className="break-all text-sm text-ink-strong">{recommendedDefault ?? "未选择"}</strong>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(capabilitySummary.length ? capabilitySummary : ["仅文本或未知能力"]).map((label) => (
                <span key={label} className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-muted">{label}</span>
              ))}
              <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-muted">
                协议：{API_FORMAT_LABEL[form.apiFormat]}
              </span>
              <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-muted">
                鉴权：{form.authStrategy}
              </span>
            </div>
            {candidates.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="primary" size="sm" onClick={importRecommended}>
                  <Plus />
                  导入推荐 {Math.min(20, candidates.length)} 个
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => addCandidates(candidates.map((c) => c.id))}>
                  全部导入 {candidates.length} 个
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSection("models")}>
                  手动选择/编辑
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {importableRows.slice(0, 18).map((m) => (
                <span key={m.id} className="rounded-full bg-panel-3 px-2.5 py-1 text-xs text-muted">
                  {m.id}
                </span>
              ))}
              {importableRows.length > 18 && <span className="self-center text-xs text-subtle">…还有 {importableRows.length - 18} 个</span>}
            </div>
          </div>
        )}
      </CfgCard>

      <CfgCard icon={Route} title="保存后下一步" sub="把 Provider 用起来">
        <div className="grid gap-2 text-sm text-muted">
          <p>创建成功后会留在该 Provider 配置页，并显示当前 active route 诊断。你可以继续：</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => goToView("apps", { app: "codex" })}>用于 Codex</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => goToView("apps", { app: "claude-code" })}>用于 Claude Code</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => goToView("apps", { app: "opencode" })}>用于 OpenCode</Button>
          </div>
          <p className="text-xs text-subtle">应用 CLI 配置会继续使用安全上下文预算；网关模型目录保留供应商真实上下文。</p>
        </div>
      </CfgCard>
    </div>
  );

  const basicSection = (
    <CfgCard icon={Info} title="基础" sub="必填">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="名称">
          <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="例如 GLM 智谱" />
        </Field>
        <Field label="分类">
          <SegRadio
            value={form.category}
            options={MODEL_GATEWAY_PROVIDER_CATEGORIES}
            onChange={(v) => update("category", v)}
          />
        </Field>
      </div>
      <Field label="默认 baseUrl">
        <Input value={form.baseUrl} onChange={(e) => update("baseUrl", e.target.value)} placeholder="https://…" />
      </Field>
      <Field label="API 格式">
        <SegRadio
          value={form.apiFormat}
          options={MODEL_GATEWAY_API_FORMATS}
          onChange={(v) => update("apiFormat", v)}
          labelOf={(v) => API_FORMAT_LABEL[v]}
        />
      </Field>
      <Field label="鉴权方式">
        <SegRadio
          value={form.authStrategy}
          options={MODEL_GATEWAY_AUTH_STRATEGIES}
          onChange={(v) => update("authStrategy", v)}
        />
      </Field>
      <Toggle checked={form.enabled} onChange={(v) => update("enabled", v)} label="启用" hint="停用后不参与路由解析" />
    </CfgCard>
  );

  const secretCard = (
    <CfgCard icon={KeyRound} title="密钥" sub="仅引用，不存明文">
      <Field
        label="API Key"
        hint={
          provider
            ? secretQuery.data?.secret?.hasSecret
              ? `当前：${secretQuery.data.secret.masked ?? "已设置"} · 上游密钥保存在服务端，浏览器只看掩码。`
              : "尚未设置密钥。"
            : "新建 Provider 保存后可在此设置密钥（探测时会临时使用此处输入的 key）。"
        }
      >
        <div className="flex gap-2">
          <Input
            type={revealSecret ? "text" : "password"}
            value={secretDraft}
            onChange={(e) => setSecretDraft(e.target.value)}
            placeholder={provider ? "输入新密钥以更新" : "sk-…"}
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => setRevealSecret((v) => !v)}>
            {revealSecret ? "隐藏" : "显示"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleSetSecret} disabled={setSecretMutation.isPending}>
            更新密钥
          </Button>
        </div>
      </Field>
    </CfgCard>
  );

  const endpointSection = (
    <CfgCard icon={Plug} title="Endpoint" sub="结构化行编辑">
      {form.endpoints.length === 0 ? (
        <p className="text-sm text-muted">没有额外 endpoint profile，默认使用基础 baseUrl。</p>
      ) : (
        <div className="grid gap-3">
          {form.endpoints.map((ep, i) => (
            <div key={i} className="grid gap-2.5 rounded-sm border border-line bg-panel-2 p-3">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="名称">
                  <Input
                    value={ep.name}
                    onChange={(e) =>
                      update("endpoints", form.endpoints.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                    }
                  />
                </Field>
                <Field label="baseUrl">
                  <Input
                    value={ep.baseUrl}
                    onChange={(e) =>
                      update("endpoints", form.endpoints.map((x, j) => (j === i ? { ...x, baseUrl: e.target.value } : x)))
                    }
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="协议">
                  <SegRadio
                    value={ep.apiFormat}
                    options={MODEL_GATEWAY_API_FORMATS}
                    onChange={(v) =>
                      update("endpoints", form.endpoints.map((x, j) => (j === i ? { ...x, apiFormat: v } : x)))
                    }
                    labelOf={(v) => API_FORMAT_LABEL[v]}
                  />
                </Field>
                <Field label="鉴权">
                  <SegRadio
                    value={ep.authStrategy}
                    options={MODEL_GATEWAY_AUTH_STRATEGIES}
                    onChange={(v) =>
                      update("endpoints", form.endpoints.map((x, j) => (j === i ? { ...x, authStrategy: v } : x)))
                    }
                  />
                </Field>
                <label className="flex items-center gap-1.5 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={ep.enabled}
                    onChange={(e) =>
                      update("endpoints", form.endpoints.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))
                    }
                  />
                  启用
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => update("endpoints", form.endpoints.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                  移除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="justify-self-start"
        onClick={() =>
          update("endpoints", [
            ...form.endpoints,
            {
              id: "",
              name: "",
              baseUrl: "",
              apiFormat: form.apiFormat,
              authStrategy: form.authStrategy,
              enabled: true,
            },
          ])
        }
      >
        <Plus />
        新增 endpoint
      </Button>
    </CfgCard>
  );

  const modelsSection = (
    <CfgCard icon={Box} title="模型" sub="搜索 / 批量导入 / 保存前校验">
      <ModelCatalogEditor
        models={form.models}
        onChange={(models) => update("models", models)}
        modelErrors={validation.modelErrors}
        showErrors={showErrors}
        candidates={candidates}
        onAddCandidates={addCandidates}
      />
    </CfgCard>
  );

  const advancedSection = (
    <>
      <CfgCard icon={Settings2} title="网络" sub="高级">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="请求超时 (ms)">
            <Input inputMode="numeric" value={form.timeoutMs} onChange={(e) => update("timeoutMs", e.target.value)} />
          </Field>
          <Field label="首字节超时 (ms)">
            <Input inputMode="numeric" value={form.firstByteTimeoutMs} onChange={(e) => update("firstByteTimeoutMs", e.target.value)} />
          </Field>
        </div>
        <Field label="代理 (proxyUrl)">
          <Input value={form.proxyUrl} onChange={(e) => update("proxyUrl", e.target.value)} placeholder="可留空" />
        </Field>
        <Toggle checked={form.tlsVerify} onChange={(v) => update("tlsVerify", v)} label="TLS 校验" hint="关闭仅用于本地自签证书" />
      </CfgCard>
      <CfgCard icon={Brain} title="推理能力" sub="thinking / effort">
        <Toggle checked={form.supportsThinking} onChange={(v) => update("supportsThinking", v)} label="支持 thinking" hint="透传思考过程参数" />
        <Toggle checked={form.supportsEffort} onChange={(v) => update("supportsEffort", v)} label="支持 effort 等级" hint="low / medium / high" />
      </CfgCard>
      <CfgCard icon={Info} title="元数据">
        <Field label="网站">
          <Input value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="可选" />
        </Field>
        <Field label="备注">
          <Input value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="可选" />
        </Field>
      </CfgCard>
      {!isCreate && provider && (
        <CfgCard icon={AlertTriangle} title="危险操作">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted">删除该 Provider 不可撤销，需确认。</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto text-red hover:bg-red-soft"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
              删除该 Provider
            </Button>
          </div>
        </CfgCard>
      )}
    </>
  );

  return (
    <div className="grid gap-4">
      {/* Subpage head */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={leaveToList} title="返回" aria-label="返回">
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink-strong">
            {isCreate ? "新建 API Provider" : `配置 · ${provider?.name ?? ""}`}
          </h2>
          <p className="text-sm text-muted">
            baseUrl / 协议 / 模型 / 网络 / 推理。保存前内联校验，危险变更需确认。
          </p>
        </div>
        {isCreate && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto shrink-0"
            onClick={() => setOnboardingChosen(false)}
          >
            <ArrowLeft />
            返回添加方式
          </Button>
        )}
      </div>

      {/* Section nav */}
      <nav className="flex flex-wrap gap-1 border-b border-line pb-2" aria-label="配置分区">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={section === id ? "page" : undefined}
            onClick={() => setSection(id)}
            className={cn(
              "inline-flex h-9 items-center gap-[7px] rounded-sm px-3 text-base outline-none transition-colors [&_svg]:size-[15px] focus-visible:shadow-[var(--ring)]",
              section === id
                ? "bg-primary-soft text-ink-strong [&_svg]:text-primary"
                : "text-muted hover:bg-panel-2 hover:text-ink",
            )}
          >
            <Icon />
            {label}
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={handleDetect}
          disabled={detectMutation.isPending}
        >
          <ScanSearch />
          {detectMutation.isPending ? "探测中…" : "探测/识别配置"}
        </Button>
      </nav>

      {/* Section body */}
      <div className="grid gap-4">
        {section === "guide" && guideSection}
        {section === "basic" && (
          <>
            {basicSection}
            {secretCard}
            {diagnosticsSection}
          </>
        )}
        {section === "endpoint" && endpointSection}
        {section === "models" && modelsSection}
        {section === "advanced" && advancedSection}
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel/95 px-4 py-3 shadow-sm backdrop-blur">
        {showErrors && validation.errors.length > 0 ? (
          <span className="flex items-center gap-1.5 text-sm text-red">
            <AlertTriangle className="size-4" />
            {validation.errors[0]}
          </span>
        ) : (
          <span className="text-sm text-subtle">
            {isCreate ? "快速连接可自动识别；目录/本地/高级模板都可继续编辑后保存" : "修改后保存"}
          </span>
        )}
        <span className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={leaveToList}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            <Check />
            {saving ? "保存中…" : isCreate ? "创建 Provider" : "保存配置"}
          </Button>
        </span>
      </div>

      {/* Delete confirmation */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-red-soft text-red [&_svg]:size-4">
              <Trash2 />
            </span>
            <DialogTitle>删除 Provider</DialogTitle>
          </DialogHeader>
          <DialogBody>
            确认删除「{provider?.name}」？该操作不可撤销，相关路由将失效。
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              取消
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "删除中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved-changes guard */}
      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent>
          <DialogHeader>
            <span className="grid size-8 place-items-center rounded-[9px] bg-amber-soft text-amber [&_svg]:size-4">
              <AlertTriangle />
            </span>
            <DialogTitle>有未保存的更改</DialogTitle>
          </DialogHeader>
          <DialogBody>有未保存的更改，确定离开？离开后本次编辑不会被保存。</DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirmLeave(false)}>
              继续编辑
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setConfirmLeave(false);
                goToView("providers");
              }}
            >
              放弃并离开
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
