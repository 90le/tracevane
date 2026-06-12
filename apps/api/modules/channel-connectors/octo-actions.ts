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

const SUPPORTED_ACTIONS = new Set<ChannelConnectorOctoManagementAction>([
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

function stripToolPrefix(value: string): string {
  return value.replace(/^(?:octo[_-]?management|octo|octo[_-]?bot[_-]?api)[.:/]+/i, "");
}

function normalizeActionToken(value: unknown): string {
  return stripToolPrefix(normalizeString(value))
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[_.\s]+/g, "-");
}

function normalizeAction(value: unknown): ChannelConnectorOctoManagementAction | null {
  const normalized = normalizeActionToken(value);
  const aliases: Record<string, ChannelConnectorOctoManagementAction> = {
    "fetch-bot-groups": "list-groups",
    fetchbotgroups: "list-groups",
    groups: "list-groups",
    "get-groups": "list-groups",
    getgroups: "list-groups",
    "list-group": "list-groups",
    listgroups: "list-groups",
    info: "group-info",
    group: "group-info",
    getgroup: "group-info",
    "get-group": "group-info",
    "get-group-info": "group-info",
    getgroupinfo: "group-info",
    "group-information": "group-info",
    members: "group-members",
    "get-group-members": "group-members",
    getgroupmembers: "group-members",
    "list-members": "group-members",
    "list-group-members": "group-members",
    listgroupmembers: "group-members",
    searchspacemembers: "search-members",
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
    "get-group-md": "group-md-read",
    getgroupmd: "group-md-read",
    "group-md": "group-md-read",
    "read-group-md": "group-md-read",
    "set-group-md": "group-md-update",
    updategroupmd: "group-md-update",
    "update-group-md": "group-md-update",
    "get-thread-md": "thread-md-read",
    getthreadmd: "thread-md-read",
    "thread-md": "thread-md-read",
    "read-thread-md": "thread-md-read",
    "set-thread-md": "thread-md-update",
    updatethreadmd: "thread-md-update",
    "update-thread-md": "thread-md-update",
    "list-threads": "list-threads",
    listthreads: "list-threads",
    threads: "list-threads",
    thread: "thread-info",
    getthread: "thread-info",
    "get-thread": "thread-info",
    threaddetails: "thread-info",
    listthreadmembers: "thread-members",
    "list-thread-members": "thread-members",
    "get-thread-members": "thread-members",
    getthreadmembers: "thread-members",
    "create-thread": "create-thread",
    createthread: "create-thread",
    "delete-thread": "delete-thread",
    deletethread: "delete-thread",
    "join-thread": "join-thread",
    jointhread: "join-thread",
    "leave-thread": "leave-thread",
    leavethread: "leave-thread",
    "get-voice-context": "voice-context-read",
    getvoicecontext: "voice-context-read",
    "voice-context": "voice-context-read",
    "read-voice-context": "voice-context-read",
    "set-voice-context": "voice-context-update",
    updatevoicecontext: "voice-context-update",
    "update-voice-context": "voice-context-update",
    "delete-voice": "voice-context-delete",
    deletevoicecontext: "voice-context-delete",
    "delete-voice-context": "voice-context-delete",
    "get-channel-messages": "history",
    getchannelmessages: "history",
    "sync-messages": "history",
    "message-history": "history",
    "messages-sync": "history",
    "sync-history": "history",
    download: "file-download-url",
    "download-url": "file-download-url",
    "file-download": "file-download-url",
    "file-url": "file-download-url",
    "get-file-download-url": "file-download-url",
    getfiledownloadurl: "file-download-url",
    edit: "message-edit",
    "edit-message": "message-edit",
    "edit-message-content": "message-edit",
    "edit-message-text": "message-edit",
    editmessage: "message-edit",
  };
  const action = aliases[normalized] || normalized;
  return SUPPORTED_ACTIONS.has(action as ChannelConnectorOctoManagementAction)
    ? action as ChannelConnectorOctoManagementAction
    : null;
}

function normalizeExplicitToolName(value: unknown): {
  tool: "octo_management";
  action: ChannelConnectorOctoManagementAction | null;
} | null {
  const raw = normalizeString(value);
  const match = raw.match(/^(octo[_-]?management|octo|octo[_-]?bot[_-]?api)(?:[.:/](.+))?$/i);
  if (!match) return null;
  const action = match[2] ? normalizeAction(match[2]) : null;
  return { tool: "octo_management", action };
}

function firstSupportedAction(...values: unknown[]): ChannelConnectorOctoManagementAction | null {
  for (const value of values) {
    const action = normalizeAction(value);
    if (action) return action;
  }
  return null;
}

function keyedActionFromRecord(record: Record<string, unknown>): {
  action: ChannelConnectorOctoManagementAction;
  params: Record<string, unknown>;
} | null {
  for (const [key, value] of Object.entries(record)) {
    const action = normalizeAction(key);
    if (!action) continue;
    return {
      action,
      params: recordFrom(value),
    };
  }
  return null;
}

function removeManifestFields(record: Record<string, unknown>): Record<string, unknown> {
  const {
    tool: _tool,
    skill: _skill,
    octoTool: _octoTool,
    octo_tool: _octo_tool,
    action: _action,
    name: _name,
    operation: _operation,
    method: _method,
    command: _command,
    intent: _intent,
    params: _params,
    arguments: _arguments,
    args: _args,
    ...params
  } = record;
  const nameAction = normalizeAction(_name);
  if (nameAction) return params;
  return _name === undefined ? params : { ...params, name: _name };
}

function paramRecord(record: Record<string, unknown>, hasExplicitParams: boolean): Record<string, unknown> {
  if (hasExplicitParams) return recordFrom(record.params ?? record.arguments ?? record.args);
  return removeManifestFields(record);
}

function normalizeToolFromRecord(record: Record<string, unknown>): {
  tool: "octo_management";
  action: ChannelConnectorOctoManagementAction | null;
} | null {
  const explicitToolValue = record.tool ?? record.skill ?? record.octoTool ?? record.octo_tool;
  return explicitToolValue !== undefined
    ? normalizeExplicitToolName(explicitToolValue)
    : null;
}

function octoActionFromValue(value: unknown): ChannelConnectorOctoActionRequest | null {
  const record = recordFrom(value);
  const explicitTool = normalizeToolFromRecord(record);
  const keyedAction = keyedActionFromRecord(record);
  const tool = explicitTool?.tool ?? "octo_management";
  const action = firstSupportedAction(
    record.action,
    explicitTool?.action,
    record.operation,
    record.method,
    record.command,
    record.intent,
    record.name,
    keyedAction?.action,
  );
  if (!tool || !action) return null;
  const hasExplicitParams = record.params !== undefined || record.arguments !== undefined || record.args !== undefined;
  const params = hasExplicitParams
    ? paramRecord(record, true)
    : keyedAction?.action === action
      ? keyedAction.params
      : paramRecord(record, false);
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
