import type {
  ChannelConnectorOctoInboundMessage,
  ChannelConnectorsDaemonRuntimeConfig,
} from "../../../../types/channel-connectors.js";
import {
  listChannelConnectorGatewayModelCatalog,
  type ChannelConnectorGatewayModel,
} from "./command-router.js";
import type {
  ChannelConnectorRuntimeBinding,
  ChannelConnectorRuntimeProject,
} from "./agent-runner.js";

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function metadataRecord(binding: ChannelConnectorRuntimeBinding): Record<string, unknown> {
  return binding.metadata && typeof binding.metadata === "object" && !Array.isArray(binding.metadata)
    ? binding.metadata as Record<string, unknown>
    : {};
}

function metadataBoolean(binding: ChannelConnectorRuntimeBinding, keys: string[], fallback = false): boolean {
  const metadata = metadataRecord(binding);
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "boolean") return value;
    const normalized = normalizeString(value).toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function metadataString(binding: ChannelConnectorRuntimeBinding, keys: string[]): string {
  const metadata = metadataRecord(binding);
  for (const key of keys) {
    const normalized = normalizeString(metadata[key]);
    if (normalized) return normalized;
  }
  return "";
}

export function countChannelConnectorVisualAttachments(message: ChannelConnectorOctoInboundMessage): number {
  return (message.attachments || [])
    .filter((attachment) => attachment.kind === "image" || attachment.kind === "video" || attachment.kind === "sticker")
    .length;
}

function normalizeGatewayModelLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function gatewayModelMatches(model: ChannelConnectorGatewayModel, requestedModel: string | null): boolean {
  const requested = normalizeString(requestedModel);
  if (!requested) return false;
  const explicitSeparator = requested.indexOf("/");
  const candidate = explicitSeparator > 0 && explicitSeparator < requested.length - 1
    ? requested.slice(explicitSeparator + 1)
    : requested;
  const key = normalizeGatewayModelLookupKey(candidate);
  if (!key) return false;
  if (normalizeGatewayModelLookupKey(model.id) === key) return true;
  return model.aliases.some((alias) => normalizeGatewayModelLookupKey(alias) === key);
}

function gatewayModelVisionCapability(
  catalog: ChannelConnectorGatewayModel[],
  model: string | null,
): boolean | null {
  const matched = catalog.find((item) => gatewayModelMatches(item, model));
  return typeof matched?.features.vision === "boolean" ? matched.features.vision : null;
}

function gatewayModelHasHealthyProvider(model: ChannelConnectorGatewayModel): boolean {
  if ((model.healthyProviderIds || []).length > 0) return true;
  if ((model.openCircuitProviderIds || []).length > 0) return false;
  return true;
}

function firstVisionGatewayModel(catalog: ChannelConnectorGatewayModel[]): ChannelConnectorGatewayModel | null {
  return catalog.find((item) => item.features.vision === true && gatewayModelHasHealthyProvider(item)) || null;
}

function configuredVisionGatewayModel(
  catalog: ChannelConnectorGatewayModel[],
  model: string,
): ChannelConnectorGatewayModel | null {
  const requested = normalizeString(model);
  if (!requested) return null;
  return catalog.find((item) => gatewayModelMatches(item, requested)) || null;
}

