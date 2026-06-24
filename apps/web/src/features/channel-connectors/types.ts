/**
 * Channel Connectors feature types.
 *
 * The wire contract lives in the repo-level `types/channel-connectors.ts` (the
 * same file the backend imports). We re-export the pieces the frontend data
 * layer and views need so they can be imported from
 * `@/features/channel-connectors/types` without reaching across the workspace
 * by relative path everywhere.
 */
export type {
  // Enums / unions
  ChannelConnectorsPhase,
  ChannelConnectorAgentId,
  ChannelConnectorPlatformId,
  ChannelConnectorPermissionMode,
  ChannelConnectorReasoningEffort,
  ChannelConnectorsSupervisorKind,
  ChannelConnectorsDaemonAction,
  // Config / bindings
  ChannelConnectorAgentProfile,
  ChannelConnectorPlatformBinding,
  ChannelConnectorsNativeConfig,
  ChannelConnectorsBindingPolicy,
  // Daemon
  ChannelConnectorsDaemonCommand,
  ChannelConnectorsDaemonCommandResult,
  ChannelConnectorsDaemonManagerStatus,
  ChannelConnectorsDaemonRuntimeConfig,
  ChannelConnectorsDaemonTemplate,
  ChannelConnectorsDaemonPlan,
  // Runtime status
  ChannelConnectorsDaemonRuntimeStatus,
  ChannelConnectorsDaemonRuntimeFeishuConnectionStatus,
  ChannelConnectorsDaemonRuntimePendingAgentRunStatus,
  ChannelConnectorsDaemonRuntimePendingAgentRunRecord,
  ChannelConnectorsDaemonRuntimeAutoCompactRecord,
  // Agent sessions
  ChannelConnectorAgentSessionRuntimeStatus,
  ChannelConnectorAgentSessionDriverBindingStatus,
  ChannelConnectorAgentSessionDriverRuntimeEvent,
  ChannelConnectorAgentSessionDriverRuntimeEventType,
  // Command surface
  ChannelConnectorCommandSurface,
  ChannelConnectorCommandSurfaceSection,
  ChannelConnectorCommandSurfaceAction,
  // Request payloads
  ChannelConnectorsSaveNativeConfigRequest,
  ChannelConnectorsDaemonRequest,
  ChannelConnectorAgentSessionActionRequest,
  ChannelConnectorCommandSurfaceRequest,
  ChannelConnectorCommandActionRequest,
  ChannelConnectorFeishuTransportSmokeRequest,
  ChannelConnectorOctoTransportSmokeRequest,
  // Response payloads
  ChannelConnectorsStatusResponse,
  ChannelConnectorsNativeConfigResponse,
  ChannelConnectorsDaemonConfigResponse,
  ChannelConnectorsDaemonResponse,
  ChannelConnectorsLogsResponse,
  ChannelConnectorAgentSessionDriverStatusResponse,
  ChannelConnectorCommandSurfaceResponse,
  ChannelConnectorCommandActionResponse,
  ChannelConnectorFeishuTransportSmokeResponse,
  ChannelConnectorOctoTransportSmokeResponse,
} from "../../../../../types/channel-connectors";

export {
  CHANNEL_CONNECTORS_DAEMON_SERVICE_NAME,
  CHANNEL_CONNECTOR_AGENT_IDS,
  CHANNEL_CONNECTOR_RUNTIME_AGENT_IDS,
  CHANNEL_CONNECTOR_PLATFORM_IDS,
} from "../../../../../types/channel-connectors";
