"use client";

import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addCreditCustomerAction, recordCreditPaymentAction, updateCreditCustomerAction } from "@/actions/admin/credit";
import { Button } from "@/components/ui/button";
import { ClientForm } from "@/components/ui/client-form";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { formatMoney, minorToDecimalString, parseDecimalToMinor } from "@/lib/money";
import { POS_TENDER_LABELS, POS_TENDERS, type PosTenderCode } from "@/lib/pos";

export interface CreditCustomerValues {
  name: string;
  phone: string;
  /** Blank means no limit. */
  limit: string;
  notes: string;
  isActive: boolean;
}

const EMPTY: CreditCustomerValues = { name: "", phone: "", limit: "", notes: "", isActive: true };

function CustomerFields({ values, onChange, errors, editing }: { values: CreditCustomerValues; onChange: (values: CreditCustomerValues) => void; errors: Record<string, string>; editing: boolean }) {
  const set = <K extends keyof CreditCustomerValues>(key: K, value: CreditCustomerValues[K]) => onChange({ ...values, [key]: value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="credit-name" label="Full name" error={errors.name}>
        <Input {...fieldAria("credit-name", errors.name)} value={values.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" />
      </Field>
      <Field id="credit-phone" label="Phone number" error={errors.phone}>
        <Input {...fieldAria("credit-phone", errors.phone)} type="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="off" placeholder="024 123 4567" />
      </Field>
      <Field id="credit-limit" label="Credit limit (GH₵)" hint="The most they may owe. Leave blank for no limit." error={errors.limitMinor}>
        <Input {...fieldAria("credit-limit", errors.limitMinor, "hint")} inputMode="decimal" value={values.limit} onChange={(e) => set("limit", e.target.value.replace(/[^\d.]/g, ""))} placeholder="No limit" />
      </Field>
      <Field id="credit-notes" label="Notes (optional)" error={errors.notes} className="sm:col-span-2">
        <Textarea {...fieldAria("credit-notes", errors.notes)} rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      {editing ? (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox checked={values.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Can buy on credit at the till (untick to stop new credit; payments are still taken)
        </label>
      ) : null}
    </div>
  );
}

function toInput(values: CreditCustomerValues): { input: { name: string; phone: string; limitMinor: number | null; notes: string }; limitError: string | null } {
  const limitText = values.limit.trim();
  const limitMinor = limitText ? parseDecimalToMinor(limitText) : null;
  return {
    input: { name: values.name, phone: values.phone, limitMinor: limitMinor ?? null, notes: values.notes },
    limitError: limitText && limitMinor === null ? "Enter the limit as an amount, e.g. 500 or 500.00." : null,
  };
}

/** "Add credit customer" in the admin: name, number, and an optional limit. */
export function AddCreditCustomerDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setValues(EMPTY);
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Add credit customer
        </Button>
      </DialogTrigger>
      <DialogContent title="Add a credit customer" description="Cashiers can also add customers at the till." className="max-w-xl">
        <ClientForm
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const { input, limitError } = toInput(values);
            if (limitError) return setErrors({ limitMinor: limitError });
            startTransition(async () => {
              const result = await addCreditCustomerAction(input);
              if (result.ok) {
                toast.success(result.message);
                setOpen(false);
                router.push(`/admin/credit/${result.data.id}`);
                return;
              }
              setErrors(result.fieldErrors ?? {});
              if (!result.fieldErrors) toast.error(result.error);
            });
          }}
        >
          <CustomerFields values={values} onChange={setValues} errors={errors} editing={false} />
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner label="Saving" /> : null} Add customer
            </Button>
          </div>
        </ClientForm>
      </DialogContent>
    </Dialog>
  );
}

/** Edit a customer's details, limit, and whether they may still buy on credit. */
export function EditCreditCustomerForm({ id, initial }: { id: string; initial: CreditCustomerValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  return (
    <ClientForm
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const { input, limitError } = toInput(values);
        if (limitError) return setErrors({ limitMinor: limitError });
        startTransition(async () => {
          const result = await updateCreditCustomerAction(id, input, values.isActive);
          if (result.ok) {
            setErrors({});
            toast.success(result.message);
            router.refresh();
          } else {
            setErrors(result.fieldErrors ?? {});
            toast.error(result.error);
          }
        });
      }}
    >
      <CustomerFields values={values} onChange={setValues} errors={errors} editing />
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? <Spinner label="Saving" /> : null} Save details
        </Button>
      </div>
    </ClientForm>
  );
}

/** A payment the shop received outside the till, such as mobile money sent to the shop's number. */
export function RecordCreditPaymentForm({ customerId, owedMinor }: { customerId: string; owedMinor: number }) {
  const router = useRouter();
  const [method, setMethod] = useState<PosTenderCode>("MOMO");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  // Kept across retries, so a payment saved before the answer was lost is recorded once.
  const [clientId, setClientId] = useState(() => crypto.randomUUID());

  if (owedMinor <= 0) return <p className="text-sm text-ink-muted">Nothing is owed, so there is nothing to pay.</p>;

  return (
    <ClientForm
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const amountMinor = parseDecimalToMinor(amount);
        if (!amountMinor || amountMinor <= 0) return setErrors({ amountMinor: "Enter the amount paid." });
        startTransition(async () => {
          const result = await recordCreditPaymentAction({ clientId, customerId, amountMinor, method, reference: reference || null, note: note || null });
          if (result.ok) {
            toast.success(`${result.message} They now owe ${formatMoney(result.data.owedAfterMinor)}.`);
            setClientId(crypto.randomUUID());
            setAmount("");
            setReference("");
            setNote("");
            setErrors({});
            router.refresh();
          } else {
            setErrors(result.fieldErrors ?? {});
            toast.error(result.error);
          }
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="pay-method" label="Paid by">
          <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PosTenderCode)}>
            {POS_TENDERS.map((code) => (
              <option key={code} value={code}>
                {POS_TENDER_LABELS[code]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="pay-amount" label="Amount (GH₵)" error={errors.amountMinor}>
          <div className="flex gap-2">
            <Input {...fieldAria("pay-amount", errors.amountMinor)} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" />
            <Button type="button" variant="outline" className="shrink-0" onClick={() => setAmount(minorToDecimalString(owedMinor))}>
              All
            </Button>
          </div>
        </Field>
        <Field id="pay-reference" label={method === "MOMO" ? "Transaction ID" : "Reference (optional)"} error={errors.reference}>
          <Input {...fieldAria("pay-reference", errors.reference)} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
        </Field>
        <Field id="pay-note" label="Note (optional)">
          <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner label="Saving" /> : null} Record payment
        </Button>
      </div>
      <p className="text-xs text-ink-muted">Money taken at the till is recorded there instead, so it counts in that shift&rsquo;s drawer.</p>
    </ClientForm>
  );
}
