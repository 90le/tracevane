import * as React from "react";
import { ChevronDown, RefreshCw } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";
import { SkeletonRow } from "@/shared/states/Skeleton";

import { useModelGatewayRuntimeQuery } from "@/lib/query/model-gateway";
import type {
  ModelGatewayRuntimeRequestLogEntry,
  ModelGatewayRuntimeRequestOutcome,
} from "../types";

const OUTCOME_BADGE: Record<
  ModelGatewayRuntimeRequestOutcome,
  { variant: "ok" | "warn" | "bad"; label: string }
> = {
  success: { variant: "ok", label: "成功" },
  failure: { variant: "bad", label: "失败" },
  "adapter-required": { variant: "warn", label: "需适配" },
  "missing-provider": { variant: "warn", label: "无 Provider" },
};

const MAX_ROWS = 6;

/** Compact one-line account-routing summary from live diagnostics only. */
function routingSummary(
  entry: ModelGatewayRuntimeRequestLogEntry,
): string | null {
  const r = entry.accountRouting;
  if (!r) return null;
  const parts: string[] = [];
  if (r.affinityHit) parts.push("粘连命中");
  if (r.selectedAccountId) parts.push(`选用 ${r.selectedAccountId}`);
  if (r.cooldownCount > 0) parts.push(`冷却 ${r.cooldownCount}`);
  if (r.skipped.length > 0) parts.push(`跳过 ${r.skipped.length}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function fmtClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Read-only "recent requests / route diagnostics" panel for the Overview
 * cockpit. Collapsible secondary placement so it never crowds the primary
 * route/health summary. Shows only the last {@link MAX_ROWS} request-log
 * entries from `useModelGatewayRuntimeQuery` — not a full archive.
 */
export function RuntimeDiagnosticsPanel({
  enabled = false,
  onEnable,
}: {
  enabled?: boolean;
  onEnable?: () => void;
}) {
  const runtimeQuery = useModelGatewayRuntimeQuery({ enabled });
  const [openPanel, setOpenPanel] = React.useState(false);

  const entries = runtimeQuery.data?.runtime.requestLog ?? [];
  // requestLog is appended chronologically; show the newest first, capped.
  const recent = [...entries].slice(-MAX_ROWS).reverse();

  return (
    <section className="rounded-md border border-line bg-panel shadow-sm">
      <button
        type="button"
        onClick={() => {
          if (!openPanel) onEnable?.();
          setOpenPanel((v) => !v);
        }}
        aria-expanded={openPanel}
        className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left outline-none transition-colors hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
      >
        <div className="min-w-0">
          <h3 className="text-md font-semibold text-ink-strong">
            最近请求 / 路由诊断
          </h3>
          <span className="text-sm text-subtle">
            {entries.length > 0
              ? `共 ${entries.length} 条 · 显示最近 ${recent.length}`
              : "近期网关请求与账号路由"}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "ml-auto size-4 shrink-0 text-subtle transition-transform",
            openPanel && "rotate-180",
          )}
        />
      </button>

      {openPanel && (
        <div className="grid gap-1.5">
          {!enabled ? (
            <EmptyState
              title="诊断尚未加载"
              description="展开后才读取最近请求，避免模型路由首页首屏被日志请求拖慢。"
            />
          ) : runtimeQuery.isLoading ? (
            <div className="py-1.5">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : runtimeQuery.error ? (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm text-red">
                {runtimeQuery.error.message}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runtimeQuery.refetch()}
              >
                <RefreshCw />
                重试
              </Button>
            </div>
          ) : recent.length === 0 ? (
            <EmptyState
              title="暂无请求记录"
              description="网关尚未处理任何请求。"
            />
          ) : (
            <>
              <ul className="grid gap-px py-1.5">
                {recent.map((entry) => {
                  const badge = OUTCOME_BADGE[entry.outcome];
                  const target = [entry.providerName, entry.routeId]
                    .filter(Boolean)
                    .join(" · ");
                  const routing = routingSummary(entry);
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center gap-3 px-4 py-2"
                    >
                      <span className="grid min-w-0 flex-1">
                        <strong className="truncate text-base text-ink-strong">
                          {entry.model ?? "未知模型"}
                        </strong>
                        <span className="truncate text-sm text-muted">
                          {target || entry.requestedPath}
                          {routing ? (
                            <span className="text-subtle"> · {routing}</span>
                          ) : null}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-xs text-subtle sm:inline">
                        {entry.statusCode ? `${entry.statusCode} · ` : ""}
                        {entry.durationMs}ms
                      </span>
                      <span className="hidden shrink-0 text-xs text-subtle md:inline">
                        {fmtClock(entry.startedAt)}
                      </span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </li>
                  );
                })}
              </ul>
              <div className="flex justify-end px-4 pb-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void runtimeQuery.refetch()}
                  disabled={runtimeQuery.isFetching}
                >
                  <RefreshCw
                    className={cn(runtimeQuery.isFetching && "animate-spin")}
                  />
                  {runtimeQuery.isFetching ? "刷新中…" : "刷新"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
