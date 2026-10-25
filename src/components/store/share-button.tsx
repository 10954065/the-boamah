"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";

/** Opens the phone's share sheet, or copies the link where sharing is not supported. */
export function ShareButton({ title, path }: { title: string; path: string }) {
  const share = async () => {
    const url = new URL(path, window.location.origin).toString();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
      } catch {
        // The visitor closed the share sheet.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy the link. You can copy it from the address bar.");
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-ink-muted transition-colors hover:bg-soft hover:text-brand-700"
    >
      <Share2 className="h-4 w-4" aria-hidden="true" />
      Share
    </button>
  );
}
