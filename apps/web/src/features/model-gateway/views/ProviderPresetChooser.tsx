import * as React from "react";
import { Bot, ChevronRight, Plug, Route, Settings2, Sparkles } from "lucide-react";

import { cn } from "@/design/lib/utils";
import type {
  ModelGatewayApiFormat,
  ModelGatewayAuthStrategy,
  ModelGatewayProviderCategory,
} from "../types";

/**
 * Prefill values a creation preset injects into the segmented config form.
 * Mirrors (and adapts to the new `FormState`/`EndpointRow`/`ModelRow` shape)
 * the protocol presets introduced in the old Vue page (commit 752615d9).
 */
export interface ProviderCreatePreset {
  id: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Suggested provider display name (user can edit before saving). */
  name: string;
  category: ModelGatewayProviderCategory;
  baseUrl: string;
  apiFormat: ModelGatewayApiFormat;
  authStrategy: ModelGatewayAuthStrategy;
  /** Optional seed endpoint profile name; baseUrl/protocol/auth inherit the above. */
  endpointName?: string;
  /** Optional seed model id + alias for the catalog. */
  modelId?: string;
  modelAlias?: string;
  supportsThinking?: boolean;
  supportsEffort?: boolean;
}

const API_FORMAT_LABEL: Record<ModelGatewayApiFormat, string> = {
  openai_chat: "openai",
  openai_responses: "responses",
  anthropic_messages: "messages",
  gemini_native: "native",
};

/**
 * Chinese creation presets. Values adapted from the GLM Coding Plan / Anthropic
 * / OpenAI compatible defaults referenced by the old Vue flow; the user always
 * lands in the editable segmented form afterward so anything here is a seed.
 */
export const PROVIDER_CREATE_PRESETS: ReadonlyArray<ProviderCreatePreset> = [
  {
    id: "anthropic-messages",
    title: "Anthropic Messages",
    desc: "Claude 官方 / 兼容端点，用于 Claude Code、Goose 等 Anthropic Messages 客户端。",
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
  },
  {
    id: "openai-responses",
    title: "OpenAI Responses (Codex 兼容)",
    desc: "用于 Codex 等基于 /v1/responses 的客户端。",
    icon: Sparkles,
    name: "OpenAI Responses",
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
    id: "openai-chat",
    title: "OpenAI Chat Completions (通用兼容)",
    desc: "第三方聚合平台、本地代理或任何 /v1/chat/completions 兼容服务。",
    icon: Plug,
    name: "OpenAI Compatible",
    category: "openai-compatible",
    baseUrl: "https://api.example.com/v1",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
    endpointName: "OpenAI Chat 端点",
    modelId: "",
    modelAlias: "",
  },
  {
    id: "glm-coding",
    title: "GLM Coding (智谱双端点)",
    desc: "智谱编程套餐：OpenAI Chat 主端点 + Anthropic Messages 备用端点。",
    icon: Route,
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
  },
  {
    id: "blank",
    title: "自定义 / 空白",
    desc: "只给出最小骨架，适合本地模型、代理网关或暂未归类的 Provider。",
    icon: Settings2,
    name: "",
    category: "custom",
    baseUrl: "",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
  },
];

function compactMeta(preset: ProviderCreatePreset): string {
  return [API_FORMAT_LABEL[preset.apiFormat], preset.baseUrl || "手动填写 baseUrl", preset.modelId]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Step 1 of provider creation: a Chinese protocol-preset chooser. Picking a
 * card prefills the segmented config form; "自定义 / 空白" gives a near-empty
 * skeleton. Edit mode never renders this.
 */
export function ProviderPresetChooser({ onChoose }: { onChoose: (preset: ProviderCreatePreset) => void }) {
  return (
    <div className="grid gap-2.5" role="list" aria-label="Provider 类型预设">
      <p className="text-sm text-muted">
        先选择协议和端点模板，再进入基础 / Endpoint / 模型 / 高级分段配置。选择后所有字段都可继续编辑。
      </p>
      {PROVIDER_CREATE_PRESETS.map((preset) => {
        const Icon = preset.icon;
        return (
          <button
            key={preset.id}
            type="button"
            role="listitem"
            onClick={() => onChoose(preset)}
            className={cn(
              "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-line bg-panel p-3.5 text-left outline-none transition-colors",
              "hover:border-primary-line hover:bg-primary-soft focus-visible:shadow-[var(--ring)]",
            )}
          >
            <span className="grid size-9 place-items-center rounded-[9px] bg-panel-3 text-primary [&_svg]:size-[18px]">
              <Icon />
            </span>
            <span className="grid min-w-0 gap-1">
              <strong className="text-base text-ink-strong">{preset.title}</strong>
              <span className="text-sm text-muted [overflow-wrap:anywhere]">{preset.desc}</span>
              <small className="text-xs text-subtle [overflow-wrap:anywhere]">{compactMeta(preset)}</small>
            </span>
            <ChevronRight className="size-4 text-subtle" />
          </button>
        );
      })}
    </div>
  );
}
