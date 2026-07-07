import cssLanguageServicePackage from "vscode-css-languageservice";
import htmlLanguageServicePackage from "vscode-html-languageservice";
import type {
  CompletionItem as CssCompletionItem,
  Diagnostic as CssDiagnostic,
  Hover as CssHover,
  Location as CssLocation,
  Range as CssRange,
  TextDocument as CssTextDocument,
  TextEdit as CssTextEdit,
} from "vscode-css-languageservice";
import type {
  CompletionItem as HtmlCompletionItem,
  Hover as HtmlHover,
  Range as HtmlRange,
  TextDocument as HtmlTextDocument,
  TextEdit as HtmlTextEdit,
} from "vscode-html-languageservice";

import type {
  LspCompletionItem,
  LspDefinitionLocation,
  LspDiagnostic,
  LspProviderId,
  LspReferenceLocation,
  LspWorkspaceTextEdit,
} from "../../../../../types/lsp.js";
import { CSS_PROVIDER_SOURCE, HTML_PROVIDER_SOURCE } from "./registry.js";

const {
  CompletionItemKind: CssCompletionItemKind,
  DiagnosticSeverity: CssDiagnosticSeverity,
  InsertTextFormat: CssInsertTextFormat,
  TextDocument: CssTextDocumentFactory,
  getCSSLanguageService,
  getLESSLanguageService,
  getSCSSLanguageService,
} = cssLanguageServicePackage;
const {
  CompletionItemKind: HtmlCompletionItemKind,
  InsertTextFormat: HtmlInsertTextFormat,
  TextDocument: HtmlTextDocumentFactory,
  getLanguageService: getHtmlLanguageService,
} = htmlLanguageServicePackage;

const HTML_LANGUAGE_SERVICE = getHtmlLanguageService();
const CSS_LANGUAGE_SERVICE = getCSSLanguageService();
const SCSS_LANGUAGE_SERVICE = getSCSSLanguageService();
const LESS_LANGUAGE_SERVICE = getLESSLanguageService();

export interface HtmlCssLanguageServiceDocumentInput {
  uri: string;
  content: string;
  language: string;
  version?: number | null;
}

export interface HtmlCssLanguageServiceLocationInput extends HtmlCssLanguageServiceDocumentInput {
  rootId: string;
  path: string;
  line: number;
  column: number;
}

export function diagnoseCssWithLanguageService(input: HtmlCssLanguageServiceDocumentInput): LspDiagnostic[] {
  if (!input.content.trim()) return [];
  const { document, service, stylesheet } = cssContext(input);
  return service.doValidation(document, stylesheet).map((diagnostic) => cssDiagnosticToTracevane(diagnostic));
}

export function hoverHtmlWithLanguageService(input: HtmlCssLanguageServiceLocationInput): { contents: string[]; range: TracevaneOneBasedRange | null } {
  const { document, htmlDocument } = htmlContext(input);
  const hover = HTML_LANGUAGE_SERVICE.doHover(document, oneBasedToPosition(input.line, input.column), htmlDocument);
  const contents = hoverContentsToStrings(hover);
  return {
    contents: contents.length ? contents : ["HTML document", "Tracevane HTML LSP provider powered by vscode-html-languageservice"],
    range: hover?.range ? rangeToOneBased(hover.range) : null,
  };
}

export function hoverCssWithLanguageService(input: HtmlCssLanguageServiceLocationInput): { contents: string[]; range: TracevaneOneBasedRange | null } {
  const { document, service, stylesheet } = cssContext(input);
  const hover = service.doHover(document, oneBasedToPosition(input.line, input.column), stylesheet);
  const contents = hoverContentsToStrings(hover);
  return {
    contents: contents.length ? contents : [`${cssProviderLabel(input.language)} stylesheet`, `Tracevane CSS LSP provider powered by vscode-css-languageservice`],
    range: hover?.range ? rangeToOneBased(hover.range) : null,
  };
}

export function completeHtmlWithLanguageService(input: HtmlCssLanguageServiceLocationInput): LspCompletionItem[] {
  const { document, htmlDocument } = htmlContext(input);
  const completion = HTML_LANGUAGE_SERVICE.doComplete(document, oneBasedToPosition(input.line, input.column), htmlDocument);
  return (completion?.items ?? []).slice(0, 200).map(htmlCompletionItemToTracevane);
}

