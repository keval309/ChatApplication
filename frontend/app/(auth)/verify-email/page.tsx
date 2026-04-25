"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/ui/AuthCard";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/Toaster";
import {
  extractErrorMessage,
  useResendVerification,
  useVerifyEmail,
} from "@/hooks/useAuth";

type Status = "idle" | "loading" | "success" | "error";

function VerifyEmailContent() {
  const router = useRouter();
  const search = useSearchParams();
  const tokenFromUrl = search.get("token");
  const emailHint = search.get("email");

  const verify = useVerifyEmail();
  const resend = useResendVerification();

  const [status, setStatus] = React.useState<Status>(
    tokenFromUrl ? "loading" : "idle",
  );
  const [errorMessage, setErrorMessage] = React.useState<string>("");
  const [resendCooldown, setResendCooldown] = React.useState<number>(
    tokenFromUrl ? 0 : emailHint ? 60 : 0,
  );

  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = window.setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [resendCooldown]);

  async function handleResendVerification() {
    if (!emailHint || resendCooldown > 0) return;
    try {
      await resend.mutateAsync(emailHint);
      toast.success("If the email exists, a new link has been sent");
      setResendCooldown(60);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  }

  React.useEffect(() => {
    if (!tokenFromUrl) return;
    let cancelled = false;
    verify
      .mutateAsync(tokenFromUrl)
      .then(() => {
        if (cancelled) return;
        setStatus("success");
        toast.success("Email verified");
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(extractErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromUrl]);

  if (tokenFromUrl) {
    if (status === "loading") {
      return (
        <AuthCard title="Verifying your email" subtitle="Just a moment…">
          <div className="flex justify-center py-4">
            <Spinner className="size-8 text-primary" label="Verifying" />
          </div>
        </AuthCard>
      );
    }

    if (status === "success") {
      return (
        <AuthCard
          title="You're all set"
          subtitle="Your email has been verified. You can sign in now."
        >
          <Button block onClick={() => router.push("/login")}>
            Continue to sign in
          </Button>
        </AuthCard>
      );
    }

    return (
      <AuthCard
        title="Verification failed"
        subtitle={errorMessage || "This link is invalid or has expired."}
        footer={
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <Button
          block
          variant="outline"
          loading={resend.isPending}
          disabled={!emailHint || resendCooldown > 0}
          onClick={handleResendVerification}
        >
          {resendCooldown > 0
            ? `Resend in ${resendCooldown}s`
            : "Resend verification email"}
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Check your inbox"
      subtitle={
        emailHint
          ? `We've sent a verification link to ${emailHint}.`
          : "We've sent you a verification link. Open it to activate your account."
      }
      footer={
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <Button
        block
        variant="outline"
        loading={resend.isPending}
        disabled={!emailHint || resendCooldown > 0}
        onClick={handleResendVerification}
      >
        {resendCooldown > 0
          ? `Resend in ${resendCooldown}s`
          : "Resend verification email"}
      </Button>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense
      fallback={
        <AuthCard title="Verifying your email" subtitle="Just a moment…">
          <div className="flex justify-center py-4">
            <Spinner className="size-8 text-primary" label="Loading" />
          </div>
        </AuthCard>
      }
    >
      <VerifyEmailContent />
    </React.Suspense>
  );
}
