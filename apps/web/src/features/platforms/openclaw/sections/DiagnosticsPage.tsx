import * as React from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, CheckCircle2, ExternalLink, ListChecks } from "lucide-react";
import { Button } from "@/design/ui/button";
import { MetricRail, MetricTile } from "@/design/ui/metric";
import { ErrorState } from "@/shared/states/ErrorState";
import { LoadingState } from "@/shared/states/LoadingState";
import { useSystemDiagnosticsQuery } from "@/lib/query/platform-read";
import { BoundaryBadge, boolText, DetailRail, EvidenceRow, Panel, RefreshButton, ResponsiveTable, SelectableRow, StatusPill, WorkbenchToolbar, useSelectedKey } from "../components";
import { deriveControlUiUrl } from "../../usePlatformsAggregate";

function levelLabel(level: string | undefined): string {
  if (level === "ok") return "正常";
  if (level === "error") return "错误";
  if (level === "warn") return "警告";
  return "未知";
}

function checkTone(level: string | undefined): "ok" | "warn" | "bad" {
  if (level === "ok") return "ok";
  if (level === "error") return "bad";
  return "warn";
}

export function DiagnosticsPage() {
  const [includeCommands, setIncludeCommands] = React.useState(false);
  const diagnostics = useSystemDiagnosticsQuery({ retry: false, staleTime: includeCommands ? 30_000 : 15_000 }, { includeCommands });
  const data = diagnostics.data;
  const controlUiUrl = deriveControlUiUrl(data);
  const commandEntries = Object.entries(data?.commands ?? {});
  const checks = data?.bootstrap?.checks ?? [];
  const problemChecks = checks.filter((check) => check.level !== "ok");
  const visibleChecks = problemChecks.length ? problemChecks : checks;
  const [selectedCheckId, setSelectedCheckId] = useSelectedKey(visibleChecks.map((check) => check.id));
  const selectedCheck = visibleChecks.find((check) => check.id === selectedCheckId) ?? visibleChecks[0];
  if (!data && (diagnostics.isLoading || diagnostics.isPending || diagnostics.isFetching)) {
    return <LoadingState title="正在加载快速诊断摘要" description="慢命令证据不会阻塞首屏。" />;
  }
  if (diagnostics.error) return <ErrorState title="无法加载诊断摘要" description={diagnostics.error.message} action={<Button variant="outline" size="sm" onClick={() => { void diagnostics.refetch(); }}>重试</Button>} />;
  const securityCritical = data?.status?.securityCritical ?? 0;
  const securityWarn = data?.status?.securityWarn ?? 0;
  const bootstrapReady = data?.bootstrap?.ready ?? false;
  const helperPaired = data?.deviceTrust?.helper?.paired ?? false;
  return (
    <div className="grid gap-[18px]">
      <MetricRail>
        <MetricTile label="严重安全项" value={securityCritical} tone={securityCritical > 0 ? "bad" : "default"} hint="需立即处理" icon={<AlertTriangle />} />
        <MetricTile label="安全警告" value={securityWarn} tone={securityWarn > 0 ? "warn" : "default"} hint="建议尽快处理" />
        <MetricTile label="Bootstrap" value={bootstrapReady ? "就绪" : "未就绪"} tone={bootstrapReady ? "ok" : "warn"} hint={`${checks.length} 项检查`} />
        <MetricTile label="设备信任" value={helperPaired ? "已配对" : "未配对"} tone={helperPaired ? "ok" : "warn"} hint={`${data?.deviceTrust?.pending?.length ?? 0} 待处理`} />
      </MetricRail>
      <Panel>
        <WorkbenchToolbar title="诊断检查" description="安全、bootstrap、设备信任和命令证据。诊断页只定位问题，修复进入守护页。">
          <Button variant="outline" size="sm" asChild><Link to="/platforms/openclaw/guard"><Activity />守护修复</Link></Button>
          <Button variant="outline" size="sm" onClick={() => setIncludeCommands(true)} disabled={includeCommands && diagnostics.isFetching}><ListChecks />加载命令证据</Button>
          <Button variant="outline" size="sm" asChild><a href={controlUiUrl ?? "#/platforms/openclaw"} target="_blank" rel="noreferrer"><ExternalLink />OpenClaw 控制台</a></Button>
          <RefreshButton loading={diagnostics.isFetching} onClick={() => { void diagnostics.refetch(); }} />
          <BoundaryBadge />
        </WorkbenchToolbar>
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel-2 px-4 py-2.5 text-sm text-muted">
          {problemChecks.length ? <AlertTriangle className="size-4 text-warning" /> : <CheckCircle2 className="size-4 text-success" />}
          当前显示 {problemChecks.length ? "需关注检查项" : "全部检查项"}；如页面无内容，刷新会重新拉取诊断数据并展示错误状态。
        </div>
        <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 rounded-md border border-line bg-panel">
            <ResponsiveTable
              columns={["检查项", "状态", "说明"]}
              rows={visibleChecks.map((check) => (
                <SelectableRow key={check.id} id={check.id} selected={selectedCheckId === check.id} onSelect={setSelectedCheckId}>
                  <td className="max-w-[320px] px-4 py-3">
                    <div className="truncate font-medium text-ink-strong">{check.label}</div>
                    <div className="truncate text-xs text-muted">{check.id}</div>
                  </td>
                  <td className="px-4 py-3"><StatusPill tone={checkTone(check.level)}>{levelLabel(check.level)}</StatusPill></td>
                  <td className="max-w-[460px] truncate px-4 py-3 text-muted">{check.detail || check.summary || "—"}</td>
                </SelectableRow>
              ))}
              empty="暂无 bootstrap 检查项"
            />
          </div>
          <DetailRail title={selectedCheck?.label ?? "运行时证据"} subtitle={selectedCheck?.detail ?? "Tracevane local HTTP bridge"}>
            <EvidenceRow label="检查状态" value={selectedCheck ? <StatusPill tone={checkTone(selectedCheck.level)}>{levelLabel(selectedCheck.level)}</StatusPill> : "—"} />
            <EvidenceRow label="可自动修复" value={selectedCheck ? boolText(selectedCheck.fixable) : "—"} />
            <EvidenceRow label="PID" value={data?.runtime?.pid ?? "—"} />
            <EvidenceRow label="Node" value={data?.runtime?.nodeVersion ?? "—"} />
            <EvidenceRow label="主机" value={data?.runtime?.hostname ?? "—"} />
            <EvidenceRow label="工作目录" value={data?.runtime?.cwd ?? "—"} />
            <EvidenceRow label="Gateway WS" value={data?.config?.gatewayWsUrl ?? "—"} />
          </DetailRail>
        </div>
      </Panel>

      <Panel>
        <WorkbenchToolbar title="命令证据" description="命令证据按需加载，避免进入诊断页时被 doctor/status 慢命令阻塞。" />
        <ResponsiveTable
          columns={["命令", "结果", "耗时"]}
          rows={commandEntries.map(([key, command]) => (
            <tr key={key}>
              <td className="max-w-[360px] truncate px-4 py-3 font-medium text-ink-strong">{key}</td>
              <td className="px-4 py-3"><StatusPill tone={command.ok ? "ok" : "bad"}>{command.ok ? "正常" : "失败"}</StatusPill></td>
              <td className="px-4 py-3 text-muted">{command.durationMs}ms</td>
            </tr>
          ))}
          empty={includeCommands ? "无命令证据" : "点击上方“加载命令证据”后再运行 doctor/status"}
        />
      </Panel>
    </div>
  );
}
