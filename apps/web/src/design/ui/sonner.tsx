import { Toaster as SonnerToaster, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

/**
 * Aurora-themed sonner toaster. Drives colors from Aurora tokens so it
 * tracks light/dark/palette automatically. Mount once near the app root.
 */
function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "!bg-panel !border !border-line !text-ink-strong !shadow-md !rounded-[11px] !text-base",
          description: "!text-muted",
          actionButton: "!bg-primary !text-primary-ink !rounded-sm",
          cancelButton: "!bg-panel-2 !text-muted !rounded-sm",
          success: "!text-green",
          error: "!text-red",
          warning: "!text-amber",
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
