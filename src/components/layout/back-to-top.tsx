"use client";

import { ArrowUp } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const SHOW_AFTER_PX = 700;

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

/** Floating button that appears once the visitor has scrolled down a long page. */
export function BackToTop({ raised = false }: { raised?: boolean }) {
  const visible = useSyncExternalStore(
    subscribe,
    () => window.scrollY > SHOW_AFTER_PX,
    () => false,
  );

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0 })}
      aria-label="Back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={cn(
        "fixed right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-brand-700 text-white shadow-[var(--shadow-overlay)] transition-[opacity,transform,background-color,bottom] duration-300 hover:bg-brand-800 sm:right-6",
        raised
          ? "bottom-[calc(5.25rem+var(--float-offset)+env(safe-area-inset-bottom,0px))] right-5 sm:right-7"
          : "bottom-[calc(1.25rem+var(--float-offset)+env(safe-area-inset-bottom,0px))]",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
