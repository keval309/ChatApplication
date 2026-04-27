"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";

interface AvatarProps {
  src?: string | null;
  alt: string;
  size?: 24 | 32 | 40 | 48 | 56 | 72;
  className?: string;
  fallbackChar?: string | null;
}

const SIZE_PX: Record<number, number> = { 24: 24, 32: 32, 40: 40, 48: 48, 56: 56, 72: 72 };

/** OAuth / common profile CDNs: `unoptimized` avoids Next’s remote hostname allowlist for small avatars. */
function avatarSrcUnoptimized(src: string): boolean {
  if (src.startsWith("data:") || src.startsWith("blob:")) return true;
  try {
    const { hostname } = new URL(src);
    if (hostname === "avatars.githubusercontent.com") return true;
    if (hostname.endsWith(".googleusercontent.com")) return true;
    return false;
  } catch {
    return true;
  }
}

/**
 * Square-rounded avatar with deterministic fallback initial.
 * Uses next/image for remote sources; falls back to a colored monogram tile.
 */
export function Avatar({
  src,
  alt,
  size = 40,
  className,
  fallbackChar,
}: AvatarProps) {
  const [errored, setErrored] = React.useState(false);
  const px = SIZE_PX[size];
  const initial = (
    fallbackChar ?? (alt.trim().charAt(0) || "?")
  ).toUpperCase();

  if (!src || errored) {
    return (
      <div
        className={cn(
          "shrink-0 rounded-full grid place-items-center bg-bg-subtle border border-border",
          "text-text-muted font-medium select-none",
          className,
        )}
        style={{ width: px, height: px, fontSize: Math.round(px * 0.42) }}
        aria-label={alt}
        role="img"
      >
        {initial}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "shrink-0 rounded-full overflow-hidden bg-bg-subtle relative",
        className,
      )}
      style={{ width: px, height: px }}
    >
      <Image
        src={src}
        alt={alt}
        width={px}
        height={px}
        className="object-cover"
        onError={() => setErrored(true)}
        unoptimized={avatarSrcUnoptimized(src)}
      />
    </div>
  );
}
