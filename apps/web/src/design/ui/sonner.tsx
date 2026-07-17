import { Toaster as SonnerToaster, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

/**
 * Token-driven sonner toaster. Colors come from the design tokens so the
 * toasts track light/dark automatically. Mount once near the app root.
 */
function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "!bg-panel !border !border-line !text-ink-strong !shadow-lg !rounded-md !text-base",
          description: "!text-muted",
          actionButton: "!bg-primary !text-primary-ink !rounded-sm",
          cancelButton: "!bg-panel-2 !text-muted !rounded-sm",
          success: "!text-success",
          error: "!text-danger",
          warning: "!text-warning",
          info: "!text-primary",
        },
      }}
      style={
        {
          "--normal-bg": "var(--panel)",
          "--normal-border": "var(--line)",
          "--normal-text": "var(--ink-strong)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster, toast };
