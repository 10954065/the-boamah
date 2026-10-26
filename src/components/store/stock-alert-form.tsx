"use client";

import { BellRing, Check } from "lucide-react";
import { useState, useTransition } from "react";
import { requestStockAlert } from "@/actions/stock-alerts";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";

interface StockAlertFormProps {
  variantId: string;
  productName: string;
  /** Prefilled for signed-in shoppers. */
  defaultContact?: string;
  smsEnabled: boolean;
}

/** "Tell me when it's back" for an out-of-stock option. */
export function StockAlertForm({ variantId, productName, defaultContact = "", smsEnabled }: StockAlertFormProps) {
  const [contact, setContact] = useState(defaultContact);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = `stock-alert-${variantId}`;

  if (done) {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-brand-800" role="status">
        <Check className="pop h-4 w-4" aria-hidden="true" /> {done}
      </p>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestStockAlert({ variantId, contact });
      if (result.ok) setDone(result.message ?? "Thanks. We will let you know when it is back.");
      else setError(result.error);
    });
  };

  return (
    <form onSubmit={submit} noValidate className="mt-3 space-y-2">
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <BellRing className="h-4 w-4 text-brand-700" aria-hidden="true" /> Tell me when it&rsquo;s back
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={id}
          type={smsEnabled ? "text" : "email"}
          inputMode={smsEnabled ? "text" : "email"}
          autoComplete={smsEnabled ? "on" : "email"}
          placeholder={smsEnabled ? "Email or phone number" : "Email address"}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-w-0 flex-1 basis-56 bg-surface"
        />
        <Button type="submit" disabled={pending || contact.trim().length < 3} aria-label={`Notify me when ${productName} is back`}>
          {pending ? <Spinner label="Saving" /> : null} Notify me
        </Button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : (
        <p className="text-xs text-ink-muted">One message when it is restocked. Nothing else.</p>
      )}
    </form>
  );
}
