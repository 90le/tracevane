import * as React from "react";

export interface ReplacePreviewLine {
  lineNumber: number;
  before: string;
  after: string;
}

export interface ReplaceDiffOptions {
  caseSensitive?: boolean;
  regex?: boolean;
}

export interface ReplaceDiffPreviewProps {
  lines: ReplacePreviewLine[];
  query: string;
  replaceWith: string;
  options?: ReplaceDiffOptions;
}

export function ReplaceDiffPreview({
  lines,
  query,
  replaceWith,
  options,
}: ReplaceDiffPreviewProps) {
  return (
    <div className="overflow-hidden rounded border border-line bg-panel font-mono text-[11px] leading-relaxed">
      {lines.map((line) => (
        <div key={`${line.lineNumber}:${line.before}`} className="grid grid-cols-[48px_minmax(0,1fr)] border-b border-line last:border-b-0">
          <div className="border-r border-line bg-panel-2 px-2 py-1 text-right text-subtle">{line.lineNumber}</div>
          <div className="min-w-0">
            <div className="grid grid-cols-[24px_minmax(0,1fr)] bg-danger/5">
              <span className="px-2 py-1 text-danger">−</span>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words px-2 py-1 text-danger">{renderMarkedSearch(line.before, query, "bg-danger/15", options)}</pre>
            </div>
            <div className="grid grid-cols-[24px_minmax(0,1fr)] bg-primary-soft">
              <span className="px-2 py-1 text-primary">+</span>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words px-2 py-1 text-primary">{renderMarkedLiteral(line.after, replaceWith || query, "bg-primary/15")}</pre>
            </div>
          </div>
        </div>
      ))}
      {lines.length === 0 ? <div className="p-2 text-muted">没有可展示的差异行。</div> : null}
    </div>
  );
}

export function createReplaceDiffLines(
  content: string,
  query: string,
  replaceWith: string,
  options: ReplaceDiffOptions = {},
): ReplacePreviewLine[] {
  if (!query) return [];
  const lines = content.split(/\r?\n/);
  const result: ReplacePreviewLine[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const before = lines[index];
    if (!lineMatchesSearch(before, query, options)) continue;
    result.push({
      lineNumber: index + 1,
      before,
      after: replaceLine(before, query, replaceWith, options),
    });
    if (result.length >= 8) break;
  }
  return result;
}

export function renderMarkedLiteral(text: string, marker: string, className: string): React.ReactNode {
  if (!marker) return text;
  const parts = text.split(marker);
  if (parts.length === 1) return text;
  return parts.flatMap((part, index) => {
    const nodes: React.ReactNode[] = [part];
    if (index < parts.length - 1) nodes.push(<mark key={`${marker}:${index}`} className={`rounded px-0.5 ${className}`}>{marker}</mark>);
    return nodes;
  });
}

export function renderMarkedSearch(
  text: string,
  marker: string,
  className: string,
  options: ReplaceDiffOptions = {},
): React.ReactNode {
  if (!marker) return text;
  if (!options.regex) {
    if (options.caseSensitive) return renderMarkedLiteral(text, marker, className);
    return renderMarkedCaseInsensitive(text, marker, className);
  }
  try {
    const matcher = new RegExp(marker, `g${options.caseSensitive ? "" : "i"}`);
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    for (const match of text.matchAll(matcher)) {
      const value = match[0] ?? "";
      const index = match.index ?? 0;
      if (!value) break;
      nodes.push(text.slice(cursor, index));
      nodes.push(<mark key={`${marker}:${index}`} className={`rounded px-0.5 ${className}`}>{value}</mark>);
      cursor = index + value.length;
    }
    if (cursor === 0) return text;
    nodes.push(text.slice(cursor));
    return nodes;
  } catch {
    return text;
  }
}

function renderMarkedCaseInsensitive(text: string, marker: string, className: string): React.ReactNode {
  const lowerText = text.toLowerCase();
  const lowerMarker = marker.toLowerCase();
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const index = lowerText.indexOf(lowerMarker, cursor);
    if (index < 0) break;
    nodes.push(text.slice(cursor, index));
    nodes.push(<mark key={`${marker}:${index}`} className={`rounded px-0.5 ${className}`}>{text.slice(index, index + marker.length)}</mark>);
    cursor = index + marker.length;
  }
  if (cursor === 0) return text;
  nodes.push(text.slice(cursor));
  return nodes;
}

function lineMatchesSearch(line: string, query: string, options: ReplaceDiffOptions): boolean {
  if (!options.regex) {
    return options.caseSensitive
      ? line.includes(query)
      : line.toLowerCase().includes(query.toLowerCase());
  }
  try {
    return new RegExp(query, options.caseSensitive ? "" : "i").test(line);
  } catch {
    return false;
  }
}

function replaceLine(line: string, query: string, replaceWith: string, options: ReplaceDiffOptions): string {
  if (!options.regex) {
    if (options.caseSensitive) return line.split(query).join(replaceWith);
    return line.replace(new RegExp(escapeRegExp(query), "gi"), replaceWith);
  }
  try {
    return line.replace(new RegExp(query, `g${options.caseSensitive ? "" : "i"}`), replaceWith);
  } catch {
    return line;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
