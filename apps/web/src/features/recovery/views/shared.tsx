import * as React from "react";

import { cn } from "@/design/lib/utils";

import type {
  OpenClawRecoveryCommandSnapshot,
  OpenClawRecoveryEventSeverity,
  OpenClawRecoveryStateKind,
} from "../types";

/** Panel shell matching the prototype `.panel` block. */
export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-md border border-line bg-panel shadow-sm", className)}>
      {children}
    </section>
  );
}

export function PanelHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h3 className="text-md font-semibold text-ink-strong">{title}</h3>
        {sub && <span className="text-sm text-subtle">{sub}</span>}
      </div>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}

/** A single icon + two-line copy + trailing slot row (prototype `.route-row`). */
export function Row({
  icon,
  iconClass,
  title,
  subtitle,
  trailing,
}: {
  icon: React.ReactNode;
  iconClass?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4",
          iconClass,
        )}
      >
        {icon}
      </span>
      <span className="grid min-w-0 flex-1">
        <strong className="truncate text-base text-ink-strong">{title}</strong>
        {subtitle && <span className="truncate text-sm text-muted">{subtitle}</span>}
      </span>
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  );
}

export type BadgeVariant = "ok" | "warn" | "bad" | "mute" | "info";

/** Recovery state → badge. Built only from the live `status` field. */
export const RECOVERY_STATE_BADGE: Record<
  OpenClawRecoveryStateKind,
  { variant: BadgeVariant; label: string }
> = {
  healthy: { variant: "ok", label: "健康" },
  degraded: { variant: "warn", label: "降级" },
  repairing: { variant: "warn", label: "修复中" },
  failed: { variant: "bad", label: "失败" },
  unknown: { variant: "mute", label: "未知" },
};

/** Event severity → badge variant. */
export const EVENT_SEVERITY_BADGE: Record<
  OpenClawRecoveryEventSeverity,
  { variant: BadgeVariant; label: string }
> = {
  success: { variant: "ok", label: "成功" },
  info: { variant: "info", label: "信息" },
  warning: { variant: "warn", label: "警告" },
  error: { variant: "bad", label: "错误" },
};

// ---------------------------------------------------------------------------
// Formatting helpers (mirrors the old page; no fabrication, only live fields).
// ---------------------------------------------------------------------------

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function formatDuration(ms: number | null | undefined): string {
  const value = typeof ms === "number" && Number.isFinite(ms) ? ms : 0;
  if (value <= 0) return "0s";
  if (value >= 60_000) return `${Math.round(value / 60_000)}m`;
  if (value >= 1000) return `${Math.round(value / 1000)}s`;
  return `${Math.round(value)}ms`;
}

export function formatBytes(value: number | null | undefined): string {
  const bytes = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (bytes <= 0) return "0 B";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function reachabilityLabel(value: boolean | null): string {
  if (value === true) return "可达";
  if (value === false) return "不可达";
  return "未知";
}

/**
 * Command evidence block — renders the commands a guarded `run` / lifecycle
 * action actually executed, with their ok/exit/stdout/stderr. This is the
 * load-bearing "evidence" surface: never fabricated, always the real
 * server-returned command log.
 */
export function CommandEvidence({
  commands,
  changedKeys,
  backupPath,
}: {
  commands: OpenClawRecoveryCommandSnapshot[];
  changedKeys?: string[];
  backupPath?: string | null;
}) {
  if (commands.length === 0 && (!changedKeys || changedKeys.length === 0) && !backupPath) {
    return (
      <p className="text-sm text-muted">该动作未返回命令记录。</p>
    );
  }
  return (
    <div className="grid gap-2">
      {backupPath && (
        <p className="text-sm text-muted">
          <span className="text-subtle">已先备份当前配置：</span>
          <code className="break-all font-mono text-xs text-ink-strong">{backupPath}</code>
        </p>
      )}
      {changedKeys && changedKeys.length > 0 && (
        <p className="text-sm text-muted">
          <span className="text-subtle">变更项：</span>
          {changedKeys.join(", ")}
        </p>
      )}
      {commands.map((cmd, index) => (
        <div
          key={`${cmd.command}-${index}`}
          className="grid gap-1 rounded-sm border border-line bg-panel-2 p-3"
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-[9px] py-[3px] text-xs font-semibold",
                cmd.ok ? "bg-green-soft text-green" : "bg-red-soft text-red",
              )}
            >
              {cmd.ok ? "成功" : "失败"}
            </span>
            <span className="truncate text-sm text-ink-strong">{cmd.label}</span>
            <span className="ml-auto shrink-0 text-xs text-subtle">
              exit {cmd.status ?? "?"} · {formatDuration(cmd.durationMs)}
            </span>
          </div>
          <code className="block break-all font-mono text-xs text-muted">
            {cmd.command} {cmd.args.join(" ")}
          </code>
          {(cmd.stdout || cmd.stderr || cmd.error) && (
            <code className="block max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-panel-3 px-2 py-1 font-mono text-xs text-muted">
              {(cmd.stdout || cmd.stderr || cmd.error).trim() || "(无输出)"}
            </code>
          )}
        </div>
      ))}
    </div>
  );
}

/** Prev / next pager driven by the server pagination payload. */
export function Pager({
  page,
  totalPages,
  totalEntries,
  hasPreviousPage,
  hasNextPage,
  onPrev,
  onNext,
  pending,
}: {
  page: number;
  totalPages: number;
  totalEntries: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onPrev: () => void;
  onNext: () => void;
  pending?: boolean;
}) {
  if (totalEntries === 0) return null;
  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-2.5 text-sm">
      <span className="text-muted">
        第 {page} / {Math.max(totalPages, 1)} 页 · 共 {totalEntries} 条
      </span>
      <div className="ml-auto flex gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPreviousPage || pending}
          className="rounded-sm border border-line px-2.5 py-1 text-muted outline-none transition-colors hover:bg-panel-2 hover:text-ink focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          上一页
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNextPage || pending}
          className="rounded-sm border border-line px-2.5 py-1 text-muted outline-none transition-colors hover:bg-panel-2 hover:text-ink focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
