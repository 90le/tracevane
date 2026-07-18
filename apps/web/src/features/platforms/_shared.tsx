import * as React from "react";
import { Link } from "react-router-dom";
import { KeyRound, LifeBuoy, RadioTower, ShieldCheck } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import type { BadgeProps } from "@/design/ui/badge";

import type { OpenClawRecoveryStatusPayload, PlatformTone, SystemHealthPayload } from "./types";
import { recoveryTone } from "./usePlatformsAggregate";

const TONE_BADGE: Record<PlatformTone, BadgeProps["variant"]> = { ok: "ok", warn: "warn", bad: "bad", info: "info" };

export function ToneBadge({ tone, children }: { tone: PlatformTone; children: React.ReactNode }) {
  return <Badge variant={TONE_BADGE[tone]}>{children}</Badge>;
}

/** Map a platform tone onto a MetricTile tone ("info" has no metric tint). */
export function metricTone(tone: PlatformTone): "default" | "ok" | "warn" | "bad" {
  return tone === "info" ? "default" : tone;
}

export function EvidenceRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm text-muted">{label}</span>
      <span className="ml-auto min-w-0 truncate text-right text-sm text-ink-strong">{value}</span>
    </div>
  );
}

export function PlatformBreadcrumb({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav aria-label="面包屑" className="text-sm text-muted">
      <ol className="flex min-w-0 flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 && <span className="text-subtle">/</span>}
              {item.to && !isLast ? (
                <Link className="truncate text-muted outline-none transition-colors duration-[var(--dur-1)] hover:text-ink-strong focus-visible:shadow-[var(--ring)]" to={item.to}>{item.label}</Link>
              ) : (
                <span className="truncate text-ink-strong" aria-current={isLast ? "page" : undefined}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function SectionNotice({ tone = "info", children }: { tone?: PlatformTone; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-line bg-panel-2 px-4 py-3 text-sm text-muted">
      <ToneBadge tone={tone}>{tone === "warn" ? "边界" : "说明"}</ToneBadge>
      <span className="ml-2">{children}</span>
    </div>
  );
}

const TRUST_VERDICT: Record<PlatformTone, string> = {
  ok: "宿主可信",
  warn: "需关注",
  bad: "暂不可信",
  info: "评估中",
};

const TRUST_VERDICT_TEXT: Record<PlatformTone, string> = {
  ok: "网关在线、守护运行中；宿主处于可信状态。",
  warn: "部分信任信号需要关注；建议进入诊断页确认细节。",
  bad: "关键信任信号异常；先进入守护页执行诊断与修复。",
  info: "信任证据尚未就绪，正在等待 health / recovery 数据。",
};

/**
 * Host trust banner: answers “宿主可信吗？” with three tone signals — gateway,
 * local helper (recovery daemon) and device pairing. Built only from the light
 * health / recovery payloads, so overview surfaces can show it without pulling
 * full diagnostics; pairing evidence stays one deep-link away in 诊断.
 */
export function HostTrustBanner({
  health,
  recovery,
  note,
  actions,
}: {
  health: SystemHealthPayload | undefined;
  recovery: OpenClawRecoveryStatusPayload | undefined;
  note?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const gatewayUp = health?.gateway === "online" || health?.gatewayConnected === true;
  const daemonRunning = Boolean(recovery?.daemon.pid);
  const gatewayTone: PlatformTone = gatewayUp ? "ok" : health ? "bad" : "info";
  const helperTone: PlatformTone = !recovery ? "info" : !daemonRunning ? "warn" : recoveryTone(recovery.status);
  const tones = [gatewayTone, helperTone];
  const tone: PlatformTone = tones.includes("bad")
    ? "bad"
    : tones.includes("warn")
      ? "warn"
      : tones.every((item) => item === "ok")
        ? "ok"
        : "info";

  const signals: Array<{ key: string; icon: React.ReactNode; label: string; value: string; hint: string; tone: PlatformTone }> = [
    {
      key: "gateway",
      icon: <RadioTower />,
      label: "网关",
      value: gatewayUp ? "在线" : health ? "离线" : "未知",
      hint: health ? `端口 ${health.gatewayPort}` : "等待健康数据",
      tone: gatewayTone,
    },
    {
      key: "helper",
      icon: <LifeBuoy />,
      label: "守护助手",
      value: !recovery ? "未知" : daemonRunning ? (recovery.status ?? "运行中") : "未运行",
      hint: daemonRunning ? `pid ${recovery?.daemon.pid}` : "daemon 未运行",
      tone: helperTone,
    },
    {
      key: "paired",
      icon: <KeyRound />,
      label: "设备配对",
      value: "未检查",
      hint: "配对证据见诊断页",
      tone: "info",
    },
  ];

  return (
    <section className="rounded-md border border-line bg-panel shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary-soft text-primary [&_svg]:size-4"><ShieldCheck /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-md font-semibold text-ink-strong">宿主可信吗？</h2>
            <ToneBadge tone={tone}>{TRUST_VERDICT[tone]}</ToneBadge>
          </div>
          <p className="mt-0.5 text-sm text-muted">{TRUST_VERDICT_TEXT[tone]}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-3">
        {signals.map((signal) => (
          <div key={signal.key} className="flex min-w-0 items-center gap-3 rounded-sm bg-panel-2 px-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-panel-3 text-muted [&_svg]:size-4">{signal.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-2xs font-semibold uppercase tracking-wider text-subtle">{signal.label}</div>
              <div className="mt-0.5 truncate text-sm text-muted">{signal.hint}</div>
            </div>
            <ToneBadge tone={signal.tone}>{signal.value}</ToneBadge>
          </div>
        ))}
      </div>
      {note ? <div className="border-t border-line px-4 py-2.5 text-xs text-subtle">{note}</div> : null}
    </section>
  );
}
