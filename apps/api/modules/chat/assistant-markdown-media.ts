import type { ChatResourceItem } from '../../../../types/chat.js';
import {
  isStudioMarkdownExplicitLocalRef,
  parseStudioMarkdownMediaRef,
  parseStudioMarkdownMediaTitle,
  type StudioMarkdownMediaRef,
} from '../../../../lib/studio-markdown-media.js';

type ParsedMarkdownMediaToken = {
  raw: string;
  end: number;
  href: string;
  title: string | null;
  quote: '"' | "'" | null;
  labelRaw: string;
  isImage: boolean;
};

type HtmlMediaExpectation = 'image' | 'video' | 'file' | 'unknown';

type RewriteHtmlTagResult = {
  tag: string;
  changed: boolean;
  resources: ChatResourceItem[];
};

type SrcsetCandidate = {
  raw: string;
  ref: string;
  descriptor: string;
};

export interface CompileAssistantMarkdownMediaOptions {
  markdown: string;
  resolveResource: (ref: string, parsedRef: StudioMarkdownMediaRef | null) => ChatResourceItem | null;
  rewriteHref: (resource: ChatResourceItem) => string;
}

export interface CompileAssistantMarkdownMediaResult {
  markdown: string;
  resources: ChatResourceItem[];
  changed: boolean;
}

