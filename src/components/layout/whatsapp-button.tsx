"use client";

import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsAppButtonProps {
  href: string;
  /** Product pages render their own button with the product in the message. */
  forProduct?: boolean;
  className?: string;
}

/** Floating "chat on WhatsApp" link, bottom right of every store page. */
export function WhatsAppButton({ href, forProduct = false, className }: WhatsAppButtonProps) {
  const pathname = usePathname();
  if (!forProduct && pathname.startsWith("/products/")) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp (opens WhatsApp)"
      className={cn(
        "pop group fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-4 z-30 flex h-13 w-13 items-center justify-center rounded-full bg-[#25d366] text-white shadow-[var(--shadow-overlay)] ring-4 ring-white/70 transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-brand-500 sm:right-6",
        className,
      )}
    >
      <MessageCircle className="h-6 w-6 fill-white/20" aria-hidden="true" />
      <span className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 sm:block">
        Chat on WhatsApp
      </span>
    </a>
  );
}
