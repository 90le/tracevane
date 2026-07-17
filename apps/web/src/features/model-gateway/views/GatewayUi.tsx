import * as React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

export type GatewayIdentityTone =
  | "openai"
  | "anthropic"
  | "qwen"
  | "gemini"
  | "deepseek"
  | "local"
  | "generic";

export type GatewayIdentity = {
  label: string;
  mark: string;
  tone: GatewayIdentityTone;
};

export type GatewayComparison = {
  label: string;
  tone: "good" | "warn" | "muted" | "primary";
  direction: "up" | "down" | "flat";
};

export function modelIdentity(model: string): GatewayIdentity {
  const value = model.toLowerCase();
  if (/(^|[\W_])(gpt|o\d|openai|codex)/.test(value)) return { label: "openai", mark: "AI", tone: "openai" };
  if (/claude|anthropic/.test(value)) return { label: "anthropic", mark: "A", tone: "anthropic" };
  if (/qwen|通义/.test(value)) return { label: "qwen", mark: "Q", tone: "qwen" };
  if (/gemini|google/.test(value)) return { label: "gemini", mark: "G", tone: "gemini" };
  if (/deepseek/.test(value)) return { label: "deepseek", mark: "D", tone: "deepseek" };
  if (/llama|ollama|local|lmstudio|vllm/.test(value)) return { label: "local", mark: "L", tone: "local" };
  return { label: "model", mark: model.slice(0, 1).toUpperCase() || "M", tone: "generic" };
}

export function providerIdentityFromText(value: string | null | undefined): GatewayIdentity {
  const label = value?.trim() || "provider";
  return modelIdentity(label);
}

export function GatewayMark({
  identity,
  size = "md",
}: {
  identity: GatewayIdentity;
  size?: "sm" | "md" | "lg";
}) {
  const className = {
    openai: "border-primary-line bg-primary-soft text-primary",
    anthropic: "border-amber-soft bg-amber-soft text-amber",
    qwen: "border-violet-soft bg-violet-soft text-violet",
    gemini: "border-primary-line bg-panel text-primary",
    deepseek: "border-teal-soft bg-teal-soft text-teal",
    local: "border-line bg-panel-3 text-muted",
    generic: "border-line bg-panel text-ink",
  }[identity.tone];
  const sizeClass = {
    sm: "size-7 rounded-[7px] text-[10px]",
    md: "size-8 rounded-[8px] text-xs",
    lg: "size-10 rounded-[10px] text-sm",
  }[size];
  return (
    <span
      className={`grid shrink-0 place-items-center border font-semibold ${sizeClass} ${className}`}
      title={identity.label}
      aria-label={identity.label}
    >
      {identity.mark}
    </span>
  );
}

export function ModelLogo({ model, size = "md" }: { model: string; size?: "sm" | "md" | "lg" }) {
  return <GatewayMark identity={modelIdentity(model)} size={size} />;
}

export function GatewayPill({
  identity,
  children,
}: {
  identity: GatewayIdentity;
  children?: React.ReactNode;
}) {
  const className = {
    openai: "bg-primary-soft text-primary",
    anthropic: "bg-amber-soft text-amber",
    qwen: "bg-violet-soft text-violet",
    gemini: "bg-primary-soft text-primary",
    deepseek: "bg-teal-soft text-teal",
    local: "bg-panel-3 text-muted",
    generic: "bg-panel-3 text-muted",
  }[identity.tone];
  return (
    <span className={`inline-flex max-w-full items-center rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium leading-none ${className}`}>
      {children ?? identity.label}
    </span>
  );
}

export function ProviderPill({ model }: { model: string }) {
  return <GatewayPill identity={modelIdentity(model)} />;
}

export function ComparisonBadge({ comparison }: { comparison: GatewayComparison }) {
  const toneClass = {
    good: "text-success",
    warn: "text-warning",
    muted: "text-muted",
    primary: "text-primary",
  }[comparison.tone];
  const Icon = comparison.direction === "down" ? TrendingDown : comparison.direction === "up" ? TrendingUp : null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${toneClass}`}>
      {Icon ? <Icon className="size-3.5" /> : null}
      {comparison.label}
    </span>
  );
}

export function GatewayMetricCard({
  icon,
  tone,
  label,
  value,
  sub,
  accent,
  meter,
  comparison,
}: {
  icon: React.ReactNode;
  tone: "primary" | "teal" | "violet";
  label: string;
  value: string;
  sub: string;
  accent: string;
  meter?: number;
  comparison: GatewayComparison;
}) {
  const toneClass = {
    primary: "bg-primary-soft text-primary border-primary-line",
    teal: "bg-teal-soft text-teal border-transparent",
    violet: "bg-violet-soft text-violet border-transparent",
  }[tone];
  const meterClass = tone === "teal" ? "bg-teal" : tone === "violet" ? "bg-violet" : "bg-primary";
  const meterWidth = `${Math.max(3, Math.min(100, (meter ?? 1) * 100))}%`;
  return (
    <div className="grid min-h-[116px] grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-md border border-line bg-panel p-3.5 shadow-sm transition-colors hover:border-primary-line">
      <span className={`mt-1 grid size-10 place-items-center rounded-full border [&_svg]:size-5 ${toneClass}`}>{icon}</span>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-subtle">{label}</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${toneClass}`}>{accent}</span>
        </div>
        <div className="mt-1 text-2xl font-semibold text-ink-strong tabular-nums">{value}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>{sub}</span>
          <ComparisonBadge comparison={comparison} />
        </div>
      </div>
      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-panel-3">
        <span className={`block h-full rounded-full ${meterClass}`} style={{ width: meterWidth }} />
      </div>
    </div>
  );
}
