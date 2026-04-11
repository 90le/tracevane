import { isStudioManagedWebchatSession } from './studio-delivery.js';
import { isStudioHostManagementCommandText } from './studio-host-management-command.js';
import { isStudioChatHostManagementExecAllowed } from './studio-chat-management-policy.js';

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
  'studio',
  'webchat',
  'local',
  'self',
]);

export const STUDIO_PRIVATE_CHAT_BLOCKED_TOOL_NAMES = [
  'gateway',
  'cron',
  'sessions_list',
  'sessions_history',
  'sessions_send',
  'sessions_spawn',
  'session_status',
] as const;

const STUDIO_PRIVATE_CHAT_BLOCKED_TOOLS = new Set<string>(STUDIO_PRIVATE_CHAT_BLOCKED_TOOL_NAMES);
const STUDIO_PRIVATE_CHAT_BLOCKED_COMMAND_TOOLS = new Set<string>([
  'exec',
  'shell',
  'bash',
]);

export const STUDIO_DELIVERY_PROMPT_GUIDANCE = [
  'In the current Studio WebChat session, assistant Markdown rich replies are the primary path for ordinary rich messages.',
  'Raw HTML rich replies are also supported in the current Studio WebChat session when you need mixed layout, direct HTML blocks, inline SVG, details/summary, or HTML-based resource composition.',
  'For ordinary Studio rich replies, prefer assistant Markdown with explicit Studio resource refs plus a studio: title hint instead of calling a tool.',
  'If Markdown rich replies are awkward for the desired layout, you may answer directly with raw HTML that uses explicit Studio refs in tags such as <img>, <video>, <source>, <a>, or <details>, together with title="studio:break-image" or data-studio-display="break-image" style hints so Studio upgrades them into rich resource cards/chips/media blocks.',
  'When you want HTML to render inline in Studio WebChat, output raw HTML directly in the assistant message and do not wrap it in ```html fences or ordinary code blocks.',
  'Use ```html fences only when you intentionally want a code/preview block rather than inline HTML rendering.',
  'Prefer explicit Studio resource refs: workspace: for files relative to the current agent workspace, uploads: for files under workspace/uploads, and studio-file: for explicit local file refs that Studio will validate.',
  'Primary Markdown examples: [Diagram](workspace:diagram.png "studio:break-image"), [Demo](uploads:demo.mp4 "studio:break-video"), [Package](studio-file:./report.pdf "studio:card"), [Attachment](studio-file:./report.pdf "studio:inline-chip").',
  'Primary raw HTML examples: <img src="workspace:diagram.png" title="studio:break-image" alt="Diagram">, <video src="uploads:demo.mp4" title="studio:break-video"></video>, <a href="studio-file:./report.pdf" title="studio:card">Package</a>, <img src="workspace:thumb.png" data-studio-display="inline-image" alt="Thumb">.',
  'Raw HTML rich replies may also contain nested Markdown-style Studio resource refs inside HTML containers such as <details>...</details>; Studio can upgrade those too when the refs are explicit and valid.',
  'These Markdown studio: hints only work for explicit Studio refs or legacy bare relative fallback refs, and only for the supported displays: studio:inline-image, studio:inline-video, studio:inline-chip, studio:break-image, studio:break-video, studio:break-chip, and studio:card.',
  'The same supported displays also apply to raw HTML via title="studio:..." or data-studio-display="...".',
  'Do not prefer bare ./graph.png style paths when workspace:, uploads:, or studio-file: can express the intent more clearly.',
  'Use studio_delivery only as a fallback when assistant Markdown cannot represent the desired reply reliably.',
  'Fallback studio_delivery cases include complex multi-resource replies that still need strict structured ordering, strongly typed paragraph/resource composition, or resources that only exist as buffer/data/blob content.',
  'Do not use message for current-session delivery in Studio.',
  'Do not call gateway, cron, sessions_list, sessions_history, sessions_send, sessions_spawn, or session_status in Studio WebChat private chat; these host-management tools belong to dedicated Studio pages and can interrupt the Gateway or depend on paired device scopes.',
  'Do not use exec, shell, or bash to run host-management commands such as openclaw/openclaw-gateway, systemctl/service/launchctl, or kill/pkill/killall in Studio WebChat private chat.',
  'Fallback studio_delivery example: version=2, blocks=[{type:"paragraph",segments:[{type:"text",text:"Summary"},{type:"resource",resourceId:"img-1",display:"break-image"},{type:"text",text:"Download below"},{type:"resource",resourceId:"file-1",display:"break-chip"}]},{type:"resource",resourceId:"video-1",display:"card"}], resources=[{id:"img-1",kind:"image",fileName:"diagram.png",filePath:"./diagram.png"},{id:"file-1",kind:"file",fileName:"report.pdf",filePath:"./report.pdf"},{id:"video-1",kind:"video",fileName:"demo.mp4",filePath:"./demo.mp4"}].',
  'Prefer studio_delivery version 2 when you do need the fallback path.',
  'Use inline-image, inline-video, and inline-chip only when you explicitly need sentence-level inline references.',
  'For text-only replies, answer directly as the assistant instead of calling a tool.',
  'Do not output file paths, raw local paths, or MEDIA text in assistant messages.',
].join(' ');

