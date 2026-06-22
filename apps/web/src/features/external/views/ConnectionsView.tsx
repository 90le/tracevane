import * as React from "react";
import {
  Activity,
  ExternalLink,
  Globe,
  PlugZap,
  RadioTower,
  Route,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/design/ui/sheet";
import { EmptyState } from "@/shared/states/EmptyState";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton, SkeletonRow } from "@/shared/states/Skeleton";

import type { ExternalConnection, ExternalConnectionKind } from "../types";
import type { ExternalViewProps } from "./types";
import { Panel, PanelHead, Row, ToneBadge, formatTime } from "./_shared";
import { useExternalAggregate } from "./useExternalAggregate";

const KIND_ICON: Record<ExternalConnectionKind, React.ComponentType<{ className?: string }>> = {
  mcp: PlugZap,
  tools: Wrench,
  "app-connection": Route,
  messaging: RadioTower,
  http: Globe,
};

function ConnectionInspector({
  connection,
  onClose,
  onReprobe,
  reprobing,
}: {
  connection: ExternalConnection | null;
  onClose: () => void;
  onReprobe: () => void;
  reprobing: boolean;
}) {
  const [confirmProbe, setConfirmProbe] = React.useState(false);
  React.useEffect(() => setConfirmProbe(false), [connection?.id]);

  const Icon = connection ? KIND_ICON[connection.kind] : PlugZap;
  return (
    <Sheet open={connection != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[460px]">
        {connection && (
          <>
            <SheetHeader>
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-[18px]">
                  <Icon />
                </span>
                <div className="min-w-0">
                  <SheetTitle className="truncate">{connection.title}</SheetTitle>
                  <SheetDescription className="truncate">
                    {connection.kindLabel} · {connection.source}
                  </SheetDescription>
                </div>
              </div>
              <ToneBadge tone={connection.tone}>{connection.status}</ToneBadge>
            </SheetHeader>

            <SheetBody>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-sm border border-line bg-panel-2 p-3">
                  <span className="text-xs text-subtle">能力 / 身份</span>
                  <div className="mt-1 text-base font-semibold text-ink-strong">
                    {connection.summary}
                  </div>
                </div>
                <div className="rounded-sm border border-line bg-panel-2 p-3">
                  <span className="text-xs text-subtle">传输</span>
                  <div className="mt-1 truncate text-base font-semibold text-ink-strong">
                    {connection.transport}
                  </div>
                </div>
              </div>

              <div className="rounded-sm border border-line bg-panel-2 p-3 text-sm text-muted">
                {connection.detail}
              </div>

              {/* Credential reference — redacted, never plaintext. */}
              <div>
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-subtle">
                  凭据引用
                </div>
                <div className="flex items-center justify-between gap-2 rounded-sm border border-line bg-panel-2 px-3 py-2 text-sm">
                  <span className="truncate text-muted">{connection.credentialRef}</span>
                  <Badge variant="mute">masked</Badge>
                </div>
              </div>

              {/* Capabilities (exposed tools / servers / platforms). */}
              {connection.capabilities.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-subtle">
                    暴露能力 · {connection.capabilities.length}
                  </div>
                  <div className="grid gap-1.5">
                    {connection.capabilities.map((cap) => (
                      <div
                        key={cap.name}
                        className="flex items-center gap-2.5 rounded-sm border border-line bg-panel-2 px-3 py-2"
                      >
                        <Wrench className="size-3.5 shrink-0 text-muted" />
                        <span className="grid min-w-0 flex-1">
                          <strong className="truncate text-sm text-ink-strong">{cap.name}</strong>
                          <span className="truncate text-xs text-muted">{cap.detail}</span>
                        </span>
                        <ToneBadge tone={cap.tone}>{cap.tone === "ok" ? "ready" : cap.tone}</ToneBadge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence — raw aggregated facts. */}
              <div>
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-subtle">
                  证据
                </div>
                <dl className="grid gap-px overflow-hidden rounded-sm border border-line bg-line">
                  {connection.evidence.map((ev, index) => (
                    <div
                      key={`${ev.label}-${index}`}
                      className="flex items-baseline gap-3 bg-panel-2 px-3 py-2"
                    >
                      <dt className="w-32 shrink-0 truncate text-xs text-subtle">{ev.label}</dt>
                      <dd className="min-w-0 flex-1 break-all font-mono text-xs text-ink-strong">
                        {ev.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </SheetBody>

            <SheetFooter className="flex-col items-stretch gap-2">
              {/* Safe read-only re-probe behind confirmation. */}
              {confirmProbe ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-muted">重新拉取来源证据？（只读）</span>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmProbe(false)}>
                    取消
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={reprobing}
                    onClick={() => {
                      onReprobe();
                      setConfirmProbe(false);
                    }}
                  >
                    <Activity className="size-3.5" />
                    {reprobing ? "拉取中…" : "确认"}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setConfirmProbe(true)}>
                  <Activity className="size-3.5" />
                  重新探测证据（只读）
                </Button>
              )}

              {/* Deep-link OUT to the owning domain for writes. */}
              {connection.writeLink ? (
                <Button asChild size="sm">
                  <Link to={connection.writeLink.to}>
                    <ExternalLink className="size-3.5" />
                    {connection.writeLink.label}
                  </Link>
                </Button>
              ) : (
                <span className="text-center text-xs text-subtle">本地连接，无外部写入流。</span>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function ConnectionsView({ selectedConnection, goToView }: ExternalViewProps) {
  const { connections, isLoading, allFailed, error, refetchAll, sources } =
    useExternalAggregate();

  const selected = React.useMemo(
    () => connections.find((c) => c.id === selectedConnection) ?? null,
    [connections, selectedConnection],
  );

  const reprobing = Object.values(sources).some((q) => q.isFetching);

  if (isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <section className="rounded-md border border-line bg-panel shadow-sm">
          <Skeleton className="h-12 w-full rounded-b-none" />
          <div className="py-1.5">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        </section>
      </div>
    );
  }

  if (allFailed) {
    return (
      <ErrorState
        title="无法加载连接来源"
        description={error?.message ?? "所有聚合来源均不可用。"}
        action={
          <Button variant="outline" size="sm" onClick={refetchAll}>
            重试
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-[18px]">
      <Panel>
        <PanelHead
          title="连接 / 来源"
          sub="真实 API 聚合，不在此创建新连接。"
          action={<Badge variant="outline">{connections.length} 行</Badge>}
        />
        {connections.length === 0 ? (
          <EmptyState
            title="暂无连接"
            description="当前来源 API 没有返回外部连接证据。"
          />
        ) : (
          <>
            {/* Column header */}
            <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_90px] items-center gap-3 border-b border-line px-4 py-2 text-xs text-subtle">
              <span>连接 / 来源</span>
              <span>类型</span>
              <span>能力</span>
              <span>状态</span>
            </div>
            <div className="py-1">
              {connections.map((c) => {
                const Icon = KIND_ICON[c.kind];
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => goToView("connections", { conn: c.id })}
                    aria-current={selected?.id === c.id ? "true" : undefined}
                    className="grid w-full grid-cols-[minmax(0,1fr)_110px_110px_90px] items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-panel-2 focus-visible:shadow-[var(--ring)] aria-[current]:bg-primary-soft"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
                        <Icon />
                      </span>
                      <span className="grid min-w-0">
                        <strong className="truncate text-base text-ink-strong">{c.title}</strong>
                        <span className="truncate text-sm text-muted">{c.source}</span>
                      </span>
                    </span>
                    <span className="truncate font-mono text-xs text-muted">{c.kindLabel}</span>
                    <span className="truncate font-mono text-xs text-muted">{c.summary}</span>
                    <ToneBadge tone={c.tone}>{c.status}</ToneBadge>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Panel>

      <p className="text-sm text-subtle">
        点击任意连接查看证据、暴露能力与凭据引用；写入动作通过详情里的深链回到对应主域。
      </p>

      <ConnectionInspector
        connection={selected}
        onClose={() => goToView("connections")}
        onReprobe={refetchAll}
        reprobing={reprobing}
      />
    </div>
  );
}