export function completeCssWithLanguageService(input: HtmlCssLanguageServiceLocationInput): LspCompletionItem[] {
  const { document, service, stylesheet } = cssContext(input);
  const completion = service.doComplete(document, oneBasedToPosition(input.line, input.column), stylesheet);
  return (completion?.items ?? []).slice(0, 200).map(cssCompletionItemToTracevane);
}

export function defineCssWithLanguageService(input: HtmlCssLanguageServiceLocationInput): LspDefinitionLocation[] {
  const { document, service, stylesheet } = cssContext(input);
  const location = service.findDefinition(document, oneBasedToPosition(input.line, input.column), stylesheet);
  return location ? [cssLocationToTracevane(input, location)] : [];
}

export function referenceCssWithLanguageService(input: HtmlCssLanguageServiceLocationInput): LspReferenceLocation[] {
  const { document, service, stylesheet } = cssContext(input);
  return service.findReferences(document, oneBasedToPosition(input.line, input.column), stylesheet).map((location) => cssLocationToTracevane(input, location));
}

export function formatHtmlWithLanguageService(input: HtmlCssLanguageServiceDocumentInput, options: { tabSize: number; insertSpaces: boolean }): LspWorkspaceTextEdit[] {
  const document = createHtmlTextDocument(input);
  return HTML_LANGUAGE_SERVICE.format(document, undefined, {
    tabSize: options.tabSize,
    insertSpaces: options.insertSpaces,
    wrapLineLength: 120,
  }).map(htmlTextEditToWorkspaceTextEdit);
}

export function formatCssWithLanguageService(input: HtmlCssLanguageServiceDocumentInput, options: { tabSize: number; insertSpaces: boolean }): LspWorkspaceTextEdit[] {
  const { document, service } = cssContext(input);
  return service.format(document, undefined, {
    tabSize: options.tabSize,
    insertSpaces: options.insertSpaces,
  }).map(cssTextEditToWorkspaceTextEdit);
}

interface TracevaneOneBasedRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

function htmlContext(input: HtmlCssLanguageServiceDocumentInput) {
  const document = createHtmlTextDocument(input);
  return { document, htmlDocument: HTML_LANGUAGE_SERVICE.parseHTMLDocument(document) };
}

function cssContext(input: HtmlCssLanguageServiceDocumentInput) {
  const document = createCssTextDocument(input);
  const service = cssLanguageServiceFor(input.language);
  return { document, service, stylesheet: service.parseStylesheet(document) };
}

function createHtmlTextDocument(input: HtmlCssLanguageServiceDocumentInput): HtmlTextDocument {
  return HtmlTextDocumentFactory.create(input.uri, "html", input.version ?? 1, input.content);
}

function createCssTextDocument(input: HtmlCssLanguageServiceDocumentInput): CssTextDocument {
  return CssTextDocumentFactory.create(input.uri, cssLanguageId(input.language), input.version ?? 1, input.content);
}

function cssLanguageServiceFor(language: string) {
  if (language === "scss") return SCSS_LANGUAGE_SERVICE;
  if (language === "less") return LESS_LANGUAGE_SERVICE;
  return CSS_LANGUAGE_SERVICE;
}

function cssLanguageId(language: string): "css" | "scss" | "less" {
  if (language === "scss" || language === "less") return language;
  return "css";
}

function cssProviderLabel(language: string): string {
  return language === "scss" ? "SCSS" : language === "less" ? "LESS" : "CSS";
}

function cssDiagnosticToTracevane(diagnostic: CssDiagnostic): LspDiagnostic {
  return {
    severity: cssDiagnosticSeverityToTracevane(diagnostic.severity),
    message: String(diagnostic.message),
    startLine: diagnostic.range.start.line + 1,
    startColumn: diagnostic.range.start.character + 1,
    endLine: diagnostic.range.end.line + 1,
    endColumn: diagnostic.range.end.character + 1,
    code: diagnostic.code == null ? null : String(diagnostic.code),
    source: CSS_PROVIDER_SOURCE,
  };
}

function cssDiagnosticSeverityToTracevane(severity: number | undefined): LspDiagnostic["severity"] {
  if (severity === CssDiagnosticSeverity.Warning) return "warning";
  if (severity === CssDiagnosticSeverity.Information) return "info";
  if (severity === CssDiagnosticSeverity.Hint) return "hint";
  return "error";
}

