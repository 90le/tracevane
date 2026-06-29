import * as React from "react";

import { WorkspaceIdeShell } from "./ide-shell";
import { WorkspaceIdeProviderPanel } from "./provider";

export function WorkspacePage() {
  React.useEffect(() => {
    document.title = "工作区 · Tracevane";
  }, []);

  const providerMode = useWorkspaceProviderMode();
  if (providerMode.enabled) {
    return (
      <main className="h-screen bg-slate-950 p-3 text-slate-100 md:p-4" data-testid="workspace-provider-mode">
        <WorkspaceIdeProviderPanel
          workspaceRoot={providerMode.workspaceRoot}
          preferredKind={providerMode.kind}
          mobile={providerMode.mobile}
        />
      </main>
    );
  }

  return <WorkspaceIdeShell />;
}

export default WorkspacePage;

function useWorkspaceProviderMode() {
  const [mode, setMode] = React.useState(() => readWorkspaceProviderMode());

  React.useEffect(() => {
    const sync = () => setMode(readWorkspaceProviderMode());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  return mode;
}

function readWorkspaceProviderMode(): {
  enabled: boolean;
  kind?: "openvscode-server" | "code-server" | "theia";
  workspaceRoot?: string;
  mobile: boolean;
} {
  if (typeof window === "undefined") return { enabled: false, mobile: false };
  const hash = window.location.hash || "";
  const queryIndex = hash.indexOf("?");
  const params = new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : window.location.search);
  const provider = params.get("provider");
  const kind = params.get("kind") || undefined;
  const validKind = kind === "openvscode-server" || kind === "code-server" || kind === "theia" ? kind : undefined;
  return {
    enabled: provider === "ide" || provider === "vscode",
    kind: validKind,
    workspaceRoot: params.get("workspaceRoot") || undefined,
    mobile: window.matchMedia?.("(max-width: 768px)").matches ?? false,
  };
}
