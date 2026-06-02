export type ChatTimelineVirtualRow = {
  estimatedHeight?: number | null;
};

export type ChatTimelineVirtualOffsetIndex = {
  offsets: number[];
  totalHeight: number;
};

export type ChatTimelineVirtualWindow = {
  start: number;
  end: number;
};

export function buildChatTimelineVirtualOffsetIndex(
  rows: readonly ChatTimelineVirtualRow[],
  options: {
    defaultHeight: number;
    itemGap: number;
  },
): ChatTimelineVirtualOffsetIndex {
  const defaultHeight = normalizePositiveNumber(options.defaultHeight, 1);
  const itemGap = Math.max(0, normalizeFiniteNumber(options.itemGap, 0));
  const offsets: number[] = [0];
  let offset = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const height = normalizePositiveNumber(row?.estimatedHeight, defaultHeight);
    offset += height + (index < rows.length - 1 ? itemGap : 0);
    offsets.push(offset);
  }

  return {
    offsets,
    totalHeight: offset,
  };
}

export function resolveChatTimelineVirtualWindow(params: {
  rows: readonly ChatTimelineVirtualRow[];
  offsetIndex: ChatTimelineVirtualOffsetIndex;
  scrollTop: number;
  clientHeight: number;
  overscanPx: number;
  minVirtualizeItems: number;
  forceEagerRender: boolean;
}): ChatTimelineVirtualWindow {
  const total = params.rows.length;
  if (params.forceEagerRender || total <= params.minVirtualizeItems) {
    return {
      start: 0,
      end: total,
    };
  }

  const top = Math.max(0, normalizeFiniteNumber(params.scrollTop, 0) - Math.max(0, params.overscanPx));
  const bottom = Math.max(
    top,
    normalizeFiniteNumber(params.scrollTop, 0)
      + Math.max(0, normalizeFiniteNumber(params.clientHeight, 0))
      + Math.max(0, params.overscanPx),
  );
  const firstVisibleIndex = findFirstItemBottomAtOrAfter(params.offsetIndex.offsets, total, top);
  if (firstVisibleIndex >= total) {
    return {
      start: 0,
      end: total,
    };
  }

  const firstAfterBottomIndex = findFirstItemTopAfter(params.offsetIndex.offsets, total, bottom);
  return {
    start: Math.max(0, firstVisibleIndex - 2),
    end: firstAfterBottomIndex < total ? Math.min(total, firstAfterBottomIndex + 2) : total,
  };
}

function findFirstItemBottomAtOrAfter(offsets: readonly number[], total: number, target: number): number {
  let low = 0;
  let high = total;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const itemBottom = offsets[mid + 1] ?? Number.POSITIVE_INFINITY;
    if (itemBottom >= target) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

function findFirstItemTopAfter(offsets: readonly number[], total: number, target: number): number {
  let low = 0;
  let high = total;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const itemTop = offsets[mid] ?? Number.POSITIVE_INFINITY;
    if (itemTop > target) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

function normalizePositiveNumber(value: number | null | undefined, fallback: number): number {
  const normalized = normalizeFiniteNumber(value, fallback);
  return normalized > 0 ? normalized : fallback;
}

function normalizeFiniteNumber(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
