import * as React from "react";

import { cn } from "@/design/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "h-9 w-full rounded-sm border border-line bg-panel-2 px-[11px] text-base text-ink-strong outline-none transition-[border-color,box-shadow]",
          "placeholder:text-subtle",
          "focus-visible:border-primary-line focus-visible:shadow-[var(--ring)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "file:border-0 file:bg-transparent file:text-base file:font-medium",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
