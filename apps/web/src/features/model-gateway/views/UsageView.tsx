import * as React from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Coins,
  Gauge,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { PageHeader } from "@/design/ui/page-header";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

import { useModelGatewayUsageQuery } from "@/lib/query/model-gateway";
import {
  GatewayMetricCard,
  ModelLogo,
  ProviderPill,
  type GatewayComparison,
} from "./GatewayUi";
import type { ModelGatewayViewProps } from "./types";

type UsageSortKey = "requests" | "total" | "input" | "output";
type UsageRange = "week" | "all" | "custom";

type UsageMetricRow = {
  model: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type UsageDailyRow = {
  date: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type UsageDateQuery = {
  range: UsageRange;
  dateFrom: string | null;
  dateTo: string | null;
};

type UsageComparison = GatewayComparison;

const SORT_OPTIONS: Array<{ key: UsageSortKey; label: string }> = [
  { key: "requests", label: "次数" },
  { key: "total", label: "总 token" },
  { key: "input", label: "输入" },
  { key: "output", label: "输出" },
];

const RANGE_OPTIONS: Array<{ key: UsageRange; label: string }> = [
  { key: "week", label: "最近一周" },
  { key: "all", label: "全部" },
  { key: "custom", label: "指定日期" },
];

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function numberText(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

function percent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function metricValue(row: UsageMetricRow, sortKey: UsageSortKey): number {
  if (sortKey === "requests") return row.requestCount;
  if (sortKey === "input") return row.inputTokens;
  if (sortKey === "output") return row.outputTokens;
  return row.totalTokens;
}

function dateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function dateKey(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function inclusiveDayCount(dateFrom: string, dateTo: string): number {
  const start = parseDateKey(dateFrom);
  const end = parseDateKey(dateTo);
  if (!start || !end || start > end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function dateKeysBetween(dateFrom: string | null | undefined, dateTo: string | null | undefined): string[] {
  if (!dateFrom || !dateTo) return [];
  const start = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const keys: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && keys.length < 45) {
    const year = cursor.getFullYear();
    const month = `${cursor.getMonth() + 1}`.padStart(2, "0");
    const day = `${cursor.getDate()}`.padStart(2, "0");
    keys.push(`${year}-${month}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function fillDailyRows(
  rows: UsageDailyRow[],
  query: { range: UsageRange; dateFrom: string | null; dateTo: string | null } | undefined,
): UsageDailyRow[] {
  if (!query || query.range === "all") return rows;
  const known = new Map(rows.map((row) => [row.date, row]));
  const keys = dateKeysBetween(query.dateFrom, query.dateTo);
  if (!keys.length) return rows;
  return keys.map((date) => known.get(date) || {
    date,
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  });
}

function rangeLabel(query: UsageDateQuery | undefined): string {
  if (!query) return "最近一周";
  if (query.range === "all") return "全部历史";
  if (query.range === "custom") {
    if (query.dateFrom && query.dateTo) return `${query.dateFrom} - ${query.dateTo}`;
    return "指定日期";
  }
  return `${query.dateFrom || "-"} - ${query.dateTo || "-"}`;
}

function comparisonWindow(query: UsageDateQuery | undefined): { dateFrom: string; dateTo: string; label: string } | null {
  if (!query || query.range === "all" || !query.dateFrom || !query.dateTo) return null;
  const days = inclusiveDayCount(query.dateFrom, query.dateTo);
  const start = parseDateKey(query.dateFrom);
  if (!start || days <= 0) return null;
  const previousTo = addDays(start, -1);
  const previousFrom = addDays(previousTo, -(days - 1));
  return {
    dateFrom: dateKey(previousFrom),
    dateTo: dateKey(previousTo),
    label: query.range === "week" && days === 7 ? "较前一周" : "较上期",
  };
}

function compareUsage(current: number, previous: number | null | undefined, label: string | null): UsageComparison {
  if (!label || previous == null) {
    return { label: "等待对比", tone: "muted", direction: "flat" };
  }
  if (previous <= 0) {
    if (current <= 0) return { label: `${label} 持平`, tone: "muted", direction: "flat" };
    return { label: `${label} 新增`, tone: "warn", direction: "up" };
  }
  const change = (current - previous) / previous;
  if (Math.abs(change) < 0.005) return { label: `${label} 持平`, tone: "muted", direction: "flat" };
  return {
    label: `${label} ${Math.round(Math.abs(change) * 100)}%`,
    tone: change < 0 ? "good" : "warn",
    direction: change < 0 ? "down" : "up",
  };
}

export function UsageView(_props: ModelGatewayViewProps) {
  const [sortKey, setSortKey] = React.useState<UsageSortKey>("total");
  const [usageRange, setUsageRange] = React.useState<UsageRange>("week");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const usageQuery = useModelGatewayUsageQuery({
    range: usageRange,
    dateFrom: usageRange === "custom" ? dateFrom || null : null,
    dateTo: usageRange === "custom" ? dateTo || null : null,
  });

  const usage = usageQuery.data;
  const previousWindow = React.useMemo(() => comparisonWindow(usage?.query), [usage?.query]);
  const previousUsageQuery = useModelGatewayUsageQuery(
    {
      range: "custom",
      dateFrom: previousWindow?.dateFrom ?? null,
      dateTo: previousWindow?.dateTo ?? null,
    },
    { enabled: Boolean(previousWindow) },
  );
  const totals = usage?.totals;
  const previousTotals = previousUsageQuery.data?.totals;
  const models = usage?.models ?? [];
  const daily = fillDailyRows(usage?.daily ?? [], usage?.query);
  const chartRows = React.useMemo(() => (
    models
      .map((model) => ({
        ...model,
        totalTokens: model.totalTokens ?? model.inputTokens + model.outputTokens,
      }))
      .sort((left, right) => (
        metricValue(right, sortKey) - metricValue(left, sortKey)
        || right.requestCount - left.requestCount
        || right.totalTokens - left.totalTokens
        || left.model.localeCompare(right.model)
      ))
  ), [models, sortKey]);
  const maxMetric = chartRows.reduce((max, row) => Math.max(max, metricValue(row, sortKey)), 0);
  const maxDailyTokens = daily.reduce((max, row) => Math.max(max, row.totalTokens), 0);
  const hasUsage = (totals?.requestCount ?? 0) > 0 || models.length > 0 || daily.some((row) => row.requestCount > 0);
  const inputShare = totals && totals.totalTokens > 0 ? totals.inputTokens / totals.totalTokens : 0;
  const outputShare = totals && totals.totalTokens > 0 ? totals.outputTokens / totals.totalTokens : 0;
  const largestModelTokens = chartRows[0]?.totalTokens ?? 0;
  const largestModelShare = totals && totals.totalTokens > 0 ? largestModelTokens / totals.totalTokens : 0;
  const comparisonLabel = previousWindow?.label ?? null;
  const requestCompare = compareUsage(totals?.requestCount ?? 0, previousTotals?.requestCount, comparisonLabel);
  const totalCompare = compareUsage(totals?.totalTokens ?? 0, previousTotals?.totalTokens, comparisonLabel);
  const inputCompare = compareUsage(totals?.inputTokens ?? 0, previousTotals?.inputTokens, comparisonLabel);
  const outputCompare = compareUsage(totals?.outputTokens ?? 0, previousTotals?.outputTokens, comparisonLabel);

  if (usageQuery.isLoading) {
    return (
      <div className="grid gap-4" role="status" aria-busy="true">
        <div className="rounded-md border border-line bg-panel p-4 shadow-sm">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-2 h-4 w-2/3" />
        </div>
        <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-[104px]" />
          <Skeleton className="h-[104px]" />
          <Skeleton className="h-[104px]" />
          <Skeleton className="h-[104px]" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
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

  return (
    <div className="grid gap-4">
      <PageHeader
        className="px-0"
        title="用量"
        description="模型路由的请求与 token 账本。优先采信 provider usage；缺失时自动估算输入和输出，确保每次请求都进入账本。"
        meta={
          <>
            <Badge variant="ok" className="gap-1.5">
              <ShieldCheck className="size-3.5" />
              统计完整
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <CalendarDays className="size-3.5" />
              {rangeLabel(usage?.query)}
            </Badge>
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="size-3.5 text-success" />
              已入账 {numberText(totals?.requestCount ?? 0)} 次
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="size-3.5 text-primary" />
              本地估算兜底已启用
            </span>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-1 rounded-md border border-line bg-panel-2 p-1" aria-label="日期范围">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={usageRange === option.key}
                className={[
                  "h-8 rounded-sm px-2.5 text-xs font-medium transition-colors",
                  usageRange === option.key
                    ? "bg-primary text-primary-ink shadow-sm"
                    : "text-muted hover:bg-panel-3 hover:text-ink",
                ].join(" ")}
                onClick={() => {
                  setUsageRange(option.key);
                  if (option.key !== "custom") {
                    setDateFrom("");
                    setDateTo("");
                  }
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      {usageRange === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs text-subtle">
            开始日期
            <input
              type="date"
              value={dateFrom}
              className="h-9 rounded-md border border-line bg-panel-2 px-2.5 text-sm text-ink outline-none focus:border-primary"
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs text-subtle">
            结束日期
            <input
              type="date"
              value={dateTo}
              className="h-9 rounded-md border border-line bg-panel-2 px-2.5 text-sm text-ink outline-none focus:border-primary"
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
          {(dateFrom || dateTo) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              <X className="size-3.5" />
              清除
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
        <GatewayMetricCard
          icon={<Send />}
          tone="primary"
          label="请求次数"
          value={numberText(totals?.requestCount ?? 0)}
          sub={`${rangeLabel(usage?.query)} · 已入账`}
          accent={`${numberText(totals?.requestCount ?? 0)} 次`}
          comparison={requestCompare}
        />
        <GatewayMetricCard
          icon={<Coins />}
          tone="violet"
          label="总 token"
          value={numberText(totals?.totalTokens ?? 0)}
          sub={`最大模型占比 ${percent(largestModelShare)}`}
          accent={percent(largestModelShare)}
          comparison={totalCompare}
        />
        <GatewayMetricCard
          icon={<ArrowDownToLine />}
          tone="primary"
          label="输入消耗"
          value={numberText(totals?.inputTokens ?? 0)}
          sub={`输入占比 ${percent(inputShare)}`}
          accent={percent(inputShare)}
          meter={inputShare}
          comparison={inputCompare}
        />
        <GatewayMetricCard
          icon={<ArrowUpFromLine />}
          tone="teal"
          label="输出消耗"
          value={numberText(totals?.outputTokens ?? 0)}
          sub={`输出占比 ${percent(outputShare)}`}
          accent={percent(outputShare)}
          meter={outputShare}
          comparison={outputCompare}
        />
      </div>

      {!hasUsage ? (
        <section className="rounded-md border border-line bg-panel shadow-sm">
          <EmptyState
            title="暂无用量记录"
            description="当前日期范围内没有请求记录。产生流量或调整筛选后，请求次数和 token 消耗会显示在这里。"
          />
        </section>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
            <ModelRankingPanel
              rows={chartRows}
              sortKey={sortKey}
              setSortKey={setSortKey}
              maxMetric={maxMetric}
              totalTokens={totals?.totalTokens ?? 0}
            />
            <DailyTrendPanel
              rows={daily}
              maxTokens={maxDailyTokens}
              queryLabel={rangeLabel(usage?.query)}
            />
          </div>
          <MeteringPanel
            requestCount={totals?.requestCount ?? 0}
            queryLabel={rangeLabel(usage?.query)}
            modelCount={models.length}
          />
        </>
      )}
    </div>
  );
}

function ModelRankingPanel({
  rows,
  sortKey,
  setSortKey,
  maxMetric,
  totalTokens,
}: {
  rows: UsageMetricRow[];
  sortKey: UsageSortKey;
  setSortKey: (key: UsageSortKey) => void;
  maxMetric: number;
  totalTokens: number;
}) {
  return (
    <section className="grid min-w-0 gap-3 rounded-md border border-line bg-panel p-4 shadow-sm">
      <div className="flex flex-col gap-3 min-[760px]:flex-row min-[760px]:items-start min-[760px]:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-md font-semibold text-ink-strong">
            <BarChart3 className="size-4 text-primary" />
            模型排行
          </h3>
          <p className="text-sm text-muted">按当前指标降序排列，条形按输入/输出拆分。</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-md border border-line bg-panel-2 p-1" aria-label="用量排序">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={sortKey === option.key}
              className={[
                "h-8 rounded-sm px-2.5 text-xs font-medium transition-colors",
                sortKey === option.key
                  ? "bg-primary text-primary-ink shadow-sm"
                  : "text-muted hover:bg-panel-3 hover:text-ink",
              ].join(" ")}
              onClick={() => setSortKey(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden grid-cols-[minmax(130px,1fr)_58px_66px_66px_minmax(150px,0.9fr)_52px] gap-2 border-y border-line bg-panel-2/60 px-3 py-2 text-xs font-medium text-subtle min-[900px]:grid">
        <span>模型</span>
        <span className="text-right">次数</span>
        <span className="text-right">输入</span>
        <span className="text-right">输出</span>
        <span>token 分布</span>
        <span className="text-right">占比</span>
      </div>

      <div className="grid gap-2" aria-label="模型用量图表">
        {rows.map((row, index) => (
          <UsageModelRow
            key={row.model}
            row={row}
            rank={index + 1}
            value={metricValue(row, sortKey)}
            maxValue={maxMetric}
            share={totalTokens > 0 ? row.totalTokens / totalTokens : 0}
          />
        ))}
      </div>
    </section>
  );
}

function UsageModelRow({
  row,
  rank,
  value,
  maxValue,
  share,
}: {
  row: UsageMetricRow;
  rank: number;
  value: number;
  maxValue: number;
  share: number;
}) {
  const width = maxValue > 0 ? Math.max(3, (value / maxValue) * 100) : 0;
  return (
    <div className="grid min-w-0 gap-3 rounded-sm border border-line bg-panel-2 p-3 transition-colors hover:border-primary-line hover:bg-[color-mix(in_srgb,var(--primary)_4%,var(--panel-2))] min-[900px]:grid-cols-[minmax(130px,1fr)_58px_66px_66px_minmax(150px,0.9fr)_52px] min-[900px]:gap-2 min-[900px]:items-center">
      <div className="grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2.5">
        <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-semibold tabular-nums text-primary-ink">
          {rank}
        </span>
        <ModelLogo model={row.model} />
        <span className="min-w-0">
          <strong className="block truncate text-sm text-ink-strong" title={row.model}>{row.model}</strong>
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs tabular-nums text-muted">
            <ProviderPill model={row.model} />
            <span>{compact(row.requestCount)} 次 · {compact(row.totalTokens)} total</span>
          </span>
        </span>
      </div>
      <MetricCell value={row.requestCount} />
      <MetricCell value={row.inputTokens} />
      <MetricCell value={row.outputTokens} />
      <StackedTokenBar
        inputTokens={row.inputTokens}
        outputTokens={row.outputTokens}
        totalTokens={row.totalTokens}
        width={width}
      />
      <div className="text-right text-sm font-semibold tabular-nums text-ink-strong">{percent(share)}</div>
    </div>
  );
}

function DailyTrendPanel({
  rows,
  maxTokens,
  queryLabel,
}: {
  rows: UsageDailyRow[];
  maxTokens: number;
  queryLabel: string;
}) {
  const activeRows = rows.filter((row) => row.requestCount > 0);
  return (
    <section className="grid gap-3 rounded-md border border-line bg-panel p-4 shadow-sm">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-md font-semibold text-ink-strong">
          <CalendarDays className="size-4 text-primary" />
          每日趋势
        </h3>
        <p className="text-sm text-muted">{queryLabel} · 输入/输出 token 分布。</p>
      </div>

      <div className="grid min-h-[196px] grid-cols-[auto_minmax(0,1fr)] gap-3">
        <div className="grid content-between py-1 text-right text-xs tabular-nums text-subtle">
          <span>{compact(maxTokens)}</span>
          <span>{compact(Math.round(maxTokens / 2))}</span>
          <span>0</span>
        </div>
        <div className="relative grid grid-cols-[repeat(auto-fit,minmax(26px,1fr))] items-end gap-2 border-l border-b border-line pl-3 pb-2 before:pointer-events-none before:absolute before:inset-x-3 before:top-1/2 before:border-t before:border-dashed before:border-line" aria-label="每日用量图表">
          {rows.map((row) => (
            <DailyBar key={row.date} row={row} maxTokens={maxTokens} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-2 text-xs text-muted">
        <LegendSwatch className="bg-primary" label="输入" />
        <LegendSwatch className="bg-teal" label="输出" />
        <span className="tabular-nums">有请求日期 {numberText(activeRows.length)} 天</span>
      </div>
    </section>
  );
}

function DailyBar({ row, maxTokens }: { row: UsageDailyRow; maxTokens: number }) {
  const height = maxTokens > 0 ? Math.max(row.totalTokens > 0 ? 10 : 3, (row.totalTokens / maxTokens) * 142) : 3;
  const inputShare = row.totalTokens > 0 ? (row.inputTokens / row.totalTokens) * 100 : 0;
  const outputShare = row.totalTokens > 0 ? (row.outputTokens / row.totalTokens) * 100 : 0;
  const showInputLabel = row.inputTokens > 0 && inputShare >= 18;
  const showOutputLabel = row.outputTokens > 0 && outputShare >= 18;
  return (
    <div className="relative z-[1] grid min-w-0 justify-items-center gap-2">
      <div className="flex h-[150px] w-full max-w-9 items-end justify-center">
        <div
          className={[
            "flex w-full max-w-7 flex-col-reverse overflow-hidden rounded-[7px] bg-panel-3 ring-1 ring-line transition-transform",
            row.totalTokens > 0 ? "shadow-sm hover:-translate-y-0.5" : "",
          ].join(" ")}
          title={`${row.date} · ${numberText(row.totalTokens)} tokens · ${numberText(row.requestCount)} 次`}
          style={{ height }}
        >
          <span className="grid w-full place-items-center bg-primary text-[10px] font-semibold tabular-nums text-primary-ink" style={{ height: `${inputShare}%` }}>
            {showInputLabel ? compact(row.inputTokens) : null}
          </span>
          <span className="grid w-full place-items-center bg-teal text-[10px] font-semibold tabular-nums text-white" style={{ height: `${outputShare}%` }}>
            {showOutputLabel ? compact(row.outputTokens) : null}
          </span>
        </div>
      </div>
      <span className="max-w-full truncate text-[10px] tabular-nums text-subtle" title={row.date}>{dateLabel(row.date)}</span>
    </div>
  );
}

function MeteringPanel({
  requestCount,
  queryLabel,
  modelCount,
}: {
  requestCount: number;
  queryLabel: string;
  modelCount: number;
}) {
  return (
    <section className="grid gap-3 rounded-md border border-line bg-panel p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-md font-semibold text-ink-strong">
          <Gauge className="size-4 text-primary" />
          统计口径
        </h3>
        <p className="text-sm text-muted">
          Provider usage 优先入账；无 usage 的成功请求使用本地 token 估算，失败请求保留输入估算、输出记 0。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 text-xs text-muted min-[520px]:grid-cols-3">
        <MeteringChip label="入账请求" value={`${numberText(requestCount)} 次`} />
        <MeteringChip label="覆盖模型" value={`${numberText(modelCount)} 个`} />
        <MeteringChip label="筛选范围" value={queryLabel} />
      </div>
    </section>
  );
}

function StackedTokenBar({
  inputTokens,
  outputTokens,
  totalTokens,
  width,
}: {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  width: number;
}) {
  const inputShare = totalTokens > 0 ? (inputTokens / totalTokens) * 100 : 0;
  const outputShare = totalTokens > 0 ? (outputTokens / totalTokens) * 100 : 0;
  return (
    <div className="min-w-0">
      <div className="h-3 overflow-hidden rounded-full bg-panel-3">
        <div className="flex h-full rounded-full" style={{ width: `${width}%` }}>
          <span className="h-full bg-primary" style={{ width: `${inputShare}%` }} />
          <span className="h-full bg-teal" style={{ width: `${outputShare}%` }} />
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-muted">
        <span>输入 {compact(inputTokens)}</span>
        <span>输出 {compact(outputTokens)}</span>
      </div>
    </div>
  );
}

function MetricCell({ value }: { value: number }) {
  return <div className="hidden text-right text-sm tabular-nums text-ink min-[900px]:block">{compact(value)}</div>;
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function MeteringChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-line bg-panel-2 px-3 py-2">
      <span className="block text-subtle">{label}</span>
      <strong className="mt-0.5 block max-w-[180px] truncate text-sm font-semibold text-ink-strong" title={value}>{value}</strong>
    </div>
  );
}
