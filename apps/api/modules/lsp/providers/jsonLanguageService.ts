import jsonLanguageServicePackage from "vscode-json-languageservice";
import type {
  ASTNode,
  CompletionItem,
  Diagnostic,
  Hover,
  JSONDocument,
  Range,
  TextDocument as JsonTextDocument,
  TextEdit,
} from "vscode-json-languageservice";

const { CompletionItemKind, DiagnosticSeverity, InsertTextFormat, TextDocument, getLanguageService } = jsonLanguageServicePackage;

import type {
  LspCompletionItem,
  LspDefinitionLocation,
  LspDiagnostic,
  LspReferenceLocation,
  LspWorkspaceTextEdit,
} from "../../../../../types/lsp.js";
import { JSON_PROVIDER_SOURCE } from "./registry.js";

const JSON_LANGUAGE_SERVICE = getLanguageService({
  schemaRequestService: async (uri) => {
    throw new Error(`External JSON schema requests are disabled for Tracevane JSON LSP: ${uri}`);
  },
  workspaceContext: {
    resolveRelativePath(relativePath, resource) {
      try {
        return new URL(relativePath, resource).toString();
      } catch {
        return relativePath;
      }
    },
  },
});

JSON_LANGUAGE_SERVICE.configure({
  validate: true,
  allowComments: false,
  schemas: [],
});

export interface JsonLanguageServiceDocumentInput {
  uri: string;
  content: string;
  version?: number | null;
}

export interface JsonLanguageServiceLocationInput extends JsonLanguageServiceDocumentInput {
  rootId: string;
  path: string;
  line: number;
  column: number;
}

export async function diagnoseJsonWithLanguageService(input: JsonLanguageServiceDocumentInput): Promise<LspDiagnostic[]> {
  if (!input.content.trim()) return [];
  const document = createJsonTextDocument(input);
  const jsonDocument = JSON_LANGUAGE_SERVICE.parseJSONDocument(document);
  const diagnostics = await JSON_LANGUAGE_SERVICE.doValidation(document, jsonDocument, {
    comments: "error",
    trailingCommas: "error",
    schemaValidation: "ignore",
  });
  return diagnostics.map((diagnostic) => jsonDiagnosticToTracevane(diagnostic));
}

export async function hoverJsonWithLanguageService(input: JsonLanguageServiceLocationInput): Promise<{ contents: string[]; range: TracevaneOneBasedRange | null }> {
  const document = createJsonTextDocument(input);
  const jsonDocument = JSON_LANGUAGE_SERVICE.parseJSONDocument(document);
  const hover = await JSON_LANGUAGE_SERVICE.doHover(document, oneBasedToPosition(input.line, input.column), jsonDocument);
  const contents = hoverContentsToStrings(hover);
  if (contents.length > 0) {
    return { contents, range: hover?.range ? rangeToOneBased(hover.range) : null };
  }
  const symbol = jsonSymbolAtPosition(document, jsonDocument, input.line, input.column);
  return {
    contents: symbol
      ? [`JSON ${symbol.kind}: ${symbol.label}`, `Path: ${symbol.path || "$"}`]
      : ["JSON document", "Tracevane JSON LSP provider powered by vscode-json-languageservice"],
    range: symbol?.range ?? null,
  };
}

export async function completeJsonWithLanguageService(input: JsonLanguageServiceLocationInput): Promise<LspCompletionItem[]> {
  const document = createJsonTextDocument(input);
  const jsonDocument = JSON_LANGUAGE_SERVICE.parseJSONDocument(document);
  const completion = await JSON_LANGUAGE_SERVICE.doComplete(document, oneBasedToPosition(input.line, input.column), jsonDocument);
  const items = (completion?.items ?? []).slice(0, 200).map(jsonCompletionItemToTracevane);
  if (!items.some((item) => item.label === "property")) {
    items.unshift({
      label: "property",
      detail: "JSON property",
      documentation: "Insert a JSON property snippet.",
      insertText: '"${1:key}": ${2:value}',
      kind: "snippet",
      sortText: "0000",
    });
  }
  return items;
}

export function defineJsonWithLanguageService(input: JsonLanguageServiceLocationInput): LspDefinitionLocation[] {
  const document = createJsonTextDocument(input);
  const jsonDocument = JSON_LANGUAGE_SERVICE.parseJSONDocument(document);
  const symbol = jsonSymbolAtPosition(document, jsonDocument, input.line, input.column);
  return symbol ? [{ rootId: input.rootId, path: input.path, ...symbol.range }] : [];
}

export function referenceJsonWithLanguageService(input: JsonLanguageServiceLocationInput): LspReferenceLocation[] {
  const document = createJsonTextDocument(input);
  const jsonDocument = JSON_LANGUAGE_SERVICE.parseJSONDocument(document);
  const symbol = jsonSymbolAtPosition(document, jsonDocument, input.line, input.column);
  return symbol ? [{ rootId: input.rootId, path: input.path, ...symbol.range }] : [];
}

export function formatJsonWithLanguageService(input: JsonLanguageServiceDocumentInput, options: { tabSize: number; insertSpaces: boolean }): LspWorkspaceTextEdit[] {
  const document = createJsonTextDocument(input);
  const edits = JSON_LANGUAGE_SERVICE.format(document, undefined, {
    tabSize: options.tabSize,
    insertSpaces: options.insertSpaces,
  });
  return edits.map(jsonTextEditToWorkspaceTextEdit);
}

interface TracevaneOneBasedRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

