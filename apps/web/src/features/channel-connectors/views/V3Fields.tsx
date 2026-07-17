import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { Input } from "@/design/ui/input";

export function FormField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid min-w-0 gap-1.5 text-sm text-ink-strong", className)}>
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-subtle">{hint}</span>}
    </label>
  );
}

export function SelectInput({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-sm border border-line bg-panel-2 px-[11px] text-base text-ink-strong outline-none transition-[border-color,color,box-shadow,background-color] duration-[var(--dur-1)] ease-[var(--ease-standard)]",
        "hover:border-line-2 focus-visible:border-primary-line focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function TextareaInput({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-y rounded-sm border border-line bg-panel-2 px-[11px] py-2 text-sm text-ink-strong outline-none transition-[border-color,color,box-shadow,background-color] duration-[var(--dur-1)] ease-[var(--ease-standard)]",
        "placeholder:text-subtle hover:border-line-2 focus-visible:border-primary-line focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function SecretInput({
  value,
  onChange,
  placeholder,
  disabled,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label: string;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        autoComplete="new-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="pr-10"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-0 top-0 size-9 border-0"
        onClick={() => setVisible((current) => !current)}
        disabled={disabled || !value}
        title={visible ? `隐藏${label}` : `显示${label}`}
        aria-label={visible ? `隐藏${label}` : `显示${label}`}
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  );
}

export function ToggleField({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-w-0 items-start gap-3 rounded-sm border border-line bg-panel px-3 py-2.5 transition-colors duration-[var(--dur-1)] ease-[var(--ease-standard)] hover:border-line-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="mt-0.5 size-4 accent-[var(--primary)]"
      />
      <span className="grid min-w-0 gap-0.5">
        <strong className="text-sm font-medium text-ink-strong">{label}</strong>
        {description && <span className="text-xs leading-relaxed text-subtle">{description}</span>}
      </span>
    </label>
  );
}
