import type { ChatHistoryPageInfo } from '../types/chat.js';

export function mergeCanonicalSnapshotPageInfo(
  current: ChatHistoryPageInfo,
  snapshot: ChatHistoryPageInfo,
  options: {
    snapshotMessageCount: number;
  },
): ChatHistoryPageInfo {
  if (options.snapshotMessageCount <= 0) {
    return snapshot;
  }

  const shouldPreserveBeforeCursor = Boolean(
    current.hasMoreBefore
    && current.beforeCursor
    && (!snapshot.hasMoreBefore || !snapshot.beforeCursor),
  );

  return {
    hasMoreBefore: shouldPreserveBeforeCursor ? true : snapshot.hasMoreBefore,
    beforeCursor: shouldPreserveBeforeCursor ? current.beforeCursor : snapshot.beforeCursor,
    hasMoreAfter: snapshot.hasMoreAfter,
    afterCursor: snapshot.afterCursor,
  };
}
