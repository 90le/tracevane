import * as React from "react";
import { AlertCircle, FileDiff } from "lucide-react";

import { CodeBlock, MonacoDiffPanel } from "@/shared/diff";
import { languageForPath } from "@/shared/editor-core";
import { getGitDiff } from "@/lib/api/git";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";
import { appendWorkbenchOutput } from "../output";
import type { IdeWorkbenchEditorTab } from "../types";
import type { GitDiffPayload } from "../../../../../../types/git";

export interface GitDiffEditorPanelProps {
  tab: IdeWorkbenchEditorTab;
}

export function GitDiffEditorPanel({ tab }: GitDiffEditorPanelProps) {
  const request = tab.gitDiff;
  const [payload, setPayload] = React.useState<GitDiffPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!request) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getGitDiff({
      rootId: tab.ref.rootId,
      path: request.directoryPath,
      file: request.repoPath,
      previousFile: request.previousPath,
      staged: request.staged,
      untracked: request.untracked,
    }, controller.signal)
      .then((next) => {
        setPayload(next);
        appendWorkbenchOutput({
          channel: { id: "git", label: "Git", kind: "custom" },
          level: next.binary ? "warn" : "info",
          text: `diff ${next.staged ? "staged" : "working"}: ${next.path}${next.binary ? " (binary)" : ""}`,
        });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const message = reason instanceof Error ? reason.message : String(reason);
        setError(message);
        appendWorkbenchOutput({
          channel: { id: "git", label: "Git", kind: "custom" },
          level: "error",
          text: `diff failed: ${request.repoPath}: ${message}`,
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request, tab.ref.rootId]);

  if (!request) {
    return <GitDiffState title="Git diff 请求无效" description="该标签缺少 Git diff metadata。" tone="danger" />;
  }

  const language = languageForPath(payload?.modifiedPath || payload?.originalPath || request.repoPath || tab.ref.path);
  const canRenderMonacoDiff = payload && !payload.binary && payload.originalContent !== null && payload.modifiedContent !== null;

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-canvas" data-ide-git-diff-panel data-ide-git-diff-path={request.rootPath}>
      <div className="border-b border-line bg-panel px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileDiff className="size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink-strong" data-ide-git-diff-title>{tab.title}</div>
            <div className="truncate font-mono text-2xs text-subtle" data-ide-git-diff-repo-path>
              {request.staged ? "staged" : "working tree"} · {request.repoPath}
            </div>
          </div>
          {payload?.truncated || payload?.contentTruncated ? (
            <span className="rounded border border-warning/40 bg-warning-soft px-2 py-0.5 text-2xs font-medium text-warning">已截断</span>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 min-w-0 p-3">
        {loading && !payload ? (
          <GitDiffState title="正在读取 Git diff…" loading />
        ) : error ? (
          <GitDiffState title="无法读取 Git diff" description={error} tone="danger" />
        ) : payload?.binary ? (
          <GitDiffState title="二进制文件不显示文本差异" description={payload.message || "该变更包含二进制内容；当前仅显示文本差异。"} tone="muted" />
        ) : canRenderMonacoDiff ? (
          <MonacoDiffPanel
            original={payload.originalContent ?? ""}
            modified={payload.modifiedContent ?? ""}
            language={language || "plaintext"}
            originalLabel={payload.originalPath ? `HEAD / index · ${payload.originalPath}` : "/dev/null"}
            modifiedLabel={`${payload.staged ? "index" : "working"} · ${payload.modifiedPath || payload.path}`}
            className="h-full"
          />
        ) : payload?.diff ? (
          <div className="h-full min-h-0" data-ide-git-diff-unified>
            <CodeBlock content={payload.diff} label="Unified diff" maxHeightClassName="max-h-full h-full" />
          </div>
        ) : (
          <GitDiffState title="没有可显示的差异" description={payload?.message || "Git 未返回该文件的 diff。"} tone="muted" />
        )}
      </div>
    </div>
  );
}

function GitDiffState({
  title,
  description,
  loading = false,
  tone = "default",
}: {
  title: string;
  description?: string;
  loading?: boolean;
  tone?: "default" | "muted" | "danger";
}) {
  const className = "h-full min-h-0 rounded-lg border border-dashed border-line bg-panel";
  if (loading) {
    return <LoadingState title={title} description={description} className={className} data-ide-git-diff-state />;
  }
  if (tone === "danger") {
    return <ErrorState title={title} description={description} className={className} data-ide-git-diff-state />;
  }
  return <EmptyState icon={<AlertCircle />} title={title} description={description} className={className} data-ide-git-diff-state />;
}
