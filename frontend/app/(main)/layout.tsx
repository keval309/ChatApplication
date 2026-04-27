"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMe } from "@/hooks/useAuth";
import { Spinner } from "@/components/ui/Spinner";
import { AppShell } from "@/components/chat/AppShell";

/**
 * Authenticated shell. Routes that should bypass the chat shell (settings,
 * onboarding) still get the AppShell wrapping; AppShell renders only the nav
 * rail / bottom bar when the route isn't /chat.
 */
const NON_SHELL_ROUTES = new Set(["/onboarding"]);

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { data, isLoading, isError } = useMe();

  React.useEffect(() => {
    if (isLoading) return;
    if (isError || !data) router.replace("/login");
  }, [data, isError, isLoading, router]);

  if (isLoading || !data) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-bg">
        <Spinner className="size-8 text-primary" label="Loading" />
      </main>
    );
  }

  if (NON_SHELL_ROUTES.has(pathname)) {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}
