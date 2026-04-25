"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthCard } from "@/components/ui/AuthCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FieldError } from "@/components/ui/FieldError";
import { toast } from "@/components/ui/Toaster";
import {
  extractErrorMessage,
  useMe,
  useUpdateProfile,
} from "@/hooks/useAuth";

const schema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      "Only letters, numbers, dots, underscores, dashes",
    ),
  displayName: z
    .string()
    .min(2, "Display name must be at least 2 characters")
    .max(50, "Display name must be at most 50 characters"),
});

type FormValues = z.infer<typeof schema>;

export default function OnboardingPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const update = useUpdateProfile();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: me?.username ?? "",
      displayName: me?.displayName ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values);
      toast.success("Profile saved");
      router.replace("/chat");
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  });

  return (
    <AuthCard
      title="Set up your profile"
      subtitle="Pick a username and a display name. You can change these later."
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div>
          <Label htmlFor="username" required>
            Username
          </Label>
          <Input
            id="username"
            autoComplete="off"
            autoFocus
            placeholder="e.g. ada.lovelace"
            invalid={!!errors.username}
            {...register("username")}
          />
          <FieldError message={errors.username?.message} />
        </div>

        <div>
          <Label htmlFor="displayName" required>
            Display name
          </Label>
          <Input
            id="displayName"
            autoComplete="name"
            placeholder="e.g. Ada Lovelace"
            invalid={!!errors.displayName}
            {...register("displayName")}
          />
          <FieldError message={errors.displayName?.message} />
        </div>

        <Button type="submit" loading={update.isPending} block>
          Continue
        </Button>
      </form>
    </AuthCard>
  );
}
