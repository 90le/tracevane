import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/lib/query/client";
import { Toaster } from "@/design/ui/sonner";

export type ThemeMode = "light" | "dark";
export type Palette = "default" | "teal" | "violet" | "graphite";

export const PALETTES: Palette[] = ["default", "teal", "violet", "graphite"];

const THEME_KEY = "tracevane-theme";
const PALETTE_KEY = "tracevane-palette";

const DEFAULT_THEME: ThemeMode = "light";
const DEFAULT_PALETTE: Palette = "default";

interface ThemeContextValue {
  theme: ThemeMode;
  palette: Palette;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setPalette: (palette: Palette) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <AppProviders>");
  return ctx;
}

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    if (value && (allowed as readonly string[]).includes(value)) return value as T;
  } catch {
    /* ignore storage access errors */
  }
  return fallback;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemeMode>(() =>
    readStored(THEME_KEY, ["light", "dark"] as const, DEFAULT_THEME),
  );
  const [palette, setPaletteState] = React.useState<Palette>(() =>
    readStored(PALETTE_KEY, PALETTES, DEFAULT_PALETTE),
  );

  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  React.useEffect(() => {
    const root = document.documentElement;
    if (palette === "default") {
      root.removeAttribute("data-palette");
    } else {
      root.setAttribute("data-palette", palette);
    }
    try {
      window.localStorage.setItem(PALETTE_KEY, palette);
    } catch {
      /* ignore */
    }
  }, [palette]);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      palette,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((prev) => (prev === "light" ? "dark" : "light")),
      setPalette: setPaletteState,
    }),
    [theme, palette],
  );

  return (
    <ThemeContext.Provider value={value}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeContext.Provider>
  );
}
