"use client";

import * as React from "react";
import {
  extractErrorMessage,
  NOTIFICATION_LEVEL_OPTIONS,
  useBlockedUsers,
  useMe,
  useUnblockUser,
  useUpdateProfile,
  useUpdateUserSettings,
  useUploadAvatar,
  useUsernameAvailability,
  useUserSettings,
} from "@/hooks/useAuth";
import { toast } from "@/components/ui/Toaster";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import type { NotificationLevel, PresenceStatus } from "@/types/auth";
import { API_URL } from "@/lib/api";
import { useRouter } from "next/navigation";

const PRESENCE_OPTIONS: PresenceStatus[] = [
  "ONLINE",
  "AWAY",
  "DND",
  "INVISIBLE",
  "OFFLINE",
];

interface AvatarEditorState {
  scale: number;
  rotate: number;
}

async function fileFromCanvas(canvas: HTMLCanvasElement): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", 0.9);
  });
  if (!blob) {
    throw new Error("Failed to generate avatar image");
  }
  return new File([blob], "avatar.webp", { type: "image/webp" });
}

function drawAvatarPreview(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  editor: AvatarEditorState,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const size = 256;
  canvas.width = size;
  canvas.height = size;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((editor.rotate * Math.PI) / 180);

  const minDim = Math.min(image.width, image.height);
  const drawSize = size * editor.scale;
  const sx = (image.width - minDim) / 2;
  const sy = (image.height - minDim) / 2;

  ctx.drawImage(
    image,
    sx,
    sy,
    minDim,
    minDim,
    -(drawSize / 2),
    -(drawSize / 2),
    drawSize,
    drawSize,
  );
  ctx.restore();
}

