import { isTracevaneManagedAgentChatSession } from './tracevane-delivery.js';

const CURRENT_SESSION_MESSAGE_ACTIONS = new Set([
  'send',
  'sendattachment',
  'reply',
  'threadreply',
  'sendwitheffect',
]);

const CURRENT_SESSION_TARGET_ALIASES = new Set([
  'cli',
  'current',
  'current-session',
  'session',
  'tracevane',
  'agent-chat',
  'webchat',
  'local',
  'self',
]);

export const TRACEVANE_PRIVATE_CHAT_BLOCKED_TOOL_NAMES = [
  'gateway',
  'cron',
  'sessions_list',
  'sessions_history',
  'sessions_send',
  'sessions_spawn',
  'session_status',
] as const;

const TRACEVANE_PRIVATE_CHAT_BLOCKED_TOOLS = new Set<string>(TRACEVANE_PRIVATE_CHAT_BLOCKED_TOOL_NAMES);
export const TRACEVANE_DELIVERY_PROMPT_GUIDANCE = [
  'In the current Tracevane Agent Chat session, assistant Markdown rich replies are the primary path for ordinary rich messages.',
  'Raw HTML rich replies are also supported in the current Tracevane Agent Chat session when you need mixed layout, direct HTML blocks, inline SVG, details/summary, or HTML-based resource composition.',
  'For ordinary Tracevane rich replies, prefer assistant Markdown with explicit Tracevane resource refs plus a tracevane: title hint instead of calling a tool.',
  'If Markdown rich replies are awkward for the desired layout, you may answer directly with raw HTML that uses explicit Tracevane refs in tags such as <img>, <video>, <source>, <a>, or <details>, together with title="tracevane:break-image" or data-tracevane-display="break-image" style hints so Tracevane upgrades them into rich resource cards/chips/media blocks.',
  'When you want HTML to render inline in Tracevane Agent Chat, output raw HTML directly in the assistant message and do not wrap it in ```html fences or ordinary code blocks.',
  'Use ```html fences only when you intentionally want a code/preview block rather than inline HTML rendering.',
  'Prefer explicit Tracevane resource refs: workspace: for files relative to the current agent workspace, uploads: for files under workspace/uploads, and tracevane-file: for explicit local file refs that Tracevane will validate.',
  'For newly created workspace or upload files, prefer portable workspace: or uploads: refs; use tracevane-file: mainly for compatibility with explicit local files that cannot be expressed relative to the workspace.',
  'Markdown/HTML Tracevane refs are display hints for the user-facing message; user-uploaded files that the model should read are delivered by Tracevane as structured fileRefs/attachments and must not be replaced by raw path text.',
  'Primary Markdown examples: [Diagram](workspace:diagram.png "tracevane:break-image"), [Demo](uploads:demo.mp4 "tracevane:break-video"), [Package](tracevane-file:./report.pdf "tracevane:card"), [Attachment](tracevane-file:./report.pdf "tracevane:inline-chip").',
  'Primary raw HTML examples: <img src="workspace:diagram.png" title="tracevane:break-image" alt="Diagram">, <video src="uploads:demo.mp4" title="tracevane:break-video"></video>, <a href="tracevane-file:./report.pdf" title="tracevane:card">Package</a>, <img src="workspace:thumb.png" data-tracevane-display="inline-image" alt="Thumb">.',
  'Raw HTML rich replies may also contain nested Markdown-style Tracevane resource refs inside HTML containers such as <details>...</details>; Tracevane can upgrade those too when the refs are explicit and valid.',
  'These Markdown tracevane: hints only work for explicit Tracevane refs or legacy bare relative fallback refs, and only for the supported displays: tracevane:inline-image, tracevane:inline-video, tracevane:inline-chip, tracevane:break-image, tracevane:break-video, tracevane:break-chip, and tracevane:card.',
  'The same supported displays also apply to raw HTML via title="tracevane:..." or data-tracevane-display="...".',
  'Do not prefer bare ./graph.png style paths when workspace:, uploads:, or tracevane-file: can express the intent more clearly.',
  'Use tracevane_delivery only as a fallback when assistant Markdown cannot represent the desired reply reliably.',
  'Fallback tracevane_delivery cases include complex multi-resource replies that still need strict structured ordering, strongly typed paragraph/resource composition, or resources that only exist as buffer/data/blob content.',
  'Do not use message for current-session delivery in Tracevane.',
  'Do not call gateway, cron, sessions_list, sessions_history, sessions_send, sessions_spawn, or session_status in Tracevane Agent Chat private chat; these management tools belong to dedicated Tracevane pages and can interrupt the Gateway or depend on paired device scopes.',
  'Fallback tracevane_delivery example: version=2, blocks=[{type:"paragraph",segments:[{type:"text",text:"Summary"},{type:"resource",resourceId:"img-1",display:"break-image"},{type:"text",text:"Download below"},{type:"resource",resourceId:"file-1",display:"break-chip"}]},{type:"resource",resourceId:"video-1",display:"card"}], resources=[{id:"img-1",kind:"image",fileName:"diagram.png",filePath:"./diagram.png"},{id:"file-1",kind:"file",fileName:"report.pdf",filePath:"./report.pdf"},{id:"video-1",kind:"video",fileName:"demo.mp4",filePath:"./demo.mp4"}].',
  'Prefer tracevane_delivery version 2 when you do need the fallback path.',
  'Use inline-image, inline-video, and inline-chip only when you explicitly need sentence-level inline references.',
  'For text-only replies, answer directly as the assistant instead of calling a tool.',
  'Do not output file paths, raw local paths, or MEDIA text in assistant messages.',
].join(' ');

