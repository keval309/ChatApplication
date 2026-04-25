import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface FieldErrorProps extends React.HTMLAttributes<HTMLParagraphElement> {
  message?: string | null;
}

export function FieldError({ message, className, ...props }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className={cn("mt-1 text-xs text-error", className)}
      {...props}
    >
      {message}
    </p>
  );
}
