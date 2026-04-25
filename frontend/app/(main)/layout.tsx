"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/hooks/useAuth";
import { Spinner } from "@/components/ui/Spinner";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
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

  return <>{children}</>;
}
