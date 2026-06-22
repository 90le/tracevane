/**
 * Lightweight line-based diff (no external dependencies).
 *
 * Strategy: strip the common prefix and suffix of lines, then run a classic
 * Longest-Common-Subsequence (LCS) over the differing middle. This keeps the
 * cost proportional to the size of the actual change (the middle), which is the
 * common case for config edits / rollbacks where most of the file is identical.
 *
 * The result is a flat list of segments in display order. `del` lines come from
 * the base (left) document, `add` lines from the proposed (right) document, and
 * `same` lines are present in both.
 */

export type LineDiffType = "same" | "add" | "del";

export interface LineDiffSegment {
  type: LineDiffType;
  text: string;
}

function splitLines(value: string): string[] {
  // Normalize line endings; keep a trailing empty line out so a final newline
  // doesn't render as a phantom blank diff line.
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized === "") return [];
  const lines = normalized.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Diff two strings line-by-line.
 *
 * @param base     the left / original content (e.g. `currentContent`)
 * @param proposed the right / new content (e.g. `preview.content`)
 */
export function lineDiff(base: string, proposed: string): LineDiffSegment[] {
  const a = splitLines(base);
  const b = splitLines(proposed);

  const segments: LineDiffSegment[] = [];

  // Common prefix.
  let start = 0;
  const minLen = Math.min(a.length, b.length);
  while (start < minLen && a[start] === b[start]) {
    segments.push({ type: "same", text: a[start] });
    start += 1;
  }

  // Common suffix (not overlapping the prefix).
  let endA = a.length;
  let endB = b.length;
  const suffix: LineDiffSegment[] = [];
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    suffix.push({ type: "same", text: a[endA - 1] });
    endA -= 1;
    endB -= 1;
  }
  suffix.reverse();

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  // LCS over the differing middle.
  const m = midA.length;
  const n = midB.length;
  if (m === 0) {
    for (const text of midB) segments.push({ type: "add", text });
  } else if (n === 0) {
    for (const text of midA) segments.push({ type: "del", text });
  } else {
    // dp[i][j] = LCS length of midA[i:] and midB[j:].
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      new Array<number>(n + 1).fill(0),
    );
    for (let i = m - 1; i >= 0; i -= 1) {
      for (let j = n - 1; j >= 0; j -= 1) {
        dp[i][j] =
          midA[i] === midB[j]
            ? dp[i + 1][j + 1] + 1
            : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) {
        segments.push({ type: "same", text: midA[i] });
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        segments.push({ type: "del", text: midA[i] });
        i += 1;
      } else {
        segments.push({ type: "add", text: midB[j] });
        j += 1;
      }
    }
    while (i < m) {
      segments.push({ type: "del", text: midA[i] });
      i += 1;
    }
    while (j < n) {
      segments.push({ type: "add", text: midB[j] });
      j += 1;
    }
  }

  segments.push(...suffix);
  return segments;
}

/** Counts of added / removed lines for a quick summary badge. */
export function diffStats(segments: LineDiffSegment[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const seg of segments) {
    if (seg.type === "add") added += 1;
    else if (seg.type === "del") removed += 1;
  }
  return { added, removed };
}
