"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addOrderNote, changeOrderStatus, recordCash, setCustomerSuspended } from "@/actions/admin/operations";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";

export function OrderStatusControl({ orderId, options }: { orderId: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const [status, setStatus] = useState(options[0]?.value ?? "");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  if (options.length === 0) return <p className="text-sm text-ink-muted">No further status changes are available for this order.</p>;
  const cancelling = status === "CANCELLED";
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await changeOrderStatus({ orderId, status, note: note || undefined });
          if (result.ok) {
            toast.success(result.message);
            setNote("");
            router.refresh();
          } else toast.error(result.error);
        });
      }}
    >
      <Field id="next-status" label="Move order to">
        <Select id="next-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="status-note" label={cancelling ? "Reason for cancellation (shown to the customer)" : "Note (optional)"}>
        <Textarea id="status-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} required={cancelling} />
      </Field>
      <Button type="submit" variant={cancelling ? "danger" : "primary"} disabled={pending || (cancelling && note.trim().length < 3)}>
        {pending ? <Spinner label="Updating" /> : null} {cancelling ? "Cancel order and release stock" : "Update status"}
      </Button>
    </form>
  );
}

export function CashCollectionForm({ orderId, totalLabel, totalDecimal }: { orderId: string; totalLabel: string; totalDecimal: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState(totalDecimal);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await recordCash({ orderId, amount });
          if (result.ok) {
            toast.success(result.message);
            router.refresh();
          } else toast.error(result.error);
        });
      }}
    >
      <Field id="cash-amount" label={`Amount collected (order total ${totalLabel})`}>
        <Input id="cash-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? <Spinner label="Saving" /> : null} Record cash payment
      </Button>
    </form>
  );
}

export function OrderNoteForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await addOrderNote({ orderId, body });
          if (result.ok) {
            setBody("");
            router.refresh();
          } else toast.error(result.error);
        });
      }}
    >
      <label htmlFor="order-note" className="sr-only">
        Internal note
      </label>
      <Textarea id="order-note" rows={2} placeholder="Internal note — not visible to the customer" value={body} onChange={(e) => setBody(e.target.value)} />
      <Button type="submit" size="sm" variant="outline" disabled={pending || body.trim().length < 2}>
        Add note
      </Button>
    </form>
  );
}

export function SuspendToggle({ userId, suspended }: { userId: string; suspended: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const run = () =>
    startTransition(async () => {
      const result = await setCustomerSuspended({ userId, suspended: !suspended });
      if (result.ok) {
        toast.success(result.message);
        setConfirming(false);
        router.refresh();
      } else toast.error(result.error);
    });
  if (suspended) {
    return (
      <Button variant="secondary" disabled={pending} onClick={run}>
        Reactivate account
      </Button>
    );
  }
  return confirming ? (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm">
      Suspend and sign this customer out everywhere?
      <Button size="sm" variant="danger" disabled={pending} onClick={run}>
        Suspend
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Keep active
      </Button>
    </div>
  ) : (
    <Button variant="outline" className="text-danger" onClick={() => setConfirming(true)}>
      Suspend account
    </Button>
  );
}
