"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteBanner, saveBanner, saveCoupon } from "@/actions/admin/operations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { ImageUploader } from "./image-uploader";

export interface CouponRow {
  id: string;
  code: string;
  description: string;
  type: "PERCENTAGE" | "FIXED";
  value: string;
  maxDiscount: string;
  minOrder: string;
  scope: "ALL" | "PRODUCTS" | "CATEGORIES";
  productIds: string[];
  categoryIds: string[];
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perCustomerLimit: string;
  isActive: boolean;
  usedCount: number;
  summary: string;
}

type CouponDraft = Omit<CouponRow, "id" | "usedCount" | "summary"> & { id?: string };

const emptyCoupon: CouponDraft = {
  code: "",
  description: "",
  type: "PERCENTAGE",
  value: "",
  maxDiscount: "",
  minOrder: "",
  scope: "ALL",
  productIds: [],
  categoryIds: [],
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  perCustomerLimit: "",
  isActive: true,
};

function MultiCheck({ id, options, selected, onChange }: { id: string; options: { id: string; name: string }[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div id={id} className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-line p-2">
      {options.map((o) => (
        <label key={o.id} className="flex items-center gap-2 text-sm">
          <Checkbox checked={selected.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...selected, o.id] : selected.filter((s) => s !== o.id))} />
          {o.name}
        </label>
      ))}
    </div>
  );
}

