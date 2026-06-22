import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/design/lib/utils";

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

/** Centered error view (Aurora .statebox.error). */
function ErrorState({
  title = "Something went wrong",
  description,
  action,
  icon,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      className={cn("grid place-items-center gap-2.5 px-[22px] py-[42px] text-center text-muted", className)}
      role="alert"
      {...props}
    >
      <div className="grid size-[46px] place-items-center rounded-[12px] bg-red-soft text-red [&_svg]:size-5">
        {icon ?? <AlertTriangle />}
      </div>
      <strong className="text-[14.5px] text-ink-strong">{title}</strong>
      {description && <span className="max-w-[42ch] text-sm">{description}</span>}
      {action && <div className="mt-1.5 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export { ErrorState };
