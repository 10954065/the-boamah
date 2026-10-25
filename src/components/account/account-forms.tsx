"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { LogOut, MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { deleteAddress, saveAddress, setDefaultAddress, updateProfile, type AddressInput } from "@/actions/profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClientForm } from "@/components/ui/client-form";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, EmptyState, Spinner } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Checkbox, Input, Select } from "@/components/ui/input";
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
      <Field id="profile-email" label="Email address" hint="Contact us to change the email on your account." className="sm:col-span-2">
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
    <ClientForm onSubmit={onSubmit} noValidate className="max-w-md space-y-4">
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

export interface AddressView {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  zoneId: string | null;
  city: string;
  area: string;
  addressLine: string;
  details: string | null;
  isDefault: boolean;
}

interface ZoneOption {
  id: string;
  name: string;
  region: string;
}

function AddressForm({ zones, initial, onDone }: { zones: ZoneOption[]; initial?: AddressView; onDone: () => void }) {
  const [values, setValues] = useState<AddressInput>({
    id: initial?.id,
    label: initial?.label ?? "",
    recipientName: initial?.recipientName ?? "",
    phone: initial?.phone ?? "",
    zoneId: initial?.zoneId ?? "",
    city: initial?.city ?? "",
    area: initial?.area ?? "",
    addressLine: initial?.addressLine ?? "",
    details: initial?.details ?? "",
    isDefault: initial?.isDefault ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = (key: keyof AddressInput) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues({ ...values, [key]: event.target.value });

  return (
    <ClientForm
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveAddress({ ...values, zoneId: values.zoneId || undefined });
          if (result.ok) {
            toast.success(result.message);
            onDone();
          } else {
            setErrors(result.fieldErrors ?? {});
            toast.error(result.error);
          }
        });
      }}
    >
      <Field id="a-label" label="Label" hint="Optional, e.g. Home or Office.">
        <Input {...fieldAria("a-label", undefined, "hint")} value={values.label} onChange={set("label")} />
      </Field>
      <Field id="a-recipient" label="Recipient name" required error={errors.recipientName}>
        <Input {...fieldAria("a-recipient", errors.recipientName)} value={values.recipientName} onChange={set("recipientName")} />
      </Field>
      <Field id="a-phone" label="Phone" required error={errors.phone}>
        <Input {...fieldAria("a-phone", errors.phone)} type="tel" value={values.phone} onChange={set("phone")} />
      </Field>
      <Field id="a-zone" label="Delivery area" error={errors.zoneId}>
        <Select {...fieldAria("a-zone", errors.zoneId)} value={values.zoneId} onChange={set("zoneId")}>
          <option value="">Not in a delivery area</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name} ({zone.region})
            </option>
          ))}
        </Select>
      </Field>
      <Field id="a-city" label="Town / city" required error={errors.city}>
        <Input {...fieldAria("a-city", errors.city)} value={values.city} onChange={set("city")} />
      </Field>
      <Field id="a-area" label="Area / neighbourhood" required error={errors.area}>
        <Input {...fieldAria("a-area", errors.area)} value={values.area} onChange={set("area")} />
      </Field>
      <Field id="a-line" label="Street address or landmark" required error={errors.addressLine} className="sm:col-span-2">
        <Input {...fieldAria("a-line", errors.addressLine)} value={values.addressLine} onChange={set("addressLine")} />
      </Field>
      <Field id="a-details" label="Additional details" className="sm:col-span-2">
        <Input id="a-details" value={values.details} onChange={set("details")} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink-muted sm:col-span-2">
        <Checkbox checked={Boolean(values.isDefault)} onChange={(e) => setValues({ ...values, isDefault: e.target.checked })} /> Use as my default address
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner label="Saving" /> : null} Save address
        </Button>
      </div>
    </ClientForm>
  );
}

export function AddressManager({ addresses, zones }: { addresses: AddressView[]; zones: ZoneOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AddressView | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const done = () => {
    setEditing(null);
    router.refresh();
  };
  const run = (action: () => Promise<unknown>) =>
    startTransition(async () => {
      await action();
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <Button onClick={() => setEditing("new")}>
        <Plus /> Add address
      </Button>
      {addresses.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState icon={<MapPin />} title="No saved addresses" description="Save an address to speed up checkout." />
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {addresses.map((address) => (
            <li key={address.id} className="rounded-lg border border-line bg-surface p-5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-ink">{address.label || address.recipientName}</p>
                {address.isDefault ? <Badge tone="brand">Default</Badge> : null}
              </div>
              <div className="mt-2 space-y-0.5 text-ink-muted">
                <p>
                  {address.recipientName} · {address.phone}
                </p>
                <p>{address.addressLine}</p>
                <p>
                  {address.area}, {address.city}
                </p>
                {address.details ? <p>{address.details}</p> : null}
                {!address.zoneId ? <p className="text-warning">Outside our current delivery areas.</p> : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(address)}>
                  <Pencil /> Edit
                </Button>
                {!address.isDefault ? (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setDefaultAddress({ id: address.id }))}>
                    <Star /> Make default
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  className="text-danger hover:text-danger"
                  onClick={() => run(() => deleteAddress({ id: address.id }))}
                  aria-label={`Delete address ${address.label || address.addressLine}`}
                >
                  <Trash2 /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing !== null ? (
          <DialogContent title={editing === "new" ? "Add address" : "Edit address"} className="max-w-2xl">
            <AddressForm zones={zones} initial={editing === "new" ? undefined : editing} onDone={done} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