function hoverContentsToStrings(hover: CssHover | HtmlHover | null | undefined): string[] {
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

function htmlCompletionItemToTracevane(item: HtmlCompletionItem): LspCompletionItem {
  return {
    label: item.label,
    detail: item.detail ?? null,
    documentation: documentationToString(item.documentation),
    insertText: completionInsertText(item),
    kind: item.insertTextFormat === HtmlInsertTextFormat.Snippet ? "snippet" : htmlCompletionKindToTracevane(item.kind),
    sortText: item.sortText ?? null,
  };
}

function cssCompletionItemToTracevane(item: CssCompletionItem): LspCompletionItem {
  return {
    label: item.label,
    detail: item.detail ?? null,
    documentation: documentationToString(item.documentation),
    insertText: completionInsertText(item),
    kind: item.insertTextFormat === CssInsertTextFormat.Snippet ? "snippet" : cssCompletionKindToTracevane(item.kind),
    sortText: item.sortText ?? null,
  };
}

function completionInsertText(item: CssCompletionItem | HtmlCompletionItem): string {
  if (typeof item.insertText === "string") return item.insertText;
  const edit = item.textEdit;
  if (edit && "newText" in edit && typeof edit.newText === "string") return edit.newText;
  return item.label;
}

function documentationToString(documentation: CssCompletionItem["documentation"] | HtmlCompletionItem["documentation"]): string | null {
  if (!documentation) return null;
  if (typeof documentation === "string") return documentation;
  if ("value" in documentation && typeof documentation.value === "string") return documentation.value;
  return null;
}

function htmlCompletionKindToTracevane(kind: number | undefined): LspCompletionItem["kind"] {
  if (kind === HtmlCompletionItemKind.Property) return "property";
  if (kind === HtmlCompletionItemKind.Value || kind === HtmlCompletionItemKind.Enum) return "value";
  if (kind === HtmlCompletionItemKind.Function) return "function";
  if (kind === HtmlCompletionItemKind.Method) return "method";
  if (kind === HtmlCompletionItemKind.Variable) return "variable";
  if (kind === HtmlCompletionItemKind.Class) return "class";
  if (kind === HtmlCompletionItemKind.Interface) return "interface";
  if (kind === HtmlCompletionItemKind.Module) return "module";
  if (kind === HtmlCompletionItemKind.Keyword) return "keyword";
  if (kind === HtmlCompletionItemKind.Field) return "field";
  if (kind === HtmlCompletionItemKind.Snippet) return "snippet";
  return "value";
}

function cssCompletionKindToTracevane(kind: number | undefined): LspCompletionItem["kind"] {
  if (kind === CssCompletionItemKind.Property) return "property";
  if (kind === CssCompletionItemKind.Value || kind === CssCompletionItemKind.Enum) return "value";
  if (kind === CssCompletionItemKind.Function) return "function";
  if (kind === CssCompletionItemKind.Method) return "method";
  if (kind === CssCompletionItemKind.Variable) return "variable";
  if (kind === CssCompletionItemKind.Class) return "class";
  if (kind === CssCompletionItemKind.Interface) return "interface";
  if (kind === CssCompletionItemKind.Module) return "module";
  if (kind === CssCompletionItemKind.Keyword) return "keyword";
  if (kind === CssCompletionItemKind.Field) return "field";
  if (kind === CssCompletionItemKind.Snippet) return "snippet";
  return "value";
}

function cssLocationToTracevane(input: HtmlCssLanguageServiceLocationInput, location: CssLocation): LspDefinitionLocation {
  return {
    rootId: input.rootId,
    path: input.path,
    ...rangeToOneBased(location.range),
  };
}

function htmlTextEditToWorkspaceTextEdit(edit: HtmlTextEdit): LspWorkspaceTextEdit {
  return textEditToWorkspaceTextEdit(edit);
}

function cssTextEditToWorkspaceTextEdit(edit: CssTextEdit): LspWorkspaceTextEdit {
  return textEditToWorkspaceTextEdit(edit);
}

function textEditToWorkspaceTextEdit(edit: { range: CssRange | HtmlRange; newText: string }): LspWorkspaceTextEdit {
  return {
    range: {
      start: { line: edit.range.start.line, character: edit.range.start.character },
      end: { line: edit.range.end.line, character: edit.range.end.character },
    },
    newText: edit.newText,
  };
}

function rangeToOneBased(range: CssRange | HtmlRange): TracevaneOneBasedRange {
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

export function providerIdForHtmlCssLanguage(language: string): LspProviderId | null {
  if (language === "html") return "html";
  if (language === "css" || language === "scss" || language === "less") return "css";
  return null;
}
