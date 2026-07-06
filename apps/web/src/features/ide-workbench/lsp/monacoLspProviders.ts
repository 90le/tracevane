import type * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";

import { editorModelUriString } from "@/shared/editor-core";
import { appendWorkbenchOutput } from "../output/outputStore";
import { requestLspCompletion, requestLspDefinition, requestLspHover } from "./lspInteractionClient";

let registered = false;

export function registerTracevaneLspMonacoProviders(monacoApi: typeof monaco): void {
  if (registered || typeof window === "undefined") return;
  registered = true;
  appendWorkbenchOutput({
    channel: { id: "lsp", label: "LSP", kind: "lsp" },
    level: "info",
    text: "JSON LSP interaction providers registered: hover, completion, definition",
  });

  monacoApi.languages.registerHoverProvider("json", {
    provideHover: async (model, position) => {
      const ref = editorRefFromModelUri(model.uri.toString());
      if (!ref) return null;
      const response = await requestLspHover({
        type: "hover",
        rootId: ref.rootId,
        path: ref.path,
        language: "json",
        content: model.getValue(),
        line: position.lineNumber,
        column: position.column,
      });
      if (!response.contents.length) return null;
      return {
        contents: response.contents.map((value) => ({ value })),
        range: response.range
          ? new monacoApi.Range(response.range.startLine, response.range.startColumn, response.range.endLine, response.range.endColumn)
          : undefined,
      };
    },
  });

  monacoApi.languages.registerCompletionItemProvider("json", {
    triggerCharacters: ['"', ":", " ", "{"],
    provideCompletionItems: async (model, position) => {
      const ref = editorRefFromModelUri(model.uri.toString());
      if (!ref) return { suggestions: [] };
      const response = await requestLspCompletion({
        type: "completion",
        rootId: ref.rootId,
        path: ref.path,
        language: "json",
        content: model.getValue(),
        line: position.lineNumber,
        column: position.column,
      });
      const word = model.getWordUntilPosition(position);
      const range = new monacoApi.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      return {
        suggestions: response.items.map((item) => ({
          label: item.label,
          detail: item.detail ?? undefined,
          documentation: item.documentation ?? undefined,
          insertText: item.insertText,
          insertTextRules: item.kind === "snippet" ? monacoApi.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          kind: item.kind === "property"
            ? monacoApi.languages.CompletionItemKind.Property
            : item.kind === "snippet"
              ? monacoApi.languages.CompletionItemKind.Snippet
              : monacoApi.languages.CompletionItemKind.Value,
          range,
          sortText: `tracevane-${item.label}`,
        })),
      };
    },
  });

  monacoApi.languages.registerDefinitionProvider("json", {
    provideDefinition: async (model, position) => {
      const ref = editorRefFromModelUri(model.uri.toString());
      if (!ref) return [];
      const response = await requestLspDefinition({
        type: "definition",
        rootId: ref.rootId,
        path: ref.path,
        language: "json",
        content: model.getValue(),
        line: position.lineNumber,
        column: position.column,
      });
      return response.locations.map((location) => ({
        uri: monacoApi.Uri.parse(editorModelUriString({ rootId: location.rootId, path: location.path })),
        range: new monacoApi.Range(
          location.startLine,
          location.startColumn,
          location.endLine ?? location.startLine,
          location.endColumn ?? location.startColumn + 1,
        ),
      }));
    },
  });
}

function editorRefFromModelUri(uri: string): { rootId: string; path: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return null;
  }
  if (parsed.protocol !== "file:") return null;
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts[0] !== "workspace" || !parts[1]) return null;
  return {
    rootId: decodeURIComponent(parts[1]),
    path: parts.slice(2).map((part) => decodeURIComponent(part)).join("/"),
  };
}
