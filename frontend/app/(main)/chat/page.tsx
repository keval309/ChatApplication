"use client";

import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { toast } from "@/components/ui/Toaster";
import { extractErrorMessage, useLogout, useMe } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

export default function ChatHomePage() {
  const router = useRouter();
  const { data: me } = useMe();
  const logout = useLogout();

  return (
    <main className="min-h-dvh bg-bg text-text">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-6 rounded-md bg-primary" />
          <span className="font-semibold">streamChat</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/settings")}>
            Settings
          </Button>
          <ThemeToggle />
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await logout.mutateAsync();
                router.replace("/login");
              } catch (err) {
                toast.error(extractErrorMessage(err));
              }
            }}
            loading={logout.isPending}
          >
            Sign out
          </Button>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-xl font-semibold">
          Welcome{me?.displayName ? `, ${me.displayName}` : ""}
        </h1>
        <p className="mt-2 text-text-muted">
          You&apos;re signed in. The conversations dashboard will live here.
        </p>
      </section>
    </main>
  );
}
