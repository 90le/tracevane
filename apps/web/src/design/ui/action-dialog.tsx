import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/design/ui/dialog";
import { Input } from "@/design/ui/input";

type ActionDialogTone = "default" | "primary" | "danger" | "warning";

export interface ActionDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: ActionDialogTone;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentDataAttr?: string;
  showClose?: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ActionDialog({
  open,
  title,
  description,
  icon,
  tone = "default",
  children,
  footer,
  className,
  contentDataAttr,
  showClose = true,
  onOpenChange,
}: ActionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={showClose}
        className={cn(
          "w-[min(560px,94vw)] max-w-none overflow-hidden rounded-lg p-0 shadow-lg",
          className,
        )}
        data-action-dialog={contentDataAttr ?? "true"}
      >
        <DialogHeader className="items-start border-b border-line bg-panel-2/80 px-4 pb-3 pr-12 pt-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? (
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-md border [&_svg]:size-4",
                  actionToneClass(tone),
                )}
              >
                {icon}
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base">{title}</DialogTitle>
              {description ? (
                <DialogDescription className="mt-1 break-words text-sm leading-5">
                  {description}
                </DialogDescription>
              ) : null}
            </div>
          </div>
        </DialogHeader>
        {children ? (
          <DialogBody className="grid gap-3 px-4 py-4 text-sm">{children}</DialogBody>
        ) : null}
        {footer ? (
          <DialogFooter className="border-t border-line bg-panel-2/80 px-4 py-3">
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export interface TextInputDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: ActionDialogTone;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  inputDataAttr?: string;
  contentDataAttr?: string;
  validate?: (value: string) => string | null;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

export function TextInputDialog({
  open,
  title,
  description,
  icon,
  tone = "primary",
  label,
  initialValue = "",
  placeholder,
  confirmLabel,
  cancelLabel = "取消",
  busy = false,
  inputDataAttr,
  contentDataAttr,
  validate,
  onCancel,
  onConfirm,
}: TextInputDialogProps) {
  const formId = React.useId();
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    if (open) setValue(initialValue);
  }, [initialValue, open]);

  const normalized = value.trim();
  const error = validate?.(normalized) ?? null;

  return (
    <ActionDialog
      open={open}
      title={title}
      description={description}
      icon={icon}
      tone={tone}
      contentDataAttr={contentDataAttr}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onCancel();
      }}
      footer={(
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant={tone === "danger" ? "danger" : "primary"}
            size="sm"
            disabled={busy || Boolean(error)}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : icon}
            {busy ? "处理中…" : confirmLabel}
          </Button>
        </>
      )}
    >
      <form
        id={formId}
        className="contents"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || error) return;
          onConfirm(normalized);
        }}
      >
        <label className="grid gap-1.5 text-xs font-medium text-muted">
          {label}
          <Input
            autoFocus
            value={value}
            placeholder={placeholder}
            disabled={busy}
            onChange={(event) => setValue(event.target.value)}
            data-action-dialog-input={inputDataAttr ?? "true"}
          />
        </label>
        {error ? (
          <div className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}
      </form>
    </ActionDialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: ActionDialogTone;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  children?: React.ReactNode;
  contentDataAttr?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  icon,
  tone = "primary",
  confirmLabel,
  cancelLabel = "取消",
  busy = false,
  children,
  contentDataAttr,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <ActionDialog
      open={open}
      title={title}
      description={description}
      icon={icon}
      tone={tone}
      contentDataAttr={contentDataAttr}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onCancel();
      }}
      footer={(
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "danger" : "primary"}
            size="sm"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : icon}
            {busy ? "处理中…" : confirmLabel}
          </Button>
        </>
      )}
    >
      {children}
    </ActionDialog>
  );
}

function actionToneClass(tone: ActionDialogTone): string {
  if (tone === "danger") return "border-danger-line bg-danger-soft text-danger";
  if (tone === "warning") return "border-warning-line bg-warning-soft text-warning";
  if (tone === "primary") return "border-primary-line bg-primary-soft text-primary";
  return "border-line bg-panel text-subtle";
}
