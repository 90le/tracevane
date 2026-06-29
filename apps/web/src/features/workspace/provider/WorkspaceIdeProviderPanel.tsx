import * as React from "react";
import { ExternalLink, Loader2, MonitorSmartphone, PlugZap, Square } from "lucide-react";

import { Button } from "@/design/ui/button";
import { cn } from "@/design/lib/utils";
import {
  buildWorkspaceIdeProviderProxyUrl,
  type WorkspaceIdeProviderKind,
  type WorkspaceIdeProviderSession,
} from "@/lib/api/workspace-ide";
import {
  useCreateWorkspaceIdeProviderSessionMutation,
  useStopWorkspaceIdeProviderSessionMutation,
  useWorkspaceIdeProviderSessionsQuery,
  useWorkspaceIdeProvidersQuery,
} from "@/lib/query/workspace-ide";

export interface WorkspaceIdeProviderPanelProps {
  className?: string;
  workspaceRoot?: string;
  preferredKind?: WorkspaceIdeProviderKind;
  mobile?: boolean;
}

export function WorkspaceIdeProviderPanel({
  className,
  workspaceRoot,
  preferredKind,
  mobile = false,
}: WorkspaceIdeProviderPanelProps) {
  const providers = useWorkspaceIdeProvidersQuery();
  const sessions = useWorkspaceIdeProviderSessionsQuery({ refetchInterval: 4_000 });
  const createSession = useCreateWorkspaceIdeProviderSessionMutation();
  const stopSession = useStopWorkspaceIdeProviderSessionMutation();

  const providerKind = preferredKind ?? providers.data?.defaultKind ?? "native-workbench";
  const providerSessions = sessions.data?.sessions ?? [];
  const activeSession = React.useMemo(
    () => selectActiveProviderSession(providerSessions, providerKind),
    [providerKind, providerSessions],
  );
  const canLaunchProvider =
    providers.data?.enabled === true && providerKind !== "native-workbench";
  const proxyUrl = activeSession?.status === "ready"
    ? buildWorkspaceIdeProviderProxyUrl(activeSession.id, "/")
    : null;

  return (
    <section
      className={cn(
        "flex h-full min-h-[360px] flex-col overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950 text-slate-100 shadow-2xl",
        className,
      )}
      data-testid="workspace-ide-provider-panel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-950/95 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200">
            <PlugZap className="h-4 w-4" aria-hidden="true" />
            IDE Provider
          </div>
          <p className="mt-1 truncate text-xs text-slate-400">
            Native Workbench 外壳 + OpenVSCode/code-server 能力层 POC
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">
            {providerKind}
          </span>
          <span className={cn(
            "rounded-full px-3 py-1 text-xs font-medium",
            activeSession?.status === "ready"
              ? "bg-emerald-400/15 text-emerald-200"
              : "bg-amber-400/15 text-amber-200",
          )}>
            {activeSession?.status ?? (canLaunchProvider ? "not started" : "native")}
          </span>
        </div>
      </header>

      {mobile ? (
        <div className="border-b border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
          <div className="flex items-start gap-2">
            <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              VS Code Web provider 当前是桌面优先能力层；手机端先保留 Tracevane 任务流、终端、Git 和搜索，不伪装成已完成的完整移动 IDE。
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-3">
        <div className="text-sm text-slate-300">
          {workspaceRoot ? `Workspace: ${workspaceRoot}` : "Workspace root will be resolved by the API."}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!canLaunchProvider || createSession.isPending}
            onClick={() => createSession.mutate({ kind: providerKind, payload: { workspaceRoot } })}
          >
            {createSession.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            启动 Provider
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!activeSession || stopSession.isPending}
            onClick={() => activeSession && stopSession.mutate(activeSession.id)}
          >
            <Square className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            停止
          </Button>
          {proxyUrl ? (
            <Button size="sm" variant="ghost" asChild>
              <a href={proxyUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                新窗口
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-slate-950">
        {proxyUrl ? (
          <iframe
            title="Tracevane IDE provider"
            src={proxyUrl}
            className="h-full min-h-[520px] w-full border-0 bg-white"
            data-testid="workspace-ide-provider-frame"
          />
        ) : (
          <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 text-slate-300">
              <PlugZap className="mx-auto h-10 w-10 text-cyan-200" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold text-slate-100">等待真实 IDE provider</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                这里不是说明文档页。启动 OpenVSCode/code-server provider 后，Tracevane 会通过自己的 HTTP/WebSocket proxy 加载真实 IDE 能力层，并继续保留全局顶栏、AI 接管和审计边界。
              </p>
            </div>
            {providers.error || sessions.error || createSession.error || stopSession.error ? (
              <p className="max-w-xl rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                Provider 操作失败：{String(
                  providers.error?.message ||
                    sessions.error?.message ||
                    createSession.error?.message ||
                    stopSession.error?.message,
                )}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

export function selectActiveProviderSession(
  sessions: WorkspaceIdeProviderSession[],
  kind: WorkspaceIdeProviderKind,
): WorkspaceIdeProviderSession | null {
  const matching = sessions.filter((session) => session.kind === kind);
  return (
    matching.find((session) => session.status === "ready") ||
    matching.find((session) => session.status === "starting") ||
    matching[0] ||
    null
  );
}
