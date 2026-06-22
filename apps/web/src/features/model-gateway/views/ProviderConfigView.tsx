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
  ScanSearch,
  Settings2,
  Trash2,
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
import { ProviderPresetChooser, type ProviderCreatePreset } from "./ProviderPresetChooser";

type Section = "basic" | "endpoint" | "models" | "advanced";

const SECTIONS: ReadonlyArray<{ id: Section; label: string; icon: React.ComponentType<{ className?: string }> }> = [
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

function formFromPreset(preset: ProviderCreatePreset): FormState {
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

  const [section, setSection] = React.useState<Section>("basic");
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [initialized, setInitialized] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmLeave, setConfirmLeave] = React.useState(false);
  // Create-mode step 1: pick a protocol preset before the segmented form.
  const [presetChosen, setPresetChosen] = React.useState(false);
  // Detected-but-not-added models, surfaced as opt-in candidates.
  const [candidates, setCandidates] = React.useState<DetectedCandidate[]>([]);

  // Baseline snapshot of the hydrated form, used to detect unsaved edits.
  const baselineRef = React.useRef<string | null>(null);

  // Secret editing
  const [secretDraft, setSecretDraft] = React.useState("");
  const [revealSecret, setRevealSecret] = React.useState(false);

  // Hydrate the form once the provider (edit) or create intent is known.
  React.useEffect(() => {
    if (initialized) return;
    if (isCreate) {
      const next = emptyForm();
      setForm(next);
      baselineRef.current = JSON.stringify(next);
      setInitialized(true);
    } else if (provider) {
      const next = formFromProvider(provider);
      setForm(next);
      baselineRef.current = JSON.stringify(next);
      setInitialized(true);
    }
  }, [isCreate, provider, initialized]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Create-mode step 1 → step 2: prefill the form from the chosen preset and
  // reset the dirty baseline so a fresh preset isn't flagged as unsaved drift.
  const choosePreset = (preset: ProviderCreatePreset) => {
    const next = formFromPreset(preset);
    setForm(next);
    baselineRef.current = JSON.stringify(next);
    setCandidates([]);
    setShowErrors(false);
    setSection("basic");
    setPresetChosen(true);
  };

  const validation = React.useMemo(() => validate(form), [form]);

  // Unsaved-changes guard: the form drifted from its hydrated baseline,
  // or a secret was typed but not yet applied.
  const isDirty =
    initialized &&
    (baselineRef.current !== JSON.stringify(form) || secretDraft.trim().length > 0);

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

  const saving = createMutation.isPending || updateMutation.isPending;

  // Create-mode step 1: protocol-preset chooser, shown before the full form.
  // Edit mode skips this entirely.
  if (isCreate && !presetChosen) {
    return (
      <div className="grid gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => goToView("providers")} title="返回" aria-label="返回">
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink-strong">新建 API Provider</h2>
            <p className="text-sm text-muted">选择一个协议预设作为起点，下一步进入分段配置。</p>
          </div>
        </div>
        <ProviderPresetChooser onChoose={choosePreset} />
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
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast.success("Provider 已创建");
          goToView("providers");
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
      setSection("basic");
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
          if (detected.length > 0) setSection("models");
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
            onClick={() => setPresetChosen(false)}
          >
            <ArrowLeft />
            返回选择预设
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
        {section === "basic" && (
          <>
            {basicSection}
            {secretCard}
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
            {isCreate ? "填写后保存以创建 Provider" : "修改后保存"}
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
