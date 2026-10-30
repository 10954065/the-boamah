"use client";

import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeProduct, saveProduct, type ProductFormInput } from "@/actions/admin/catalog";
import { Button } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { SELLING_UNITS, UNIT_INFO, type SellingUnitCode } from "@/lib/quantity";
import { ImageUploader, type UploadedImage } from "./image-uploader";

export interface TierDraft {
  minQty: string;
  price: string;
}

const MAX_TIERS = 4;

export interface VariantDraft {
  id?: string;
  name: string;
  sku: string;
  /** Scanned at the till; empty when the option has none. */
  barcode: string;
  unit: SellingUnitCode;
  price: string;
  salePrice: string;
  /** "YYYY-MM-DDTHH:mm" in Ghana time, or empty for no end date. */
  saleEndsAt: string;
  step: string;
  min: string;
  max: string;
  lowStock: string;
  openingStock: string;
  isActive: boolean;
  tiers: TierDraft[];
  currentStock?: string;
}

export interface ProductDraft {
  id?: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  searchKeywords: string;
  brand: string;
  categoryId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isFeatured: boolean;
  images: UploadedImage[];
  variants: VariantDraft[];
  defaultIndex: number;
}

const emptyVariant = (): VariantDraft => ({
  name: "",
  sku: "",
  barcode: "",
  unit: "ITEM",
  price: "",
  salePrice: "",
  saleEndsAt: "",
  step: "1",
  min: "1",
  max: "",
  lowStock: "5",
  openingStock: "0",
  isActive: true,
  tiers: [],
});

