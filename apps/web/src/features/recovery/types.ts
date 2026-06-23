/**
 * Recovery (System Guard) feature types.
 *
 * The wire contract lives in the repo-level `types/openclaw-recovery.ts` (the
 * same file the backend imports). We re-export the pieces the frontend data
 * layer and views need so they can be imported from
 * `@/features/recovery/types` without reaching across the workspace by relative
 * path everywhere. View-model helper types (frontend-only) are added at the
 * bottom.
 */
export type {
  // Enums / unions
  OpenClawRecoverySupervisorKind,
  OpenClawRecoveryDaemonState,
  OpenClawRecoveryStateKind,
  OpenClawRecoveryEventSeverity,
  OpenClawRecoveryEventKind,
  OpenClawRecoveryTrigger,
  OpenClawRecoveryRunAction,
  OpenClawRecoveryDaemonServiceAction,
  // State documents
  OpenClawRecoveryPolicy,
  OpenClawRecoveryDaemonRuntime,
  OpenClawRecoveryProbeSnapshot,
  OpenClawRecoveryCommand,
  OpenClawRecoveryCommandSnapshot,
  OpenClawRecoveryLastRepair,
  OpenClawRecoveryRepairSnapshot,
  OpenClawRecoveryMonitorSnapshot,
  OpenClawRecoveryRuntimeState,
  OpenClawRecoveryState,
  // Events / backups
  OpenClawRecoveryEvent,
  OpenClawRecoveryEventRecord,
  OpenClawRecoveryBackupSummary,
  OpenClawRecoveryBackupRecord,
  OpenClawRecoveryPagination,
  // Daemon service
  OpenClawRecoveryDaemonServiceTemplate,
  OpenClawRecoveryDaemonServiceSnapshot,
  // Request payloads
  OpenClawRecoveryDaemonServiceRequest,
  OpenClawRecoveryRunRequest,
  OpenClawRecoveryRestoreBackupRequest,
  // Response payloads
  OpenClawRecoveryStatusPayload,
  OpenClawRecoveryEventsPayload,
  OpenClawRecoveryBackupsPayload,
  OpenClawRecoveryDaemonServiceResponse,
  OpenClawRecoveryRunResponse,
  OpenClawRecoveryRestoreBackupResponse,
} from "../../../../../types/openclaw-recovery";

export {
  OPENCLAW_RECOVERY_DEFAULT_HOST,
  OPENCLAW_RECOVERY_DEFAULT_PORT,
  OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME,
} from "../../../../../types/openclaw-recovery";

/** The exact `data-view` set for the System Guard console. */
export const RECOVERY_VIEWS = [
  "overview",
  "issues",
  "events",
  "backups",
] as const;

export type RecoveryView = (typeof RECOVERY_VIEWS)[number];

/** Imperative navigation the page passes down so a view can switch sub-views. */
export interface RecoveryViewNavigation {
  goToView: (view: RecoveryView) => void;
}

export type RecoveryViewProps = RecoveryViewNavigation;
