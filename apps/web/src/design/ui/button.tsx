import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/design/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-base font-medium transition-[color,background-color,border-color,box-shadow,transform] outline-none focus-visible:shadow-[var(--ring)] disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-line-2 bg-panel text-ink shadow-sm hover:border-primary-line hover:bg-[color-mix(in_srgb,var(--primary)_6%,var(--panel))]",
        primary:
          "border border-transparent text-primary-ink bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_92%,#fff_8%),var(--primary))] shadow-[0_8px_20px_-8px_color-mix(in_srgb,var(--primary)_70%,transparent)] hover:bg-primary",
        ghost:
          "border border-transparent bg-transparent hover:bg-panel-2 hover:border-line",
        danger:
          "border border-transparent text-primary-ink bg-[linear-gradient(180deg,color-mix(in_srgb,var(--red)_92%,#fff_8%),var(--red))] shadow-[0_8px_20px_-8px_color-mix(in_srgb,var(--red)_70%,transparent)]",
        outline:
          "border border-line-2 bg-transparent text-ink hover:bg-panel-2 hover:border-primary-line",
      },
      size: {
        default: "min-h-9 px-[13px]",
        sm: "min-h-[30px] px-[9px] text-sm gap-1.5 [&_svg]:size-3.5",
        lg: "min-h-10 px-4 text-md",
        icon: "size-9 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
