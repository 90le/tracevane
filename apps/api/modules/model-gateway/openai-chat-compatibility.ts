type JsonRecord = Record<string, unknown>;

export interface OpenAIChatCompatibilityOptions {
  allowMetadata?: boolean;
}

export interface OpenAIChatCompatibilityResult {
  bodyText: string | undefined;
  removedFields: string[];
}

const STRICT_CHAT_INCOMPATIBLE_FIELDS = ["metadata"] as const;

export function sanitizeOpenAIChatUpstreamBody(
  bodyText: string | undefined,
  options: OpenAIChatCompatibilityOptions = {},
): OpenAIChatCompatibilityResult {
  if (!bodyText) return { bodyText, removedFields: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { bodyText, removedFields: [] };
  }
  if (!isRecord(parsed)) return { bodyText, removedFields: [] };

  const sanitized: JsonRecord = { ...parsed };
  const removedFields: string[] = [];
  for (const field of STRICT_CHAT_INCOMPATIBLE_FIELDS) {
    if (field === "metadata" && options.allowMetadata) continue;
    if (Object.prototype.hasOwnProperty.call(sanitized, field)) {
      delete sanitized[field];
      removedFields.push(field);
    }
  }

  return {
    bodyText: removedFields.length ? JSON.stringify(sanitized) : bodyText,
    removedFields,
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
