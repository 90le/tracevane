import { CliRuntimeView } from "./views/CliRuntimeView";

/**
 * CLI Agent management page. The domain is intentionally single-purpose:
 * install, configure, reinstall, and repair Codex / Claude Code / OpenCode.
 * Runtime run monitoring belongs to the owner surfaces that launch the work.
 */
export function CliAgentsPage() {
  return <CliRuntimeView />;
}
