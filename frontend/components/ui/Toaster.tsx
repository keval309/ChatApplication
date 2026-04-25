"use client";

import * as React from "react";
import { Toaster as SonnerToaster, toast } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "bg-bg-elevated border border-border text-text shadow-sm rounded-xl",
          title: "text-md font-medium",
          description: "text-sm text-text-muted",
          actionButton: "bg-primary text-text-inverse",
          cancelButton: "bg-bg-subtle text-text",
          success: "border-success/40",
          error: "border-error/40",
        },
      }}
    />
  );
}

export { toast };
