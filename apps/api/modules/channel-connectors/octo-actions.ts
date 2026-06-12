import type {
  ChannelConnectorOctoManagementAction,
} from "./command-router.js";

export const STUDIO_OCTO_ACTIONS_BLOCK = "studio-octo-actions";

export interface ChannelConnectorOctoActionRequest {
  tool: "octo_management";
  action: ChannelConnectorOctoManagementAction;
  params: Record<string, unknown>;
}

export interface ChannelConnectorExtractedOctoActions {
  replyText: string;
  actions: ChannelConnectorOctoActionRequest[];
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

function normalizeAction(value: unknown): ChannelConnectorOctoManagementAction | null {
  const normalized = normalizeString(value).toLowerCase().replace(/[_\s]+/g, "-");
  const aliases: Record<string, ChannelConnectorOctoManagementAction> = {
    groups: "list-groups",
    "list-group": "list-groups",
    info: "group-info",
    group: "group-info",
    "get-group": "group-info",
    "group-information": "group-info",
    members: "group-members",
    "list-members": "group-members",
    "list-group-members": "group-members",
    "space-members": "search-members",
    "search-space": "search-members",
    "search-space-members": "search-members",
    "list-space-members": "search-members",
    search: "search-members",
    creategroup: "create-group",
    "create-group-chat": "create-group",
    "update-group-info": "update-group",
    "add-group-members": "add-members",
    "remove-group-members": "remove-members",
    "group-md": "group-md-read",
    "read-group-md": "group-md-read",
    "set-group-md": "group-md-update",
    "update-group-md": "group-md-update",
    "thread-md": "thread-md-read",
    "read-thread-md": "thread-md-read",
    "set-thread-md": "thread-md-update",
    "update-thread-md": "thread-md-update",
    threads: "list-threads",
    thread: "thread-info",
    "get-thread": "thread-info",
    "list-thread-members": "thread-members",
    "voice-context": "voice-context-read",
    "read-voice-context": "voice-context-read",
    "set-voice-context": "voice-context-update",
    "update-voice-context": "voice-context-update",
    "delete-voice": "voice-context-delete",
    "delete-voice-context": "voice-context-delete",
    "sync-messages": "history",
    "message-history": "history",
    "messages-sync": "history",
    "sync-history": "history",
    download: "file-download-url",
    "download-url": "file-download-url",
    "file-download": "file-download-url",
    "file-url": "file-download-url",
    "get-file-download-url": "file-download-url",
    edit: "message-edit",
    "edit-message": "message-edit",
  };
  const action = aliases[normalized] || normalized;
  const supported = new Set<ChannelConnectorOctoManagementAction>([
    "list-groups",
    "group-info",
    "group-members",
    "search-members",
    "create-group",
    "update-group",
    "add-members",
    "remove-members",
    "list-threads",
    "thread-info",
    "thread-members",
    "create-thread",
    "delete-thread",
    "join-thread",
    "leave-thread",
    "group-md-read",
    "group-md-update",
    "thread-md-read",
    "thread-md-update",
    "voice-context-read",
    "voice-context-update",
    "voice-context-delete",
    "history",
    "file-download-url",
    "message-edit",
  ]);
  return supported.has(action as ChannelConnectorOctoManagementAction)
    ? action as ChannelConnectorOctoManagementAction
    : null;
}

function normalizeExplicitToolName(value: unknown): "octo_management" | null {
  const normalized = normalizeString(value).toLowerCase().replace(/[-\s]+/g, "_");
  return normalized === "octo_management" || normalized === "octo" || normalized === "octo_bot_api"
    ? "octo_management"
    : null;
}

function octoActionFromValue(value: unknown): ChannelConnectorOctoActionRequest | null {
  const record = recordFrom(value);
  const explicitToolValue = record.tool ?? record.skill ?? record.octoTool ?? record.octo_tool;
  const tool = explicitToolValue !== undefined
    ? normalizeExplicitToolName(explicitToolValue)
    : "octo_management";
  const action = normalizeAction(record.action);
  if (!tool || !action) return null;
  const hasExplicitParams = record.params !== undefined || record.arguments !== undefined || record.args !== undefined;
  const paramsSource = hasExplicitParams
    ? recordFrom(record.params ?? record.arguments ?? record.args)
    : record;
  if (hasExplicitParams) return { tool, action, params: paramsSource };
  const {
    tool: _tool,
    skill: _skill,
    octoTool: _octoTool,
    octo_tool: _octo_tool,
    action: _action,
    params: _params,
    arguments: _arguments,
    args: _args,
    ...params
  } = paramsSource;
  return { tool, action, params };
}

export function extractChannelConnectorOctoActions(replyText: string | null | undefined): ChannelConnectorExtractedOctoActions {
  const source = normalizeString(replyText);
  if (!source) return { replyText: "", actions: [], errors: [] };
  const actions: ChannelConnectorOctoActionRequest[] = [];
  const errors: string[] = [];
  const pattern = new RegExp(
    "```[ \\t]*" + STUDIO_OCTO_ACTIONS_BLOCK + "[^\\r\\n]*\\r?\\n([\\s\\S]*?)```",
    "gi",
  );
  const stripped = source.replace(pattern, (_match, rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson.trim()) as unknown;
      const parsedActions = arrayFromManifest(parsed)
        .map(octoActionFromValue)
        .filter((item): item is ChannelConnectorOctoActionRequest => item !== null);
      if (!parsedActions.length) {
        errors.push("studio-octo-actions block did not include any valid Octo action entries.");
      } else {
        actions.push(...parsedActions);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "studio-octo-actions block is not valid JSON.");
    }
    return "";
  }).trim();
  return {
    replyText: stripped,
    actions,
    errors,
  };
}
