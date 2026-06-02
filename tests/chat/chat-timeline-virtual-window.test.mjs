import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChatTimelineVirtualOffsetIndex,
  resolveChatTimelineVirtualWindow,
} from '../../dist/lib/chat-timeline-virtual-window.js';

const DEFAULT_HEIGHT = 280;
const ITEM_GAP = 18;
const MIN_ITEMS = 4;
const OVERSCAN = 120;

function legacyLinearWindow(rows, options) {
  const total = rows.length;
  if (options.forceEagerRender || total <= options.minVirtualizeItems) {
    return {
      start: 0,
      end: total,
    };
  }

  const top = Math.max(0, options.scrollTop - options.overscanPx);
  const bottom = options.scrollTop + options.clientHeight + options.overscanPx;
  let offset = 0;
  let start = 0;
  let end = total;
  let foundStart = false;

  for (let index = 0; index < total; index += 1) {
    const row = rows[index];
    const itemHeight = (row?.estimatedHeight || options.defaultHeight) + (index < total - 1 ? options.itemGap : 0);
    const itemTop = offset;
    const itemBottom = offset + itemHeight;
    if (!foundStart && itemBottom >= top) {
      start = Math.max(0, index - 2);
      foundStart = true;
    }
    if (foundStart && itemTop > bottom) {
      end = Math.min(total, index + 2);
      break;
    }
    offset = itemBottom;
  }

  return { start, end };
}

function resolve(rows, options = {}) {
  const offsetIndex = buildChatTimelineVirtualOffsetIndex(rows, {
    defaultHeight: DEFAULT_HEIGHT,
    itemGap: ITEM_GAP,
  });
  return resolveChatTimelineVirtualWindow({
    rows,
    offsetIndex,
    scrollTop: options.scrollTop ?? 0,
    clientHeight: options.clientHeight ?? 420,
    overscanPx: options.overscanPx ?? OVERSCAN,
    minVirtualizeItems: options.minVirtualizeItems ?? MIN_ITEMS,
    forceEagerRender: options.forceEagerRender ?? false,
  });
}

test('timeline virtual offset index stores cumulative item bottoms once per row list', () => {
  const offsetIndex = buildChatTimelineVirtualOffsetIndex([
    { estimatedHeight: 100 },
    { estimatedHeight: 200 },
    { estimatedHeight: 300 },
  ], {
    defaultHeight: DEFAULT_HEIGHT,
    itemGap: ITEM_GAP,
  });

  assert.deepEqual(offsetIndex.offsets, [0, 118, 336, 636]);
  assert.equal(offsetIndex.totalHeight, 636);
});

test('timeline virtual window matches the previous linear scan over representative scroll positions', () => {
  const rows = [
    { estimatedHeight: 96 },
    { estimatedHeight: 180 },
    { estimatedHeight: 480 },
    { estimatedHeight: 132 },
    { estimatedHeight: 720 },
    { estimatedHeight: 280 },
    { estimatedHeight: 360 },
    { estimatedHeight: 140 },
    { estimatedHeight: 640 },
    { estimatedHeight: 220 },
  ];
  const cases = [0, 1, 110, 240, 560, 980, 1640, 2400, 3200];

  for (const scrollTop of cases) {
    const options = {
      scrollTop,
      clientHeight: 420,
      overscanPx: OVERSCAN,
      minVirtualizeItems: MIN_ITEMS,
      forceEagerRender: false,
      defaultHeight: DEFAULT_HEIGHT,
      itemGap: ITEM_GAP,
    };
    assert.deepEqual(resolve(rows, options), legacyLinearWindow(rows, options), `scrollTop=${scrollTop}`);
  }
});

test('timeline virtual window keeps eager and overscroll fallback behavior', () => {
  const rows = [
    { estimatedHeight: 100 },
    { estimatedHeight: 100 },
    { estimatedHeight: 100 },
  ];
  assert.deepEqual(resolve(rows), { start: 0, end: 3 });
  assert.deepEqual(resolve([...rows, ...rows], { forceEagerRender: true }), { start: 0, end: 6 });

  const longRows = Array.from({ length: 8 }, () => ({ estimatedHeight: 120 }));
  assert.deepEqual(resolve(longRows, { scrollTop: 100000, clientHeight: 420 }), { start: 0, end: 8 });
});

test('timeline virtual window keeps long IM histories bounded around the viewport', () => {
  const rows = Array.from({ length: 1000 }, (_, index) => ({
    estimatedHeight: index % 7 === 0 ? 620 : 280,
  }));
  const window = resolve(rows, {
    scrollTop: 50000,
    clientHeight: 960,
    overscanPx: 2640,
    minVirtualizeItems: 96,
  });

  assert.ok(window.start > 0);
  assert.ok(window.end < rows.length);
  assert.ok(window.end - window.start <= 34, `mounted window too wide: ${window.end - window.start}`);

  const eagerBoundaryRows = rows.slice(0, 96);
  assert.deepEqual(resolve(eagerBoundaryRows, {
    scrollTop: 5000,
    clientHeight: 960,
    overscanPx: 2640,
    minVirtualizeItems: 96,
  }), { start: 0, end: 96 });

  const firstVirtualizedWindow = resolve(rows.slice(0, 97), {
    scrollTop: 5000,
    clientHeight: 960,
    overscanPx: 2640,
    minVirtualizeItems: 96,
  });
  assert.ok(firstVirtualizedWindow.end - firstVirtualizedWindow.start < 97);
});
