"use client";

import { useRouter } from "next/navigation";
import { KeyRound, LayoutDashboard, Pause, Play, Store, UserCog } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resetStaffPassword, setStaffRole, setStaffSuspended } from "@/actions/admin/operations";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/permissions";
import { ROLE_CHOICES, type LoginDetails, type StaffLinks, type StaffRole } from "@/lib/staff-onboarding";
import { CopyValue, LoginCardPanel } from "./staff-onboarding";

/** The private links staff open once on each device. */
export function PrivateLinks({ admin, till }: StaffLinks) {
  return (
    <div className="space-y-4">
      <CopyValue label="Admin link" value={admin} icon={<LayoutDashboard className="h-4 w-4 text-brand-700" aria-hidden="true" />} />
      <CopyValue label="Till link" value={till} icon={<Store className="h-4 w-4 text-gold-700" aria-hidden="true" />} />
      <p className="text-[12.5px] font-medium text-ink-muted">
        Each person opens their link once on each device. Without it these pages look as if they do not exist. Share them only with staff. Adding
        someone puts the right link on their login card.
      </p>
    </div>
  );
}

/** For an email that already has an account from before the shop went guest only. */
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
          {ROLE_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {ROLE_LABELS[choice]}
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

interface StaffCardActionsProps {
  userId: string;
  name: string;
  email: string;
  role: StaffRole;
  suspended: boolean;
  links: StaffLinks;
}

/** Change role, reset password and suspend, on one person's card. */
export function StaffCardActions({ userId, name, email, role, suspended, links }: StaffCardActionsProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "role" | "reset" | "suspend">("idle");
  const [nextRole, setNextRole] = useState<string>(role);
  const [issued, setIssued] = useState<LoginDetails | null>(null);
  const [pending, startTransition] = useTransition();

  const done = (message?: string) => {
    if (message) toast.success(message);
    setMode("idle");
    router.refresh();
  };

  const saveRole = () =>
    startTransition(async () => {
      const result = await setStaffRole({ email, role: nextRole });
      if (result.ok) done(result.message);
      else toast.error(result.error);
    });
  const reset = () =>
    startTransition(async () => {
      const result = await resetStaffPassword({ userId });
      if (result.ok) {
        setMode("idle");
        setIssued({ name: result.data.name, email: result.data.email, role: result.data.role, password: result.data.temporaryPassword });
      } else toast.error(result.error);
    });
  const suspend = (next: boolean) =>
    startTransition(async () => {
      const result = await setStaffSuspended({ userId, suspended: next });
      if (result.ok) done(result.message);
      else toast.error(result.error);
    });

  return (
    <>
      {mode === "role" ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field id={`role-${userId}`} label={`New role for ${name}`} className="min-w-44 flex-1">
            <Select id={`role-${userId}`} value={nextRole} onChange={(event) => setNextRole(event.target.value)}>
              {ROLE_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {ROLE_LABELS[choice]}
                </option>
              ))}
              <option value="CUSTOMER">No staff access</option>
            </Select>
          </Field>
          <Button size="sm" className="h-10" disabled={pending || nextRole === role} onClick={saveRole}>
            Save
          </Button>
          <Button size="sm" variant="ghost" className="h-10" disabled={pending} onClick={() => setMode("idle")}>
            Cancel
          </Button>
        </div>
      ) : mode === "reset" || mode === "suspend" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft/60 p-3 text-[13px] font-semibold">
          <span className="min-w-0 flex-1">{mode === "reset" ? `Sign ${name} out everywhere and make a new password?` : `Suspend ${name} and sign them out?`}</span>
          <Button size="sm" variant="danger" disabled={pending} onClick={() => (mode === "reset" ? reset() : suspend(true))}>
            {pending ? <Spinner label="Working" /> : null} {mode === "reset" ? "Reset" : "Suspend"}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setMode("idle")}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" aria-label={`Change role for ${name}`} onClick={() => setMode("role")}>
            <UserCog /> Role
          </Button>
          <Button size="sm" variant="outline" aria-label={`Reset password for ${name}`} onClick={() => setMode("reset")}>
            <KeyRound /> Reset password
          </Button>
          {suspended ? (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => suspend(false)}>
              <Play /> Reactivate
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" aria-label={`Suspend ${name}`} onClick={() => setMode("suspend")}>
              <Pause /> Suspend
            </Button>
          )}
        </div>
      )}
      <Dialog open={issued !== null} onOpenChange={(open) => !open && setIssued(null)}>
        {issued ? (
          <DialogContent className="max-w-2xl rounded-2xl sm:p-7" title={`New password for ${issued.name}`} description="They have been signed out everywhere. Give them this card or send them the login message.">
            <LoginCardPanel details={issued} links={links} onDone={() => setIssued(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
