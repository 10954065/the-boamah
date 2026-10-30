"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { updateProfile } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { ClientForm } from "@/components/ui/client-form";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { passwordField } from "@/lib/validation";

export function ProfileForm({ name, phone, email }: { name: string; phone: string | null; email: string }) {
  const [values, setValues] = useState({ name, phone: phone ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  return (
    <ClientForm
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await updateProfile(values);
          if (result.ok) {
            setErrors({});
            toast.success(result.message);
          } else {
            setErrors(result.fieldErrors ?? {});
            toast.error(result.error);
          }
        });
      }}
    >
      <Field id="profile-name" label="Full name" error={errors.name}>
        <Input {...fieldAria("profile-name", errors.name)} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} autoComplete="name" />
      </Field>
      <Field id="profile-phone" label="Phone number" error={errors.phone}>
        <Input {...fieldAria("profile-phone", errors.phone)} value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} type="tel" autoComplete="tel" />
      </Field>
      <Field id="profile-email" label="Email address" hint="The email you sign in with." className="sm:col-span-2">
        <Input id="profile-email" value={email} disabled aria-describedby="profile-email-hint" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner label="Saving" /> : null} Save changes
        </Button>
      </div>
    </ClientForm>
  );
}

const passwordSchema = z
  .object({ currentPassword: z.string().min(1, "Enter your current password."), newPassword: passwordField, confirmPassword: z.string() })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });

export function PasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });
    if (error) {
      setFormError(
        error.status === 429
          ? "Too many attempts. Please wait a few minutes."
          : /invalid/i.test(error.message ?? "")
            ? "Your current password is incorrect."
            : (error.message ?? "We couldn't change your password."),
      );
      return;
    }
    form.reset();
    toast.success("Password changed. Other devices have been signed out.");
  });

  return (
    <ClientForm onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field id="currentPassword" label="Current password" error={errors.currentPassword?.message}>
        <Input type="password" autoComplete="current-password" {...fieldAria("currentPassword", errors.currentPassword?.message)} {...form.register("currentPassword")} />
      </Field>
      <Field id="newPassword" label="New password" hint="At least 8 characters." error={errors.newPassword?.message}>
        <Input type="password" autoComplete="new-password" {...fieldAria("newPassword", errors.newPassword?.message, "hint")} {...form.register("newPassword")} />
      </Field>
      <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword?.message}>
        <Input type="password" autoComplete="new-password" {...fieldAria("confirmPassword", errors.confirmPassword?.message)} {...form.register("confirmPassword")} />
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Spinner label="Saving" /> : null} Change password
      </Button>
    </ClientForm>
  );
}

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      className={className}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await authClient.signOut();
          router.replace("/");
          router.refresh();
        })
      }
    >
      <LogOut /> Sign out
    </Button>
  );
}
