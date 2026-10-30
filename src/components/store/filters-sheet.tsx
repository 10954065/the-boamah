"use client";

import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";

/** Filters on phones and tablets: a button beside the sort that opens a side panel, so products stay near the top of the page. */
export function FiltersSheet({ activeCount, children }: { activeCount: number; children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="lg:hidden" aria-label={activeCount > 0 ? `Filters, ${activeCount} on` : "Filters"}>
          <SlidersHorizontal /> Filters
          {activeCount > 0 ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-700 px-1 text-[11px] font-bold text-white">{activeCount}</span> : null}
        </Button>
      </DialogTrigger>
      <SheetContent title="Filters" side="right" closeLabel="Close filters">
        <div className="p-4">{children}</div>
      </SheetContent>
    </Dialog>
  );
}
