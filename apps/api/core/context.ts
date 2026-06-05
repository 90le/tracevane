import type http from 'node:http';
import type { LoggerLike, StudioServerConfig } from '../../../types/api.js';
import type { AgentsService } from '../modules/agents/service.js';
import type { ChatService } from '../modules/chat/service.js';
import type { ChannelsService } from '../modules/channels/service.js';
import type { ConfigService } from '../modules/config/service.js';
import type { CronService } from '../modules/cron/service.js';
import type { DashboardService } from '../modules/dashboard/service.js';
import type { FilesService } from '../modules/files/service.js';
import type { GitService } from '../modules/git/service.js';
import type { ModelGatewayService } from '../modules/model-gateway/service.js';
import type { OpenClawRecoveryService } from '../modules/openclaw-recovery/service.js';
import type { PluginsService } from '../modules/plugins/service.js';
import type { SkillsService } from '../modules/skills/service.js';
import type { SystemService } from '../modules/system/service.js';
import type { TerminalService } from '../modules/terminal/service.js';

export interface StudioServices {
  agents: AgentsService;
  chat: ChatService;
  channels: ChannelsService;
  config: ConfigService;
  cron: CronService;
  dashboard: DashboardService;
  files: FilesService;
  git: GitService;
  modelGateway: ModelGatewayService;
  openclawRecovery: OpenClawRecoveryService;
  plugins: PluginsService;
  skills: SkillsService;
  system: SystemService;
  terminal: TerminalService;
}

export interface StudioApiContext {
  config: StudioServerConfig;
  logger: LoggerLike;
  sseClients: Set<http.ServerResponse>;
  services: StudioServices;
}
