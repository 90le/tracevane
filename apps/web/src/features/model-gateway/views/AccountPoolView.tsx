import { EmptyState } from "@/shared/states/EmptyState";

import type { ModelGatewayViewProps } from "./types";

/**
 * Account-pool child page (account-backed providers). Stubbed in Phase 6 Group A.
 */
export function AccountPoolView(_props: ModelGatewayViewProps) {
  return (
    <EmptyState
      title="建设中（本视图在后续任务实现）"
      description="账号池轮换、配额与登录将在后续阶段接入。"
    />
  );
}
