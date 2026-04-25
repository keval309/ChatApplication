"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setUnauthenticatedHandler } from "@/lib/api";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  React.useEffect(() => {
    setUnauthenticatedHandler(() => router.replace("/login"));
    return () => setUnauthenticatedHandler(null);
  }, [router]);

  return <>{children}</>;
}
