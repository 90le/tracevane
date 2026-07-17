export type ChatToolStatus = "running" | "completed" | "error";
export type ChatPermissionStatus =
  "pending" | "allowed" | "denied" | "timed-out" | "failed";
export type ChatRunProjectionLifecycle =
  "queued" | "running" | "completed" | "aborted" | "error";

export type ChatProcessBlockKind = "thinking" | "reasoning";

export type ChatAttachmentKind = "image" | "video" | "file";
export type ChatResourceSource =
  | "user_upload"
  | "tool_artifact"
  | "structured_message"
  | "tracevane_delivery"
  | "assistant_markdown"
  | "tracevane_resource";
export type ChatResourceStatus = "ready" | "missing";
export type ChatResourcePlacement = "append";
export type ChatInlineResourceDisplay =
  | "inline-image"
  | "inline-video"
  | "inline-chip"
  | "break-image"
  | "break-video"
  | "break-chip";

export interface ChatResourceItem {
  id: string;
  kind: ChatAttachmentKind;
  url: string;
  downloadUrl: string;
  resourceRef: string | null;
  fileName: string;
  mimeType: string | null;
  relativePath?: string;
  originalPath?: string;
  source: ChatResourceSource;
  status: ChatResourceStatus;
  placement: ChatResourcePlacement;
  toolCallId?: string | null;
}

export interface ChatToolArtifactItem extends ChatResourceItem {}

export interface ChatToolCard {
  toolCallId: string;
  runId: string | null;
  name: string;
  status: ChatToolStatus;
  startedAt: string | null;
  updatedAt: string | null;
  argsPreview: string | null;
  resultPreview: string | null;
  isError: boolean;
  artifacts?: ChatToolArtifactItem[];
}

export interface ChatPermissionRequestCard {
  requestId: string;
  runId: string | null;
  toolName: string;
  status: ChatPermissionStatus;
  requestedAt: string;
  updatedAt: string | null;
  inputPreview: string | null;
  message: string | null;
}

export interface ChatMessageToolCallItem {
  toolCallId: string;
  runId: string | null;
  name: string;
  status: ChatToolStatus;
  startedAt: string | null;
  updatedAt: string | null;
  argsPreview: string | null;
  resultPreview: string | null;
  isError: boolean;
  artifacts?: ChatToolArtifactItem[];
}

export interface ChatProcessBlock {
  id: string;
  kind: ChatProcessBlockKind;
  text: string;
}

export interface ChatRunOverlay {
  runId: string;
  startedAt: string;
  updatedAt: string;
  lifecycle: ChatRunProjectionLifecycle;
  previewText: string;
  toolCalls: ChatMessageToolCallItem[];
  finalMessageId: string | null;
  finalCreatedAt: string | null;
  firstAssistantSeenAt: string | null;
  firstToolStartedAt: string | null;
  sequence: number;
}

export type ChatSideResultKind = "btw";

export interface ChatSideResult {
  kind: ChatSideResultKind;
  question: string;
  text: string;
  isError: boolean;
}

