import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";
import { isApiError } from "@/lib/api/errors";
import { resolveApiUrl } from "@/lib/runtime";

import { unlockWithCredential, type AuthStatusPayload } from "./api";

/**
 * Full-screen unlock card rendered by the auth gate while the standalone
 * server's session gate rejects API calls. Submits the credential to
 * `/api/auth/unlock`; on success the backend sets the HttpOnly session cookie
 * and the page reloads into the unlocked app. Password is the default field;
 * when a password is configured the token input hides behind a collapsible —
 * without one the token is the only method and shows directly.
 */
export function UnlockPage({ status }: { status: AuthStatusPayload }) {
  const [useToken, setUseToken] = React.useState(!status.hasPassword);
  const [credential, setCredential] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const switchMode = (nextUseToken: boolean) => {
    setUseToken(nextUseToken);
    setCredential("");
    setError(null);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = credential.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await unlockWithCredential(value);
      // The session cookie is set; reload so the gate re-checks and mounts
      // the app shell. Keep the submitting state — the page is going away.
      window.location.reload();
    } catch (err) {
      setError(
        isApiError(err) && err.code === "auth_invalid_credential"
          ? "密码或访问令牌不正确，请重试"
          : "无法连接服务器，请稍后重试",
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-4">
      <div className="w-full max-w-[380px] rounded-md border border-line bg-panel px-6 py-7 shadow-lg">
        <div className="grid justify-items-center gap-2.5 text-center">
          <span className="grid size-12 place-items-center rounded-md border border-line-2 bg-panel-2 shadow-sm">
            <img
              src={resolveApiUrl("/brand/tracevane-mark.svg")}
              alt="Tracevane"
              className="size-8"
              draggable={false}
            />
          </span>
          <h1 className="text-lg font-semibold text-ink-strong">解锁 Tracevane</h1>
          <p className="text-sm text-muted">输入密码或访问令牌继续</p>
        </div>

        <form onSubmit={onSubmit} className="mt-6 grid gap-3">
          <Input
            key={useToken ? "token" : "password"}
            type="password"
            value={credential}
            onChange={(event) => {
              setCredential(event.target.value);
              setError(null);
            }}
            placeholder={useToken ? "访问令牌" : "密码"}
            aria-label={useToken ? "访问令牌" : "密码"}
            autoComplete={useToken ? "off" : "current-password"}
            className={useToken ? "font-mono" : undefined}
            disabled={submitting}
            autoFocus
          />
          {error ? (
            <div
              role="alert"
              className="rounded-sm border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              {error}
            </div>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || !credential.trim()}
          >
            {submitting ? "正在解锁…" : "解锁"}
          </Button>
        </form>

        {status.hasPassword ? (
          <button
            type="button"
            onClick={() => switchMode(!useToken)}
            aria-expanded={useToken}
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 text-xs text-subtle transition-colors hover:text-ink"
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                useToken && "rotate-180",
              )}
            />
            {useToken ? "收起，使用密码解锁" : "展开使用访问令牌"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
