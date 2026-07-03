import type http from "node:http";
import {
  createStandaloneTracevaneConfig,
  createTracevaneConfig,
  syncStandaloneTracevaneConfig,
} from "./config.js";
import {
  createTracevaneServer,
  createTracevaneRequestHandler,
  createTracevaneRouter,
  createTracevaneUpgradeHandler,
  handleTracevaneRequest,
} from "./server.js";
import { createAgentsService } from "./modules/agents/service.js";
import {
  createChannelConnectorsService,
  type ChannelConnectorsServiceOptions,
} from "./modules/channel-connectors/service.js";
import { createChannelsService } from "./modules/channels/service.js";
import { createConfigService } from "./modules/config/service.js";
import { createCronService } from "./modules/cron/service.js";
import { createDashboardService } from "./modules/dashboard/service.js";
import { createFilesService } from "./modules/files/service.js";
import { createGitService } from "./modules/git/service.js";
import { createIdeWorkbenchService } from "./modules/ide-workbench/service.js";
import {
  createModelGatewayService,
  type ModelGatewayServiceOptions,
} from "./modules/model-gateway/service.js";
import { createOpenClawRecoveryService } from "./modules/openclaw-recovery/service.js";
import { createSkillsService } from "./modules/skills/service.js";
import { createSystemService } from "./modules/system/service.js";
import { createTerminalService } from "./modules/terminal/service.js";
import type { LoggerLike, TracevaneServerConfig } from "../../types/api.js";
import type { TracevaneApiContext, TracevaneServices } from "./core/context.js";

export interface CreateTracevaneContextOptions {
  config: TracevaneServerConfig;
  logger: LoggerLike;
  channelConnectorsOptions?: ChannelConnectorsServiceOptions;
  modelGatewayOptions?: ModelGatewayServiceOptions;
}

export function createTracevaneContext(
  options: CreateTracevaneContextOptions,
): TracevaneApiContext {
  const sseClients = new Set<http.ServerResponse>();
  const getSseConnections = () => sseClients.size;

  const agents = createAgentsService(options.config);
  const channelConnectors = createChannelConnectorsService(
    options.config,
    options.channelConnectorsOptions,
  );
  const channels = createChannelsService(options.config);
  const config = createConfigService(options.config);
  const cron = createCronService(options.config);
  const skills = createSkillsService(options.config);
  const terminal = createTerminalService({
    config: options.config,
    skills,
  });
  const system = createSystemService(options.config, getSseConnections);
  const dashboard = createDashboardService({
    config: options.config,
    agents,
    channels,
    cron,
    skills,
    system,
    terminal,
  });
  const files = createFilesService(options.config);
  const git = createGitService(options.config);
  const ideWorkbench = createIdeWorkbenchService(options.config);
  const modelGateway = createModelGatewayService(
    options.config,
    options.modelGatewayOptions,
  );
  const openclawRecovery = createOpenClawRecoveryService(options.config);
  const services: TracevaneServices = {
    agents,
    channelConnectors,
    channels,
    config,
    cron,
    dashboard,
    files,
    git,
    ideWorkbench,
    modelGateway,
    openclawRecovery,
    skills,
    system,
    terminal,
  };

  return {
    config: options.config,
    logger: options.logger,
    sseClients,
    services,
  };
}

export {
  createStandaloneTracevaneConfig,
  createTracevaneConfig,
  createTracevaneServer,
  createTracevaneRequestHandler,
  createTracevaneRouter,
  createTracevaneUpgradeHandler,
  handleTracevaneRequest,
  syncStandaloneTracevaneConfig,
};