function CouponForm({ initial, products, categories, onDone }: { initial: CouponDraft; products: { id: string; name: string }[]; categories: { id: string; name: string }[]; onDone: () => void }) {
  const [d, setD] = useState<CouponDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof CouponDraft>(k: K, v: CouponDraft[K]) => setD({ ...d, [k]: v });
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveCoupon(d);
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
      <Field id="cp-code" label="Code" required error={errors.code}>
        <Input {...fieldAria("cp-code", errors.code)} className="font-mono uppercase" value={d.code} onChange={(e) => set("code", e.target.value.toUpperCase())} />
      </Field>
      <Field id="cp-type" label="Discount type">
        <Select id="cp-type" value={d.type} onChange={(e) => set("type", e.target.value as CouponDraft["type"])}>
          <option value="PERCENTAGE">Percentage off</option>
          <option value="FIXED">Fixed amount off (GH₵)</option>
        </Select>
      </Field>
      <Field id="cp-value" label={d.type === "PERCENTAGE" ? "Percentage (%)" : "Amount (GH₵)"} required error={errors.value}>
        <Input {...fieldAria("cp-value", errors.value)} inputMode="decimal" value={d.value} onChange={(e) => set("value", e.target.value)} />
      </Field>
      <Field id="cp-max" label="Maximum discount (GH₵)" hint="Optional cap for percentage coupons." error={errors.maxDiscount}>
        <Input {...fieldAria("cp-max", errors.maxDiscount, "hint")} inputMode="decimal" value={d.maxDiscount} onChange={(e) => set("maxDiscount", e.target.value)} />
      </Field>
      <Field id="cp-min" label="Minimum order (GH₵)" error={errors.minOrder}>
        <Input {...fieldAria("cp-min", errors.minOrder)} inputMode="decimal" value={d.minOrder} onChange={(e) => set("minOrder", e.target.value)} />
      </Field>
      <Field id="cp-desc" label="Internal description">
        <Input id="cp-desc" value={d.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <Field id="cp-start" label="Starts" error={errors.startsAt}>
        <Input {...fieldAria("cp-start", errors.startsAt)} type="datetime-local" value={d.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
      </Field>
      <Field id="cp-end" label="Expires" error={errors.endsAt}>
        <Input {...fieldAria("cp-end", errors.endsAt)} type="datetime-local" value={d.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
      </Field>
      <Field id="cp-limit" label="Total uses allowed" hint="Blank = unlimited." error={errors.usageLimit}>
        <Input {...fieldAria("cp-limit", errors.usageLimit, "hint")} inputMode="numeric" value={d.usageLimit} onChange={(e) => set("usageLimit", e.target.value)} />
      </Field>
      <Field id="cp-per" label="Uses per customer" hint="Blank = unlimited." error={errors.perCustomerLimit}>
        <Input {...fieldAria("cp-per", errors.perCustomerLimit, "hint")} inputMode="numeric" value={d.perCustomerLimit} onChange={(e) => set("perCustomerLimit", e.target.value)} />
      </Field>
      <Field id="cp-scope" label="Applies to" className="sm:col-span-2">
        <Select id="cp-scope" value={d.scope} onChange={(e) => set("scope", e.target.value as CouponDraft["scope"])}>
          <option value="ALL">Whole order</option>
          <option value="PRODUCTS">Selected products only</option>
          <option value="CATEGORIES">Selected categories only</option>
        </Select>
      </Field>
      {d.scope === "PRODUCTS" ? (
        <Field id="cp-products" label="Products" error={errors.productIds} className="sm:col-span-2">
          <MultiCheck id="cp-products" options={products} selected={d.productIds} onChange={(ids) => set("productIds", ids)} />
        </Field>
      ) : null}
      {d.scope === "CATEGORIES" ? (
        <Field id="cp-categories" label="Categories" error={errors.categoryIds} className="sm:col-span-2">
          <MultiCheck id="cp-categories" options={categories} selected={d.categoryIds} onChange={(ids) => set("categoryIds", ids)} />
        </Field>
      ) : null}
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <Checkbox checked={d.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Active
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner label="Saving" /> : null} Save coupon
        </Button>
      </div>
    </form>
  );
}

export function CouponManager({ coupons, products, categories }: { coupons: CouponRow[]; products: { id: string; name: string }[]; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CouponDraft | null>(null);
  return (
    <>
      <Button className="mb-4" onClick={() => setEditing(emptyCoupon)}>
        <Plus /> New coupon
      </Button>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line bg-soft/60 text-left text-[12.5px] text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">Code</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Discount</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Used</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {coupons.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-muted">No coupons yet.</td>
              </tr>
            ) : null}
            {coupons.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-mono font-semibold">{c.code}</td>
                <td className="px-4 py-3 text-ink-muted">{c.summary}</td>
                <td className="px-4 py-3 tabular-nums">
                  {c.usedCount}
                  {c.usageLimit ? ` / ${c.usageLimit}` : ""}
                </td>
                <td className="px-4 py-3">{c.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit ${c.code}`}>
                    <Pencil />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing ? (
          <DialogContent title={editing.id ? `Edit ${editing.code}` : "New coupon"} className="max-w-2xl">
            <CouponForm
              initial={editing}
              products={products}
              categories={categories}
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

export interface BannerRow {
  id?: string;
  placement: "HERO" | "HOME_PROMO";
  eyebrow: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  tone: "leaf" | "gold" | "cream" | "brand";
  startsAt: string;
  endsAt: string;
  sortOrder: number;
  isActive: boolean;
}

const emptyBanner: BannerRow = { placement: "HOME_PROMO", eyebrow: "", title: "", subtitle: "", imageUrl: "", ctaLabel: "", ctaHref: "", tone: "leaf", startsAt: "", endsAt: "", sortOrder: 0, isActive: true };

function BannerForm({ initial, onDone }: { initial: BannerRow; onDone: () => void }) {
  const [b, setB] = useState<BannerRow>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof BannerRow>(k: K, v: BannerRow[K]) => setB({ ...b, [k]: v });
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveBanner(b);
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
      <Field id="b-place" label="Placement">
        <Select id="b-place" value={b.placement} onChange={(e) => set("placement", e.target.value as BannerRow["placement"])}>
          <option value="HERO">Homepage hero</option>
          <option value="HOME_PROMO">Homepage promo tile</option>
        </Select>
      </Field>
      <Field id="b-tone" label="Background">
        <Select id="b-tone" value={b.tone} onChange={(e) => set("tone", e.target.value as BannerRow["tone"])}>
          <option value="leaf">Leaf green</option>
          <option value="gold">Golden</option>
          <option value="cream">Cream</option>
          <option value="brand">Soft forest</option>
        </Select>
      </Field>
      <Field id="b-title" label="Title" required error={errors.title} className="sm:col-span-2">
        <Input {...fieldAria("b-title", errors.title)} value={b.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field id="b-eyebrow" label="Small label above title">
        <Input id="b-eyebrow" value={b.eyebrow} onChange={(e) => set("eyebrow", e.target.value)} />
      </Field>
      <Field id="b-sub" label="Supporting text">
        <Input id="b-sub" value={b.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
      </Field>
      <Field id="b-cta" label="Button label">
        <Input id="b-cta" value={b.ctaLabel} onChange={(e) => set("ctaLabel", e.target.value)} />
      </Field>
      <Field id="b-href" label="Button link" hint="A page on this site, e.g. /offers" error={errors.ctaHref}>
        <Input {...fieldAria("b-href", errors.ctaHref, "hint")} value={b.ctaHref} onChange={(e) => set("ctaHref", e.target.value)} />
      </Field>
      <Field id="b-start" label="Show from" error={errors.startsAt}>
        <Input {...fieldAria("b-start", errors.startsAt)} type="datetime-local" value={b.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
      </Field>
      <Field id="b-end" label="Show until" error={errors.endsAt}>
        <Input {...fieldAria("b-end", errors.endsAt)} type="datetime-local" value={b.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <ImageUploader folder="banners" max={1} label="Banner image" images={b.imageUrl ? [{ url: b.imageUrl, alt: "" }] : []} onChange={(imgs) => set("imageUrl", imgs[0]?.url ?? "")} />
        {errors.imageUrl ? <p className="mt-1 text-xs font-medium text-danger">{errors.imageUrl}</p> : null}
      </div>
      <Field id="b-order" label="Display order">
        <Input id="b-order" type="number" min={0} value={b.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value) || 0)} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
        <Checkbox checked={b.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Active
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner label="Saving" /> : null} Save banner
        </Button>
      </div>
    </form>
  );
}

export function BannerManager({ banners }: { banners: BannerRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<BannerRow | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button className="mb-4" onClick={() => setEditing(emptyBanner)}>
        <Plus /> New banner
      </Button>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {banners.map((banner) => (
          <li key={banner.id} className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="relative aspect-[16/7] bg-soft">
              {banner.imageUrl ? <Image src={banner.imageUrl} alt="" fill sizes="400px" className="object-cover" /> : null}
            </div>
            <div className="space-y-1 p-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge tone="brand">{banner.placement === "HERO" ? "Hero" : "Promo"}</Badge>
                {banner.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
              </div>
              <p className="font-semibold">{banner.title}</p>
              <div className="flex gap-1 pt-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(banner)}>
                  <Pencil /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  disabled={pending}
                  aria-label={`Delete banner ${banner.title}`}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteBanner({ id: banner.id! });
                      if (!result.ok) toast.error(result.error);
                      router.refresh();
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing ? (
          <DialogContent title={editing.id ? "Edit banner" : "New banner"} className="max-w-2xl">
            <BannerForm
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
