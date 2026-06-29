export type WorkspaceShellMode =
  | "desktop"
  | "desktop-immersive"
  | "mobile"
  | "mobile-panel-fullscreen"
  | "mobile-browser-fullscreen";

export type WorkspaceFormFactor = "desktop" | "tablet" | "mobile";
export type WorkspacePrimaryInteraction = "mouse-keyboard" | "touch-keyboard";
export type WorkspaceSingleTaskSurface =
  | "none"
  | "editor"
  | "terminal"
  | "side-panel";

export interface WorkspaceLayoutMode {
  shellMode: WorkspaceShellMode;
  /**
   * Responsive product contract for the IDE shell.
   *
   * Desktop remains a dense multi-pane workbench. Tablet is allowed to keep
   * two-pane IDE layouts, while mobile must collapse into a single-task flow
   * where Editor, Terminal, Files, Search, and Git take turns as the main
   * surface instead of being squeezed into desktop columns.
   */
  workspaceFormFactor: WorkspaceFormFactor;
  primaryInteraction: WorkspacePrimaryInteraction;
  singleTaskSurface: WorkspaceSingleTaskSurface;
  keyboardSafeTerminalRequired: boolean;
  shellImmersive: boolean;
  mobileBrowserFullscreen: boolean;
  mobileNavOverlay: boolean;
  reserveMobileNav: boolean;
  showDockQuickControls: boolean;
}

export function deriveWorkspaceLayoutMode({
  browserFullscreenPanel,
  isMobileWorkbench,
  isTabletWorkbench = false,
  maximizedDockPanel,
  mobilePanelFullscreen,
}: {
  browserFullscreenPanel: string | null;
  isMobileWorkbench: boolean;
  isTabletWorkbench?: boolean;
  maximizedDockPanel: string | null;
  mobilePanelFullscreen: boolean;
}): WorkspaceLayoutMode {
  const browserFullscreen = Boolean(browserFullscreenPanel);
  const dockImmersive = Boolean(maximizedDockPanel);
  const terminalFocused =
    maximizedDockPanel === "terminal" || browserFullscreenPanel === "terminal";

  if (isMobileWorkbench) {
    return {
      shellMode: browserFullscreen
        ? "mobile-browser-fullscreen"
        : mobilePanelFullscreen
          ? "mobile-panel-fullscreen"
          : "mobile",
      workspaceFormFactor: "mobile",
      primaryInteraction: "touch-keyboard",
      singleTaskSurface: terminalFocused
        ? "terminal"
        : mobilePanelFullscreen || dockImmersive
          ? "side-panel"
          : "editor",
      keyboardSafeTerminalRequired: terminalFocused,
      shellImmersive: false,
      mobileBrowserFullscreen: browserFullscreen,
      mobileNavOverlay:
        browserFullscreen || mobilePanelFullscreen || dockImmersive,
      reserveMobileNav:
        browserFullscreen || mobilePanelFullscreen || dockImmersive,
      showDockQuickControls: browserFullscreen || dockImmersive,
    };
  }

  return {
    shellMode:
      dockImmersive || browserFullscreen ? "desktop-immersive" : "desktop",
    workspaceFormFactor: isTabletWorkbench ? "tablet" : "desktop",
    primaryInteraction: isTabletWorkbench ? "touch-keyboard" : "mouse-keyboard",
    singleTaskSurface: "none",
    keyboardSafeTerminalRequired: false,
    shellImmersive: dockImmersive || browserFullscreen,
    mobileBrowserFullscreen: false,
    mobileNavOverlay: false,
    reserveMobileNav: false,
    showDockQuickControls: true,
  };
}
