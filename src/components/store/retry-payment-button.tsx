"use client";

import { CreditCard } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { retryPayment } from "@/actions/checkout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";

export function RetryPaymentButton({ reference, token }: { reference: string; token?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await retryPayment({ reference, token });
          if (result.ok) window.location.assign(result.data.redirectTo);
          else toast.error(result.error);
        })
      }
    >
      {pending ? <Spinner label="Starting payment" /> : <CreditCard />}
      Pay now
    </Button>
  );
}
