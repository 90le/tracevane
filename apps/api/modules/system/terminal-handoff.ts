import type { SystemTerminalActionSuggestion } from "../../../../types/system.js";

export interface BuildSystemTerminalActionSuggestionsInput {
  bootstrapRepairNeeded: boolean;
  helperPendingRepair: boolean;
}

export function buildSystemTerminalActionSuggestions(
  input: BuildSystemTerminalActionSuggestionsInput,
): SystemTerminalActionSuggestion[] {
  const items: SystemTerminalActionSuggestion[] = [];

  if (input.bootstrapRepairNeeded) {
    items.push({
      key: "bootstrap-repair",
      title: "修复系统引导配置",
      routePath: "/terminal/system-bootstrap-repair",
      commandHint: "openclaw doctor && openclaw gateway status --json",
    });
  }

  if (input.helperPendingRepair) {
    items.push({
      key: "device-trust-repair",
      title: "修复终端设备信任配对",
      routePath: "/terminal/system-device-trust-repair",
      commandHint: "openclaw devices pending && openclaw devices paired",
    });
  }

  return items;
}
