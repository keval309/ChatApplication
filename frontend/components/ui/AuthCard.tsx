import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

interface AuthCardProps {
  title: string;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function AuthCard({
  title,
  subtitle,
  footer,
  children,
  className,
}: AuthCardProps) {
  return (
    <main className="min-h-dvh w-full flex items-center justify-center bg-bg px-4 py-10">
      <div
        className={cn(
          "w-full max-w-md flex flex-col gap-6",
          "bg-bg-elevated border border-border rounded-2xl shadow-sm",
          "p-6 sm:p-8",
          className,
        )}
      >
        <header className="flex flex-col gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text"
          >
            <span
              aria-hidden
              className="inline-block size-6 rounded-md bg-primary"
            />
            <span className="font-semibold text-text">streamChat</span>
          </Link>
          <h1 className="text-xl font-semibold leading-tight">{title}</h1>
          {subtitle ? (
            <p className="text-sm text-text-muted">{subtitle}</p>
          ) : null}
        </header>

        <div className="flex flex-col gap-4">{children}</div>

        {footer ? (
          <footer className="text-sm text-text-muted text-center">
            {footer}
          </footer>
        ) : null}
      </div>
    </main>
  );
}
