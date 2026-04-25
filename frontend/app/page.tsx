"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/hooks/useAuth";
import { Spinner } from "@/components/ui/Spinner";

export default function HomePage() {
  const router = useRouter();
  const { data, isLoading, isError } = useMe();

  useEffect(() => {
    if (isLoading) return;
    if (isError || !data) {
      router.replace("/login");
      return;
    }
    if (!data.username) {
      router.replace("/onboarding");
    } else {
      router.replace("/chat");
    }
  }, [data, isError, isLoading, router]);

  return (
    <main className="min-h-dvh flex items-center justify-center bg-bg">
      <Spinner className="size-8 text-primary" label="Loading" />
    </main>
  );
}
