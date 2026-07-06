import type { LspDiagnosticsRequest, LspDiagnosticsResponse } from "../../../../../../types/lsp";

export async function requestLspDiagnostics(
  request: LspDiagnosticsRequest,
  options: { signal?: AbortSignal } = {},
): Promise<LspDiagnosticsResponse> {
  const response = await fetch("/api/lsp/diagnostics", {
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
    const message = typeof data?.message === "string" ? data.message : `LSP diagnostics failed: ${response.status}`;
    throw new Error(message);
  }
  return data as LspDiagnosticsResponse;
}