export function UserSettingsScreen(): React.JSX.Element {
  const router = useRouter();
  const { data: me } = useMe();
  const settingsQuery = useUserSettings();
  const blockedQuery = useBlockedUsers();

  const updateProfile = useUpdateProfile();
  const updateSettings = useUpdateUserSettings();
  const checkUsername = useUsernameAvailability();
  const uploadAvatar = useUploadAvatar();
  const unblockUser = useUnblockUser();
  const [avatarVersion, setAvatarVersion] = React.useState(0);
  const [avatarLoadError, setAvatarLoadError] = React.useState(false);

  const resolvedAvatarUrl = React.useMemo(() => {
    const rawUrl = me?.avatarUrl?.trim();
    if (!rawUrl) return null;
    const absoluteUrl =
      rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
        ? rawUrl
        : `${API_URL}${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`;
    const separator = absoluteUrl.includes("?") ? "&" : "?";
    return `${absoluteUrl}${separator}v=${avatarVersion}`;
  }, [avatarVersion, me?.avatarUrl]);

  const [displayName, setDisplayName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [statusMessage, setStatusMessage] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [presenceStatus, setPresenceStatus] = React.useState<PresenceStatus>("ONLINE");

  const [usernameAvailability, setUsernameAvailability] = React.useState<null | boolean>(
    null,
  );
  const [avatarImage, setAvatarImage] = React.useState<HTMLImageElement | null>(null);
  const [avatarEditor, setAvatarEditor] = React.useState<AvatarEditorState>({
    scale: 1,
    rotate: 0,
  });
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const [lastSeenVisible, setLastSeenVisible] = React.useState(true);
  const [sendReadReceipts, setSendReadReceipts] = React.useState(true);
  const [globalNotificationLevel, setGlobalNotificationLevel] =
    React.useState<NotificationLevel>("ALL_MESSAGES");
  const [autoUnmuteReminder, setAutoUnmuteReminder] = React.useState(false);


  React.useEffect(() => {
    if (!me) return;
    setDisplayName(me.displayName ?? "");
    setUsername(me.username ?? "");
    setStatusMessage(me.statusMessage ?? "");
    setBio(me.bio ?? "");
    setPresenceStatus(me.presenceStatus ?? "ONLINE");
  }, [me]);

  React.useEffect(() => {
    if (!settingsQuery.data) return;
    setLastSeenVisible(settingsQuery.data.lastSeenVisible);
    setSendReadReceipts(settingsQuery.data.sendReadReceipts);
    setGlobalNotificationLevel(settingsQuery.data.globalNotificationLevel);
    setAutoUnmuteReminder(settingsQuery.data.autoUnmuteReminder);
  }, [settingsQuery.data]);

  React.useEffect(() => {
    if (!avatarImage || !canvasRef.current) return;
    drawAvatarPreview(canvasRef.current, avatarImage, avatarEditor);
  }, [avatarEditor, avatarImage]);

  React.useEffect(() => {
    const normalized = username.trim();
    if (!normalized || normalized === me?.username) {
      setUsernameAvailability(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const result = await checkUsername.mutateAsync(normalized);
        setUsernameAvailability(result.available);
      } catch {
        setUsernameAvailability(null);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [checkUsername, me?.username, username]);

  const handleAvatarSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Avatar size must be 5MB or less.");
      return;
    }
    const src = await file.arrayBuffer();
    const image = new Image();
    image.src = URL.createObjectURL(new Blob([src], { type: file.type }));
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not load image"));
    });
    setAvatarImage(image);
    setAvatarEditor({ scale: 1, rotate: 0 });
  };

  const handleUploadAvatar = async (): Promise<void> => {
    if (!avatarImage || !canvasRef.current) {
      toast.error("Pick an avatar image first.");
      return;
    }
    try {
      const file = await fileFromCanvas(canvasRef.current);
      await uploadAvatar.mutateAsync(file);
      setAvatarVersion((prev) => prev + 1);
      setAvatarLoadError(false);
      toast.success("Avatar updated");
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  };

  const handleSaveProfile = async (): Promise<void> => {
    if (usernameAvailability === false) {
      toast.error("Username is already taken.");
      return;
    }
    try {
      await updateProfile.mutateAsync({
        username: username.trim(),
        displayName: displayName.trim(),
        statusMessage: statusMessage.trim(),
        bio: bio.trim(),
        presenceStatus,
      });
      toast.success("Profile updated");
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  };

  const handleSavePrivacyAndNotifications = async (): Promise<void> => {
    try {
      await updateSettings.mutateAsync({
        lastSeenVisible,
        sendReadReceipts,
        globalNotificationLevel,
        autoUnmuteReminder,
      });
      toast.success("Settings saved");
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  };

  const isBusy =
    updateProfile.isPending ||
    updateSettings.isPending ||
    uploadAvatar.isPending;

  return (
    <main className="min-h-dvh bg-bg text-text">
      <section className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
        <header className="mb-6 rounded-xl border border-border bg-bg-elevated p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Settings</h1>
              <p className="text-sm text-text-muted">
                Manage your profile, privacy, notifications, and blocked users.
              </p>
            </div>
            <Button variant="outline" onClick={() => router.push("/chat")}>
              Back to chat
            </Button>
          </div>
        </header>

        <div className="space-y-4">
          <article className="rounded-xl border border-border bg-bg-elevated p-4">
            <h2 className="text-lg font-medium">Profile</h2>
            <p className="mb-4 text-sm text-text-muted">
              Keep your public profile information up to date.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="displayName" required>
                  Display name
                </Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="username" required>
                  Username
                </Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
                <p className="mt-1 text-xs text-text-muted">
                  {usernameAvailability === null
                    ? "Typing checks availability..."
                    : usernameAvailability
                      ? "Username is available"
                      : "Username is already taken"}
                </p>
              </div>
              <div>
                <Label htmlFor="statusMessage">Status message</Label>
                <Input
                  id="statusMessage"
                  value={statusMessage}
                  maxLength={100}
                  onChange={(event) => setStatusMessage(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="presenceStatus">Presence</Label>
                <select
                  id="presenceStatus"
                  className="h-11 w-full rounded-xl border border-border bg-bg px-3 text-md"
                  value={presenceStatus}
                  onChange={(event) => setPresenceStatus(event.target.value as PresenceStatus)}
                >
                  {PRESENCE_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="bio">Bio</Label>
                <textarea
                  id="bio"
                  className="min-h-24 w-full rounded-xl border border-border bg-bg px-3 py-2 text-md outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  value={bio}
                  maxLength={300}
                  onChange={(event) => setBio(event.target.value)}
                />
              </div>
            </div>
            <div className="mt-4">
              <Button onClick={handleSaveProfile} loading={updateProfile.isPending}>
                Save profile
              </Button>
            </div>
          </article>

          <article className="rounded-xl border border-border bg-bg-elevated p-4">
            <h2 className="text-lg font-medium">Avatar</h2>
            <p className="mb-4 text-sm text-text-muted">
              Upload, crop, and rotate your avatar before saving.
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 overflow-hidden rounded-full border border-border bg-bg-subtle">
                  {resolvedAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolvedAvatarUrl ?? ""}
                      alt="Current avatar"
                      className="h-full w-full object-cover"
                      onError={() => setAvatarLoadError(true)}
                      onLoad={() => setAvatarLoadError(false)}
                    />
                  ) : null}
                </div>
                <div>
                  <p className="text-sm text-text-muted">
                    {resolvedAvatarUrl
                      ? "Current avatar from your profile"
                      : "No avatar uploaded yet"}
                  </p>
                  {resolvedAvatarUrl ? (
                    <a
                      href={resolvedAvatarUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Open current avatar URL
                    </a>
                  ) : null}
                  {avatarLoadError ? (
                    <p className="text-xs text-error">
                      Avatar URL exists but image failed to load.
                    </p>
                  ) : null}
                </div>
              </div>
              <Input type="file" accept="image/*" onChange={handleAvatarSelect} />
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="scale">Zoom</Label>
                  <Input
                    id="scale"
                    type="range"
                    min={1}
                    max={2}
                    step={0.05}
                    value={avatarEditor.scale}
                    onChange={(event) =>
                      setAvatarEditor((prev) => ({
                        ...prev,
                        scale: Number(event.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="rotate">Rotate</Label>
                  <Input
                    id="rotate"
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={avatarEditor.rotate}
                    onChange={(event) =>
                      setAvatarEditor((prev) => ({
                        ...prev,
                        rotate: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              </div>
              <canvas
                ref={canvasRef}
                className="h-40 w-40 rounded-full border border-border bg-bg-subtle"
                aria-label="Avatar preview"
              />
              <Button onClick={handleUploadAvatar} loading={uploadAvatar.isPending}>
                Upload avatar
              </Button>
            </div>
          </article>

          <article className="rounded-xl border border-border bg-bg-elevated p-4">
            <h2 className="text-lg font-medium">Privacy and Notifications</h2>
            <p className="mb-4 text-sm text-text-muted">
              Control your visibility and global notification defaults.
            </p>
            <div className="grid gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={lastSeenVisible}
                  onChange={(event) => setLastSeenVisible(event.target.checked)}
                />
                Show last seen to others
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sendReadReceipts}
                  onChange={(event) => setSendReadReceipts(event.target.checked)}
                />
                Send read receipts (also controls receiving)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoUnmuteReminder}
                  onChange={(event) => setAutoUnmuteReminder(event.target.checked)}
                />
                Notify me when mute expires
              </label>
              <div>
                <Label htmlFor="globalNotificationLevel">Global notifications</Label>
                <select
                  id="globalNotificationLevel"
                  className="h-11 w-full rounded-xl border border-border bg-bg px-3 text-md"
                  value={globalNotificationLevel}
                  onChange={(event) =>
                    setGlobalNotificationLevel(event.target.value as NotificationLevel)
                  }
                >
                  {NOTIFICATION_LEVEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <Button
                onClick={handleSavePrivacyAndNotifications}
                loading={updateSettings.isPending}
              >
                Save privacy and notifications
              </Button>
            </div>
          </article>

          <article className="rounded-xl border border-border bg-bg-elevated p-4">
            <h2 className="text-lg font-medium">Blocked users</h2>
            <p className="mb-4 text-sm text-text-muted">
              Users blocked from chat appear here. You can unblock them anytime.
            </p>
            <div className="mt-4 space-y-2">
              {(blockedQuery.data ?? []).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-bg-subtle p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {item.blockedUser.displayName ?? item.blockedUser.username ?? item.blockedId}
                    </p>
                    <p className="text-xs text-text-muted">{item.blockedId}</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => void unblockUser.mutateAsync(item.blockedId)}
                    loading={unblockUser.isPending}
                  >
                    Unblock
                  </Button>
                </div>
              ))}
            </div>
          </article>
        </div>

        {(settingsQuery.isLoading || blockedQuery.isLoading) && (
          <p className="mt-4 text-sm text-text-muted">Loading settings...</p>
        )}
        {isBusy && <p className="mt-2 text-sm text-text-muted">Saving changes...</p>}
      </section>
    </main>
  );
}