export const TRACEVANE_DELIVERY_MESSAGE_BLOCK_REASON = [
  'Current Tracevane Agent Chat session delivery must not use message for current-session sends.',
  'For text-only replies, answer directly as the assistant.',
  'For files, images, videos, or mixed rich replies, prefer direct assistant Markdown rich replies or raw HTML rich replies first; use tracevane_delivery only when those reply formats cannot represent the result reliably.',
].join(' ');

export const TRACEVANE_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON = [
  'Current Tracevane Agent Chat private chat must not call gateway, cron, sessions_list, sessions_history, sessions_send, sessions_spawn, or session_status.',
  'These management tools belong to dedicated Tracevane pages and may interrupt the Gateway or fail behind paired-device scope checks.',
  'Answer directly as the assistant unless the operator is intentionally using the relevant Tracevane management page.',
].join(' ');

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAction(value: unknown): string {
  return normalizeString(value).replace(/[^a-z-]/gi, '').toLowerCase();
}

function normalizeTargetAlias(value: unknown): string | null {
  const normalized = normalizeString(value).toLowerCase();
  return CURRENT_SESSION_TARGET_ALIASES.has(normalized) ? normalized : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];
}

function hasExplicitCurrentSessionAlias(params: Record<string, unknown>): boolean {
  if (
    normalizeTargetAlias(params.target)
    || normalizeTargetAlias(params.to)
    || normalizeTargetAlias(params.channelId)
  ) {
    return true;
  }

  const targets = readStringArray(params.targets);
  return targets.length === 1 && Boolean(normalizeTargetAlias(targets[0]));
}

function hasExplicitActionTarget(params: Record<string, unknown>): boolean {
  return Boolean(
    normalizeString(params.target)
    || normalizeString(params.to)
    || normalizeString(params.channelId)
    || readStringArray(params.targets).length,
  );
}

function isTracevaneWebchatContext(sessionKey?: string | null, channelId?: string | null): boolean {
  return isTracevaneManagedAgentChatSession({
    sessionKey: sessionKey || undefined,
    messageChannel: channelId || undefined,
  });
}

export function shouldBlockTracevaneCurrentSessionMessageTool(params: {
  toolName: string;
  toolParams: Record<string, unknown>;
  sessionKey?: string | null;
  channelId?: string | null;
}): boolean {
  if (normalizeString(params.toolName).toLowerCase() !== 'message') {
    return false;
  }
  if (!isTracevaneWebchatContext(params.sessionKey, params.channelId)) {
    return false;
  }

  const action = normalizeAction(params.toolParams.action);
  if (!CURRENT_SESSION_MESSAGE_ACTIONS.has(action)) {
    return false;
  }

  const explicitChannel = normalizeString(params.toolParams.channel).toLowerCase();
  if (explicitChannel && explicitChannel !== 'agent-chat' && explicitChannel !== 'webchat') {
    return false;
  }

  if (hasExplicitActionTarget(params.toolParams) && !hasExplicitCurrentSessionAlias(params.toolParams)) {
    return false;
  }

  return true;
}

export function shouldBlockTracevanePrivateChatManagementTool(params: {
  toolName: string;
  sessionKey?: string | null;
  channelId?: string | null;
  toolParams?: Record<string, unknown>;
}): boolean {
  if (!isTracevaneWebchatContext(params.sessionKey, params.channelId)) {
    return false;
  }
  const toolName = normalizeString(params.toolName).toLowerCase();
  if (TRACEVANE_PRIVATE_CHAT_BLOCKED_TOOLS.has(toolName)) {
    return true;
  }
  return false;
}

export function buildTracevaneBeforePromptBuildResult(params: {
  sessionKey?: string | null;
  channelId?: string | null;
}): { appendSystemContext: string } | undefined {
  if (!isTracevaneWebchatContext(params.sessionKey, params.channelId)) {
    return undefined;
  }

  return {
    appendSystemContext: TRACEVANE_DELIVERY_PROMPT_GUIDANCE,
  };
}

export function buildTracevaneBeforeToolCallResult(params: {
  toolName: string;
  toolParams: Record<string, unknown>;
  sessionKey?: string | null;
  channelId?: string | null;
}): { block: true; blockReason: string } | undefined {
  if (shouldBlockTracevaneCurrentSessionMessageTool(params)) {
    return {
      block: true,
      blockReason: TRACEVANE_DELIVERY_MESSAGE_BLOCK_REASON,
    };
  }

  if (shouldBlockTracevanePrivateChatManagementTool(params)) {
    return {
      block: true,
      blockReason: TRACEVANE_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
    };
  }

  return undefined;
}
