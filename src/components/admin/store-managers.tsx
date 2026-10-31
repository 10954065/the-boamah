"use client";

import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSettings, saveZone, type SettingsInput } from "@/actions/admin/operations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Checkbox, Input, Textarea } from "@/components/ui/input";

export interface ZoneRow {
  id?: string;
  name: string;
  region: string;
  areas: string;
  fee: string;
  minOrder: string;
  freeFrom: string;
  estimatedDelivery: string;
  transitMinDays: number | null;
  transitMaxDays: number | null;
  sortOrder: number;
  isActive: boolean;
}

const emptyZone: ZoneRow = { name: "", region: "", areas: "", fee: "", minOrder: "", freeFrom: "", estimatedDelivery: "", transitMinDays: null, transitMaxDays: null, sortOrder: 0, isActive: true };

function ZoneForm({ initial, onDone }: { initial: ZoneRow; onDone: () => void }) {
  const [z, setZ] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ZoneRow>(k: K, v: ZoneRow[K]) => setZ({ ...z, [k]: v });
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveZone(z);
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
      <Field id="z-name" label="Zone name" required error={errors.name}>
        <Input {...fieldAria("z-name", errors.name)} value={z.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field id="z-region" label="Region" required error={errors.region}>
        <Input {...fieldAria("z-region", errors.region)} value={z.region} onChange={(e) => set("region", e.target.value)} />
      </Field>
      <Field id="z-areas" label="Areas covered" hint="Separate with commas. Customers see these when choosing a zone." className="sm:col-span-2">
        <Textarea id="z-areas" rows={2} aria-describedby="z-areas-hint" value={z.areas} onChange={(e) => set("areas", e.target.value)} />
      </Field>
      <Field id="z-fee" label="Delivery fee (GH₵)" required error={errors.fee}>
        <Input {...fieldAria("z-fee", errors.fee)} inputMode="decimal" value={z.fee} onChange={(e) => set("fee", e.target.value)} />
      </Field>
      <Field id="z-min" label="Minimum order (GH₵)" error={errors.minOrder}>
        <Input {...fieldAria("z-min", errors.minOrder)} inputMode="decimal" value={z.minOrder} onChange={(e) => set("minOrder", e.target.value)} />
      </Field>
      <Field id="z-free" label="Free delivery from (GH₵)" hint="Blank = never free." error={errors.freeFrom}>
        <Input {...fieldAria("z-free", errors.freeFrom, "hint")} inputMode="decimal" value={z.freeFrom} onChange={(e) => set("freeFrom", e.target.value)} />
      </Field>
      <Field id="z-eta" label="Delivery estimate shown to customers" hint="For example: Usually next working day.">
        <Input id="z-eta" aria-describedby="z-eta-hint" value={z.estimatedDelivery} onChange={(e) => set("estimatedDelivery", e.target.value)} />
      </Field>
      <Field id="z-tmin" label="Fewest days on the road" hint="Once the order leaves the shop. 0 means the same day." error={errors.transitMinDays}>
        <Input {...fieldAria("z-tmin", errors.transitMinDays, "hint")} type="number" inputMode="numeric" min={0} max={60} value={z.transitMinDays ?? ""} onChange={(e) => set("transitMinDays", e.target.value === "" ? null : Number(e.target.value))} />
      </Field>
      <Field id="z-tmax" label="Most days on the road" hint="Google shows these days with your products." error={errors.transitMaxDays}>
        <Input {...fieldAria("z-tmax", errors.transitMaxDays, "hint")} type="number" inputMode="numeric" min={0} max={60} value={z.transitMaxDays ?? ""} onChange={(e) => set("transitMaxDays", e.target.value === "" ? null : Number(e.target.value))} />
      </Field>
      <Field id="z-order" label="Display order">
        <Input id="z-order" type="number" min={0} value={z.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value) || 0)} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
        <Checkbox checked={z.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Delivering to this zone
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner label="Saving" /> : null} Save zone
        </Button>
      </div>
    </form>
  );
}