function isFenceDelimiter(line: string, marker: '`' | '~'): boolean {
  const match = line.match(/^[ \t]{0,3}(```+|~~~+)/);
  if (!match) {
    return false;
  }
  return match[1]?.[0] === marker;
}

function findLineEnd(source: string, start: number): number {
  const nextBreak = source.indexOf('\n', start);
  return nextBreak === -1 ? source.length : nextBreak + 1;
}

function findClosingBracket(source: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '[') {
      depth += 1;
      continue;
    }
    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function findClosingParen(source: string, openIndex: number): number {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  for (let index = openIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      if (depth === 0) {
        return index;
      }
      depth -= 1;
    }
  }
  return -1;
}

function parseDestinationAndTitle(raw: string): {
  href: string;
  title: string | null;
  quote: '"' | "'" | null;
} | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  let href = '';
  let rest = '';

  if (trimmed.startsWith('<')) {
    const close = trimmed.indexOf('>');
    if (close <= 0) {
      return null;
    }
    href = trimmed.slice(1, close).trim();
    rest = trimmed.slice(close + 1).trim();
  } else {
    let cursor = 0;
    while (cursor < trimmed.length && !/\s/.test(trimmed[cursor])) {
      if (trimmed[cursor] === '\\') {
        cursor += 2;
        continue;
      }
      cursor += 1;
    }
    href = trimmed.slice(0, cursor).trim();
    rest = trimmed.slice(cursor).trim();
  }

  if (!href) {
    return null;
  }

  if (!rest) {
    return { href, title: null, quote: null };
  }

  const quote = rest[0];
  if ((quote !== '"' && quote !== '\'') || rest.length < 2) {
    return { href, title: null, quote: null };
  }

  let closeIndex = -1;
  for (let index = 1; index < rest.length; index += 1) {
    if (rest[index] === '\\') {
      index += 1;
      continue;
    }
    if (rest[index] === quote) {
      closeIndex = index;
      break;
    }
  }

  if (closeIndex < 1) {
    return { href, title: null, quote: null };
  }
  if (rest.slice(closeIndex + 1).trim()) {
    return { href, title: null, quote: null };
  }

  return {
    href,
    title: rest.slice(1, closeIndex),
    quote,
  };
}

function parseMarkdownMediaToken(source: string, start: number): ParsedMarkdownMediaToken | null {
  const isImage = source[start] === '!' && source[start + 1] === '[';
  const openBracket = isImage ? start + 1 : start;
  if (source[openBracket] !== '[') {
    return null;
  }

  const closeBracket = findClosingBracket(source, openBracket);
  if (closeBracket < 0) {
    return null;
  }

  let cursor = closeBracket + 1;
  while (source[cursor] === ' ' || source[cursor] === '\t') {
    cursor += 1;
  }
  if (source[cursor] !== '(') {
    return null;
  }

  const closeParen = findClosingParen(source, cursor);
  if (closeParen < 0) {
    return null;
  }

  const destination = parseDestinationAndTitle(source.slice(cursor + 1, closeParen));
  if (!destination) {
    return null;
  }

  return {
    raw: source.slice(start, closeParen + 1),
    end: closeParen + 1,
    href: destination.href,
    title: destination.title,
    quote: destination.quote,
    labelRaw: source.slice(openBracket + 1, closeBracket),
    isImage,
  };
}

function rebuildMarkdownMediaToken(
  token: ParsedMarkdownMediaToken,
  href: string,
  title: string,
): string {
  const quote = token.quote || '"';
  return `${token.isImage ? '!' : ''}[${token.labelRaw}](${href} ${quote}${title}${quote})`;
}

function findTagEnd(source: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }
    if (char === '>') {
      return index;
    }
  }
  return -1;
}

function expectedKindForHtmlAttribute(
  tagName: string,
  attrName: string,
): HtmlMediaExpectation {
  if (attrName === 'poster') {
    return 'image';
  }
  if (attrName === 'href') {
    return tagName === 'a' ? 'file' : 'unknown';
  }
  if (attrName !== 'src') {
    return 'unknown';
  }
  if (tagName === 'img') {
    return 'image';
  }
  if (tagName === 'video') {
    return 'video';
  }
  if (tagName === 'audio') {
    return 'file';
  }
  if (tagName === 'source') {
    return 'unknown';
  }
  return 'unknown';
}

function htmlResourceMatchesExpectation(
  resource: ChatResourceItem,
  expected: HtmlMediaExpectation,
): boolean {
  if (expected === 'unknown') {
    return true;
  }
  if (expected === 'file') {
    return true;
  }
  return resource.kind === expected;
}

function parseSrcsetCandidates(value: string): SrcsetCandidate[] {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(/\s+/);
      const ref = parts.shift() || '';
      return {
        raw: entry,
        ref,
        descriptor: parts.join(' '),
      };
    })
    .filter((entry) => Boolean(entry.ref));
}

function rewriteHtmlSrcset(
  value: string,
  tagName: string,
  options: CompileAssistantMarkdownMediaOptions,
  seenIds: Set<string>,
): { value: string; changed: boolean; resources: ChatResourceItem[] } {
  const resources: ChatResourceItem[] = [];
  const rewritten = parseSrcsetCandidates(value).map((candidate) => {
    const parsedRef = parseStudioMarkdownMediaRef(candidate.ref);
    const isExplicitLocalRef = isStudioMarkdownExplicitLocalRef(candidate.ref);
    if (!parsedRef && !isExplicitLocalRef) {
      return candidate.raw;
    }
    const resource = options.resolveResource(candidate.ref, parsedRef);
    if (!resource || !htmlResourceMatchesExpectation(resource, expectedKindForHtmlAttribute(tagName, 'src'))) {
      return candidate.raw;
    }
    const rewrittenHref = options.rewriteHref(resource);
    if (!rewrittenHref) {
      return candidate.raw;
    }
    if (!seenIds.has(resource.id)) {
      seenIds.add(resource.id);
      resources.push(resource);
    }
    return candidate.descriptor ? `${rewrittenHref} ${candidate.descriptor}` : rewrittenHref;
  });
  const nextValue = rewritten.join(', ');
  return {
    value: nextValue,
    changed: nextValue !== value,
    resources,
  };
}

function rewriteAssistantHtmlTag(
  rawTag: string,
  options: CompileAssistantMarkdownMediaOptions,
  seenIds: Set<string>,
): RewriteHtmlTagResult {
  const tagNameMatch = /^<\s*([a-zA-Z][\w:-]*)\b/.exec(rawTag);
  if (!tagNameMatch) {
    return { tag: rawTag, changed: false, resources: [] };
  }
  const tagName = tagNameMatch[1]?.toLowerCase() || '';
  if (!tagName || rawTag.startsWith('</')) {
    return { tag: rawTag, changed: false, resources: [] };
  }

  const attrPattern = /\b(src|href|poster|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  const resources: ChatResourceItem[] = [];
  let changed = false;
  let rewritten = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(rawTag))) {
    const attrName = match[1]?.toLowerCase() || '';
    const rawValue = match[2] ?? match[3] ?? match[4] ?? '';
    const quote = match[2] != null ? '"' : match[3] != null ? '\'' : '';
    if (attrName === 'srcset') {
      const rewrittenSrcset = rewriteHtmlSrcset(rawValue, tagName, options, seenIds);
      if (!rewrittenSrcset.changed) {
        continue;
      }
      const attrStart = match.index;
      const attrEnd = attrPattern.lastIndex;
      rewritten += rawTag.slice(cursor, attrStart);
      const encodedValue = quote
        ? `${quote}${rewrittenSrcset.value}${quote}`
        : rewrittenSrcset.value;
      rewritten += `${attrName}=${encodedValue}`;
      cursor = attrEnd;
      changed = true;
      resources.push(...rewrittenSrcset.resources);
      continue;
    }
    const parsedRef = parseStudioMarkdownMediaRef(rawValue);
    const isExplicitLocalRef = isStudioMarkdownExplicitLocalRef(rawValue);
    if (!parsedRef && !isExplicitLocalRef) {
      continue;
    }

    const resource = options.resolveResource(rawValue, parsedRef);
    if (!resource || !htmlResourceMatchesExpectation(resource, expectedKindForHtmlAttribute(tagName, attrName))) {
      continue;
    }

    const rewrittenHref = options.rewriteHref(resource);
    if (!rewrittenHref) {
      continue;
    }

    const attrStart = match.index;
    const attrEnd = attrPattern.lastIndex;
    rewritten += rawTag.slice(cursor, attrStart);
    const encodedValue = quote
      ? `${quote}${rewrittenHref}${quote}`
      : rewrittenHref;
    rewritten += `${attrName}=${encodedValue}`;
    cursor = attrEnd;
    changed = true;

    if (!seenIds.has(resource.id)) {
      seenIds.add(resource.id);
      resources.push(resource);
    }
  }

  if (!changed) {
    return { tag: rawTag, changed: false, resources: [] };
  }

  rewritten += rawTag.slice(cursor);
  return {
    tag: rewritten,
    changed: true,
    resources,
  };
}

export function compileAssistantMarkdownMedia(
  options: CompileAssistantMarkdownMediaOptions,
): CompileAssistantMarkdownMediaResult {
  const source = String(options.markdown || '');
  if (!source.trim()) {
    return {
      markdown: source,
      resources: [],
      changed: false,
    };
  }

  let changed = false;
  let inFence: '`' | '~' | null = null;
  let index = 0;
  let result = '';
  const resources: ChatResourceItem[] = [];
  const seenIds = new Set<string>();

  while (index < source.length) {
    const lineStart = index === 0 || source[index - 1] === '\n';
    if (lineStart) {
      const lineEnd = findLineEnd(source, index);
      const line = source.slice(index, lineEnd);
      const fenceMatch = line.match(/^[ \t]{0,3}(```+|~~~+)/);
      if (fenceMatch) {
        const marker = fenceMatch[1]?.[0] === '~' ? '~' : '`';
        if (!inFence) {
          inFence = marker;
          result += line;
          index = lineEnd;
          continue;
        }
        if (isFenceDelimiter(line, inFence)) {
          inFence = null;
          result += line;
          index = lineEnd;
          continue;
        }
      }
    }

    if (inFence) {
      result += source[index];
      index += 1;
      continue;
    }

    if (source[index] === '`') {
      let tickCount = 1;
      while (source[index + tickCount] === '`') {
        tickCount += 1;
      }
      const delimiter = '`'.repeat(tickCount);
      const close = source.indexOf(delimiter, index + tickCount);
      if (close >= 0) {
        result += source.slice(index, close + tickCount);
        index = close + tickCount;
        continue;
      }
    }

    const token = source[index] === '[' || (source[index] === '!' && source[index + 1] === '[')
      ? parseMarkdownMediaToken(source, index)
      : null;
    if (!token) {
      if (source[index] === '<') {
        const tagEnd = findTagEnd(source, index);
        if (tagEnd > index) {
          const rawTag = source.slice(index, tagEnd + 1);
          const rewrittenTag = rewriteAssistantHtmlTag(rawTag, options, seenIds);
          if (rewrittenTag.changed) {
            changed = true;
            result += rewrittenTag.tag;
            resources.push(...rewrittenTag.resources);
            index = tagEnd + 1;
            continue;
          }
        }
      }
      result += source[index];
      index += 1;
      continue;
    }

    const display = parseStudioMarkdownMediaTitle(token.title);
    const parsedRef = parseStudioMarkdownMediaRef(token.href);
    if (!display || (!parsedRef && !isStudioMarkdownExplicitLocalRef(token.href))) {
      result += token.raw;
      index = token.end;
      continue;
    }

    const resource = options.resolveResource(token.href, parsedRef);
    if (!resource) {
      result += token.raw;
      index = token.end;
      continue;
    }

    if ((display === 'inline-image' || display === 'break-image') && resource.kind !== 'image') {
      result += token.raw;
      index = token.end;
      continue;
    }
    if ((display === 'inline-video' || display === 'break-video') && resource.kind !== 'video') {
      result += token.raw;
      index = token.end;
      continue;
    }

    const rewrittenHref = options.rewriteHref(resource);
    if (!rewrittenHref) {
      result += token.raw;
      index = token.end;
      continue;
    }

    changed = true;
    result += rebuildMarkdownMediaToken(token, rewrittenHref, `studio:${display}`);
    if (!seenIds.has(resource.id)) {
      seenIds.add(resource.id);
      resources.push(resource);
    }
    index = token.end;
  }

  return {
    markdown: result,
    resources,
    changed,
  };
}
