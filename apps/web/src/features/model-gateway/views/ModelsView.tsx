import { EmptyState } from "@/shared/states/EmptyState";

import type { ModelGatewayViewProps } from "./types";

/**
 * Cross-provider model catalog view. Stubbed in Phase 6 Group A; filled later.
 */
export function ModelsView(_props: ModelGatewayViewProps) {
  return (
    <EmptyState
      title="建设中（本视图在后续任务实现）"
      description="模型目录与能力/定价检视将在后续阶段接入。"
    />
  );
}
