"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leftAdornment?: React.ReactNode;
  rightAdornment?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { className, invalid, leftAdornment, rightAdornment, type = "text", ...props },
    ref,
  ) {
    const baseField = cn(
      "flex h-11 w-full min-w-0 rounded-xl bg-bg-elevated px-3 text-md",
      "border placeholder:text-text-muted text-text",
      "transition-colors duration-150 outline-none",
      "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
      "focus-visible:ring-offset-bg",
      invalid
        ? "border-error focus-visible:ring-error/60"
        : "border-border focus-visible:border-primary",
      "disabled:cursor-not-allowed disabled:opacity-60",
    );

    if (!leftAdornment && !rightAdornment) {
      return (
        <input
          ref={ref}
          type={type}
          aria-invalid={invalid || undefined}
          className={cn(baseField, className)}
          {...props}
        />
      );
    }

    return (
      <div
        className={cn(
          "relative flex items-center w-full",
          "rounded-xl border bg-bg-elevated",
          invalid ? "border-error" : "border-border focus-within:border-primary",
          "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1",
          "focus-within:ring-offset-bg",
          className,
        )}
      >
        {leftAdornment ? (
          <span className="pl-3 text-text-muted shrink-0 inline-flex items-center">
            {leftAdornment}
          </span>
        ) : null}
        <input
          ref={ref}
          type={type}
          aria-invalid={invalid || undefined}
          className={cn(
            "flex-1 h-11 bg-transparent px-3 text-md outline-none",
            "placeholder:text-text-muted text-text",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
          {...props}
        />
        {rightAdornment ? (
          <span className="pr-3 text-text-muted shrink-0 inline-flex items-center">
            {rightAdornment}
          </span>
        ) : null}
      </div>
    );
  },
);
