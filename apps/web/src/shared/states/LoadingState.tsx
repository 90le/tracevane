import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/design/lib/utils";

export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

/** Centered loading view (Aurora .statebox + spinner). */
function LoadingState({
  title = "Loading…",
  description,
  action,
  className,
  ...props
}: LoadingStateProps) {
  return (
    <div
      className={cn("grid place-items-center gap-2.5 px-[22px] py-[42px] text-center text-muted", className)}
      role="status"
      aria-busy="true"
      {...props}
    >
      <div className="grid size-[46px] place-items-center rounded-[12px] bg-panel-2 text-subtle">
        <Loader2 className="size-5 animate-[aurora-spin_.8s_linear_infinite]" />
      </div>
      <strong className="text-[14.5px] text-ink-strong">{title}</strong>
      {description && <span className="max-w-[42ch] text-sm">{description}</span>}
      {action && <div className="mt-1.5 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export { LoadingState };
