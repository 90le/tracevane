/**
 * Model Gateway feature types.
 *
 * The wire contract lives in the repo-level `types/model-gateway.ts` (the same
 * file the backend imports). We re-export the pieces the frontend data layer
 * and views need so they can be imported from `@/features/model-gateway/types`
 * without reaching across the workspace by relative path everywhere. View-model
 * helper types (frontend-only) are added at the bottom.
 */
export type {
  // Enums / unions
  ModelGatewayAppScope,
  ModelGatewayAppConnectionId,
  ModelGatewayProviderCategory,
  ModelGatewayProviderSourceType,
  ModelGatewayAccountProviderKind,
  ModelGatewayAccountCredentialSource,
  ModelGatewayAccountState,
  ModelGatewayAccountRoutingStrategy,
  ModelGatewayApiFormat,
  ModelGatewayAuthStrategy,
  ModelGatewayReasoningThinkingParam,
  ModelGatewayReasoningEffortParam,
  ModelGatewayReasoningEffortValueMode,
  ModelGatewayReasoningOutputFormat,
  ModelGatewayRouteId,
  ModelGatewayRouteMode,
  ModelGatewayCircuitState,
  ModelGatewayActiveRouteState,
  ModelGatewaySupervisorKind,
  ModelGatewayLocalDaemonState,
  ModelGatewayRuntimeHostMode,
  ModelGatewayDaemonImplementationStatus,
  ModelGatewayDaemonServiceAction,
  ModelGatewayDaemonBootstrapMode,
  ModelGatewayRuntimeRequestKind,
  ModelGatewayRuntimeRequestOutcome,
  // Provider domain
  ModelGatewayProviderModel,
  ModelGatewayProviderModelPricing,
  ModelGatewayModelFeatures,
  ModelGatewayUnsupportedRoute,
  ModelGatewayRouteSupport,
  ModelGatewayProviderModelCatalog,
  ModelGatewayProviderHealth,
  ModelGatewayProviderFailover,
  ModelGatewayProviderNetwork,
  ModelGatewayProviderMetadata,
  ModelGatewayProviderReasoning,
  ModelGatewayProviderEndpointProfile,
  ModelGatewayProvider,
  ModelGatewayProviderView,
  ModelGatewayProviderInput,
  ModelGatewayProviderEndpointProfileInput,
  // Accounts
  ModelGatewayAccountEntry,
  ModelGatewayAccountProviderRouting,
  ModelGatewayAccountProviderConfig,
  ModelGatewayAccountRoutingDiagnostics,
  ModelGatewayAccountRoutingSkip,
  // Secrets / client auth
  ModelGatewaySecretSummary,
  ModelGatewayClientAuthConfig,
  ModelGatewayClientAuthView,
  // Models listing
  ModelGatewayModelListItem,
  ModelGatewayModelListResponse,
  // State documents
  ModelGatewayRegistryState,
  ModelGatewaySecretState,
  ModelGatewayRuntimeState,
  // Runtime / usage
  ModelGatewayRuntimeUsage,
  ModelGatewayRuntimeUsageSummary,
  ModelGatewayRuntimeUsageSummaryBucket,
  ModelGatewayRuntimeLatencyDistribution,
  ModelGatewayRuntimeLatencySummary,
  ModelGatewayRuntimeRequestLogEntry,
  ModelGatewayModelUsageRow,
  // Lifecycle / daemon
  ModelGatewayLifecycleStatus,
  ModelGatewayDaemonServiceCommand,
  ModelGatewayDaemonServiceCommandResult,
  ModelGatewayDaemonServiceManagerStatus,
  ModelGatewayDaemonBootstrapStatus,
  ModelGatewayDaemonServiceTemplate,
  ModelGatewayDaemonServicePlan,
  ModelGatewayDaemonServiceRequest,
  ModelGatewayDaemonServiceResponse,
  ModelGatewayDaemonRuntimeMetadata,
  // Route decisions / active route
  ModelGatewayRouteDecision,
  ModelGatewayActiveRouteStatus,
  // App connections
  ModelGatewayAppConnectionProfile,
  ModelGatewayAppConnectionTarget,
  ModelGatewayAppConnectionPreview,
  ModelGatewayAppConnection,
  ModelGatewayAppConnectionBackup,
  // Request payloads
  ModelGatewayUpsertProviderRequest,
  ModelGatewaySetProviderSecretRequest,
  ModelGatewaySetActiveProviderRequest,
  ModelGatewayClientAuthUpdateRequest,
  ModelGatewayProviderDetectRequest,
  ModelGatewayProviderTestRequest,
  ModelGatewayActiveRouteSmokeRequest,
  ModelGatewayProviderAccountUpdateRequest,
  ModelGatewayCodexAccountLoginStartRequest,
  ModelGatewayCodexAccountLoginPollRequest,
  ModelGatewayUpdateAppConnectionProfileRequest,
  ModelGatewayApplyAppConnectionRequest,
  ModelGatewayRollbackAppConnectionRequest,
  // Response payloads
  ModelGatewayStatusResponse,
  ModelGatewayRuntimeResponse,
  ModelGatewayUsageLedgerResponse,
  ModelGatewayProvidersResponse,
  ModelGatewayProvidersSummary,
  ModelGatewayProviderSecretResponse,
  ModelGatewayClientAuthResponse,
  ModelGatewayProviderDetectResponse,
  ModelGatewayProviderDetectModelResult,
  ModelGatewayProviderDetectProtocolResult,
  ModelGatewayProviderDetectRecommendation,
  ModelGatewayProviderTestResponse,
  ModelGatewayProviderAccountUpdateResponse,
  ModelGatewayProviderAccountRefreshResponse,
  ModelGatewayCodexAccountLoginStartResponse,
  ModelGatewayCodexAccountLoginPollResponse,
  ModelGatewayAppConnectionsResponse,
  ModelGatewayAppConnectionBackupsResponse,
  ModelGatewayAppConnectionBackupContentResponse,
  ModelGatewayUpdateAppConnectionProfileResponse,
  ModelGatewayApplyAppConnectionResponse,
  ModelGatewayApplyAppConnectionsResponse,
  ModelGatewayRollbackAppConnectionResponse,
} from "../../../../../types/model-gateway";

