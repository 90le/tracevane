import type http from "node:http";
import type { LoggerLike, TracevaneServerConfig } from "../../../types/api.js";
import type { AgentsService } from "../modules/agents/service.js";
import type { ChannelConnectorsService } from "../modules/channel-connectors/service.js";
import type { ChannelsService } from "../modules/channels/service.js";
import type { ConfigService } from "../modules/config/service.js";
import type { CronService } from "../modules/cron/service.js";
import type { DashboardService } from "../modules/dashboard/service.js";
import type { FilesService } from "../modules/files/service.js";
import type { GitService } from "../modules/git/service.js";
import type { IdeWorkbenchService } from "../modules/ide-workbench/service.js";
import type { ModelGatewayService } from "../modules/model-gateway/service.js";
import type { OpenClawRecoveryService } from "../modules/openclaw-recovery/service.js";
import type { SkillsService } from "../modules/skills/service.js";
import type { SystemService } from "../modules/system/service.js";
import type { TerminalService } from "../modules/terminal/service.js";

export interface TracevaneServices {
  agents: AgentsService;
  channelConnectors: ChannelConnectorsService;
  channels: ChannelsService;
  config: ConfigService;
  cron: CronService;
  dashboard: DashboardService;
  files: FilesService;
  git: GitService;
  ideWorkbench: IdeWorkbenchService;
  modelGateway: ModelGatewayService;
  openclawRecovery: OpenClawRecoveryService;
  skills: SkillsService;
  system: SystemService;
  terminal: TerminalService;
}

export interface TracevaneApiContext {
  config: TracevaneServerConfig;
  logger: LoggerLike;
  sseClients: Set<http.ServerResponse>;
  services: TracevaneServices;
}
