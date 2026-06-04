import type http from 'node:http';
import { createStandaloneStudioConfig, createStudioConfig, syncStandaloneStudioConfig } from './config.js';
import {
  createStudioServer,
  createStudioRequestHandler,
  createStudioRouter,
  createStudioUpgradeHandler,
  handleStudioRequest,
} from './server.js';
import { createAgentsService } from './modules/agents/service.js';
import { createChatService } from './modules/chat/service.js';
import { createChannelsService } from './modules/channels/service.js';
import { createCodexStackService } from './modules/codex-stack/service.js';
import { createConfigService } from './modules/config/service.js';
import { createCronService } from './modules/cron/service.js';
import { createDashboardService } from './modules/dashboard/service.js';
import { createFilesService } from './modules/files/service.js';
import { createGitService } from './modules/git/service.js';
import { createModelGatewayService } from './modules/model-gateway/service.js';
import { createPluginsService } from './modules/plugins/service.js';
import { createSkillsService } from './modules/skills/service.js';
import { createSystemService } from './modules/system/service.js';
import { createTerminalService } from './modules/terminal/service.js';
import type { LoggerLike, StudioServerConfig } from '../../types/api.js';
import type { StudioApiContext, StudioServices } from './core/context.js';

export interface CreateStudioContextOptions {
  config: StudioServerConfig;
  logger: LoggerLike;
}

export function createStudioContext(options: CreateStudioContextOptions): StudioApiContext {
  const sseClients = new Set<http.ServerResponse>();
  const getSseConnections = () => sseClients.size;

  const agents = createAgentsService(options.config);
  const channels = createChannelsService(options.config);
  const codexStack = createCodexStackService(options.config);
  const config = createConfigService(options.config);
  const cron = createCronService(options.config);
  const plugins = createPluginsService(options.config);
  const skills = createSkillsService(options.config);
  const terminal = createTerminalService({
    config: options.config,
    skills,
  });
  const system = createSystemService(options.config, getSseConnections);
  const chat = createChatService({
    config: options.config,
    system,
  });
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
  const modelGateway = createModelGatewayService(options.config);

  const services: StudioServices = {
    agents,
    chat,
    channels,
    codexStack,
    config,
    cron,
    dashboard,
    files,
    git,
    modelGateway,
    plugins,
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
  createStandaloneStudioConfig,
  createStudioConfig,
  createStudioServer,
  createStudioRequestHandler,
  createStudioRouter,
  createStudioUpgradeHandler,
  handleStudioRequest,
  syncStandaloneStudioConfig,
};
