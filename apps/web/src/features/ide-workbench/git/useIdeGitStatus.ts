import * as React from "react";

import { appendWorkbenchOutput } from "../output";
import { getGitStatus } from "@/lib/api/git";
import { buildIdeGitDecorations, type IdeGitDecorationSnapshot } from "./gitDecorations";
import type { GitStatusPayload } from "../../../../../../types/git";

export interface UseIdeGitStatusResult extends IdeGitDecorationSnapshot {
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useIdeGitStatus(rootId: string, directoryPath: string): UseIdeGitStatusResult {
  const [status, setStatus] = React.useState<GitStatusPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshTick, setRefreshTick] = React.useState(0);
  const refresh = React.useCallback(() => setRefreshTick((value) => value + 1), []);

  React.useEffect(() => {
    if (!rootId) {
      setStatus(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    getGitStatus({ rootId, path: directoryPath }, controller.signal)
      .then((payload) => {
        setStatus(payload);
        setError(null);
        appendWorkbenchOutput({
          channel: { id: "git", label: "Git", kind: "custom" },
          level: payload.available ? "info" : "warn",
          text: payload.available
            ? `status ${payload.branch || "HEAD"}: ${payload.changes.length} change(s)`
            : `status unavailable: ${payload.message || "not a git repository"}`,
        });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const message = reason instanceof Error ? reason.message : String(reason);
        setError(message);
        appendWorkbenchOutput({
          channel: { id: "git", label: "Git", kind: "custom" },
          level: "error",
          text: `status error: ${message}`,
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [directoryPath, refreshTick, rootId]);

  const decorations = React.useMemo(() => buildIdeGitDecorations(status), [status]);
  return { ...decorations, loading, error, refresh };
}
