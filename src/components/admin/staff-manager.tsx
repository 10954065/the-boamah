"use client";

import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addStaff, resetStaffPassword, setStaffRole, setStaffSuspended } from "@/actions/admin/operations";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import type { STAFF_ROLES } from "@/lib/permissions";
import type { StaffLinks } from "@/server/staff";

const COPIED_MESSAGE_MS = 2000;

type StaffRole = (typeof STAFF_ROLES)[number];

const STAFF_ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: "CASHIER", label: "Cashier (till only)" },
  { value: "ORDER_MANAGER", label: "Order Manager" },
  { value: "INVENTORY_MANAGER", label: "Inventory Manager" },
  { value: "STORE_MANAGER", label: "Store Manager" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
];

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MESSAGE_MS);
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  };
  return (
    <div>
      <p className="text-sm font-semibold text-ink">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md bg-soft px-3 py-2 text-[13px]">{value}</code>
        <Button type="button" size="sm" variant="outline" aria-label={`Copy ${label}`} onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

/** The private links staff open once on each device. */
export function PrivateLinks({ admin, till }: StaffLinks) {
  return (
    <div className="space-y-4">
      <CopyValue label="Admin link" value={admin} />
      <CopyValue label="Till link" value={till} />
      <p className="text-xs text-ink-subtle">
        Each person opens their link once on each device. Without it these pages look as if they do not exist. Share them only with staff.
      </p>
    </div>
  );
}

interface IssuedPassword {
  name: string;
  temporaryPassword: string;
}

/** A temporary password is shown here once; the server does not keep it. */
function IssuedPasswordDialog({ issued, onClose }: { issued: IssuedPassword | null; onClose: () => void }) {
  return (
    <Dialog open={issued !== null} onOpenChange={(open) => !open && onClose()}>
      {issued ? (
        <DialogContent title={`Temporary password for ${issued.name}`} description="Copy it now. It will not be shown again.">
          <div className="space-y-4">
            <CopyValue label="Temporary password" value={issued.temporaryPassword} />
            <p className="text-sm text-ink-muted">
              They sign in with this and their email. They can choose their own password with Forgot your password on the sign in page.
            </p>
            <Button type="button" className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function AddStaffForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("CASHIER");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [issued, setIssued] = useState<IssuedPassword | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await addStaff({ name, email, role });
            if (result.ok) {
              setErrors({});
              setName("");
              setEmail("");
              setIssued(result.data);
              router.refresh();
            } else {
              setErrors(result.fieldErrors ?? {});
              toast.error(result.error);
            }
          });
        }}
      >
        <Field id="new-staff-name" label="Full name" error={errors.name}>
          <Input {...fieldAria("new-staff-name", errors.name)} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field id="new-staff-email" label="Email address" error={errors.email}>
          <Input {...fieldAria("new-staff-email", errors.email)} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field id="new-staff-role" label="Role">
          <Select id="new-staff-role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            {STAFF_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner label="Adding" /> : <UserPlus />} Add staff member
        </Button>
      </form>
      <IssuedPasswordDialog issued={issued} onClose={() => setIssued(null)} />
    </>
  );
}

export function StaffRoleForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ORDER_MANAGER");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await setStaffRole({ email, role });
          if (result.ok) {
            toast.success(result.message);
            setEmail("");
            router.refresh();
          } else toast.error(result.error);
        });
      }}
    >
      <Field id="staff-email" label="Account email" className="min-w-64 flex-1">
        <Input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field id="staff-role" label="Role">
        <Select id="staff-role" value={role} onChange={(e) => setRole(e.target.value)}>
          {STAFF_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value="CUSTOMER">No staff access</option>
        </Select>
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner label="Saving" /> : null} Change role
      </Button>
    </form>
  );
}

/** Reset password and suspend, for one row of the staff table. */
export function StaffRowActions({ userId, name, suspended }: { userId: string; name: string; suspended: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<"reset" | "suspend" | null>(null);
  const [issued, setIssued] = useState<IssuedPassword | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () =>
    startTransition(async () => {
      const result = await resetStaffPassword({ userId });
      if (result.ok) {
        setConfirming(null);
        setIssued(result.data);
      } else toast.error(result.error);
    });
  const suspend = (next: boolean) =>
    startTransition(async () => {
      const result = await setStaffSuspended({ userId, suspended: next });
      if (result.ok) {
        toast.success(result.message);
        setConfirming(null);
        router.refresh();
      } else toast.error(result.error);
    });

  return (
    <>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{confirming === "reset" ? `Sign ${name} out and give a new password?` : `Suspend ${name} and sign them out?`}</span>
          <Button size="sm" variant="danger" disabled={pending} onClick={() => (confirming === "reset" ? reset() : suspend(true))}>
            {confirming === "reset" ? "Reset" : "Suspend"}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setConfirming("reset")}>
            <KeyRound /> Reset password
          </Button>
          {suspended ? (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => suspend(false)}>
              Reactivate
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirming("suspend")}>
              Suspend
            </Button>
          )}
        </div>
      )}
      <IssuedPasswordDialog issued={issued} onClose={() => setIssued(null)} />
    </>
  );
}