function createJsonTextDocument(input: JsonLanguageServiceDocumentInput): JsonTextDocument {
  return TextDocument.create(input.uri, "json", input.version ?? 1, input.content);
}

function jsonDiagnosticToTracevane(diagnostic: Diagnostic): LspDiagnostic {
  return {
    severity: jsonDiagnosticSeverityToTracevane(diagnostic.severity),
    message: typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value,
    startLine: diagnostic.range.start.line + 1,
    startColumn: diagnostic.range.start.character + 1,
    endLine: diagnostic.range.end.line + 1,
    endColumn: diagnostic.range.end.character + 1,
    code: "JSON_PARSE",
    source: JSON_PROVIDER_SOURCE,
  };
}

function jsonDiagnosticSeverityToTracevane(severity: number | undefined): LspDiagnostic["severity"] {
  if (severity === DiagnosticSeverity.Warning) return "warning";
  if (severity === DiagnosticSeverity.Information) return "info";
  if (severity === DiagnosticSeverity.Hint) return "hint";
  return "error";
}

function hoverContentsToStrings(hover: Hover | null | undefined): string[] {
  if (!hover?.contents) return [];
  const contents = hover.contents;
  if (typeof contents === "string") return contents ? [contents] : [];
  if (Array.isArray(contents)) {
    return contents
      .map((item) => typeof item === "string" ? item : item.value)
      .filter((item): item is string => Boolean(item));
  }
  if ("value" in contents && typeof contents.value === "string") return [contents.value];
  return [];
}

function jsonCompletionItemToTracevane(item: CompletionItem): LspCompletionItem {
  return {
    label: item.label,
    detail: item.detail ?? null,
    documentation: jsonDocumentationToString(item.documentation),
    insertText: jsonCompletionInsertText(item),
    kind: item.insertTextFormat === InsertTextFormat.Snippet ? "snippet" : jsonCompletionKindToTracevane(item.kind),
    sortText: item.sortText ?? null,
  };
}

function jsonCompletionInsertText(item: CompletionItem): string {
  if (typeof item.insertText === "string") return item.insertText;
  const edit = item.textEdit;
  if (edit && "newText" in edit && typeof edit.newText === "string") return edit.newText;
  return item.label;
}

function jsonDocumentationToString(documentation: CompletionItem["documentation"]): string | null {
  if (!documentation) return null;
  if (typeof documentation === "string") return documentation;
  if ("value" in documentation && typeof documentation.value === "string") return documentation.value;
  return null;
}

function jsonCompletionKindToTracevane(kind: number | undefined): LspCompletionItem["kind"] {
  if (kind === CompletionItemKind.Property) return "property";
  if (kind === CompletionItemKind.Value || kind === CompletionItemKind.Enum) return "value";
  if (kind === CompletionItemKind.Function) return "function";
  if (kind === CompletionItemKind.Method) return "method";
  if (kind === CompletionItemKind.Variable) return "variable";
  if (kind === CompletionItemKind.Class) return "class";
  if (kind === CompletionItemKind.Interface) return "interface";
  if (kind === CompletionItemKind.Module) return "module";
  if (kind === CompletionItemKind.Keyword) return "keyword";
  if (kind === CompletionItemKind.Field) return "field";
  if (kind === CompletionItemKind.Snippet) return "snippet";
  return "value";
}

function jsonTextEditToWorkspaceTextEdit(edit: TextEdit): LspWorkspaceTextEdit {
  return {
    range: {
      start: { line: edit.range.start.line, character: edit.range.start.character },
      end: { line: edit.range.end.line, character: edit.range.end.character },
    },
    newText: edit.newText,
  };
}

function jsonSymbolAtPosition(document: JsonTextDocument, jsonDocument: JSONDocument, line: number, column: number): { kind: "property" | "value"; label: string; path: string; range: TracevaneOneBasedRange } | null {
  const offset = document.offsetAt(oneBasedToPosition(line, column));
  const node = jsonDocument.getNodeFromOffset(offset, true);
  if (!node) return null;
  const property = node.type === "property" ? node : node.parent?.type === "property" ? node.parent : null;
  const target = property ?? node;
  return {
    kind: property ? "property" : "value",
    label: property ? String(property.keyNode.value || "property") : nodeLabel(node),
    path: jsonPathForNode(target),
    range: rangeForNode(document, target),
  };
}

function rangeForNode(document: JsonTextDocument, node: ASTNode): TracevaneOneBasedRange {
  return rangeToOneBased({
    start: document.positionAt(node.offset),
    end: document.positionAt(node.offset + Math.max(1, node.length)),
  });
}

function rangeToOneBased(range: Range): TracevaneOneBasedRange {
  return {
    startLine: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLine: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

function oneBasedToPosition(line: number, column: number): { line: number; character: number } {
  return {
    line: Math.max(0, Math.floor(line || 1) - 1),
    character: Math.max(0, Math.floor(column || 1) - 1),
  };
}

function nodeLabel(node: ASTNode): string {
  if (node.type === "string") return String(node.value ?? "string");
  if (node.type === "number") return String(node.value ?? "number");
  if (node.type === "boolean") return String(node.value);
  return node.type;
}

function jsonPathForNode(node: ASTNode): string {
  const segments: string[] = [];
  let current: ASTNode | undefined = node;
  while (current) {
    if (current.type === "property") {
      segments.unshift(String(current.keyNode.value || "property"));
    }
    current = current.parent;
  }
  return segments.length ? `$${segments.map((segment) => `.${segment}`).join("")}` : "$";
}
