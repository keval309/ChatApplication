"use client";

import * as React from "react";
import { Button, type ButtonProps } from "./Button";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.13 4.13 0 0 1-1.79 2.71v2.26h2.9c1.7-1.56 2.69-3.87 2.69-6.61z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.46-.8 5.95-2.19l-2.9-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.95v2.32A9 9 0 0 0 9 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.97 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.16.29-1.7V4.98H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.02l3.01-2.32z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.98l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"
    />
  </svg>
);

export interface GoogleButtonProps extends Omit<ButtonProps, "leftIcon" | "variant"> {
  label?: string;
}

export function GoogleButton({
  label = "Continue with Google",
  block = true,
  ...rest
}: GoogleButtonProps) {
  return (
    <Button
      variant="outline"
      block={block}
      leftIcon={<GoogleIcon />}
      {...rest}
    >
      {label}
    </Button>
  );
}
