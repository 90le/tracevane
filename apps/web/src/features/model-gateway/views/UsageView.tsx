import { ArrowDownToLine, ArrowUpFromLine, Coins, Send } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design/ui/table";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";

import {
  useModelGatewayStatusQuery,
  useModelGatewayUsageQuery,
} from "@/lib/query/model-gateway";
import type { ModelGatewayViewProps } from "./types";

/** Compact number formatter (12_400 → "12.4k", 3_800_000 → "3.8M"). */
function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

/** Latency cell: render evidence or a `-` placeholder when null/missing. */
function latency(ms: number | null | undefined): string {
  if (ms == null) return "-";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

const BAR_COLORS = [
  "var(--primary)",
  "var(--teal)",
  "var(--violet)",
  "var(--amber)",
  "var(--green)",
];

export function UsageView(_props: ModelGatewayViewProps) {
  const usageQuery = useModelGatewayUsageQuery();
  const statusQuery = useModelGatewayStatusQuery();

  if (usageQuery.isLoading) {
    return <LoadingState title="加载用量数据…" />;
  }

  if (usageQuery.error) {
    return (
      <ErrorState
        title="无法加载用量数据"
        description={usageQuery.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => void usageQuery.refetch()}>
            重试
          </Button>
        }
      />
    );
  }

  const usage = usageQuery.data;
  const totals = usage?.totals;
  const models = usage?.models ?? [];

  // Latency comes from the runtime usage summary (status), shown as `-` when absent.
  const latencySummary = statusQuery.data?.runtime.usageSummary.latency;

  const hasUsage = (totals?.requestCount ?? 0) > 0 || models.length > 0;
  const maxRequests = models.reduce((max, m) => Math.max(max, m.requestCount), 0);

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-xl font-semibold text-ink-strong">用量</h2>
        <p className="text-sm text-muted">
          请求、token 与延迟分布，按模型拆分。数据来源于网关用量账本。
        </p>
      </div>

      {/* KPI grid — values from API totals or zero */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          icon={<Send />}
          label="请求"
          value={compact(totals?.requestCount ?? 0)}
        />
        <Kpi icon={<Coins />} label="tokens" value={compact(totals?.totalTokens ?? 0)} />
        <Kpi
          icon={<ArrowDownToLine />}
          label="输入"
          value={compact(totals?.inputTokens ?? 0)}
        />
        <Kpi
          icon={<ArrowUpFromLine />}
          label="输出"
          value={compact(totals?.outputTokens ?? 0)}
        />
      </div>

      {!hasUsage ? (
        <section className="rounded-md border border-line bg-panel shadow-sm">
          <EmptyState
            title="暂无用量记录"
            description="网关尚未记录任何请求。产生流量后，模型用量与延迟分布会显示在这里。"
          />
        </section>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
            {/* Model token / request distribution bars */}
            <section className="rounded-md border border-line bg-panel shadow-sm">
              <div className="border-b border-line px-4 py-3">
                <h3 className="text-md font-semibold text-ink-strong">按模型分布</h3>
                <span className="text-sm text-subtle">请求次数占比</span>
              </div>
              <div className="grid gap-2.5 p-4">
                {models.map((m, idx) => {
                  const pct = maxRequests > 0 ? (m.requestCount / maxRequests) * 100 : 0;
                  return (
                    <div key={m.model} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <i
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: BAR_COLORS[idx % BAR_COLORS.length] }}
                        />
                        <span className="truncate text-sm text-ink">{m.model}</span>
                      </span>
                      <span className="text-sm tabular-nums text-muted">
                        {compact(m.requestCount)}
                      </span>
                      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-panel-3">
                        <i
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(pct, 2)}%`,
                            background: BAR_COLORS[idx % BAR_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Latency distribution — `-` when no evidence */}
            <aside className="rounded-md border border-line bg-panel shadow-sm">
              <div className="border-b border-line px-4 py-3">
                <h3 className="text-md font-semibold text-ink-strong">延迟分布</h3>
                <span className="text-sm text-subtle">全部路由</span>
              </div>
              <div className="grid grid-cols-3 gap-2 p-4">
                <LatCell label="p50" value={latency(latencySummary?.p50Ms)} />
                <LatCell label="p95" value={latency(latencySummary?.p95Ms)} />
                <LatCell label="p99" value={latency(latencySummary?.p99Ms)} />
                <LatCell label="首字节 p95" value={latency(latencySummary?.firstByte.p95Ms)} />
                <LatCell label="平均" value={latency(latencySummary?.averageMs)} />
                <LatCell label="最大" value={latency(latencySummary?.maxMs)} />
              </div>
            </aside>
          </div>

          {/* 模型 / 请求次数 / Token 消耗 table */}
          <section className="grid gap-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>模型</TableHead>
                  <TableHead className="text-right">请求次数</TableHead>
                  <TableHead className="text-right">输入 Token</TableHead>
                  <TableHead className="text-right">输出 Token</TableHead>
                  <TableHead className="text-right">Token 消耗</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((m) => (
                  <TableRow key={m.model}>
                    <TableCell className="font-medium text-ink-strong">{m.model}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted">
                      {compact(m.requestCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted">
                      {compact(m.inputTokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted">
                      {compact(m.outputTokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-ink">
                      {compact(m.totalTokens)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-line bg-panel p-3.5 shadow-sm">
      <span className="flex items-center gap-1.5 text-xs text-subtle [&_svg]:size-3.5">
        {icon}
        {label}
      </span>
      <div className="mt-1.5 text-2xl font-semibold text-ink-strong tabular-nums">{value}</div>
    </div>
  );
}

function LatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("rounded-sm border border-line bg-panel-2 px-3 py-2 text-center")}>
      <span className="block text-xs text-subtle">{label}</span>
      <strong className="block text-md text-ink-strong tabular-nums">{value}</strong>
    </div>
  );
}
