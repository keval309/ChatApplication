"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthCard } from "@/components/ui/AuthCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FieldError } from "@/components/ui/FieldError";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/Toaster";
import { extractErrorMessage, useResetPassword } from "@/hooks/useAuth";
import { Eye, EyeOff } from "lucide-react";

const schema = z
  .object({
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

function ResetPasswordForm() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get("token");
  const reset = useResetPassword();
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  if (!token) {
    return (
      <AuthCard
        title="Invalid reset link"
        subtitle="This link is missing or malformed. Request a new one to continue."
        footer={
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <Button block onClick={() => router.push("/forgot-password")}>
          Request a new link
        </Button>
      </AuthCard>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await reset.mutateAsync({ token, newPassword: values.newPassword });
      toast.success("Password updated. Please sign in.");
      router.replace("/login");
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  });

  return (
    <AuthCard
      title="Set a new password"
      subtitle="Choose a strong password you don't use anywhere else."
      footer={
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div>
          <Label htmlFor="newPassword" required>
            New password
          </Label>
          <Input
            id="newPassword"
            type={showNewPassword ? "text" : "password"}
            autoComplete="new-password"
            autoFocus
            placeholder="Min. 8 characters"
            invalid={!!errors.newPassword}
            rightAdornment={
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="inline-flex items-center justify-center text-text-muted hover:text-text"
                aria-label={showNewPassword ? "Hide password" : "Show password"}
              >
                {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
            {...register("newPassword")}
          />
          <FieldError message={errors.newPassword?.message} />
        </div>

        <div>
          <Label htmlFor="confirmPassword" required>
            Confirm password
          </Label>
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Re-enter new password"
            invalid={!!errors.confirmPassword}
            rightAdornment={
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="inline-flex items-center justify-center text-text-muted hover:text-text"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
            {...register("confirmPassword")}
          />
          <FieldError message={errors.confirmPassword?.message} />
        </div>

        <Button type="submit" loading={reset.isPending} block>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense
      fallback={
        <AuthCard title="Reset password" subtitle="Loading…">
          <div className="flex justify-center py-4">
            <Spinner className="size-8 text-primary" label="Loading" />
          </div>
        </AuthCard>
      }
    >
      <ResetPasswordForm />
    </React.Suspense>
  );
}
