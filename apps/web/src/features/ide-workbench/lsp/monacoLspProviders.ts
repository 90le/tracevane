import type * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";

import type { LspCompletionItem, LspWorkspaceTextEdit } from "../../../../../../types/lsp";

import { editorModelUriString } from "@/shared/editor-core";
import { appendWorkbenchOutput } from "../output/outputStore";
import { requestLspCodeActions, requestLspCompletion, requestLspDefinition, requestLspFormatting, requestLspHover, requestLspReferences, requestLspRename } from "./lspInteractionClient";

let registered = false;

const TYPESCRIPT_INTERACTION_LANGUAGES = ["typescript", "typescriptreact", "javascript", "javascriptreact"] as const;

export function registerTracevaneLspMonacoProviders(monacoApi: typeof monaco): void {
  if (registered || typeof window === "undefined") return;
  registered = true;
  appendWorkbenchOutput({
    channel: { id: "lsp", label: "LSP", kind: "lsp" },
    level: "info",
    text: "LSP interaction providers registered: JSON hover/completion/definition/references; TypeScript/JavaScript hover/definition/completion/references",
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

  monacoApi.languages.registerReferenceProvider("json", {
    provideReferences: async (model, position) => {
      const ref = editorRefFromModelUri(model.uri.toString());
      if (!ref) return [];
      const response = await requestLspReferences({
        type: "references",
        rootId: ref.rootId,
        path: ref.path,
        language: "json",
        content: model.getValue(),
        line: position.lineNumber,
        column: position.column,
      });
      return response.locations.map((location) => lspLocationToMonaco(monacoApi, location));
    },
  });


  monacoApi.languages.registerDocumentFormattingEditProvider("json", {
    provideDocumentFormattingEdits: async (model, options) => {
      const ref = editorRefFromModelUri(model.uri.toString());
      if (!ref) return [];
      const response = await requestLspFormatting({
        type: "formatting",
        rootId: ref.rootId,
        path: ref.path,
        language: "json",
        content: model.getValue(),
        tabSize: options.tabSize,
        insertSpaces: options.insertSpaces,
      });
      return response.textEdits.map((edit) => workspaceTextEditToMonaco(monacoApi, edit));
    },
  });

  monacoApi.languages.registerCodeActionProvider("json", {
    provideCodeActions: async (model, range) => {
      const ref = editorRefFromModelUri(model.uri.toString());
      if (!ref) return { actions: [], dispose: () => undefined };
      const response = await requestLspCodeActions({
        type: "codeAction",
        rootId: ref.rootId,
        path: ref.path,
        language: "json",
        content: model.getValue(),
        range: {
          start: { line: Math.max(0, range.startLineNumber - 1), character: Math.max(0, range.startColumn - 1) },
          end: { line: Math.max(0, range.endLineNumber - 1), character: Math.max(0, range.endColumn - 1) },
        },
      });
      return {
        actions: response.actions
          .filter((action) => !action.disabledReason && action.workspaceEdit?.changes)
          .map((action) => ({
            title: action.title,
            kind: action.kind || "quickfix",
            isPreferred: Boolean(action.isPreferred),
            edit: { edits: workspaceEditToMonacoResourceEdits(monacoApi, model.uri, action.workspaceEdit?.changes) },
          })),
        dispose: () => undefined,
      };
    },
  });

  for (const language of TYPESCRIPT_INTERACTION_LANGUAGES) {
    monacoApi.languages.registerHoverProvider(language, {
      provideHover: async (model, position) => {
        const ref = editorRefFromModelUri(model.uri.toString());
        if (!ref) return null;
        const response = await requestLspHover({
          type: "hover",
          rootId: ref.rootId,
          path: ref.path,
          language,
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


    monacoApi.languages.registerCompletionItemProvider(language, {
      triggerCharacters: [".", "'", '"', "<"],
      provideCompletionItems: async (model, position) => {
        const ref = editorRefFromModelUri(model.uri.toString());
        if (!ref) return { suggestions: [] };
        const response = await requestLspCompletion({
          type: "completion",
          rootId: ref.rootId,
          path: ref.path,
          language,
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
            kind: toMonacoCompletionKind(monacoApi, item),
            range,
            sortText: item.sortText || `tracevane-${item.label}`,
          })),
        };
      },
    });

    monacoApi.languages.registerDefinitionProvider(language, {
      provideDefinition: async (model, position) => {
        const ref = editorRefFromModelUri(model.uri.toString());
        if (!ref) return [];
        const response = await requestLspDefinition({
          type: "definition",
          rootId: ref.rootId,
          path: ref.path,
          language,
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

    monacoApi.languages.registerReferenceProvider(language, {
      provideReferences: async (model, position) => {
        const ref = editorRefFromModelUri(model.uri.toString());
        if (!ref) return [];
        const response = await requestLspReferences({
          type: "references",
          rootId: ref.rootId,
          path: ref.path,
          language,
          content: model.getValue(),
          line: position.lineNumber,
          column: position.column,
        });
        return response.locations.map((location) => lspLocationToMonaco(monacoApi, location));
      },
    });

    monacoApi.languages.registerRenameProvider(language, {
      provideRenameEdits: async (model, position, newName) => {
        const ref = editorRefFromModelUri(model.uri.toString());
        if (!ref) return { edits: [], rejectReason: "Tracevane workspace model URI is missing" };
        const response = await requestLspRename({
          type: "rename",
          rootId: ref.rootId,
          path: ref.path,
          language,
          content: model.getValue(),
          line: position.lineNumber,
          column: position.column,
          newName,
        });
        if (!response.workspaceEdit) {
          return { edits: [], rejectReason: response.rejected?.[0]?.reason || "Symbol cannot be renamed" };
        }
        return { edits: workspaceEditToMonacoResourceEdits(monacoApi, model.uri, response.workspaceEdit.changes) };
      },
    });

    monacoApi.languages.registerDocumentFormattingEditProvider(language, {
      provideDocumentFormattingEdits: async (model, options) => {
        const ref = editorRefFromModelUri(model.uri.toString());
        if (!ref) return [];
        const response = await requestLspFormatting({
          type: "formatting",
          rootId: ref.rootId,
          path: ref.path,
          language,
          content: model.getValue(),
          tabSize: options.tabSize,
          insertSpaces: options.insertSpaces,
        });
        return response.textEdits.map((edit) => workspaceTextEditToMonaco(monacoApi, edit));
      },
    });

    monacoApi.languages.registerCodeActionProvider(language, {
      provideCodeActions: async (model, range) => {
        const ref = editorRefFromModelUri(model.uri.toString());
        if (!ref) return { actions: [], dispose: () => undefined };
        const response = await requestLspCodeActions({
          type: "codeAction",
          rootId: ref.rootId,
          path: ref.path,
          language,
          content: model.getValue(),
          range: {
            start: { line: Math.max(0, range.startLineNumber - 1), character: Math.max(0, range.startColumn - 1) },
            end: { line: Math.max(0, range.endLineNumber - 1), character: Math.max(0, range.endColumn - 1) },
          },
        });
        return {
          actions: response.actions
            .filter((action) => !action.disabledReason && action.workspaceEdit?.changes)
            .map((action) => ({
              title: action.title,
              kind: action.kind || "quickfix",
              isPreferred: Boolean(action.isPreferred),
              edit: { edits: workspaceEditToMonacoResourceEdits(monacoApi, model.uri, action.workspaceEdit?.changes) },
            })),
          dispose: () => undefined,
        };
      },
    });
  }
}

function lspLocationToMonaco(
  monacoApi: typeof monaco,
  location: { rootId: string; path: string; startLine: number; startColumn: number; endLine?: number; endColumn?: number },
): monaco.languages.Location {
  return {
    uri: monacoApi.Uri.parse(editorModelUriString({ rootId: location.rootId, path: location.path })),
    range: new monacoApi.Range(
      location.startLine,
      location.startColumn,
      location.endLine ?? location.startLine,
      location.endColumn ?? location.startColumn + 1,
    ),
  };
}


function toMonacoCompletionKind(monacoApi: typeof monaco, item: LspCompletionItem): monaco.languages.CompletionItemKind {
  switch (item.kind) {
    case "property":
      return monacoApi.languages.CompletionItemKind.Property;
    case "snippet":
      return monacoApi.languages.CompletionItemKind.Snippet;
    case "function":
      return monacoApi.languages.CompletionItemKind.Function;
    case "method":
      return monacoApi.languages.CompletionItemKind.Method;
    case "variable":
      return monacoApi.languages.CompletionItemKind.Variable;
    case "class":
      return monacoApi.languages.CompletionItemKind.Class;
    case "interface":
      return monacoApi.languages.CompletionItemKind.Interface;
    case "module":
      return monacoApi.languages.CompletionItemKind.Module;
    case "keyword":
      return monacoApi.languages.CompletionItemKind.Keyword;
    case "field":
      return monacoApi.languages.CompletionItemKind.Field;
    default:
      return monacoApi.languages.CompletionItemKind.Value;
  }
}

function workspaceEditToMonacoResourceEdits(
  monacoApi: typeof monaco,
  fallbackUri: monaco.Uri,
  changes: Record<string, LspWorkspaceTextEdit[]> | undefined | null,
): monaco.languages.IWorkspaceTextEdit[] {
  if (!changes) return [];
  const edits: monaco.languages.IWorkspaceTextEdit[] = [];
  for (const list of Object.values(changes)) {
    for (const edit of list) {
      edits.push({
        resource: fallbackUri,
        textEdit: workspaceTextEditToMonaco(monacoApi, edit),
        versionId: undefined,
      });
    }
  }
  return edits;
}

function workspaceTextEditToMonaco(monacoApi: typeof monaco, edit: LspWorkspaceTextEdit): monaco.languages.TextEdit {
  return {
    range: new monacoApi.Range(
      edit.range.start.line + 1,
      edit.range.start.character + 1,
      edit.range.end.line + 1,
      edit.range.end.character + 1,
    ),
    text: edit.newText,
  };
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
