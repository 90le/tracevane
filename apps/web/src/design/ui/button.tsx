import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/design/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-base font-medium outline-none transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--dur-1)] ease-[var(--ease-standard)] focus-visible:shadow-[var(--ring)] disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-line-2 bg-panel-2 text-ink shadow-sm hover:border-line-2 hover:bg-panel-3",
        primary:
          "border border-transparent bg-primary text-primary-ink shadow-[0_6px_18px_-6px_color-mix(in_srgb,var(--color-primary)_60%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,#fff_8%)]",
        ghost:
          "border border-transparent bg-transparent hover:bg-panel-2",
        danger:
          "border border-transparent bg-danger text-primary-ink shadow-[0_6px_18px_-6px_color-mix(in_srgb,var(--color-danger)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-danger)_92%,#fff_8%)]",
        "danger-soft":
          "border border-danger-line bg-danger-soft text-danger hover:border-danger/60",
        outline:
          "border border-line bg-panel-2 text-ink hover:bg-panel-3",
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
