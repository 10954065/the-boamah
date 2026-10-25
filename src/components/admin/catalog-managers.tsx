"use client";

import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCategory, saveCategory } from "@/actions/admin/catalog";
import { changeStock } from "@/actions/admin/operations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { ImageUploader } from "./image-uploader";

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

function CategoryForm({ initial, nextOrder, onDone }: { initial?: CategoryRow; nextOrder: number; onDone: () => void }) {
  const [values, setValues] = useState({
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    imageUrl: initial?.imageUrl ?? "",
    sortOrder: initial?.sortOrder ?? nextOrder,
    isActive: initial?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveCategory({ id: initial?.id, ...values });
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
      <Field id="c-name" label="Name" required error={errors.name}>
        <Input {...fieldAria("c-name", errors.name)} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
      </Field>
      <Field id="c-slug" label="URL slug" hint="Leave blank to generate from the name." error={errors.slug}>
        <Input {...fieldAria("c-slug", errors.slug, "hint")} value={values.slug} onChange={(e) => setValues({ ...values, slug: e.target.value })} />
      </Field>
      <Field id="c-desc" label="Description" error={errors.description}>
        <Textarea rows={2} {...fieldAria("c-desc", errors.description)} value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} />
      </Field>
      <ImageUploader
        folder="categories"
        max={1}
        label="Category image"
        images={values.imageUrl ? [{ url: values.imageUrl, alt: "" }] : []}
        onChange={(images) => setValues({ ...values, imageUrl: images[0]?.url ?? "" })}
      />
      <div className="grid grid-cols-2 gap-4">
        <Field id="c-order" label="Display order" hint="Lower numbers appear first.">
          <Input id="c-order" type="number" min={0} value={values.sortOrder} onChange={(e) => setValues({ ...values, sortOrder: Number(e.target.value) || 0 })} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
          <Checkbox checked={values.isActive} onChange={(e) => setValues({ ...values, isActive: e.target.checked })} /> Active
        </label>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner label="Saving" /> : null} Save category
      </Button>
    </form>
  );
}

export function CategoryManager({ categories, canEdit }: { categories: CategoryRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CategoryRow | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const done = () => {
    setEditing(null);
    router.refresh();
  };
  return (
    <>
      {canEdit ? (
        <Button className="mb-4" onClick={() => setEditing("new")}>
          <Plus /> New category
        </Button>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-soft/60 text-left text-xs uppercase tracking-wider text-ink-subtle">
            <tr>
              <th scope="col" className="px-4 py-3">Order</th>
              <th scope="col" className="px-4 py-3">Name</th>
              <th scope="col" className="px-4 py-3">Products</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {categories.map((category) => (
              <tr key={category.id}>
                <td className="px-4 py-3 tabular-nums text-ink-muted">{category.sortOrder}</td>
                <td className="px-4 py-3">
                  <p className="font-semibold">{category.name}</p>
                  <p className="text-xs text-ink-subtle">/categories/{category.slug}</p>
                </td>
                <td className="px-4 py-3 tabular-nums">{category.productCount}</td>
                <td className="px-4 py-3">{category.isActive ? <Badge tone="success">Active</Badge> : <Badge>Hidden</Badge>}</td>
                <td className="px-4 py-3 text-right">
                  {canEdit ? (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(category)}>
                        <Pencil /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        disabled={pending}
                        aria-label={`Delete ${category.name}`}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await deleteCategory({ id: category.id });
                            if (result.ok) toast.success(result.message);
                            else toast.error(result.error);
                            router.refresh();
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing !== null ? (
          <DialogContent title={editing === "new" ? "New category" : `Edit ${editing.name}`}>
            <CategoryForm initial={editing === "new" ? undefined : editing} nextOrder={categories.length} onDone={done} />
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

export function StockAdjustButton({ variantId, label, unitLabel }: { variantId: string; label: string; unitLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ type: "RECEIPT" as "RECEIPT" | "ADJUSTMENT" | "CORRECTION", direction: "add" as "add" | "remove", quantity: "", reason: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Adjust
      </Button>
      {open ? (
        <DialogContent title={`Adjust stock: ${label}`} description="Every change is recorded with your name, the time and the reason.">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await changeStock({ variantId, ...values, direction: values.type === "RECEIPT" ? "add" : values.direction });
                if (result.ok) {
                  toast.success(result.message);
                  setOpen(false);
                  setValues({ type: "RECEIPT", direction: "add", quantity: "", reason: "" });
                  router.refresh();
                } else {
                  setErrors(result.fieldErrors ?? {});
                  toast.error(result.error);
                }
              });
            }}
          >
            <Field id="s-type" label="Type of change">
              <Select id="s-type" value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value as typeof values.type })}>
                <option value="RECEIPT">Stock received (delivery from supplier)</option>
                <option value="ADJUSTMENT">Adjustment (damage, expiry, loss)</option>
                <option value="CORRECTION">Correction (count error)</option>
              </Select>
            </Field>
            {values.type !== "RECEIPT" ? (
              <Field id="s-dir" label="Direction">
                <Select id="s-dir" value={values.direction} onChange={(e) => setValues({ ...values, direction: e.target.value as "add" | "remove" })}>
                  <option value="add">Add stock</option>
                  <option value="remove">Remove stock</option>
                </Select>
              </Field>
            ) : null}
            <Field id="s-qty" label={`Quantity (${unitLabel})`} required error={errors.quantity}>
              <Input {...fieldAria("s-qty", errors.quantity)} inputMode="decimal" value={values.quantity} onChange={(e) => setValues({ ...values, quantity: e.target.value })} />
            </Field>
            <Field id="s-reason" label="Reason" required error={errors.reason}>
              <Input {...fieldAria("s-reason", errors.reason)} placeholder="e.g. Delivery from supplier, invoice #123" value={values.reason} onChange={(e) => setValues({ ...values, reason: e.target.value })} />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner label="Saving" /> : null} Record change
            </Button>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
