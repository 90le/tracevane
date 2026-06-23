import * as React from "react";
import { MessageSquare, RefreshCw, Search } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import {
  Panel,
  PanelHead,
  Row,
  ToneBadge,
  formatTime,
  toneIconClass,
} from "@/features/cli-agents/views/_shared";

import type { ApiError } from "@/lib/api/errors";
import type { ChatSessionRow } from "../types";
import { runStateTone, sessionTitle } from "../_shared";

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
    if (!q) return sessions;
    return sessions.filter((s) => {
      const hay = [
        sessionTitle(s),
        s.agentId,
        s.source?.channel ?? "",
        s.lastMessagePreview ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, filter]);

  return (
    <Panel className="flex h-full min-h-0 flex-col">
      <PanelHead
        title="会话"
        sub={`${sessions.length} 个 Agent 会话`}
        action={
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className={cn(isFetching && "animate-spin")} />
            刷新
          </Button>
        }
      />
      <div className="border-b border-line p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="按标题 / 代理 / 渠道筛选"
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
          <div className="grid gap-0.5 p-1">
            {visible.map((s) => {
              const st = runStateTone(s.runtime?.state);
              return (
                <div
                  key={s.key}
                  className={cn(
                    "rounded-sm",
                    s.key === selectedKey && "bg-primary-soft",
                  )}
                >
                  <Row
                    icon={<MessageSquare />}
                    iconClass={toneIconClass(st.tone)}
                    title={sessionTitle(s)}
                    subtitle={`${s.agentId} · ${s.source?.channel ?? "—"} · ${formatTime(s.updatedAt)}`}
                    trailing={<ToneBadge tone={st.tone}>{st.label}</ToneBadge>}
                    onClick={() => onSelect(s.key)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}

export default SessionListView;