export const STUDIO_DELIVERY_MESSAGE_BLOCK_REASON = [
  'Current Studio WebChat session delivery must not use message for current-session sends.',
  'For text-only replies, answer directly as the assistant.',
  'For files, images, videos, or mixed rich replies, prefer direct assistant Markdown rich replies or raw HTML rich replies first; use studio_delivery only when those reply formats cannot represent the result reliably.',
].join(' ');

export const STUDIO_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON = [
  'Current Studio WebChat private chat must not call gateway, cron, sessions_list, sessions_history, sessions_send, sessions_spawn, or session_status.',
  'Current Studio WebChat private chat must not run host-management shell commands through exec/shell/bash either, including openclaw, systemctl, service, launchctl, kill, pkill, or killall.',
  'These host-management tools belong to dedicated Studio pages and may interrupt the Gateway or fail behind paired-device scope checks.',
  'Answer directly as the assistant unless the operator is intentionally using the relevant Studio management page.',
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

function readCommandText(params: Record<string, unknown>): string {
  return normalizeString(params.command)
    || normalizeString(params.cmd)
    || normalizeString(params.script)
    || normalizeString(params.input);
}

function isStudioWebchatContext(sessionKey?: string | null, channelId?: string | null): boolean {
  return isStudioManagedWebchatSession({
    sessionKey: sessionKey || undefined,
    messageChannel: channelId || undefined,
  });
}

export function shouldBlockStudioCurrentSessionMessageTool(params: {
  toolName: string;
  toolParams: Record<string, unknown>;
  sessionKey?: string | null;
  channelId?: string | null;
}): boolean {
  if (normalizeString(params.toolName).toLowerCase() !== 'message') {
    return false;
  }
  if (!isStudioWebchatContext(params.sessionKey, params.channelId)) {
    return false;
  }

  const action = normalizeAction(params.toolParams.action);
  if (!CURRENT_SESSION_MESSAGE_ACTIONS.has(action)) {
    return false;
  }

  const explicitChannel = normalizeString(params.toolParams.channel).toLowerCase();
  if (explicitChannel && explicitChannel !== 'webchat') {
    return false;
  }

  if (hasExplicitActionTarget(params.toolParams) && !hasExplicitCurrentSessionAlias(params.toolParams)) {
    return false;
  }

  return true;
}

export function shouldBlockStudioPrivateChatManagementTool(params: {
  toolName: string;
  sessionKey?: string | null;
  channelId?: string | null;
  toolParams?: Record<string, unknown>;
}): boolean {
  if (!isStudioWebchatContext(params.sessionKey, params.channelId)) {
    return false;
  }
  const toolName = normalizeString(params.toolName).toLowerCase();
  if (STUDIO_PRIVATE_CHAT_BLOCKED_TOOLS.has(toolName)) {
    return true;
  }
  if (!STUDIO_PRIVATE_CHAT_BLOCKED_COMMAND_TOOLS.has(toolName)) {
    return false;
  }

  const command = readCommandText(params.toolParams || {});
  if (!command) {
    return false;
  }
  if (isStudioChatHostManagementExecAllowed(params.sessionKey)) {
    return false;
  }
  return isStudioHostManagementCommandText(command);
}

export function buildStudioBeforePromptBuildResult(params: {
  sessionKey?: string | null;
  channelId?: string | null;
}): { appendSystemContext: string } | undefined {
  if (!isStudioWebchatContext(params.sessionKey, params.channelId)) {
    return undefined;
  }

  return {
    appendSystemContext: STUDIO_DELIVERY_PROMPT_GUIDANCE,
  };
}

export function buildStudioBeforeToolCallResult(params: {
  toolName: string;
  toolParams: Record<string, unknown>;
  sessionKey?: string | null;
  channelId?: string | null;
}): { block: true; blockReason: string } | undefined {
  if (shouldBlockStudioCurrentSessionMessageTool(params)) {
    return {
      block: true,
      blockReason: STUDIO_DELIVERY_MESSAGE_BLOCK_REASON,
    };
  }

  if (shouldBlockStudioPrivateChatManagementTool(params)) {
    return {
      block: true,
      blockReason: STUDIO_PRIVATE_CHAT_MANAGEMENT_BLOCK_REASON,
    };
  }

  return undefined;
}
