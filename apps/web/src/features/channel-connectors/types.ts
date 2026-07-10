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
  ChannelConnectorAccount,
  ChannelConnectorAccountLifecycle,
  ChannelConnectorAccountSecurityPolicy,
  ChannelConnectorAccountSecretsResponse,
  ChannelConnectorDeliveryTarget,
  ChannelConnectorDeliveryPolicy,
  ChannelConnectorDeliverySessionPolicy,
  ChannelConnectorDeliveryAccessPolicy,
  ChannelConnectorDeliveryResolution,
  ChannelConnectorDeliveryResolutionResult,
  ChannelConnectorDeliveryPeerKind,
  ChannelConnectorSourceRule,
  ChannelConnectorIngressRoutingContext,
  ChannelConnectorV3ValidationIssue,
  ChannelConnectorV3RoutingPreviewRequest,
  ChannelConnectorV3RoutingPreviewResponse,
  ChannelConnectorAgentSessionPolicyConfig,
  ChannelConnectorsV3Config,
  ChannelConnectorsV3ConfigResponse,
  ChannelConnectorsV3ConfigPlanRequest,
  ChannelConnectorsV3ConfigPlanResponse,
  ChannelConnectorsV3ConfigApplyRequest,
  ChannelConnectorsV3ConfigApplyResponse,
  ChannelConnectorsV3SemanticDiff,
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
  ChannelConnectorsDaemonRuntimeReplyOutboxStatus,
  ChannelConnectorsDaemonRuntimeReplyOutboxDeadLetter,
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
  ChannelConnectorsDaemonRequest,
  ChannelConnectorAgentSessionActionRequest,
  ChannelConnectorCommandSurfaceRequest,
  ChannelConnectorCommandActionRequest,
  ChannelConnectorFeishuAppRegistrationStartRequest,
  ChannelConnectorFeishuTransportSmokeRequest,
  ChannelConnectorOctoTransportSmokeRequest,
  // Response payloads
  ChannelConnectorsStatusResponse,
  ChannelConnectorFeishuAppRegistrationSessionResponse,
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
  CHANNEL_CONNECTOR_DEFAULT_FEISHU_API_URL,
  CHANNEL_CONNECTOR_DEFAULT_LARK_API_URL,
  CHANNEL_CONNECTOR_DEFAULT_OCTO_API_URL,
} from "../../../../../types/channel-connectors";
