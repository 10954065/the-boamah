"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { trackOrder, type TrackingView } from "@/actions/checkout";
import { Button } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function TrackOrderForm({ initialReference }: { initialReference: string }) {
  const [reference, setReference] = useState(initialReference);
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackingView | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <form
        className="space-y-4 rounded-lg border border-line bg-surface p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const response = await trackOrder({ reference, contact });
            if (response.ok) setResult(response.data);
            else {
              setResult(null);
              setError(response.error);
            }
          });
        }}
      >
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field id="reference" label="Order reference" hint="For example BMH-261025-7KQ4XM.">
          <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} className="font-mono uppercase" required />
        </Field>
        <Field id="contact" label="Email or phone number used for the order">
          <Input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="email" required />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner label="Searching" /> : null} Track order
        </Button>
      </form>

      {result ? (
        <section aria-live="polite" className="rounded-lg border border-line bg-surface p-5 sm:p-6">
          <p className="text-sm text-ink-muted">Order {result.reference} · placed {result.placedAt}</p>
          <p className="mt-1 text-xl font-extrabold">{result.statusLabel}</p>
          <ol className="mt-4 space-y-2 text-sm">
            {result.history.map((entry, index) => (
              <li key={`${entry.label}-${index}`} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success" aria-hidden="true" />
                <span className="font-medium text-ink">{entry.label}</span>
                <span className="text-ink-muted">· {entry.at}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
