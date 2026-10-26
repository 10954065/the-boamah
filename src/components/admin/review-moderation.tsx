"use client";

import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { moderateReview } from "@/actions/reviews";
import { Button } from "@/components/ui/button";

interface ReviewModerationProps {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

/** Approve or reject one review; published reviews can be taken down again. */
export function ReviewModeration({ id, status }: ReviewModerationProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const act = (next: "APPROVED" | "REJECTED") =>
    startTransition(async () => {
      const result = await moderateReview({ id, status: next });
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "APPROVED" ? (
        <Button type="button" size="sm" disabled={pending} onClick={() => act("APPROVED")}>
          <Check /> Approve
        </Button>
      ) : null}
      {status !== "REJECTED" ? (
        <Button type="button" size="sm" variant="outline" className="text-danger" disabled={pending} onClick={() => act("REJECTED")}>
          <X /> {status === "APPROVED" ? "Unpublish" : "Reject"}
        </Button>
      ) : null}
    </div>
  );
}
