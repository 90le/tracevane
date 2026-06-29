import {
  WorkspaceIdeProviderLifecycleController,
  WorkspaceIdeProviderSessionRegistry,
  createWorkspaceIdeProviderSpawnRunner,
  workspaceIdeProviderEnvConfig,
  type WorkspaceIdeProviderConfig,
} from "./provider-service.js";

export interface WorkspaceIdeProviderService {
  config: WorkspaceIdeProviderConfig;
  controller: WorkspaceIdeProviderLifecycleController;
}

export function createWorkspaceIdeProviderService(): WorkspaceIdeProviderService {
  const config = workspaceIdeProviderEnvConfig();
  const registry = new WorkspaceIdeProviderSessionRegistry(config.basePort);
  const controller = new WorkspaceIdeProviderLifecycleController(
    registry,
    createWorkspaceIdeProviderSpawnRunner(),
  );
  return { config, controller };
}
