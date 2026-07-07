import * as React from "react";

import type { LspDiagnostic } from "../../../../../../types/lsp";
import { appendWorkbenchOutput } from "../output/outputStore";
import { replaceWorkbenchProblemsForFileSource } from "../problems/problemStore";
import { requestLspDiagnostics } from "./lspDiagnosticsClient";

const LSP_DEBOUNCE_MS = 300;

export interface UseLspDiagnosticsOptions {
  enabled: boolean;
  rootId: string;
  path: string;
  language?: string | null;
  content: string | null;
  version?: number | null;
}

export function useLspDiagnostics({
  enabled,
  rootId,
  path,
  language,
  content,
  version,
}: UseLspDiagnosticsOptions): void {
  const outputOnceRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    if (!enabled || content == null) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void requestLspDiagnostics({
        type: "diagnose",
        id: `ide-${Date.now().toString(36)}`,
        rootId,
        path,
        language,
        version,
        content,
      }, { signal: controller.signal }).then((response) => {
        replaceWorkbenchProblemsForFileSource({
          rootId: response.rootId,
          path: response.path,
          source: "lsp",
          problems: response.diagnostics.map((diagnostic, index) => problemFromDiagnostic(response.rootId, response.path, diagnostic, index)),
        });
        const key = `${response.rootId}:${response.path}:ready`;
        if (!outputOnceRef.current.has(key)) {
          outputOnceRef.current.add(key);
          appendWorkbenchOutput({
            channel: { id: "lsp", label: "LSP", kind: "lsp" },
            level: "info",
            text: `${lspDiagnosticsLabel(response.language, response.provider)} diagnostics active: ${response.path}`,
          });
        }
      }).catch((error) => {
        if (controller.signal.aborted) return;
        appendWorkbenchOutput({
          channel: { id: "lsp", label: "LSP", kind: "lsp" },
          level: "error",
          text: `Diagnostics failed for ${path}: ${error instanceof Error ? error.message : String(error)}`,
        });
      });
    }, LSP_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [content, enabled, language, path, rootId, version]);
}

function lspDiagnosticsLabel(language: string | null | undefined, provider: string | null | undefined): string {
  if (language === "typescript" || language === "typescriptreact") return "TypeScript";
  if (language === "javascript" || language === "javascriptreact") return "JavaScript";
  if (language === "json") return "JSON";
  return provider || "LSP";
}

function problemFromDiagnostic(rootId: string, path: string, diagnostic: LspDiagnostic, index: number) {
  return {
    id: ["lsp", rootId, path, diagnostic.source, diagnostic.code ?? "diagnostic", diagnostic.startLine, diagnostic.startColumn, index].join(":"),
    rootId,
    path,
    source: "lsp" as const,
    severity: diagnostic.severity,
    message: diagnostic.message,
    startLine: diagnostic.startLine,
    startColumn: diagnostic.startColumn,
    endLine: diagnostic.endLine,
    endColumn: diagnostic.endColumn,
    code: diagnostic.code ?? undefined,
  };
}
