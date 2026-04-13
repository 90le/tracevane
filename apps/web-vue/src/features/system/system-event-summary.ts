import type {
  SystemDiagnosticsPayload,
  SystemStudioReleasePayload,
} from "../../../../../types/system";

type SystemText = (zh: string, en: string) => string;

export interface SystemEventSummaryItem {
  label: string;
  value: string;
}

export function buildSystemEventSummary(params: {
  diagnostics: SystemDiagnosticsPayload | null;
  studioRelease: SystemStudioReleasePayload | null;
  text: SystemText;
}): SystemEventSummaryItem[] {
  const { diagnostics, studioRelease, text } = params;

  return [
    {
      label: text("安全审计", "Security Audit"),
      value: `${diagnostics?.status.securityCritical || 0} critical / ${diagnostics?.status.securityWarn || 0} warn`,
    },
    {
      label: text("Agent / 会话", "Agents / Sessions"),
      value: `${diagnostics?.status.agentCount || 0} / ${diagnostics?.status.sessionCount || 0}`,
    },
    {
      label: text("更新版本", "Latest Version"),
      value:
        studioRelease?.latestVersion ||
        diagnostics?.status.updateLatestVersion ||
        text("未知", "Unknown"),
    },
  ];
}
