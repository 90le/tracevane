import { QueryClient } from "@tanstack/react-query";

/**
 * Shared TanStack Query client for the web app. Configured for an internal
 * tool: no refetch on window focus, a short stale window, and a single retry.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 10_000,
      retry: 1,
    },
  },
});