export function ZoneManager({ zones }: { zones: (ZoneRow & { summary: string })[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ZoneRow | null>(null);
  return (
    <>
      <Button className="mb-4" onClick={() => setEditing(emptyZone)}>
        <Plus /> New zone
      </Button>
      <ul className="grid gap-4 md:grid-cols-2">
        {zones.map((zone) => (
          <li key={zone.id} className="rounded-lg border border-line bg-surface p-5 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{zone.name}</p>
                <p className="text-xs text-ink-subtle">{zone.region}</p>
              </div>
              {zone.isActive ? <Badge tone="success">Delivering</Badge> : <Badge>Paused</Badge>}
            </div>
            <p className="mt-2 text-ink-muted">{zone.summary}</p>
            {zone.areas ? <p className="mt-1 text-xs text-ink-subtle">{zone.areas}</p> : null}
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditing(zone)}>
              <Pencil /> Edit
            </Button>
          </li>
        ))}
      </ul>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing ? (
          <DialogContent title={editing.id ? `Edit ${editing.name}` : "New delivery zone"} className="max-w-2xl">
            <ZoneForm
              initial={editing}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

type SettingsDraft = Omit<SettingsInput, never>;

export function SettingsForm({ initial, onlineConfigured }: { initial: SettingsDraft; onlineConfigured: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<SettingsDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const text = (key: keyof SettingsDraft) => ({
    value: (s[key] as string | undefined) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS({ ...s, [key]: e.target.value }),
  });
  const bool = (key: keyof SettingsDraft) => ({ checked: Boolean(s[key]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [key]: e.target.checked }) });
  const section = "space-y-4 rounded-lg border border-line bg-surface p-5";

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveSettings(s);
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
      <section className={section}>
        <h2 className="text-[15px] font-bold">Store & contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="st-name" label="Store name" error={errors.storeName}>
            <Input {...fieldAria("st-name", errors.storeName)} {...text("storeName")} />
          </Field>
          <Field id="st-tagline" label="Tagline">
            <Input id="st-tagline" {...text("tagline")} />
          </Field>
          <Field id="st-email" label="Contact email" error={errors.contactEmail}>
            <Input {...fieldAria("st-email", errors.contactEmail)} type="email" {...text("contactEmail")} />
          </Field>
          <Field id="st-phone" label="Contact phone">
            <Input id="st-phone" {...text("contactPhone")} />
          </Field>
          <Field id="st-wa" label="WhatsApp number">
            <Input id="st-wa" {...text("whatsappNumber")} />
          </Field>
          <Field id="st-hours" label="Business hours">
            <Input id="st-hours" {...text("businessHours")} />
          </Field>
          <Field id="st-address" label="Address" className="sm:col-span-2">
            <Input id="st-address" {...text("address")} />
          </Field>
        </div>
        <p className="text-xs text-ink-subtle">Customers only see the details you enter here.</p>
      </section>

      <section className={section}>
        <h2 className="text-[15px] font-bold">Announcement bar</h2>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox {...bool("announcementEnabled")} /> Show the announcement bar
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="st-ann" label="Message" error={errors.announcementText}>
            <Input {...fieldAria("st-ann", errors.announcementText)} {...text("announcementText")} />
          </Field>
          <Field id="st-annlink" label="Link (optional)" hint="A page on this site, e.g. /offers" error={errors.announcementLink}>
            <Input {...fieldAria("st-annlink", errors.announcementLink, "hint")} {...text("announcementLink")} />
          </Field>
        </div>
      </section>

      <section className={section}>
        <h2 className="text-[15px] font-bold">Payments & fulfilment</h2>
        {!onlineConfigured ? (
          <Alert tone="warning">Online payment needs PAYSTACK_SECRET_KEY on the server. Until it is set, customers will not see the online payment option.</Alert>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm"><Checkbox {...bool("onlinePaymentEnabled")} /> Accept online payments (Paystack)</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox {...bool("codEnabled")} /> Accept cash on delivery / collection</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox {...bool("pickupEnabled")} /> Offer store pickup</label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="st-pickup" label="Pickup address">
            <Input id="st-pickup" {...text("pickupAddress")} />
          </Field>
          <Field id="st-pickupinfo" label="Pickup instructions">
            <Input id="st-pickupinfo" {...text("pickupInstructions")} />
          </Field>
          <Field id="st-ttl" label="Unpaid online orders are released after (minutes)" error={errors.pendingPaymentTtlMinutes}>
            <Input
              {...fieldAria("st-ttl", errors.pendingPaymentTtlMinutes)}
              type="number"
              min={15}
              max={1440}
              value={s.pendingPaymentTtlMinutes}
              onChange={(e) => setS({ ...s, pendingPaymentTtlMinutes: Number(e.target.value) || 60 })}
            />
          </Field>
        </div>
      </section>

      <section className={section}>
        <h2 className="text-[15px] font-bold">Notifications</h2>
        <Field id="st-admins" label="Send new-order alerts to" hint="Email addresses separated by commas.">
          <Input id="st-admins" aria-describedby="st-admins-hint" {...text("notifyAdminEmails")} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm"><Checkbox {...bool("notifyOnNewOrder")} /> Email staff about new orders</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox {...bool("smsEnabled")} /> Send SMS updates to customers (needs an SMS provider)</label>
        </div>
      </section>

      <section className={section}>
        <h2 className="text-[15px] font-bold">Social media links</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["socialFacebook", "socialInstagram", "socialX", "socialTiktok"] as const).map((key) => (
            <Field key={key} id={`st-${key}`} label={key.replace("social", "")} error={errors[key]}>
              <Input {...fieldAria(`st-${key}`, errors[key])} placeholder="https://" {...text(key)} />
            </Field>
          ))}
        </div>
      </section>

      <section className={section}>
        <h2 className="text-[15px] font-bold">Policies</h2>
        <p className="text-xs text-ink-subtle">These are published as written. Have them reviewed for your business before going live.</p>
        <Field
          id="st-handlingdays"
          label="Days to get an order out of the shop"
          hint="Packing time before delivery. Enter 0 if orders usually leave the day they are placed. Google shows this with delivery times."
          error={errors.handlingDays}
          className="max-w-md"
        >
          <Input
            {...fieldAria("st-handlingdays", errors.handlingDays, "hint")}
            type="number"
            inputMode="numeric"
            min={0}
            max={30}
            value={s.handlingDays ?? ""}
            onChange={(e) => setS({ ...s, handlingDays: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </Field>
        <Field
          id="st-returndays"
          label="Days customers have to return an item"
          hint="Google shows this with your products. Enter 0 if you do not take returns, or leave it blank until you decide."
          error={errors.returnDays}
          className="max-w-md"
        >
          <Input
            {...fieldAria("st-returndays", errors.returnDays, "hint")}
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            value={s.returnDays ?? ""}
            onChange={(e) => setS({ ...s, returnDays: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </Field>
        {(
          [
            ["deliveryPolicy", "Delivery information"],
            ["returnsPolicy", "Returns & refunds"],
            ["privacyPolicy", "Privacy policy"],
            ["termsPolicy", "Terms & conditions"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} id={`st-${key}`} label={label}>
            <Textarea id={`st-${key}`} rows={5} {...text(key)} />
          </Field>
        ))}
      </section>

      <section className={section}>
        <h2 className="text-[15px] font-bold">Data</h2>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox {...bool("isSampleData")} /> This store still contains sample data (shows a warning to staff)
        </label>
      </section>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Spinner label="Saving" /> : null} Save settings
      </Button>
    </form>
  );
}
