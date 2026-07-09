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
  ChannelConnectorRuntimeAgentId,
  ChannelConnectorRuntimeAgentMetadata,
  ChannelConnectorPlatformId,
  ChannelConnectorPermissionMode,
  ChannelConnectorFeishuAppRegistrationTenant,
  ChannelConnectorFeishuAppRegistrationStatus,
  ChannelConnectorBusyStrategy,
  ChannelConnectorReasoningEffort,
  ChannelConnectorsSupervisorKind,
  ChannelConnectorsDaemonAction,
  // Config / bindings
  ChannelConnectorAgentProfile,
  ChannelConnectorPlatformBinding,
  ChannelConnectorAgentSessionPolicyConfig,
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
  ChannelConnectorAgentSessionControlStatus,
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
  ChannelConnectorFeishuAppRegistrationStartRequest,
  ChannelConnectorFeishuTransportSmokeRequest,
  ChannelConnectorOctoTransportSmokeRequest,
  // Response payloads
  ChannelConnectorsStatusResponse,
  ChannelConnectorBindingSecretsResponse,
  ChannelConnectorFeishuAppRegistrationSessionResponse,
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
  CHANNEL_CONNECTOR_RUNTIME_AGENT_METADATA,
  CHANNEL_CONNECTOR_PLATFORM_IDS,
} from "../../../../../types/channel-connectors";
