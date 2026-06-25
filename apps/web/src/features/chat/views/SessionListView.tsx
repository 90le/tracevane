import * as React from "react";
import { MessageSquare, RefreshCw, Search } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import {
  ToneBadge,
  formatTime,
  toneIconClass,
} from "@/features/cli-agents/views/_shared";

import type { ApiError } from "@/lib/api/errors";
import type { ChatSessionRow } from "../types";
import { runStateTone, sessionTitle, shouldShowRunState } from "../_shared";

/**
 * Left column: the session roster. Organizer folders exist in the bootstrap
 * payload but the workbench presents a flat, searchable list ordered by the
 * organizer's root/folder ordering would require write-organizer support; we
 * keep this read-only and filter client-side. Selecting a session drives the
 * `?session=` deep-link.
 */
export function SessionListView({
  sessions,
  selectedKey,
  isLoading,
  isFetching,
  error,
  onSelect,
  onRefresh,
}: {
  sessions: ChatSessionRow[];
  selectedKey: string | null;
  isLoading: boolean;
  isFetching: boolean;
  error: ApiError | null;
  onSelect: (key: string) => void;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = React.useState("");

  const visible = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    const ordered = [...sessions].sort((a, b) => {
      const aUnknown = a.runtime?.state === "unknown" ? 1 : 0;
      const bUnknown = b.runtime?.state === "unknown" ? 1 : 0;
      const aArchived = a.presentation?.archived ? 1 : 0;
      const bArchived = b.presentation?.archived ? 1 : 0;
      const aWritable = a.permissions?.canSend ? 0 : 1;
      const bWritable = b.permissions?.canSend ? 0 : 1;
      return (
        aArchived - bArchived || aUnknown - bUnknown || aWritable - bWritable
      );
    });
    if (!q) return ordered;
    return ordered.filter((s) => {
      const hay = [
        sessionTitle(s),
        s.agentId,
        s.source?.originLabel ?? "",
        s.source?.surface ?? "",
        s.source?.channel ?? "",
        s.lastMessagePreview ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, filter]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel">
      <div className="grid gap-2 border-b border-line p-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-md font-semibold text-ink-strong">
              Agent 会话
            </h3>
            <span className="block truncate text-xs text-subtle">
              {sessions.length} 个会话
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            title="刷新会话"
          >
            <RefreshCw className={cn(isFetching && "animate-spin")} />
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜索会话 / Agent / 来源"
            className="pl-8"
            aria-label="筛选会话"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-2">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : error ? (
          <ErrorState
            title="无法加载会话"
            description={error.message}
            action={
              <Button variant="outline" size="sm" onClick={onRefresh}>
                重试
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<MessageSquare />}
            title={sessions.length === 0 ? "暂无会话" : "无匹配会话"}
            description={
              sessions.length === 0
                ? "Tracevane Agent 会话会在出现后显示在这里。"
                : "调整筛选条件以查看更多会话。"
            }
          />
        ) : (
          <div className="grid gap-px p-1">
            {visible.map((s) => {
              const st = runStateTone(s.runtime?.state);
              const source =
                s.source?.originLabel ||
                s.source?.surface ||
                s.source?.channel ||
                "本地";
              const preview =
                s.lastMessagePreview?.trim() ||
                (s.kind === "observed_external"
                  ? "外部观察会话"
                  : "暂无最近消息");
              const showState = shouldShowRunState(s.runtime?.state);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onSelect(s.key)}
                  className={cn(
                    "flex min-w-0 items-center gap-3 rounded-sm px-3 py-2.5 text-left outline-none transition-colors hover:bg-panel-2 focus-visible:shadow-[var(--ring)]",
                    s.key === selectedKey && "bg-primary-soft",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-md [&_svg]:size-4",
                      toneIconClass(st.tone),
                    )}
                  >
                    <MessageSquare />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <strong className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-strong">
                        {sessionTitle(s)}
                      </strong>
                      <span className="shrink-0 text-xs text-subtle">
                        {formatTime(s.updatedAt)}
                      </span>
                    </span>
                    <span className="truncate text-xs text-muted">
                      {preview}
                    </span>
                    <span className="truncate text-2xs text-subtle">
                      {s.agentId} · {source}
                    </span>
                  </span>
                  {showState && (
                    <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default SessionListView;
