import * as React from "react";
import {
  Bot,
  ChevronRight,
  Cloud,
  KeyRound,
  Laptop,
  Library,
  Plug,
  Settings2,
  Sparkles,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import type {
  ModelGatewayApiFormat,
  ModelGatewayAuthStrategy,
  ModelGatewayProviderCategory,
} from "../types";

export type ProviderOnboardingMode =
  | "quick"
  | "catalog"
  | "local"
  | "account"
  | "advanced";

export interface ProviderSeed {
  id: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  category: ModelGatewayProviderCategory;
  baseUrl: string;
  apiFormat: ModelGatewayApiFormat;
  authStrategy: ModelGatewayAuthStrategy;
  endpointName?: string;
  modelId?: string;
  modelAlias?: string;
  supportsThinking?: boolean;
  supportsEffort?: boolean;
  website?: string;
  notes?: string;
}

interface OnboardingOption {
  id: ProviderOnboardingMode;
  title: string;
  desc: string;
  bestFor: string;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean;
}

const ONBOARDING_OPTIONS: ReadonlyArray<OnboardingOption> = [
  {
    id: "quick",
    title: "快速连接 API Provider",
    desc: "输入名称、Base URL 和 API Key，自动识别协议、鉴权、模型上下文和能力。",
    bestFor: "大多数 OpenAI-compatible 云服务、聚合平台或公司代理",
    icon: Sparkles,
    primary: true,
  },
  {
    id: "catalog",
    title: "从供应商目录添加",
    desc: "先选 OpenAI、Anthropic、DeepSeek、智谱等供应商，再按官方默认值预填。",
    bestFor: "主流云供应商、聚合平台、需要 models.dev 能力种子的场景",
    icon: Library,
  },
  {
    id: "local",
    title: "连接本地 / 自托管服务",
    desc: "为 Ollama、LM Studio、vLLM、llama.cpp、LocalAI 等本地端点预设低摩擦入口。",
    bestFor: "本机或内网模型服务，通常可无密钥或使用自定义密钥",
    icon: Laptop,
  },
  {
    id: "account",
    title: "账号型 Provider",
    desc: "返回 Provider 列表发起 Codex 浏览器授权，不需要手动粘贴 API Key。",
    bestFor: "Codex 账号、后续可扩展 OAuth / device-code 登录型 Provider",
    icon: Bot,
  },
  {
    id: "advanced",
    title: "高级手动配置",
    desc: "直接选择协议模板、endpoint profile、模型别名、网络超时和特殊鉴权。",
    bestFor: "网关管理员、多 endpoint、特殊协议兼容和路由调试",
    icon: Settings2,
  },
];

export const CLOUD_PROVIDER_SEEDS: ReadonlyArray<ProviderSeed> = [
  {
    id: "openai",
    title: "OpenAI",
    desc: "官方 OpenAI API。适合 Responses / Codex 类客户端。",
    icon: Sparkles,
    name: "OpenAI",
    category: "official",
    baseUrl: "https://api.openai.com/v1",
    apiFormat: "openai_responses",
    authStrategy: "bearer",
    endpointName: "OpenAI Responses 端点",
    modelId: "gpt-5.5",
    modelAlias: "gpt-latest",
    supportsThinking: true,
    supportsEffort: true,
    website: "https://platform.openai.com",
    notes: "优先自动识别 /models；上下文和输出能力以网关模型目录保存真实值，CLI 应用配置另行使用安全预算。",
  },
  {
    id: "anthropic",
    title: "Anthropic",
    desc: "Claude 官方 Messages API。适合 Claude Code / Anthropic-compatible 客户端。",
    icon: Bot,
    name: "Anthropic",
    category: "official",
    baseUrl: "https://api.anthropic.com",
    apiFormat: "anthropic_messages",
    authStrategy: "anthropic_api_key",
    endpointName: "Anthropic Messages 端点",
    modelId: "claude-sonnet-4-5",
    modelAlias: "claude",
    supportsThinking: true,
    supportsEffort: true,
    website: "https://console.anthropic.com",
  },
  {
    id: "openrouter",
    title: "OpenRouter",
    desc: "聚合多家模型的 OpenAI-compatible 服务，通常通过 /v1/models 自动发现。",
    icon: Cloud,
    name: "OpenRouter",
    category: "aggregator",
    baseUrl: "https://openrouter.ai/api/v1",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
    endpointName: "OpenAI Chat 端点",
    modelId: "openai/gpt-5.5",
    modelAlias: "gpt-latest",
    supportsThinking: true,
    supportsEffort: true,
    website: "https://openrouter.ai",
  },
  {
    id: "deepseek",
    title: "DeepSeek",
    desc: "DeepSeek 官方 OpenAI-compatible API。",
    icon: Cloud,
    name: "DeepSeek",
    category: "official",
    baseUrl: "https://api.deepseek.com/v1",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
    endpointName: "OpenAI Chat 端点",
    modelId: "deepseek-chat",
    modelAlias: "deepseek",
    supportsThinking: true,
    website: "https://platform.deepseek.com",
  },
  {
    id: "glm",
    title: "智谱 GLM",
    desc: "智谱编程套餐或 OpenAI-compatible GLM API。",
    icon: Cloud,
    name: "GLM Coding",
    category: "official",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
    endpointName: "OpenAI Chat 编程端点",
    modelId: "glm-4.6",
    modelAlias: "glm",
    supportsThinking: true,
    supportsEffort: true,
    website: "https://bigmodel.cn",
  },
  {
    id: "siliconflow",
    title: "SiliconFlow",
    desc: "硅基流动 OpenAI-compatible 聚合平台。",
    icon: Cloud,
    name: "SiliconFlow",
    category: "aggregator",
    baseUrl: "https://api.siliconflow.cn/v1",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
    endpointName: "OpenAI Chat 端点",
    modelId: "Qwen/Qwen3-Coder",
    modelAlias: "coder",
    supportsThinking: true,
    website: "https://siliconflow.cn",
  },
];

export const LOCAL_PROVIDER_SEEDS: ReadonlyArray<ProviderSeed> = [
  {
    id: "ollama",
    title: "Ollama",
    desc: "本机 Ollama OpenAI-compatible 端点。默认不需要 API Key。",
    icon: Laptop,
    name: "Ollama",
    category: "local",
    baseUrl: "http://127.0.0.1:11434/v1",
    apiFormat: "openai_chat",
    authStrategy: "none",
    endpointName: "Ollama 本地端点",
    modelId: "llama3.1",
    modelAlias: "local",
    notes: "如果 /v1/models 不可用，可在模型分区手动添加本地模型 id。",
  },
  {
    id: "lmstudio",
    title: "LM Studio",
    desc: "LM Studio Local Server 的 OpenAI-compatible 端点。",
    icon: Laptop,
    name: "LM Studio",
    category: "local",
    baseUrl: "http://127.0.0.1:1234/v1",
    apiFormat: "openai_chat",
    authStrategy: "none",
    endpointName: "LM Studio 本地端点",
    modelId: "local-model",
    modelAlias: "local",
  },
  {
    id: "vllm",
    title: "vLLM / OpenAI-compatible Server",
    desc: "自托管 vLLM、SGLang、llama.cpp server 或 LocalAI。",
    icon: Plug,
    name: "Self-hosted OpenAI Compatible",
    category: "local",
    baseUrl: "http://127.0.0.1:8000/v1",
    apiFormat: "openai_chat",
    authStrategy: "none",
    endpointName: "自托管 OpenAI Chat 端点",
    modelId: "local-model",
    modelAlias: "self-hosted",
  },
];

export const ADVANCED_PROTOCOL_SEEDS: ReadonlyArray<ProviderSeed> = [
  {
    id: "advanced-anthropic-messages",
    title: "Anthropic Messages 协议",
    desc: "只按 Anthropic Messages 协议预填，供应商和模型可自行编辑。",
    icon: Bot,
    name: "Anthropic Compatible",
    category: "openai-compatible",
    baseUrl: "https://api.anthropic.com",
    apiFormat: "anthropic_messages",
    authStrategy: "anthropic_api_key",
    endpointName: "Anthropic Messages 端点",
    modelId: "claude-sonnet-4-5",
    modelAlias: "claude",
    supportsThinking: true,
    supportsEffort: true,
  },
  {
    id: "advanced-openai-responses",
    title: "OpenAI Responses 协议",
    desc: "用于 Codex / Responses 兼容客户端的高级模板。",
    icon: Sparkles,
    name: "OpenAI Responses Compatible",
    category: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    apiFormat: "openai_responses",
    authStrategy: "bearer",
    endpointName: "Responses 端点",
    modelId: "gpt-5-codex",
    modelAlias: "codex",
    supportsThinking: true,
    supportsEffort: true,
  },
  {
    id: "advanced-openai-chat",
    title: "OpenAI Chat Completions 协议",
    desc: "第三方聚合平台、本地代理或 /v1/chat/completions 兼容服务。",
    icon: Plug,
    name: "OpenAI Compatible",
    category: "openai-compatible",
    baseUrl: "https://api.example.com/v1",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
    endpointName: "OpenAI Chat 端点",
  },
  {
    id: "advanced-blank",
    title: "空白手动配置",
    desc: "只给最小骨架，适合未归类供应商、代理网关或特殊鉴权。",
    icon: Settings2,
    name: "",
    category: "custom",
    baseUrl: "",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
  },
];

const API_FORMAT_LABEL: Record<ModelGatewayApiFormat, string> = {
  openai_chat: "openai",
  openai_responses: "responses",
  anthropic_messages: "messages",
  gemini_native: "native",
};

function compactSeedMeta(seed: ProviderSeed): string {
  return [API_FORMAT_LABEL[seed.apiFormat], seed.baseUrl || "手动填写 baseUrl", seed.modelId]
    .filter(Boolean)
    .join(" · ");
}

function SeedList({
  seeds,
  onChooseSeed,
}: {
  seeds: ReadonlyArray<ProviderSeed>;
  onChooseSeed: (seed: ProviderSeed) => void;
}) {
  return (
    <div className="grid gap-2.5">
      {seeds.map((seed) => {
        const Icon = seed.icon;
        return (
          <button
            key={seed.id}
            type="button"
            onClick={() => onChooseSeed(seed)}
            className={cn(
              "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-line bg-panel p-3.5 text-left outline-none transition-colors",
              "hover:border-primary-line hover:bg-primary-soft focus-visible:shadow-[var(--ring)]",
            )}
          >
            <span className="grid size-9 place-items-center rounded-[9px] bg-panel-3 text-primary [&_svg]:size-[18px]">
              <Icon />
            </span>
            <span className="grid min-w-0 gap-1">
              <strong className="text-base text-ink-strong">{seed.title}</strong>
              <span className="text-sm text-muted [overflow-wrap:anywhere]">{seed.desc}</span>
              <small className="text-xs text-subtle [overflow-wrap:anywhere]">{compactSeedMeta(seed)}</small>
            </span>
            <ChevronRight className="size-4 text-subtle" />
          </button>
        );
      })}
    </div>
  );
}

export function ProviderOnboardingChooser({
  selectedMode,
  onSelectMode,
  onChooseSeed,
  onStartQuick,
  onStartCodexLogin,
  codexLoginPending,
}: {
  selectedMode: ProviderOnboardingMode;
  onSelectMode: (mode: ProviderOnboardingMode) => void;
  onChooseSeed: (seed: ProviderSeed) => void;
  onStartQuick: () => void;
  onStartCodexLogin: () => void;
  codexLoginPending?: boolean;
}) {
  const selected = ONBOARDING_OPTIONS.find((option) => option.id === selectedMode) ?? ONBOARDING_OPTIONS[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
      <div className="grid gap-2.5" role="list" aria-label="Provider 新建方式">
        {ONBOARDING_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = selectedMode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="listitem"
              onClick={() => onSelectMode(option.id)}
              className={cn(
                "grid gap-1 rounded-md border p-3 text-left outline-none transition-colors focus-visible:shadow-[var(--ring)]",
                active
                  ? "border-primary-line bg-primary-soft text-ink-strong"
                  : "border-line bg-panel hover:border-primary-line hover:bg-panel-2",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-[8px] bg-panel-3 text-primary [&_svg]:size-4">
                  <Icon />
                </span>
                <strong className="text-base">{option.title}</strong>
                {option.primary && (
                  <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-ink">推荐</span>
                )}
              </span>
              <span className="text-sm text-muted">{option.desc}</span>
              <small className="text-xs text-subtle">适合：{option.bestFor}</small>
            </button>
          );
        })}
      </div>

      <section className="rounded-md border border-line bg-panel p-4 shadow-sm">
        <div className="mb-3 flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-primary [&_svg]:size-4">
            <selected.icon />
          </span>
          <div className="min-w-0">
            <h3 className="text-md font-semibold text-ink-strong">{selected.title}</h3>
            <p className="text-sm text-muted">{selected.desc}</p>
          </div>
        </div>

        {selectedMode === "quick" && (
          <div className="grid gap-3">
            <div className="rounded-sm border border-primary-line bg-primary-soft/35 p-3 text-sm text-muted">
              推荐从这里开始：先填最少字段，再由 Tracevane 自动识别协议、模型和能力；识别失败时仍可切到模型或高级分区手动补齐。
            </div>
            <button
              type="button"
              onClick={onStartQuick}
              className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-primary-line bg-primary-soft p-3.5 text-left outline-none transition-colors hover:bg-panel focus-visible:shadow-[var(--ring)]"
            >
              <span className="grid size-9 place-items-center rounded-[9px] bg-panel-3 text-primary [&_svg]:size-[18px]">
                <KeyRound />
              </span>
              <span className="grid min-w-0 gap-1">
                <strong className="text-base text-ink-strong">进入快速连接表单</strong>
                <span className="text-sm text-muted">名称 / Base URL / API Key → 测试连接并自动识别 → 保存。</span>
              </span>
              <ChevronRight className="size-4 text-subtle" />
            </button>
          </div>
        )}

        {selectedMode === "catalog" && <SeedList seeds={CLOUD_PROVIDER_SEEDS} onChooseSeed={onChooseSeed} />}
        {selectedMode === "local" && <SeedList seeds={LOCAL_PROVIDER_SEEDS} onChooseSeed={onChooseSeed} />}
        {selectedMode === "advanced" && <SeedList seeds={ADVANCED_PROTOCOL_SEEDS} onChooseSeed={onChooseSeed} />}

        {selectedMode === "account" && (
          <div className="grid gap-3">
            <div className="rounded-sm border border-line bg-panel-2 p-3 text-sm text-muted">
              账号型 Provider 不要求用户理解 API 协议；从 Provider 列表发起浏览器授权后，Tracevane 会创建 Provider 和账号池。
            </div>
            <button
              type="button"
              onClick={onStartCodexLogin}
              disabled={codexLoginPending}
              className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-line bg-panel p-3.5 text-left outline-none transition-colors hover:border-primary-line hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60 focus-visible:shadow-[var(--ring)]"
            >
              <span className="grid size-9 place-items-center rounded-[9px] bg-panel-3 text-primary [&_svg]:size-[18px]">
                <Bot />
              </span>
              <span className="grid min-w-0 gap-1">
                <strong className="text-base text-ink-strong">前往 Codex 账户登录</strong>
                <span className="text-sm text-muted">回到 Provider 列表后点击“Codex 账户登录”，自动轮询并创建 Codex Account Provider。</span>
              </span>
              <ChevronRight className="size-4 text-subtle" />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
