import type {
  DreamingRemHarnessPayload,
  DreamingSnapshotPayload,
} from '../../../../../types/dreaming';

export type DreamingText = (chinese: string, english: string) => string;

export interface DreamingCurrentEmptyReasonParams {
  snapshot: DreamingSnapshotPayload | null;
  dreamingEnabled: boolean;
  groundedLaneCount: number;
  diaryEntryCount: number;
  remHarnessPreview: DreamingRemHarnessPayload | null;
  text: DreamingText;
}

export interface DreamingRemHarnessSummary {
  stateTone: 'idle' | 'warning' | 'ready';
  stateLabel: string;
  message: string;
  groundedSourcePath: string;
  liveReflectionCount: number;
  liveCandidateTruthCount: number;
  groundedFileCount: number;
}

function normalizePath(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function summarizeDreamingRemHarness(
  preview: DreamingRemHarnessPayload | null,
  text: DreamingText,
): DreamingRemHarnessSummary {
  if (!preview) {
    return {
      stateTone: 'idle',
      stateLabel: text('未预览', 'Not previewed'),
      message: text(
        '还没运行 REM 预览。点一次 Preview REM，Studio 会同时检查 live REM 和 grounded historical replay。',
        'REM preview has not run yet. Click Preview REM to inspect both live REM and grounded historical replay.'
      ),
      groundedSourcePath: '',
      liveReflectionCount: 0,
      liveCandidateTruthCount: 0,
      groundedFileCount: 0,
    };
  }

  const groundedSourcePath = normalizePath(preview.grounded.sourcePath || preview.live.sourcePath);
  if (preview.live.error) {
    return {
      stateTone: 'warning',
      stateLabel: text('Live 预览失败', 'Live preview failed'),
      message: preview.live.error,
      groundedSourcePath,
      liveReflectionCount: 0,
      liveCandidateTruthCount: 0,
      groundedFileCount: 0,
    };
  }

  if (preview.grounded.error) {
    return {
      stateTone: 'warning',
      stateLabel: preview.grounded.error.includes('YYYY-MM-DD.md')
        ? text('Grounded 文件名不兼容', 'Grounded filenames incompatible')
        : text('Grounded 预览失败', 'Grounded preview failed'),
      message: preview.grounded.error,
      groundedSourcePath,
      liveReflectionCount: preview.live.remReflections.length,
      liveCandidateTruthCount: preview.live.remCandidateTruthCount,
      groundedFileCount: 0,
    };
  }

  if (preview.grounded.groundedFiles.length === 0) {
    return {
      stateTone: 'idle',
      stateLabel: text('未提取 grounded 文件', 'No grounded files extracted'),
      message: text(
        '预览已运行，但 grounded replay 还没有产出可渲染的文件。',
        'Preview ran successfully, but grounded replay did not yield any renderable files yet.'
      ),
      groundedSourcePath,
      liveReflectionCount: preview.live.remReflections.length,
      liveCandidateTruthCount: preview.live.remCandidateTruthCount,
      groundedFileCount: 0,
    };
  }

  return {
    stateTone: 'ready',
    stateLabel: text('预览已就绪', 'Preview ready'),
    message: text(
      `Live REM 看到 ${preview.live.remReflections.length} 条反思，grounded replay 命中 ${preview.grounded.groundedFiles.length} 个 historical files。`,
      `Live REM found ${preview.live.remReflections.length} reflections, and grounded replay matched ${preview.grounded.groundedFiles.length} historical files.`
    ),
    groundedSourcePath,
    liveReflectionCount: preview.live.remReflections.length,
    liveCandidateTruthCount: preview.live.remCandidateTruthCount,
    groundedFileCount: preview.grounded.groundedFiles.length,
  };
}

export function deriveDreamingCurrentEmptyReason({
  snapshot,
  dreamingEnabled,
  groundedLaneCount,
  diaryEntryCount,
  remHarnessPreview,
  text,
}: DreamingCurrentEmptyReasonParams): string {
  if (!snapshot?.status) {
    return text(
      '状态还没返回，先点击一次 Refresh State 看 gateway 是否已经回了 dreaming 数据。',
      'Status has not returned yet. Start with Refresh State to verify the gateway is returning dreaming data.'
    );
  }

  if (!dreamingEnabled) {
    return text(
      '当前 Dreaming 是关闭的，所以不会有新的夜间 sweep 或 grounded replay 结果。',
      'Dreaming is currently disabled, so no new nightly sweep or grounded replay results will appear.'
    );
  }

  if (groundedLaneCount > 0 || diaryEntryCount > 0) {
    return '';
  }

  const groundedError = remHarnessPreview?.grounded.error?.trim() || '';
  const groundedSourcePath = normalizePath(remHarnessPreview?.grounded.sourcePath);
  if (groundedError.includes('YYYY-MM-DD.md')) {
    return text(
      `当前不是坏了，而是 grounded historical replay 目录里没有符合 4.9 要求的 YYYY-MM-DD.md 文件${groundedSourcePath ? `：${groundedSourcePath}` : ''}。先修正 daily memory 文件名，再执行 Preview REM 或 Backfill Diary。`,
      `Nothing is broken. The grounded historical replay directory does not contain the YYYY-MM-DD.md files required by 4.9${groundedSourcePath ? ` at ${groundedSourcePath}` : ''}. Fix the daily memory filenames first, then run Preview REM or Backfill Diary again.`
    );
  }

  if (groundedError) {
    return text(
      `当前还没有 grounded replay 数据，最近一次 REM 预览还返回了错误：${groundedError}`,
      `There is no grounded replay data yet, and the latest REM preview also returned an error: ${groundedError}`
    );
  }

  if (!remHarnessPreview) {
    return text(
      '当前不是坏了，而是还没有 grounded replay 数据。先点一次 Preview REM 确认 historical memory 是否可回放，再执行 Backfill Diary。',
      'Nothing is broken right now; there is simply no grounded replay data yet. Run Preview REM first to verify the historical memory can be replayed, then execute Backfill Diary.'
    );
  }

  return text(
    '当前不是坏了，而是还没有 grounded replay 数据。要看到 grounded lane，先执行一次 Backfill Diary；它会扫描工作区里的 historical memory daily files 并写入可回滚的 DREAMS.md 条目。',
    'Nothing is broken right now; there is simply no grounded replay data yet. To populate the grounded lane, run Backfill Diary once. It scans historical memory daily files in the workspace and writes reversible entries into DREAMS.md.'
  );
}
