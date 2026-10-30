"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Printer } from "lucide-react";
import { toast } from "sonner";
import { reviewTillItem } from "@/actions/admin/till";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TillReviewButtonProps {
  kind: "sale" | "return" | "shift";
  id: string;
  /** Shown beside the note box. */
  label?: string;
}

/** Marks a flagged sale, a refund or a shift's count as looked at, with a note for the record. */
export function TillReviewButton({ kind, id, label = "Mark as looked at" }: TillReviewButtonProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await reviewTillItem({ kind, id, note });
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="Note (optional)" placeholder="Note (optional)" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} className="h-8 min-w-40 flex-1 text-sm" />
      <Button type="button" size="sm" disabled={pending} onClick={submit}>
        <Check /> {label}
      </Button>
    </div>
  );
}

/** Prints the page as it is on screen (the admin menus are left off the paper). */
export function PrintPageButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer /> Print
    </Button>
  );
}
