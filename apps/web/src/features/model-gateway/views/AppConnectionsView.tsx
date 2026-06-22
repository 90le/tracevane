import { EmptyState } from "@/shared/states/EmptyState";

import type { ModelGatewayViewProps } from "./types";

/**
 * Client App Connection child page. Stubbed in Phase 6 Group A; filled later.
 * The `selectedApp` prop carries the `?app=<cli>` deep-link target so the later
 * implementation can focus a specific connection.
 */
export function AppConnectionsView(_props: ModelGatewayViewProps) {
  return (
    <EmptyState
      title="建设中（本视图在后续任务实现）"
      description="客户端接入（应用/回滚网关路由）将在后续阶段接入。"
    />
  );
}
