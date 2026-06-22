import * as React from "react";

import { cn } from "@/design/lib/utils";

export interface ListDetailLayoutProps
  extends React.HTMLAttributes<HTMLDivElement> {
  list: React.ReactNode;
  detail?: React.ReactNode;
  /** On ≤1080px the detail slides in as a right drawer; controls its open state. */
  detailOpen?: boolean;
}

/**
 * Aurora List-Detail split: a fluid list column + a sticky detail column.
 * At ≤1080px the detail collapses into a right drawer toggled by `detailOpen`.
 */
const ListDetailLayout = React.forwardRef<HTMLDivElement, ListDetailLayoutProps>(
  ({ list, detail, detailOpen, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("tv-split", className)}
      data-detail-open={detailOpen ? "true" : "false"}
      {...props}
    >
      <div className="min-w-0">{list}</div>
      {detail != null && <aside className="tv-detail">{detail}</aside>}
    </div>
  )
);
ListDetailLayout.displayName = "ListDetailLayout";

export { ListDetailLayout };
