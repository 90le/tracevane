import * as React from "react";
import { RefreshCw, Search } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { EmptyState } from "@/shared/states/EmptyState";

import { EvidenceRow, Panel, PanelHead, SectionNotice, ToneBadge } from "../_shared";
import type { PlatformTone } from "../types";

export { EvidenceRow, Panel, PanelHead, SectionNotice, ToneBadge };

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function boolText(value: boolean | null | undefined): string {
  if (value == null) return "未知";
  return value ? "是" : "否";
}

export function WorkbenchToolbar({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 border-b border-line bg-panel px-4 py-3 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-semibold text-ink-strong">{title}</h2>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2 md:justify-end">{children}</div> : null}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = "搜索" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm transition-[border-color,box-shadow] duration-[var(--dur-1)] ease-[var(--ease-standard)] focus-within:border-primary-line focus-within:shadow-[var(--ring)] md:max-w-[320px]">
      <Search className="size-4 shrink-0 text-muted" />
      <span className="sr-only">{placeholder}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-ink-strong outline-none placeholder:text-subtle"
      />
    </label>
  );
}

export function StatusPill({ tone, children }: { tone: PlatformTone; children: React.ReactNode }) {
  return <ToneBadge tone={tone}>{children}</ToneBadge>;
}

export function ReadOnlyStrip({ tone = "info", children = "当前只展示真实后端证据；写入能力必须先接入 typed API、确认流、结果证据和回滚/验证路径。" }: { tone?: PlatformTone; children?: React.ReactNode }) {
  return <SectionNotice tone={tone}>{children}</SectionNotice>;
}

export function useSelectedKey(keys: string[]): [string | null, React.Dispatch<React.SetStateAction<string | null>>] {
  const [selectedKey, setSelectedKey] = React.useState<string | null>(keys[0] ?? null);
  const joinedKeys = keys.join("\u001f");
  React.useEffect(() => {
    setSelectedKey((current) => {
      if (current && keys.includes(current)) return current;
      return keys[0] ?? null;
    });
  }, [joinedKeys]);
  return [selectedKey, setSelectedKey];
}

export function SelectableRow({
  id,
  selected,
  onSelect,
  children,
}: {
  id: string;
  selected: boolean;
  onSelect: (id: string) => void;
  children: React.ReactNode;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  };
  return (
    <tr
      tabIndex={0}
      aria-selected={selected}
      onClick={() => onSelect(id)}
      onKeyDown={handleKeyDown}
      className={cn(
        "cursor-pointer outline-none transition-[background-color,box-shadow] duration-[var(--dur-1)] ease-[var(--ease-standard)] hover:bg-panel-2 focus:bg-panel-2 focus-visible:shadow-[var(--ring)]",
        selected && "bg-primary-soft/60 shadow-[inset_2px_0_0_var(--primary)]"
      )}
    >
      {children}
    </tr>
  );
}

export function RefreshButton({ onClick, loading = false }: { onClick: () => void; loading?: boolean }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading}>
      <RefreshCw className={cn("size-4", loading && "animate-spin")} />
      刷新
    </Button>
  );
}

export function ResponsiveTable({
  columns,
  rows,
  empty,
}: {
  columns: string[];
  rows: React.ReactNode[];
  empty: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="border-b border-line bg-panel-2 text-2xs font-semibold uppercase tracking-wider text-subtle">
          <tr>{columns.map((column) => <th key={column} className="px-4 py-2.5 text-left">{column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{rows.length ? rows : <tr><td colSpan={columns.length}>{typeof empty === "string" ? <EmptyState title={empty} /> : empty}</td></tr>}</tbody>
      </table>
    </div>
  );
}

export function DetailRail({ title, subtitle, children, className }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <aside className={cn("min-w-0 rounded-md border border-line bg-panel shadow-sm", className)}>
      <div className="border-b border-line px-4 py-3">
        <h3 className="truncate text-md font-semibold text-ink-strong">{title}</h3>
        {subtitle ? <div className="mt-0.5 text-sm text-muted">{subtitle}</div> : null}
      </div>
      <div className="py-1.5">{children}</div>
    </aside>
  );
}

export function statusTone(status: string | undefined): PlatformTone {
  const value = (status ?? "").toLowerCase();
  if (["ready", "ok", "enabled", "healthy", "success", "online", "active", "fresh"].some((item) => value.includes(item))) return "ok";
  if (["blocked", "failed", "error", "critical", "offline"].some((item) => value.includes(item))) return "bad";
  if (["warn", "setup", "pending", "stale", "disabled", "missing"].some((item) => value.includes(item))) return "warn";
  return "info";
}

export function BoundaryBadge() {
  return <Badge variant="mute">read-only</Badge>;
}
