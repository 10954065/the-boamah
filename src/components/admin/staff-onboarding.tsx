"use client";

import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, LayoutDashboard, PencilLine, Printer, RefreshCw, Store, UserPlus } from "lucide-react";
import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { addStaff } from "@/actions/admin/operations";
import { LogoMark } from "@/components/brand/logo";
import { PrintArea } from "@/components/pos/receipt";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/permissions";
import {
  generateStaffPassword,
  loginMessage,
  ROLE_CHOICES,
  ROLE_DESCRIPTIONS,
  signInPlaces,
  STAFF_PASSWORD_MIN,
  type LoginDetails,
  type StaffLinks,
  type StaffRole,
} from "@/lib/staff-onboarding";
import { cn } from "@/lib/utils";

const COPIED_MESSAGE_MS = 2000;

/** Copies text, saying so on the button for a moment. */
function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MESSAGE_MS);
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  };
  return { copied, copy };
}

export function CopyValue({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  const { copied, copy } = useCopy();
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-bold text-ink">
        {icon}
        {label}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-soft px-3 py-2 text-[13px] font-semibold">{value}</code>
        <Button type="button" size="sm" variant="outline" aria-label={`Copy ${label}`} onClick={() => copy(value)}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

/** Where a role signs in, as small labels. */
export function SignInPlaceTags({ role, className }: { role: StaffRole; className?: string }) {
  const places = signInPlaces(role);
  return (
    <span className={cn("flex flex-wrap gap-1.5", className)}>
      {places.admin ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">
          <LayoutDashboard className="h-3 w-3" aria-hidden="true" /> Admin
        </span>
      ) : null}
      {places.till ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-bold text-gold-700">
          <Store className="h-3 w-3" aria-hidden="true" /> Till
        </span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The login card: shown once after adding someone or resetting a password.
// ---------------------------------------------------------------------------

function CardRow({ label, labelId, children }: { label: string; labelId?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[7.5rem_1fr] sm:gap-3">
      <dt id={labelId} className="text-[12px] font-bold uppercase tracking-wider text-ink-subtle">
        {label}
      </dt>
      <dd className="min-w-0 font-semibold text-ink">{children}</dd>
    </div>
  );
}

function LoginCard({ details, links, passwordLabelId }: { details: LoginDetails; links: StaffLinks; passwordLabelId?: string }) {
  const places = signInPlaces(details.role);
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-brand-800 bg-surface">
      <div className="flex items-center gap-3 bg-brand-900 px-5 py-4 text-white">
        <LogoMark className="h-10 w-10" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="font-display text-[16px] font-extrabold">The Boamah&rsquo;s</p>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-300">Staff login</p>
        </div>
        <span className="rounded-full bg-gold-400 px-3 py-1 text-[12px] font-extrabold text-brand-900">{ROLE_LABELS[details.role]}</span>
      </div>
      <dl className="divide-y divide-line px-5">
        <CardRow label="Name">{details.name}</CardRow>
        <CardRow label="Sign in at">
          {/* Typewriter letters, so a link copied by hand reads exactly as written (the main font turns 8x6 into 8×6). */}
          <span className="block space-y-1 font-mono text-[12.5px]">
            {places.admin ? <span className="block break-all">{places.till ? "Admin: " : ""}{links.admin}</span> : null}
            {places.till ? <span className="block break-all">{places.admin ? "Till: " : ""}{links.till}</span> : null}
          </span>
        </CardRow>
        <CardRow label="Email">
          <span className="break-all">{details.email}</span>
        </CardRow>
        <CardRow label="Password" labelId={passwordLabelId}>
          <code aria-labelledby={passwordLabelId} className="break-all font-mono text-[20px] font-bold tracking-[0.08em] text-brand-800">
            {details.password}
          </code>
        </CardRow>
      </dl>
    </div>
  );
}

/** The card, its copy and print buttons and the once-only warning. */
export function LoginCardPanel({ details, links, onDone, extra }: { details: LoginDetails; links: StaffLinks; onDone: () => void; extra?: ReactNode }) {
  const { copied, copy } = useCopy();
  const passwordLabelId = useId();
  return (
    <div className="space-y-4">
      <LoginCard details={details} links={links} passwordLabelId={passwordLabelId} />
      <Alert tone="warning" title="This password is shown only once">
        Copy the login message or print the card now. The shop keeps only a scrambled check of it, never the password itself.
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => copy(loginMessage(details, links))}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy login message"}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          <Printer /> Print card
        </Button>
        <span className="flex-1" />
        {extra}
        <Button type="button" variant="secondary" onClick={onDone}>
          Done
        </Button>
      </div>
      <PrintArea>
        <div className="mx-auto max-w-[150mm] p-[15mm] font-sans text-[14px] [-webkit-print-color-adjust:exact] [print-color-adjust:exact]">
          <LoginCard details={details} links={links} />
          <p className="mt-4 text-[12px] text-ink-muted">Keep this card private. Tear it up once you have signed in and chosen your own password.</p>
        </div>
      </PrintArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Adding someone.
// ---------------------------------------------------------------------------

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 flex items-center gap-2.5 font-display text-[15px] font-extrabold text-ink">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-700 text-[12px] text-white">{number}</span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function RoleCards({ value, onChange }: { value: StaffRole; onChange: (role: StaffRole) => void }) {
  const name = useId();
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {ROLE_CHOICES.map((role) => {
        const chosen = role === value;
        return (
          <label
            key={role}
            className={cn(
              "relative flex cursor-pointer flex-col gap-1.5 rounded-xl border-2 p-3.5 transition-[border-color,background-color,box-shadow] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40",
              chosen ? "border-brand-600 bg-brand-50/70 shadow-sm" : "border-line hover:border-brand-200 hover:bg-soft/60",
            )}
          >
            <input type="radio" name={name} value={role} checked={chosen} onChange={() => onChange(role)} className="sr-only" />
            <span className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-extrabold text-ink">{ROLE_LABELS[role]}</span>
              <span
                aria-hidden="true"
                className={cn("flex h-5 w-5 items-center justify-center rounded-full border-2", chosen ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong")}
              >
                {chosen ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
            </span>
            <span className="text-[12.5px] font-medium leading-snug text-ink-muted">{ROLE_DESCRIPTIONS[role]}</span>
            <SignInPlaceTags role={role} className="mt-auto pt-1" />
          </label>
        );
      })}
    </div>
  );
}

interface PasswordChoiceProps {
  password: string;
  onChange: (value: string) => void;
  typing: boolean;
  onTyping: (typing: boolean) => void;
  error?: string;
}

function PasswordChoice({ password, onChange, typing, onTyping, error }: PasswordChoiceProps) {
  if (typing) {
    return (
      <div className="space-y-2">
        <Field id="new-staff-password" label="Their password" hint={`At least ${STAFF_PASSWORD_MIN} characters.`} error={error}>
          <Input
            {...fieldAria("new-staff-password", error, "hint")}
            value={password}
            onChange={(event) => onChange(event.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            className="h-11 font-mono text-[15px] font-semibold"
          />
        </Field>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            onTyping(false);
            onChange(generateStaffPassword());
          }}
        >
          <RefreshCw /> Make one for me instead
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
      <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-brand-700">
        <KeyRound className="h-4 w-4" aria-hidden="true" /> Password made for them
      </p>
      <p aria-live="polite" className="mt-2 break-all font-mono text-[22px] font-bold tracking-[0.08em] text-brand-900">
        {password}
      </p>
      <p className="mt-1 text-[12.5px] font-medium text-ink-muted">16 letters and numbers, with no 0 and O or 1 and l to mix up.</p>
      {error ? <p className="mt-2 text-xs font-medium text-danger">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(generateStaffPassword())}>
          <RefreshCw /> Make another
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onTyping(true)}>
          <PencilLine /> Type my own
        </Button>
      </div>
    </div>
  );
}

const EMPTY = { name: "", email: "", phone: "" };

/** The Super Admin's way to give someone a login: who, what they do, and their password, then a card to hand over. */
export function AddStaffDialog({ links }: { links: StaffLinks }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(EMPTY);
  const [role, setRole] = useState<StaffRole>("CASHIER");
  const [password, setPassword] = useState("");
  const [typing, setTyping] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [issued, setIssued] = useState<LoginDetails | null>(null);
  const [pending, startTransition] = useTransition();

  function startAgain() {
    setFields(EMPTY);
    setRole("CASHIER");
    setPassword(generateStaffPassword());
    setTyping(false);
    setErrors({});
    setIssued(null);
  }

  function openChange(next: boolean) {
    if (next) startAgain();
    setOpen(next);
  }

  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) => setFields((current) => ({ ...current, [key]: event.target.value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addStaff({ ...fields, role, password });
      if (result.ok) {
        setIssued(result.data);
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        <Button size="lg">
          <UserPlus /> Add staff member
        </Button>
      </DialogTrigger>
      {open ? (
        <DialogContent
          className="max-w-2xl rounded-2xl sm:p-7"
          title={issued ? `${issued.name} can now sign in` : "Add a staff member"}
          description={issued ? "Give them this card or send them the login message." : "They get their own login. You choose what they can do."}
        >
          {issued ? (
            <LoginCardPanel
              details={issued}
              links={links}
              onDone={() => setOpen(false)}
              extra={
                <Button type="button" variant="ghost" onClick={startAgain}>
                  <UserPlus /> Add another
                </Button>
              }
            />
          ) : (
            <form onSubmit={submit} noValidate className="space-y-7">
              <Step number={1} title="Who are they?">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="new-staff-name" label="Full name" error={errors.name} className="sm:col-span-2">
                    <Input {...fieldAria("new-staff-name", errors.name)} value={fields.name} onChange={set("name")} autoComplete="off" required />
                  </Field>
                  <Field id="new-staff-email" label="Email address" hint="They sign in with this." error={errors.email}>
                    <Input {...fieldAria("new-staff-email", errors.email, "hint")} type="email" value={fields.email} onChange={set("email")} autoComplete="off" required />
                  </Field>
                  <Field id="new-staff-phone" label="Phone number (optional)" hint="So you can reach them." error={errors.phone}>
                    <Input {...fieldAria("new-staff-phone", errors.phone, "hint")} type="tel" inputMode="tel" value={fields.phone} onChange={set("phone")} autoComplete="off" />
                  </Field>
                </div>
              </Step>
              <Step number={2} title="What will they do?">
                <RoleCards value={role} onChange={setRole} />
              </Step>
              <Step number={3} title="Their password">
                <PasswordChoice password={password} onChange={setPassword} typing={typing} onTyping={setTyping} error={errors.password} />
              </Step>
              <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="lg" disabled={pending}>
                  {pending ? <Spinner label="Creating" /> : <Check />} Create login
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
