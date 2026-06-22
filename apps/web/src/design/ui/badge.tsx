import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/design/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-[9px] py-[3px] text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        info: "bg-primary-soft text-primary",
        ok: "bg-green-soft text-green",
        warn: "bg-amber-soft text-amber",
        bad: "bg-red-soft text-red",
        mute: "bg-panel-3 text-muted",
        outline: "border border-line bg-panel-2 text-muted font-normal",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
