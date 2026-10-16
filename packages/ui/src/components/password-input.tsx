"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { type VariantProps } from "class-variance-authority";
import { cn } from "@workspace/ui/lib/utils";
import { Input, inputVariants } from "@workspace/ui/components/input";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type" | "size"> &
  VariantProps<typeof inputVariants> & {
    showPasswordLabel: string;
    hidePasswordLabel: string;
    startIcon?: React.ReactNode;
  };

function PasswordInput({
  className,
  size = "default",
  showPasswordLabel,
  hidePasswordLabel,
  startIcon,
  disabled,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false);
  const label = visible ? hidePasswordLabel : showPasswordLabel;

  return (
    <div className="relative">
      {startIcon ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-0 z-10 flex items-center ps-3.5 text-subtle"
        >
          {startIcon}
        </span>
      ) : null}
      <Input
        type={visible ? "text" : "password"}
        size={size}
        disabled={disabled}
        className={cn(startIcon && "ps-12", "pe-12", className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label={label}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
        className="absolute end-1.5 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export { PasswordInput };
export type { PasswordInputProps };
