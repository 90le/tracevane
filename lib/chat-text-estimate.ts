type ChatTextBlockHeightEstimateOptions = {
  baseHeight?: number;
  charsPerSoftLine?: number;
  codeFenceHeight?: number;
  lineHeight?: number;
  maxHeight?: number;
  tableLineHeight?: number;
};

const DEFAULT_BASE_HEIGHT = 48;
const DEFAULT_CHARS_PER_SOFT_LINE = 86;
const DEFAULT_CODE_FENCE_HEIGHT = 42;
const DEFAULT_LINE_HEIGHT = 22;
const DEFAULT_MAX_HEIGHT = 7200;
const DEFAULT_TABLE_LINE_HEIGHT = 10;

function isEstimateWhitespace(char: string): boolean {
  return char === ' '
    || char === '\n'
    || char === '\r'
    || char === '\t'
    || char === '\f'
    || char === '\v';
}

function findTrimmedBounds(value: string): { start: number; end: number } | null {
  let start = -1;
  for (let index = 0; index < value.length; index += 1) {
    if (!isEstimateWhitespace(value[index] || '')) {
      start = index;
      break;
    }
  }
  if (start < 0) {
    return null;
  }

  for (let index = value.length - 1; index >= start; index -= 1) {
    if (!isEstimateWhitespace(value[index] || '')) {
      return { start, end: index };
    }
  }
  return null;
}

function isMarkdownTableLine(value: string, start: number, end: number): boolean {
  let firstNonWhitespace = -1;
  let lastNonWhitespace = -1;
  for (let index = start; index <= end; index += 1) {
    if (!isEstimateWhitespace(value[index] || '')) {
      if (firstNonWhitespace < 0) {
        firstNonWhitespace = index;
      }
      lastNonWhitespace = index;
    }
  }
  if (firstNonWhitespace < 0 || lastNonWhitespace <= firstNonWhitespace) {
    return false;
  }
  if (value[firstNonWhitespace] !== '|' || value[lastNonWhitespace] !== '|') {
    return false;
  }
  return lastNonWhitespace - firstNonWhitespace >= 2;
}

export function estimateChatTextBlockHeight(
  value: string,
  options: ChatTextBlockHeightEstimateOptions = {},
): number {
  const baseHeight = options.baseHeight ?? DEFAULT_BASE_HEIGHT;
  const charsPerSoftLine = Math.max(1, Math.trunc(options.charsPerSoftLine ?? DEFAULT_CHARS_PER_SOFT_LINE));
  const codeFenceHeight = options.codeFenceHeight ?? DEFAULT_CODE_FENCE_HEIGHT;
  const lineHeight = options.lineHeight ?? DEFAULT_LINE_HEIGHT;
  const maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;
  const tableLineHeight = options.tableLineHeight ?? DEFAULT_TABLE_LINE_HEIGHT;
  const bounds = findTrimmedBounds(value);
  if (!bounds) {
    return 0;
  }

  const normalizedLength = bounds.end - bounds.start + 1;
  const softLineCount = Math.ceil(normalizedLength / charsPerSoftLine);
  if (baseHeight + softLineCount * lineHeight >= maxHeight) {
    return maxHeight;
  }

  let hardLineCount = 1;
  let codeFenceCount = 0;
  let tableLineCount = 0;
  let lineStart = bounds.start;

  for (let index = bounds.start; index <= bounds.end; index += 1) {
    const char = value[index] || '';
    if (char === '`' && value[index + 1] === '`' && value[index + 2] === '`') {
      codeFenceCount += 1;
      index += 2;
      continue;
    }
    if (char !== '\n') {
      continue;
    }

    if (isMarkdownTableLine(value, lineStart, index - 1)) {
      tableLineCount += 1;
    }
    hardLineCount += 1;
    lineStart = index + 1;
    if (
      baseHeight
      + Math.max(hardLineCount, softLineCount) * lineHeight
      + codeFenceCount * codeFenceHeight
      + tableLineCount * tableLineHeight >= maxHeight
    ) {
      return maxHeight;
    }
  }

  if (isMarkdownTableLine(value, lineStart, bounds.end)) {
    tableLineCount += 1;
  }

  return Math.min(
    maxHeight,
    baseHeight
      + Math.max(hardLineCount, softLineCount) * lineHeight
      + codeFenceCount * codeFenceHeight
      + tableLineCount * tableLineHeight,
  );
}
