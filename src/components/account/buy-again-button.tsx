"use client";

import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { buyAgain } from "@/actions/cart";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

interface BuyAgainButtonProps {
  reference: string;
  size?: "sm" | "md";
  className?: string;
}

/** Puts a past order's items back in the cart and opens the cart. */
export function BuyAgainButton({ reference, size = "md", className }: BuyAgainButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={cn("whitespace-nowrap", className)}
      disabled={pending}
      aria-label={`Buy again: order ${reference}`}
      onClick={() =>
        startTransition(async () => {
          const result = await buyAgain({ reference });
          if (result.ok) {
            toast.success(result.message);
            router.push("/cart");
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      {pending ? <Spinner label="Adding" /> : <RotateCcw />}
      Buy again
    </Button>
  );
}
