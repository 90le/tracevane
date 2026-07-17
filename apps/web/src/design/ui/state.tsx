import * as React from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

import { cn } from "@/design/lib/utils";

/**
 * Centered state views (Aurora .statebox): the canonical loading / empty /
 * error placeholders for panels and pages. `src/shared/states/*` delegates
 * to these primitives; feature code should prefer them over ad-hoc markup.
 */

export interface StateViewProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

const stateViewClass =
  "grid place-items-center gap-2.5 px-[22px] py-[42px] text-center text-muted";

function StateViewShell({
  tone,
  title,
  description,
  action,
  icon,
  className,
  children,
  ...props
}: StateViewProps & { tone: "empty" | "error" | "loading" }) {
  return (
    <div
      className={cn(stateViewClass, className)}
      role={tone === "error" ? "alert" : tone === "loading" ? "status" : undefined}
      aria-busy={tone === "loading" ? true : undefined}
      {...props}
    >
      <div
        className={cn(
          "grid size-[46px] place-items-center rounded-[12px] [&_svg]:size-5",
          tone === "error" && "bg-danger-soft text-danger",
          tone === "empty" && "bg-panel-3 text-subtle",
          tone === "loading" && "bg-panel-2 text-subtle",
        )}
      >
        {icon}
      </div>
      <strong className="text-[14.5px] text-ink-strong">{title}</strong>
      {description && <span className="max-w-[42ch] text-sm">{description}</span>}
      {action && <div className="mt-1.5 flex flex-wrap gap-2">{action}</div>}
      {children}
    </div>
  );
}

/** Centered empty view (Aurora .statebox.empty). */
function EmptyState({
  title = "Nothing here yet",
  icon,
  ...props
}: StateViewProps) {
  return <StateViewShell tone="empty" title={title} icon={icon ?? <Inbox />} {...props} />;
}

/** Centered error view (Aurora .statebox.error). */
function ErrorState({
  title = "Something went wrong",
  icon,
  ...props
}: StateViewProps) {
  return (
    <StateViewShell tone="error" title={title} icon={icon ?? <AlertTriangle />} {...props} />
  );
}

/** Centered loading view (Aurora .statebox + spinner). */
function LoadingState({ title = "Loading…", ...props }: StateViewProps) {
  return (
    <StateViewShell
      tone="loading"
      title={title}
      icon={<Loader2 className="animate-[aurora-spin_.8s_linear_infinite]" />}
      {...props}
    />
  );
}

export { EmptyState, ErrorState, LoadingState };
