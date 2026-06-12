export const STUDIO_FEISHU_ACTIONS_BLOCK = "studio-feishu-actions";

export type ChannelConnectorFeishuActionTool =
  | "feishu_channel"
  | "feishu_app_scopes"
  | "feishu_doc"
  | "feishu_drive"
  | "feishu_perm"
  | "feishu_wiki"
  | "feishu_bitable";

export interface ChannelConnectorFeishuActionRequest {
  tool: ChannelConnectorFeishuActionTool;
  action: string;
  params: Record<string, unknown>;
}

export interface ChannelConnectorExtractedFeishuActions {
  replyText: string;
  actions: ChannelConnectorFeishuActionRequest[];
  errors: string[];
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordFrom(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayFromManifest(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = recordFrom(value);
  if (Array.isArray(record.actions)) return record.actions;
  if (Array.isArray(record.calls)) return record.calls;
  return Object.keys(record).length ? [record] : [];
}

function normalizeToolName(value: unknown): ChannelConnectorFeishuActionTool | null {
  const normalized = normalizeString(value).toLowerCase().replace(/[-\s]+/g, "_");
  if (normalized === "feishu_channel" || normalized === "feishu_im" || normalized === "channel" || normalized === "im") {
    return "feishu_channel";
  }
  if (
    normalized === "feishu_app_scopes" ||
    normalized === "feishu_scopes" ||
    normalized === "app_scopes" ||
    normalized === "scopes" ||
    normalized === "scope"
  ) {
    return "feishu_app_scopes";
  }
  if (normalized === "feishu_doc" || normalized === "feishu_document" || normalized === "doc" || normalized === "docx") {
    return "feishu_doc";
  }
  if (normalized === "feishu_drive" || normalized === "drive") return "feishu_drive";
  if (normalized === "feishu_perm" || normalized === "feishu_permission" || normalized === "permission" || normalized === "perm") {
    return "feishu_perm";
  }
  if (normalized === "feishu_wiki" || normalized === "wiki") return "feishu_wiki";
  if (normalized === "feishu_bitable" || normalized === "bitable" || normalized === "base") return "feishu_bitable";
  return null;
}

function feishuActionFromValue(value: unknown): ChannelConnectorFeishuActionRequest | null {
  const record = recordFrom(value);
  const tool = normalizeToolName(record.tool || record.skill || record.name || record.feishuTool || record.feishu_tool);
  const action = normalizeString(record.action);
  if (!tool || !action) return null;
  const hasExplicitParams = record.params !== undefined || record.arguments !== undefined || record.args !== undefined;
  const paramsSource = hasExplicitParams
    ? recordFrom(record.params ?? record.arguments ?? record.args)
    : record;
  if (hasExplicitParams) return { tool, action, params: paramsSource };
  const { tool: _tool, skill: _skill, name: _name, feishuTool: _feishuTool, feishu_tool: _feishu_tool, action: _action, params: _params, arguments: _arguments, args: _args, ...params } = paramsSource;
  return { tool, action, params };
}

export function extractChannelConnectorFeishuActions(replyText: string | null | undefined): ChannelConnectorExtractedFeishuActions {
  const source = normalizeString(replyText);
  if (!source) return { replyText: "", actions: [], errors: [] };
  const actions: ChannelConnectorFeishuActionRequest[] = [];
  const errors: string[] = [];
  const pattern = new RegExp(
    "```[ \\t]*" + STUDIO_FEISHU_ACTIONS_BLOCK + "[^\\r\\n]*\\r?\\n([\\s\\S]*?)```",
    "gi",
  );
  const stripped = source.replace(pattern, (_match, rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson.trim()) as unknown;
      const parsedActions = arrayFromManifest(parsed)
        .map(feishuActionFromValue)
        .filter((item): item is ChannelConnectorFeishuActionRequest => item !== null);
      if (!parsedActions.length) {
        errors.push("studio-feishu-actions block did not include any valid Feishu action entries.");
      } else {
        actions.push(...parsedActions);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "studio-feishu-actions block is not valid JSON.");
    }
    return "";
  }).trim();
  return {
    replyText: stripped,
    actions,
    errors,
  };
}
