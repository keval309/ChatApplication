"use client";

import * as React from "react";
import Image from "next/image";
import { X, Download } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface MediaLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/**
 * Full-screen image viewer. Closes on Esc, click on the dim, or the X button.
 * Focus is trapped to the close button by default for accessibility.
 */
export function MediaLightbox({ src, alt, onClose }: MediaLightboxProps) {
  const closeRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        "bg-black/85 animate-chat-fade-in",
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          download
          aria-label="Download image"
          className={cn(
            "h-11 w-11 grid place-items-center rounded-full",
            "bg-white/10 text-white hover:bg-white/20 backdrop-blur",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
          )}
        >
          <Download className="h-5 w-5" />
        </a>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={cn(
            "h-11 w-11 grid place-items-center rounded-full",
            "bg-white/10 text-white hover:bg-white/20 backdrop-blur",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
          )}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="max-h-full max-w-full">
        <Image
          src={src}
          alt={alt}
          width={1600}
          height={1200}
          className="max-h-[90vh] max-w-[95vw] w-auto h-auto object-contain"
          unoptimized={src.startsWith("data:") || src.startsWith("blob:")}
        />
      </div>
    </div>
  );
}
