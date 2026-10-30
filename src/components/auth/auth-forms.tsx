"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, MailCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { ClientForm } from "@/components/ui/client-form";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { cn, safeRedirectPath } from "@/lib/utils";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema } from "@/lib/validation";

function errorMessage(error: { message?: string; status?: number } | null | undefined, fallback: string): string {
  if (!error) return fallback;
  if (error.status === 429) return error.message || "Too many attempts. Please wait a minute and try again.";
  return error.message || fallback;
}

/** A gap, not space-y: ClientForm wraps the fields in a display: contents fieldset, which space-y cannot reach. */
const AUTH_FORM = "flex flex-col gap-5 [&_label]:font-bold";
const AUTH_INPUT = "h-12 rounded-xl bg-surface pl-11 text-[15px] font-medium shadow-[var(--shadow-card)]";
const FIELD_ICON = "pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-subtle";

function IconInput({ icon: Icon, className, ...props }: ComponentProps<"input"> & { icon: LucideIcon }) {
  return (
    <div className="relative">
      <Icon className={FIELD_ICON} aria-hidden="true" />
      <Input className={cn(AUTH_INPUT, className)} {...props} />
    </div>
  );
}

/** A password box that can show what was typed, and says when Caps Lock is on. */
function PasswordInput({ className, showLabel = "Show password", ...props }: ComponentProps<"input"> & { showLabel?: string }) {
  const [shown, setShown] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const checkCaps = (event: KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState("CapsLock"));
  return (
    <>
      <div className="relative">
        <LockKeyhole className={FIELD_ICON} aria-hidden="true" />
        <Input {...props} type={shown ? "text" : "password"} onKeyDown={checkCaps} onKeyUp={checkCaps} className={cn(AUTH_INPUT, "pr-12", className)} />
        <button
          type="button"
          aria-label={showLabel}
          aria-pressed={shown}
          onClick={() => setShown((current) => !current)}
          className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-soft hover:text-ink"
        >
          {shown ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
      </div>
      {capsLock ? (
        <p role="status" className="text-xs font-bold text-warning">
          Caps Lock is on
        </p>
      ) : null}
    </>
  );
}

function SubmitButton({ busy, busyLabel, children }: { busy: boolean; busyLabel: string; children: string }) {
  return (
    <Button type="submit" size="lg" className="group h-12 w-full rounded-xl text-[15px] font-bold shadow-[var(--shadow-raised)]" disabled={busy}>
      {busy ? <Spinner label={busyLabel} /> : null} {children}
      {busy ? null : <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
    </Button>
  );
}

export function SignInForm({ next, forgotHref = "/forgot-password" }: { next?: string; forgotHref?: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof signInSchema>>({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;
  const passwordError = errors.password?.message;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.signIn.email({ email: values.email, password: values.password });
    if (error) {
      setFormError(error.status === 401 ? "Incorrect email or password." : errorMessage(error, "We couldn't sign you in."));
      return;
    }
    router.replace(safeRedirectPath(next, "/admin"));
    router.refresh();
  });

  return (
    <ClientForm onSubmit={onSubmit} noValidate className={AUTH_FORM}>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field id="email" label="Email address" error={errors.email?.message}>
        <IconInput icon={Mail} type="email" autoComplete="email" placeholder="you@example.com" {...fieldAria("email", errors.email?.message)} {...form.register("email")} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="password">Password</Label>
          <Link href={forgotHref} className="text-[13px] font-bold text-brand-700 hover:underline">
            Forgot your password?
          </Link>
        </div>
        <PasswordInput autoComplete="current-password" {...fieldAria("password", passwordError)} {...form.register("password")} />
        {passwordError ? (
          <p id="password-error" role="alert" className="flex items-center gap-1 text-xs font-medium text-danger">
            <span aria-hidden="true">⚠</span> {passwordError}
          </p>
        ) : null}
      </div>
      <SubmitButton busy={isSubmitting} busyLabel="Signing in">
        Sign in
      </SubmitButton>
      <p className="text-center text-[13px] font-medium text-ink-subtle">New here? Your login card from the Super Admin has your email and password.</p>
    </ClientForm>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.requestPasswordReset({ email: values.email, redirectTo: "/reset-password" });
    if (error && error.status === 429) {
      setFormError(errorMessage(error, ""));
      return;
    }
    // Same message whether or not the account exists (no account enumeration).
    setSent(true);
  });

  if (sent) {
    return (
      <div role="status" className="rounded-2xl border border-success/30 bg-success-soft p-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface text-success shadow-[var(--shadow-card)]">
          <MailCheck className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="mt-4 font-display text-[18px] font-extrabold text-ink">Check your email</p>
        <p className="mt-1.5 text-[14px] font-medium text-ink-muted">
          If an account exists for that address, we&rsquo;ve sent a link to reset your password. The link expires in 1 hour.
        </p>
      </div>
    );
  }

  return (
    <ClientForm onSubmit={onSubmit} noValidate className={AUTH_FORM}>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field id="email" label="Email address" error={errors.email?.message}>
        <IconInput icon={Mail} type="email" autoComplete="email" placeholder="you@example.com" {...fieldAria("email", errors.email?.message)} {...form.register("email")} />
      </Field>
      <SubmitButton busy={isSubmitting} busyLabel="Sending">
        Send reset link
      </SubmitButton>
    </ClientForm>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.resetPassword({ newPassword: values.password, token });
    if (error) {
      setFormError(
        /invalid|expired/i.test(error.message ?? "")
          ? "This reset link is invalid or has expired. Request a new one from the staff sign in page."
          : errorMessage(error, "We couldn't reset your password."),
      );
      return;
    }
    setDone(true);
  });

  if (done) {
    return (
      <Alert tone="success" title="Your password has been changed">
        Open your staff link and sign in with the new password.
      </Alert>
    );
  }

  return (
    <ClientForm onSubmit={onSubmit} noValidate className={AUTH_FORM}>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field id="password" label="New password" hint="At least 8 characters." error={errors.password?.message}>
        <PasswordInput showLabel="Show new password" autoComplete="new-password" {...fieldAria("password", errors.password?.message, "hint")} {...form.register("password")} />
      </Field>
      <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message}>
        <PasswordInput
          showLabel="Show the password typed again"
          autoComplete="new-password"
          {...fieldAria("confirmPassword", errors.confirmPassword?.message)}
          {...form.register("confirmPassword")}
        />
      </Field>
      <SubmitButton busy={isSubmitting} busyLabel="Saving">
        Set new password
      </SubmitButton>
    </ClientForm>
  );
}
