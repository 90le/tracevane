type JsonRecord = Record<string, unknown>;

export function responsesMcpCallToAnthropicToolBlocks(item: JsonRecord): JsonRecord[] {
  if (item.type !== "mcp_call") return [];
  const id = stringOrNull(item.id) || stringOrNull(item.call_id);
  const name = stringOrNull(item.name) || stringOrNull(item.tool_name);
  const serverName = stringOrNull(item.server_label) || stringOrNull(item.server_name);
  if (!id || !name || !serverName) return [];

  const blocks: JsonRecord[] = [{
    type: "mcp_tool_use",
    id,
    name,
    server_name: serverName,
    input: parseMcpToolArguments(item.arguments ?? item.input),
  }];

  const outputValue = item.output ?? item.result ?? item.content;
  if (outputValue !== undefined || item.error !== undefined) {
    blocks.push({
      type: "mcp_tool_result",
      tool_use_id: id,
      is_error: item.error !== undefined && item.error !== null,
      content: mcpToolResultContentToAnthropicContent(item.error ?? outputValue),
    });
  }
  return blocks;
}

export function chatMcpToolBlocksToResponsesItems(blocks: unknown): JsonRecord[] {
  if (!Array.isArray(blocks)) return [];
  const pendingResults = new Map<string, JsonRecord>();
  for (const block of blocks) {
    if (!isRecord(block) || block.type !== "mcp_tool_result") continue;
    const toolUseId = stringOrNull(block.tool_use_id);
    if (toolUseId) pendingResults.set(toolUseId, block);
  }

  return blocks.flatMap((block): JsonRecord[] => {
    if (!isRecord(block) || block.type !== "mcp_tool_use") return [];
    const id = stringOrNull(block.id);
    const name = stringOrNull(block.name);
    const serverLabel = stringOrNull(block.server_name) || stringOrNull(block.server_label);
    if (!id || !name || !serverLabel) return [];

    const result = pendingResults.get(id);
    const item: JsonRecord = {
      type: "mcp_call",
      id,
      name,
      server_label: serverLabel,
      arguments: JSON.stringify(block.input ?? {}),
    };
    if (result) {
      if (result.is_error === true) item.error = mcpResultContentToText(result.content);
      else item.output = mcpResultContentToText(result.content);
    }
    return [item];
  });
}

function parseMcpToolArguments(value: unknown): unknown {
  if (isRecord(value) || Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) || Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mcpToolResultContentToAnthropicContent(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    const blocks = value.filter(isRecord);
    if (blocks.length) return blocks;
  }
  if (isRecord(value) && typeof value.type === "string") return [value];
  return [{ type: "text", text: stringifyCompact(value ?? "") }];
}

function mcpResultContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content.map(contentPartToText).filter(Boolean).join("");
    return text || stringifyCompact(content);
  }
  const text = contentPartToText(content);
  return text || stringifyCompact(content ?? "");
}

function contentPartToText(part: unknown): string {
  if (typeof part === "string") return part;
  if (!isRecord(part)) return "";
  return stringOrNull(part.text)
    || stringOrNull(part.input_text)
    || stringOrNull(part.output_text)
    || stringOrNull(part.refusal)
    || "";
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

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
