export function isCollapsedPreviewWhitespace(char: string): boolean {
  return char === ' '
    || char === '\n'
    || char === '\r'
    || char === '\t'
    || char === '\f'
    || char === '\v';
}

export function hasCollapsedPreviewContent(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!isCollapsedPreviewWhitespace(value[index] || '')) {
      return true;
    }
  }
  return false;
}

export function hasTrimmedLineCountAtLeast(value: string, minLineCount: number): boolean {
  const targetLineCount = Math.max(1, Math.trunc(minLineCount));
  let start = -1;
  let end = -1;

  for (let index = 0; index < value.length; index += 1) {
    if (!isCollapsedPreviewWhitespace(value[index] || '')) {
      start = index;
      break;
    }
  }

  if (start < 0) {
    return false;
  }
  if (targetLineCount <= 1) {
    return true;
  }

  for (let index = value.length - 1; index >= start; index -= 1) {
    if (!isCollapsedPreviewWhitespace(value[index] || '')) {
      end = index;
      break;
    }
  }

  let lineCount = 1;
  for (let index = start; index <= end; index += 1) {
    if (value[index] === '\n') {
      lineCount += 1;
      if (lineCount >= targetLineCount) {
        return true;
      }
    }
  }
  return false;
}

export function buildBoundedCollapsedPreview(value: string, limit: number): string {
  const maxLength = Math.max(0, Math.trunc(limit));
  if (!maxLength) {
    return '';
  }

  let preview = '';
  let pendingSpace = false;
  let truncated = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] || '';
    if (isCollapsedPreviewWhitespace(char)) {
      if (preview) {
        pendingSpace = true;
      }
      continue;
    }

    if (pendingSpace) {
      if (preview.length >= maxLength) {
        truncated = true;
        break;
      }
      preview += ' ';
      pendingSpace = false;
    }

    if (preview.length >= maxLength) {
      truncated = true;
      break;
    }
    preview += char;
    if (preview.length >= maxLength && index < value.length - 1) {
      truncated = true;
      break;
    }
  }

  if (!preview) {
    return '';
  }
  if (!truncated) {
    return preview;
  }
  return `${preview.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
