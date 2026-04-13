type SystemText = (zh: string, en: string) => string;

export interface SystemEventCenterSummaryCardRecipe {
  key: "current" | "failures" | "pending" | "recoveries";
  label: string;
}

export interface SystemEventCenterRecipe {
  pageTitle: string;
  pageCopy: string;
  summaryCards: SystemEventCenterSummaryCardRecipe[];
}

export function buildDefaultSystemEventCenterRecipe(
  text: SystemText,
): SystemEventCenterRecipe {
  return {
    pageTitle: text("系统事件中心", "System Event Center"),
    pageCopy: text(
      "Phase 1 提供事件中心壳层：总览、筛选、时间线与详情。",
      "Phase 1 delivers the event center shell: summary, filters, timeline, and details.",
    ),
    summaryCards: [
      { key: "current", label: text("当前事件", "Current Events") },
      { key: "failures", label: text("最近失败", "Recent Failures") },
      { key: "pending", label: text("待处理审计", "Pending Audit") },
      { key: "recoveries", label: text("最近恢复", "Recent Recoveries") },
    ],
  };
}
