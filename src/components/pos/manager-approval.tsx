"use client";

import { useId } from "react";
import { ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ManagerApproval } from "@/lib/pos-returns";
import { cn } from "@/lib/utils";

export interface ApprovalDetails {
  email: string;
  password: string;
}

export const NO_APPROVAL: ApprovalDetails = { email: "", password: "" };

/** What to send: nothing when the signed-in person is a manager, otherwise the details typed. */
export function approvalToSend(canManage: boolean, details: ApprovalDetails): ManagerApproval | null {
  return canManage ? null : { email: details.email.trim(), password: details.password };
}

/** The details with the password wiped: done after every try, so it is never kept longer than one request. */
export function withoutPassword(details: ApprovalDetails): ApprovalDetails {
  return { ...details, password: "" };
}

export function approvalReady(canManage: boolean, details: ApprovalDetails): boolean {
  return canManage || (/^\S+@\S+\.\S+$/.test(details.email.trim()) && details.password.length > 0);
}

interface ReasonFieldProps {
  reasons: readonly string[];
  value: string;
  onChange: (value: string) => void;
}

/** Why a manager approves it: a common reason at a tap, or typed. */
export function ReasonField({ reasons, value, onChange }: ReasonFieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={`${id}-reason`} className="mb-1 block text-sm font-semibold">
        Reason
      </label>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {reasons.map((reason) => (
          <button
            key={reason}
            type="button"
            aria-pressed={value === reason}
            onClick={() => onChange(reason)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              value === reason ? "border-brand-700 bg-brand-50 text-brand-700" : "border-line-strong text-ink-muted hover:bg-soft",
            )}
          >
            {reason}
          </button>
        ))}
      </div>
      <Input id={`${id}-reason`} maxLength={200} autoComplete="off" placeholder="Or type the reason" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

export function reasonReady(reason: string): boolean {
  return reason.trim().length >= 3;
}

interface ManagerApprovalFieldsProps {
  canManage: boolean;
  value: ApprovalDetails;
  onChange: (value: ApprovalDetails) => void;
}

/**
 * A manager approves at the till: a signed-in manager approves by
 * themselves; otherwise a manager types their own email and password, which
 * the shop's system checks once and the till never keeps.
 */
export function ManagerApprovalFields({ canManage, value, onChange }: ManagerApprovalFieldsProps) {
  const id = useId();
  if (canManage) {
    return (
      <p className="flex items-center gap-2 rounded-md bg-soft px-3 py-2 text-sm text-ink-muted">
        <ShieldCheck className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" /> You approve this as a manager.
      </p>
    );
  }
  return (
    <fieldset className="space-y-2 rounded-md border border-line p-3">
      <legend className="px-1 text-sm font-semibold">Manager approval</legend>
      <p className="text-xs text-ink-muted">A manager types their own email and password. They are checked once and not kept on the till.</p>
      <div>
        <label htmlFor={`${id}-email`} className="mb-1 block text-xs font-semibold">
          Manager&apos;s email
        </label>
        <Input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          autoComplete="off"
          data-1p-ignore
          value={value.email}
          onChange={(event) => onChange({ ...value, email: event.target.value })}
        />
      </div>
      <div>
        <label htmlFor={`${id}-password`} className="mb-1 block text-xs font-semibold">
          Manager&apos;s password
        </label>
        <Input
          id={`${id}-password`}
          type="password"
          // Not offered for saving: this till is shared and the password is not the signed-in person's.
          autoComplete="new-password"
          data-1p-ignore
          value={value.password}
          onChange={(event) => onChange({ ...value, password: event.target.value })}
        />
      </div>
    </fieldset>
  );
}
