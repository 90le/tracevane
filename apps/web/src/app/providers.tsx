import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/lib/query/client";
import { Toaster } from "@/design/ui/sonner";

export type ThemeMode = "light" | "dark";

const THEME_KEY = "tracevane-theme";
/** Legacy key from the removed accent-palette feature; cleaned up on load. */
const LEGACY_PALETTE_KEY = "tracevane-palette";

// Dark console is the product default; light stays switchable and is the
// only theme that needs a data-theme override on <html> (see theme.css).
const DEFAULT_THEME: ThemeMode = "dark";

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
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

  React.useEffect(() => {
    const root = document.documentElement;
    // Dark is the unprefixed :root default — only light needs the attribute.
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
    try {
      window.localStorage.setItem(THEME_KEY, theme);
      window.localStorage.removeItem(LEGACY_PALETTE_KEY);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((prev) => (prev === "light" ? "dark" : "light")),
    }),
    [theme],
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