export {
  MODEL_GATEWAY_DEFAULT_HOST,
  MODEL_GATEWAY_DEFAULT_PORT,
  MODEL_GATEWAY_DAEMON_SERVICE_NAME,
  MODEL_GATEWAY_APP_SCOPES,
  MODEL_GATEWAY_APP_CONNECTION_IDS,
  MODEL_GATEWAY_PROVIDER_CATEGORIES,
  MODEL_GATEWAY_PROVIDER_SOURCE_TYPES,
  MODEL_GATEWAY_ACCOUNT_PROVIDER_KINDS,
  MODEL_GATEWAY_ACCOUNT_CREDENTIAL_SOURCES,
  MODEL_GATEWAY_ACCOUNT_STATES,
  MODEL_GATEWAY_ACCOUNT_ROUTING_STRATEGIES,
  MODEL_GATEWAY_API_FORMATS,
  MODEL_GATEWAY_AUTH_STRATEGIES,
  MODEL_GATEWAY_REASONING_THINKING_PARAMS,
  MODEL_GATEWAY_REASONING_EFFORT_PARAMS,
  MODEL_GATEWAY_REASONING_EFFORT_VALUE_MODES,
  MODEL_GATEWAY_REASONING_OUTPUT_FORMATS,
  MODEL_GATEWAY_ROUTE_IDS,
} from "../../../../../types/model-gateway";

/**
 * Generic write-response envelope used by the provider upsert routes. The
 * backend wraps the resulting provider view in `{ ok, provider }` inline
 * (see routes.ts `POST/PUT /api/model-gateway/providers`).
 */
export interface ModelGatewayUpsertProviderResponse {
  ok: true;
  provider: import("../../../../../types/model-gateway").ModelGatewayProviderView;
}
