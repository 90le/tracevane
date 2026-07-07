type JsonRecord = Record<string, unknown>;

const RESPONSES_BUILTIN_TOOL_OUTPUT_TYPES = new Set([
  "web_search_call",
  "file_search_call",
  "code_interpreter_call",
  "computer_call",
  "image_generation_call",
  "local_shell_call",
  "computer_call_output",
]);

const RESPONSES_BUILTIN_TOOL_SUMMARY_FIELDS = [
  "status",
  "action",
  "query",
  "queries",
  "results",
  "code",
  "outputs",
  "output",
  "result",
  "content",
  "error",
  "image",
  "image_url",
  "call_id",
] as const;

export function isResponsesBuiltinToolOutputItem(item: JsonRecord): boolean {
  const type = stringOrNull(item.type);
  return type ? RESPONSES_BUILTIN_TOOL_OUTPUT_TYPES.has(type) : false;
}

export function responsesBuiltinToolOutputItemToText(item: JsonRecord): string {
  const type = stringOrNull(item.type);
  if (!type || !RESPONSES_BUILTIN_TOOL_OUTPUT_TYPES.has(type)) return "";

  const summary: JsonRecord = {};
  for (const field of RESPONSES_BUILTIN_TOOL_SUMMARY_FIELDS) {
    if (item[field] !== undefined) summary[field] = item[field];
  }
  const body = Object.keys(summary).length ? ` ${stringifyCompact(summary)}` : "";
  return `[OpenAI Responses ${type}${body}]`;
}

function stringifyCompact(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
