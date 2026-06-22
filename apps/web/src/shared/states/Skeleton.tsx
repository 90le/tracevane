import * as React from "react";

import { cn } from "@/design/lib/utils";

/**
 * Shimmer skeleton block (Aurora .skeleton). Compose for placeholder rows/cards.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[7px] bg-panel-3",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-[aurora-sk_1.3s_ease-in-out_infinite]",
        "after:bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--ink)_7%,transparent),transparent)]",
        className
      )}
      {...props}
    />
  );
}

/** A single list-shaped skeleton row (avatar + two lines + trailing). */
function SkeletonRow({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "grid grid-cols-[34px_minmax(0,1fr)_80px_60px] items-center gap-3 px-[15px] py-[11px]",
        className
      )}
      {...props}
    >
      <Skeleton className="size-[34px] rounded-[9px]" />
      <div className="grid gap-1.5">
        <Skeleton className="h-3.5 w-3/5" />
        <Skeleton className="h-2.5 w-2/5" />
      </div>
      <Skeleton className="h-3.5" />
      <Skeleton className="h-3.5" />
    </div>
  );
}

export { Skeleton, SkeletonRow };