export function ProductForm({ initial, categories, canDelete }: { initial?: ProductDraft; categories: { id: string; name: string }[]; canDelete: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<ProductDraft>(
    initial ?? {
      name: "",
      slug: "",
      description: "",
      shortDescription: "",
      searchKeywords: "",
      brand: "",
      categoryId: categories[0]?.id ?? "",
      status: "DRAFT",
      isFeatured: false,
      images: [],
      variants: [emptyVariant()],
      defaultIndex: 0,
    },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setVariant = (index: number, patch: Partial<VariantDraft>) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)) }));
  const err = (key: string) => errors[key];

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const payload: ProductFormInput = {
      ...draft,
      variants: draft.variants.map((v) => ({
        id: v.id,
        name: v.name,
        sku: v.sku,
        barcode: v.barcode,
        unit: v.unit,
        price: v.price,
        salePrice: v.salePrice || undefined,
        saleEndsAt: v.salePrice && v.saleEndsAt ? v.saleEndsAt : undefined,
        step: v.step,
        min: v.min,
        max: v.max || undefined,
        lowStock: v.lowStock,
        openingStock: v.id ? undefined : v.openingStock || undefined,
        isActive: v.isActive,
        tiers: v.tiers.filter((t) => t.minQty.trim() || t.price.trim()),
      })),
    };
    startTransition(async () => {
      const result = await saveProduct(payload);
      if (result.ok) {
        setErrors({});
        toast.success(result.message);
        if (!draft.id) router.replace(`/admin/products/${result.data.id}`);
        else router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <section className="grid gap-4 rounded-lg border border-line bg-surface p-5 md:grid-cols-2">
        <Field id="name" label="Product name" required error={err("name")} className="md:col-span-2">
          <Input {...fieldAria("name", err("name"))} value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field id="categoryId" label="Category" required error={err("categoryId")}>
          <Select {...fieldAria("categoryId", err("categoryId"))} value={draft.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="brand" label="Brand" hint="The maker, e.g. Quaker or Dove. Google uses it to show the product in search." error={err("brand")}>
          <Input {...fieldAria("brand", err("brand"), "hint")} value={draft.brand} onChange={(e) => set("brand", e.target.value)} />
        </Field>
        <Field id="slug" label="URL slug" hint="Leave blank to generate from the name." error={err("slug")} className="md:col-span-2">
          <Input {...fieldAria("slug", err("slug"), "hint")} value={draft.slug} onChange={(e) => set("slug", e.target.value)} />
        </Field>
        <Field id="shortDescription" label="Short description" hint="Shown under the product name." error={err("shortDescription")} className="md:col-span-2">
          <Input {...fieldAria("shortDescription", err("shortDescription"), "hint")} value={draft.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} />
        </Field>
        <Field id="description" label="Description" required error={err("description")} className="md:col-span-2">
          <Textarea rows={5} {...fieldAria("description", err("description"))} value={draft.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field id="searchKeywords" label="Search keywords" hint="Extra words customers might search for, e.g. local names." className="md:col-span-2">
          <Input {...fieldAria("searchKeywords", undefined, "hint")} value={draft.searchKeywords} onChange={(e) => set("searchKeywords", e.target.value)} />
        </Field>
        <Field id="status" label="Status">
          <Select id="status" value={draft.status} onChange={(e) => set("status", e.target.value as ProductDraft["status"])}>
            <option value="DRAFT">Draft (hidden from customers)</option>
            <option value="PUBLISHED">Published (visible in the store)</option>
            <option value="ARCHIVED">Archived (no longer sold)</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-ink">
          <Checkbox checked={draft.isFeatured} onChange={(e) => set("isFeatured", e.target.checked)} /> Feature on the homepage
        </label>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <ImageUploader images={draft.images} onChange={(images) => set("images", images)} folder="products" label="Product images" />
        {err("images") ? <p className="mt-2 text-xs font-medium text-danger">{err("images")}</p> : null}
      </section>

      <section className="space-y-4 rounded-lg border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Sizes, prices &amp; quantity rules</h2>
          <Button type="button" size="sm" variant="outline" onClick={() => set("variants", [...draft.variants, emptyVariant()])}>
            <Plus /> Add option
          </Button>
        </div>
        {err("variants") ? <Alert tone="danger">{err("variants")}</Alert> : null}
        <p className="text-xs text-ink-muted">
          Quantities are in the selling unit: for &ldquo;kg&rdquo; use steps like 0.5. Stock for existing options is changed in Inventory so every change is recorded.
        </p>
        {draft.variants.map((variant, index) => {
          const p = `variants.${index}`;
          return (
            <fieldset key={index} className="grid gap-3 rounded-md border border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
              <legend className="px-1 text-sm font-semibold">Option {index + 1}</legend>
              <Field id={`${p}.name`} label="Name" required error={err(`${p}.name`)}>
                <Input {...fieldAria(`${p}.name`, err(`${p}.name`))} placeholder="e.g. 5 kg bag" value={variant.name} onChange={(e) => setVariant(index, { name: e.target.value })} />
              </Field>
              <Field id={`${p}.sku`} label="SKU" required error={err(`${p}.sku`)}>
                <Input {...fieldAria(`${p}.sku`, err(`${p}.sku`))} value={variant.sku} onChange={(e) => setVariant(index, { sku: e.target.value.toUpperCase() })} />
              </Field>
              <Field id={`${p}.barcode`} label="Barcode" hint="Scan the pack or type the number under the stripes." error={err(`${p}.barcode`)}>
                <Input
                  {...fieldAria(`${p}.barcode`, err(`${p}.barcode`))}
                  autoComplete="off"
                  value={variant.barcode}
                  // A USB scanner types the code and presses Enter; keep that Enter from submitting the form.
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                  onChange={(e) => setVariant(index, { barcode: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field id={`${p}.unit`} label="Sold by">
                <Select id={`${p}.unit`} value={variant.unit} onChange={(e) => setVariant(index, { unit: e.target.value as SellingUnitCode })}>
                  {SELLING_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {UNIT_INFO[unit].per}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id={`${p}.price`} label="Price (GH₵)" required error={err(`${p}.price`)}>
                <Input {...fieldAria(`${p}.price`, err(`${p}.price`))} inputMode="decimal" value={variant.price} onChange={(e) => setVariant(index, { price: e.target.value })} />
              </Field>
              <Field id={`${p}.salePrice`} label="Sale price (GH₵)" error={err(`${p}.salePrice`)}>
                <Input {...fieldAria(`${p}.salePrice`, err(`${p}.salePrice`))} inputMode="decimal" value={variant.salePrice} onChange={(e) => setVariant(index, { salePrice: e.target.value })} />
              </Field>
              <Field id={`${p}.saleEndsAt`} label="Sale ends (Ghana time)" hint="Optional. Leave empty to keep the sale on." error={err(`${p}.saleEndsAt`)}>
                <Input
                  {...fieldAria(`${p}.saleEndsAt`, err(`${p}.saleEndsAt`), "hint")}
                  type="datetime-local"
                  disabled={!variant.salePrice}
                  value={variant.saleEndsAt}
                  onChange={(e) => setVariant(index, { saleEndsAt: e.target.value })}
                />
              </Field>
              <Field id={`${p}.step`} label="Quantity step" error={err(`${p}.step`)}>
                <Input {...fieldAria(`${p}.step`, err(`${p}.step`))} inputMode="decimal" value={variant.step} onChange={(e) => setVariant(index, { step: e.target.value })} />
              </Field>
              <Field id={`${p}.min`} label="Minimum" error={err(`${p}.min`)}>
                <Input {...fieldAria(`${p}.min`, err(`${p}.min`))} inputMode="decimal" value={variant.min} onChange={(e) => setVariant(index, { min: e.target.value })} />
              </Field>
              <Field id={`${p}.max`} label="Maximum per order" error={err(`${p}.max`)}>
                <Input {...fieldAria(`${p}.max`, err(`${p}.max`))} inputMode="decimal" placeholder="No limit" value={variant.max} onChange={(e) => setVariant(index, { max: e.target.value })} />
              </Field>
              <Field id={`${p}.lowStock`} label="Low stock alert at" error={err(`${p}.lowStock`)}>
                <Input {...fieldAria(`${p}.lowStock`, err(`${p}.lowStock`))} inputMode="decimal" value={variant.lowStock} onChange={(e) => setVariant(index, { lowStock: e.target.value })} />
              </Field>
              {variant.id ? (
                <Field id={`${p}.stock`} label="Current stock">
                  <Input id={`${p}.stock`} value={variant.currentStock ?? ""} disabled />
                </Field>
              ) : (
                <Field id={`${p}.openingStock`} label="Opening stock" error={err(`${p}.openingStock`)}>
                  <Input {...fieldAria(`${p}.openingStock`, err(`${p}.openingStock`))} inputMode="decimal" value={variant.openingStock} onChange={(e) => setVariant(index, { openingStock: e.target.value })} />
                </Field>
              )}
              <BulkTiers
                prefix={p}
                tiers={variant.tiers}
                unitLabel={UNIT_INFO[variant.unit].plural}
                error={err}
                onChange={(tiers) => setVariant(index, { tiers })}
              />
              <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="defaultIndex" checked={draft.defaultIndex === index} onChange={() => set("defaultIndex", index)} className="h-4 w-4 accent-brand-700" />
                  Default option
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={variant.isActive} onChange={(e) => setVariant(index, { isActive: e.target.checked })} /> Available for sale
                </label>
                {draft.variants.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-danger"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        variants: d.variants.filter((_, i) => i !== index),
                        defaultIndex: d.defaultIndex >= index ? Math.max(0, d.defaultIndex - 1) : d.defaultIndex,
                      }))
                    }
                  >
                    <Trash2 /> Remove option
                  </Button>
                ) : null}
              </div>
            </fieldset>
          );
        })}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Spinner label="Saving" /> : null} Save product
        </Button>
        {draft.id && canDelete ? (
          confirmDelete ? (
            <div className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm">
              Delete (or archive if it has orders)?
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeProduct({ id: draft.id! });
                    if (result.ok) {
                      toast.success(result.message);
                      router.replace("/admin/products");
                    } else toast.error(result.error);
                  })
                }
              >
                Confirm
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete product
            </Button>
          )
        ) : null}
      </div>
    </form>
  );
}