export async function resolveChannelConnectorVisualTurnProject(input: {
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  message: ChannelConnectorOctoInboundMessage;
  gatewayEndpoint: string;
  gatewayClientKey: string | null;
  listCatalog?: (endpoint: string, clientKey: string | null) => Promise<ChannelConnectorGatewayModel[]>;
}): Promise<{
  project: ChannelConnectorRuntimeProject;
  modelCapabilities: { vision?: boolean | null } | null;
  switched: boolean;
  originalModel: string | null;
  selectedModel: string | null;
  reason: string | null;
  catalogError: string | null;
  configuredVisionModel: string | null;
}> {
  const originalModel = normalizeString(input.project.model) || null;
  if (countChannelConnectorVisualAttachments(input.message) === 0) {
    return {
      project: input.project,
      modelCapabilities: null,
      switched: false,
      originalModel,
      selectedModel: originalModel,
      reason: null,
      catalogError: null,
      configuredVisionModel: null,
    };
  }
  if (!metadataBoolean(input.binding, [
    "autoVisionModel",
    "auto_vision_model",
    "visionAutoModel",
    "vision_auto_model",
  ], false)) {
    return {
      project: input.project,
      modelCapabilities: null,
      switched: false,
      originalModel,
      selectedModel: originalModel,
      reason: "disabled-by-binding",
      catalogError: null,
      configuredVisionModel: metadataString(input.binding, [
        "autoVisionModelId",
        "auto_vision_model_id",
        "visionModel",
        "vision_model",
        "visualModel",
        "visual_model",
      ]) || null,
    };
  }
  const configuredVisionModel = metadataString(input.binding, [
    "autoVisionModelId",
    "auto_vision_model_id",
    "visionModel",
    "vision_model",
    "visualModel",
    "visual_model",
  ]) || null;

  let catalog: ChannelConnectorGatewayModel[] = [];
  try {
    catalog = await (input.listCatalog || listChannelConnectorGatewayModelCatalog)(
      input.gatewayEndpoint,
      input.gatewayClientKey,
    );
  } catch (error) {
    return {
      project: input.project,
      modelCapabilities: null,
      switched: false,
      originalModel,
      selectedModel: originalModel,
      reason: "catalog-unavailable",
      catalogError: error instanceof Error ? error.message : String(error),
      configuredVisionModel,
    };
  }

  const currentVision = gatewayModelVisionCapability(catalog, originalModel);
  if (currentVision === true) {
    return {
      project: input.project,
      modelCapabilities: { vision: true },
      switched: false,
      originalModel,
      selectedModel: originalModel,
      reason: "current-model-vision",
      catalogError: null,
      configuredVisionModel,
    };
  }

  const configuredModel = configuredVisionModel
    ? configuredVisionGatewayModel(catalog, configuredVisionModel)
    : null;
  if (configuredVisionModel) {
    if (!configuredModel) {
      return {
        project: input.project,
        modelCapabilities: { vision: currentVision },
        switched: false,
        originalModel,
        selectedModel: originalModel,
        reason: "configured-vision-model-missing",
        catalogError: null,
        configuredVisionModel,
      };
    }
    if (configuredModel.features.vision !== true) {
      return {
        project: input.project,
        modelCapabilities: { vision: currentVision },
        switched: false,
        originalModel,
        selectedModel: originalModel,
        reason: "configured-vision-model-non-vision",
        catalogError: null,
        configuredVisionModel,
      };
    }
    if (!gatewayModelHasHealthyProvider(configuredModel)) {
      return {
        project: input.project,
        modelCapabilities: { vision: currentVision },
        switched: false,
        originalModel,
        selectedModel: originalModel,
        reason: "configured-vision-model-unhealthy",
        catalogError: null,
        configuredVisionModel,
      };
    }
  }

  const visionModel = configuredModel || firstVisionGatewayModel(catalog);
  if (!visionModel) {
    return {
      project: input.project,
      modelCapabilities: { vision: currentVision },
      switched: false,
      originalModel,
      selectedModel: originalModel,
      reason: currentVision === false ? "current-model-non-vision" : "no-vision-model",
      catalogError: null,
      configuredVisionModel,
    };
  }

  if (gatewayModelMatches(visionModel, originalModel)) {
    return {
      project: input.project,
      modelCapabilities: { vision: true },
      switched: false,
      originalModel,
      selectedModel: originalModel,
      reason: "current-model-vision",
      catalogError: null,
      configuredVisionModel,
    };
  }

  return {
    project: {
      ...input.project,
      model: visionModel.id,
    },
    modelCapabilities: { vision: true },
    switched: true,
    originalModel,
    selectedModel: visionModel.id,
    reason: configuredModel ? "configured-vision-model" : currentVision === false ? "current-model-non-vision" : "current-model-unknown",
    catalogError: null,
    configuredVisionModel,
  };
}
