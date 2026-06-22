import * as React from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/design/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

/** Centered empty view (Aurora .statebox.empty). */
function EmptyState({
  title = "Nothing here yet",
  description,
  action,
  icon,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn("grid place-items-center gap-2.5 px-[22px] py-[42px] text-center text-muted", className)}
      {...props}
    >
      <div className="grid size-[46px] place-items-center rounded-[12px] bg-panel-3 text-subtle [&_svg]:size-5">
        {icon ?? <Inbox />}
      </div>
      <strong className="text-[14.5px] text-ink-strong">{title}</strong>
      {description && <span className="max-w-[42ch] text-sm">{description}</span>}
      {action && <div className="mt-1.5 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export { EmptyState };
