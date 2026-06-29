export type WorkspaceShellMode =
  | "desktop"
  | "desktop-immersive"
  | "mobile"
  | "mobile-panel-fullscreen"
  | "mobile-browser-fullscreen";

export interface WorkspaceLayoutMode {
  shellMode: WorkspaceShellMode;
  shellImmersive: boolean;
  mobileBrowserFullscreen: boolean;
  mobileNavOverlay: boolean;
  reserveMobileNav: boolean;
  showDockQuickControls: boolean;
}

export function deriveWorkspaceLayoutMode({
  browserFullscreenPanel,
  isMobileWorkbench,
  maximizedDockPanel,
  mobilePanelFullscreen,
}: {
  browserFullscreenPanel: string | null;
  isMobileWorkbench: boolean;
  maximizedDockPanel: string | null;
  mobilePanelFullscreen: boolean;
}): WorkspaceLayoutMode {
  const browserFullscreen = Boolean(browserFullscreenPanel);
  const dockImmersive = Boolean(maximizedDockPanel);

  if (isMobileWorkbench) {
    return {
      shellMode: browserFullscreen
        ? "mobile-browser-fullscreen"
        : mobilePanelFullscreen
          ? "mobile-panel-fullscreen"
          : "mobile",
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
    shellImmersive: dockImmersive || browserFullscreen,
    mobileBrowserFullscreen: false,
    mobileNavOverlay: false,
    reserveMobileNav: false,
    showDockQuickControls: true,
  };
}
