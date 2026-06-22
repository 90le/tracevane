import * as React from "react";
import { KeyRound, RadioTower, Route, Server } from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";
import { ErrorState } from "@/shared/states/ErrorState";
import { Skeleton } from "@/shared/states/Skeleton";

import type { ExternalViewProps } from "./types";
import { Panel, PanelHead, StatTile } from "./_shared";
import { useExternalAggregate } from "./useExternalAggregate";

/**
 * Authorization boundary view. Credentials are NEVER shown in plaintext — only
 * masked counts / risk summaries from the source APIs. All credential writes
 * (OAuth refresh, secret migration, MCP server CRUD) stay in the owning domain.
 */
export function AuthView() {
  const { isLoading, allFailed, error, refetchAll, sources } = useExternalAggregate();

  if (isLoading) {
    return (
      <div className="grid gap-[18px]" role="status" aria-busy="true">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[180px] w-full" />
      </div>
    );
  }

  if (allFailed) {
    return (
      <ErrorState
        title="无法加载授权边界"
        description={error?.message ?? "所有聚合来源均不可用。"}
        action={
          <Button variant="outline" size="sm" onClick={refetchAll}>
            重试
          </Button>
        }
      />
    );
  }

  const skills = sources.skills.data;
  const appConnections = sources.appConnections.data;
  const channel = sources.channelStatus.data;
  const diagnostics = sources.diagnostics.data;

  const configuredSkills = skills?.counts.configured ?? 0;
  const configuredApps =
    appConnections?.connections.filter((c) => c.configured).length ?? 0;
  const feishuConnections = channel?.runtime.feishuConnections ?? 0;

  return (
    <div className="grid gap-[18px]">
      <Panel>
        <PanelHead
          title="授权边界"
          sub="凭据只展示风险摘要，不展示明文。"
          action={<Badge variant="mute">masked</Badge>}
        />
        <div className="grid gap-3 p-3 sm:grid-cols-2">
          <StatTile label="Skill API keys" value={configuredSkills} sub="已配置 skill 密钥项（掩码）" />
          <StatTile label="Gateway client configs" value={configuredApps} sub="已配置 app 目标" />
          <StatTile label="IM bot identity" value={feishuConnections} sub="Feishu 长连接" />
          <StatTile
            label="HTTP bridge"
            value={diagnostics?.config.transport.preferredMode ?? "—"}
            sub={diagnostics?.config.gatewayControlUiBasePath || "本地"}
          />
        </div>
      </Panel>

      <Panel>
        <PanelHead title="凭据归属" sub="每类凭据由对应主域写入与持有。" />
        <div className="py-1.5">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
              <KeyRound />
            </span>
            <span className="grid min-w-0 flex-1">
              <strong className="truncate text-base text-ink-strong">Skill 密钥</strong>
              <span className="truncate text-sm text-muted">
                保存在服务端密钥库 · 平台 / OpenClaw 写入
              </span>
            </span>
            <Badge variant="mute">server-owned</Badge>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
              <Route />
            </span>
            <span className="grid min-w-0 flex-1">
              <strong className="truncate text-base text-ink-strong">Gateway app 凭据</strong>
              <span className="truncate text-sm text-muted">
                apply / rollback 归模型网关确认流
              </span>
            </span>
            <Badge variant="mute">server-owned</Badge>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
              <RadioTower />
            </span>
            <span className="grid min-w-0 flex-1">
              <strong className="truncate text-base text-ink-strong">IM bot 身份</strong>
              <span className="truncate text-sm text-muted">渠道守护进程持有 · IM 渠道写入</span>
            </span>
            <Badge variant="mute">server-owned</Badge>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4">
              <Server />
            </span>
            <span className="grid min-w-0 flex-1">
              <strong className="truncate text-base text-ink-strong">HTTP bridge</strong>
              <span className="truncate text-sm text-muted">
                {diagnostics?.config.gatewayWsUrl || "本地 transport"}
              </span>
            </span>
            <Badge variant="mute">local</Badge>
          </div>
        </div>
      </Panel>

      <p className="rounded-sm border border-line bg-panel-2 p-3 text-sm text-muted">
        如果后续要开放 OAuth 刷新、连接测试、MCP server 增删或 secret 迁移，必须先做后端确认流：掩码预览、影响范围、失败 envelope、回滚 / 撤销路径与审计记录。
      </p>
    </div>
  );
}
