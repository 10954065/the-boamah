"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { ClientForm } from "@/components/ui/client-form";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { safeRedirectPath } from "@/lib/utils";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema } from "@/lib/validation";

function errorMessage(error: { message?: string; status?: number } | null | undefined, fallback: string): string {
  if (!error) return fallback;
  if (error.status === 429) return error.message || "Too many attempts. Please wait a minute and try again.";
  return error.message || fallback;
}

export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof signInSchema>>({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

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
    <ClientForm onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field id="email" label="Email address" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...fieldAria("email", errors.email?.message)} {...form.register("email")} />
      </Field>
      <Field id="password" label="Password" error={errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...fieldAria("password", errors.password?.message)} {...form.register("password")} />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">
          Forgot your password?
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Spinner label="Signing in" /> : null} Sign in
      </Button>
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
      <Alert tone="success" title="Check your email">
        If an account exists for that address, we&rsquo;ve sent a link to reset your password. The link expires in 1 hour.
      </Alert>
    );
  }

  return (
    <ClientForm onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field id="email" label="Email address" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...fieldAria("email", errors.email?.message)} {...form.register("email")} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Spinner label="Sending" /> : null} Send reset link
      </Button>
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
    <ClientForm onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field id="password" label="New password" hint="At least 8 characters." error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...fieldAria("password", errors.password?.message, "hint")} {...form.register("password")} />
      </Field>
      <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message}>
        <Input type="password" autoComplete="new-password" {...fieldAria("confirmPassword", errors.confirmPassword?.message)} {...form.register("confirmPassword")} />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Spinner label="Saving" /> : null} Set new password
      </Button>
    </ClientForm>
  );
}
