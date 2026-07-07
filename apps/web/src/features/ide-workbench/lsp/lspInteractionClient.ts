import type {
  LspCodeActionRequest,
  LspCodeActionResponse,
  LspCompletionRequest,
  LspCompletionResponse,
  LspDefinitionResponse,
  LspHoverResponse,
  LspFormattingRequest,
  LspFormattingResponse,
  LspPositionRequest,
  LspReferencesResponse,
  LspRenameRequest,
  LspRenameResponse,
  LspSemanticTokensRequest,
  LspSemanticTokensResponse,
  LspWorkspaceEditApplyRequest,
  LspWorkspaceEditApplyResponse,
  LspWorkspaceEditPreviewRequest,
  LspWorkspaceEditPreviewResponse,
} from "../../../../../../types/lsp";

export async function requestLspHover(
  request: LspPositionRequest,
  options: { signal?: AbortSignal } = {},
): Promise<LspHoverResponse> {
  return requestLspFeature<LspHoverResponse>("/api/lsp/hover", request, options);
}

export async function requestLspCompletion(
  request: LspCompletionRequest,
  options: { signal?: AbortSignal } = {},
): Promise<LspCompletionResponse> {
  return requestLspFeature<LspCompletionResponse>("/api/lsp/completion", request, options);
}

export async function requestLspDefinition(
  request: LspPositionRequest,
  options: { signal?: AbortSignal } = {},
): Promise<LspDefinitionResponse> {
  return requestLspFeature<LspDefinitionResponse>("/api/lsp/definition", request, options);
}

export async function requestLspReferences(
  request: LspPositionRequest,
  options: { signal?: AbortSignal } = {},
): Promise<LspReferencesResponse> {
  return requestLspFeature<LspReferencesResponse>("/api/lsp/references", request, options);
}

export async function requestLspSemanticTokens(
  request: LspSemanticTokensRequest,
  options: { signal?: AbortSignal } = {},
): Promise<LspSemanticTokensResponse> {
  return requestLspFeature<LspSemanticTokensResponse>("/api/lsp/semantic-tokens", request, options);
}


export async function requestLspRename(
  request: LspRenameRequest,
  options: { signal?: AbortSignal } = {},
): Promise<LspRenameResponse> {
  return requestLspFeature<LspRenameResponse>("/api/lsp/rename", request, options);
}

export async function requestLspFormatting(
  request: LspFormattingRequest,
  options: { signal?: AbortSignal } = {},
): Promise<LspFormattingResponse> {
  return requestLspFeature<LspFormattingResponse>("/api/lsp/formatting", request, options);
}

export async function requestLspCodeActions(
  request: LspCodeActionRequest,
  options: { signal?: AbortSignal } = {},
): Promise<LspCodeActionResponse> {
  return requestLspFeature<LspCodeActionResponse>("/api/lsp/code-actions", request, options);
}

export async function previewLspWorkspaceEdit(
  request: LspWorkspaceEditPreviewRequest,
  options: { signal?: AbortSignal } = {},
): Promise<LspWorkspaceEditPreviewResponse> {
  return requestLspFeature<LspWorkspaceEditPreviewResponse>("/api/lsp/workspace-edit/preview", request, options);
}

export async function applyLspWorkspaceEdit(
  request: LspWorkspaceEditApplyRequest,
  options: { signal?: AbortSignal } = {},
): Promise<LspWorkspaceEditApplyResponse> {
  return requestLspFeature<LspWorkspaceEditApplyResponse>("/api/lsp/workspace-edit/apply", request, options);
}

async function requestLspFeature<T>(
  endpoint: string,
  request: unknown,
  options: { signal?: AbortSignal },
): Promise<T> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: options.signal,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : `LSP request failed: ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}
