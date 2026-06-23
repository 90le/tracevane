export function formatModelTokenBudget(value?: number | null): string | null {
  if (!value) return null;
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    const text = Number.isInteger(millions)
      ? millions.toFixed(0)
      : millions.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return `${text}M`;
  }
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

export function formatModelBudgetPair(options: {
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  contextLabel?: string;
  outputLabel?: string;
}): string | null {
  const context = formatModelTokenBudget(options.contextWindow);
  const output = formatModelTokenBudget(options.maxOutputTokens);
  const parts = [
    context ? `${options.contextLabel ?? "上下文"} ${context}` : null,
    output ? `${options.outputLabel ?? "输出"} ${output}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || null;
}