interface BulkTiersProps {
  prefix: string;
  tiers: TierDraft[];
  unitLabel: string;
  error: (key: string) => string | undefined;
  onChange: (tiers: TierDraft[]) => void;
}

/** Up to four "buy at least N, pay X each" prices for one option. */
function BulkTiers({ prefix, tiers, unitLabel, error, onChange }: BulkTiersProps) {
  const update = (index: number, patch: Partial<TierDraft>) => onChange(tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  return (
    <div className="space-y-2 rounded-md bg-soft/60 p-3 sm:col-span-2 lg:col-span-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Bulk prices <span className="font-normal text-ink-muted">(optional: a lower price each when customers buy more)</span>
        </p>
        {tiers.length < MAX_TIERS ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onChange([...tiers, { minQty: "", price: "" }])}>
            <Plus /> Add bulk price
          </Button>
        ) : null}
      </div>
      {error(`${prefix}.tiers`) ? <p className="text-xs font-medium text-danger">{error(`${prefix}.tiers`)}</p> : null}
      {tiers.map((tier, t) => {
        const q = `${prefix}.tiers.${t}`;
        return (
          <div key={t} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field id={`${q}.minQty`} label={`Buy at least (${unitLabel})`} error={error(`${q}.minQty`)}>
              <Input {...fieldAria(`${q}.minQty`, error(`${q}.minQty`))} inputMode="decimal" placeholder="e.g. 5" value={tier.minQty} onChange={(e) => update(t, { minQty: e.target.value })} />
            </Field>
            <Field id={`${q}.price`} label="Price each (GH₵)" error={error(`${q}.price`)}>
              <Input {...fieldAria(`${q}.price`, error(`${q}.price`))} inputMode="decimal" placeholder="e.g. 420.00" value={tier.price} onChange={(e) => update(t, { price: e.target.value })} />
            </Field>
            <Button type="button" size="sm" variant="ghost" className="mb-1 text-danger" onClick={() => onChange(tiers.filter((_, i) => i !== t))} aria-label={`Remove bulk price ${t + 1}`}>
              <Trash2 />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
