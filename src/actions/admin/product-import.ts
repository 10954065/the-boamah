"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { hasPermission } from "@/lib/permissions";
import { planImport, type ImportPlan, type RowOutcome } from "@/lib/product-import";
import { applyImport, loadCatalogSnapshot, readProductSheet, SheetError } from "@/server/product-import";
import { authorize, runAction } from "@/server/session";
import { notifyBackInStock } from "@/server/stock-alerts";
import { refreshStorefront } from "@/server/storefront-cache";

export interface ImportPreview {
  fileName: string;
  counts: ImportPlan["counts"];
  rows: RowOutcome[];
  /** The sheet changes stock, which this person may not do. */
  stockNotAllowed: boolean;
}

const STOCK_NOT_ALLOWED = "This sheet changes stock, which your role cannot do. Ask a Store Manager to import it, or clear the Stock column for products already on the website.";

async function planUpload(formData: FormData): Promise<{ plan: ImportPlan; fileName: string } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose the Excel file to upload." };
  try {
    const [rows, snapshot] = await Promise.all([readProductSheet(file), loadCatalogSnapshot()]);
    return { plan: planImport(rows, snapshot), fileName: file.name.slice(0, 120) };
  } catch (error) {
    if (error instanceof SheetError) return { error: error.message };
    throw error;
  }
}

/** Reads a sheet and says what importing it would change, without changing anything. */
export async function previewProductImport(formData: FormData): Promise<ActionResult<ImportPreview>> {
  return runAction("admin.previewProductImport", async () => {
    const user = await authorize("catalog:edit");
    const planned = await planUpload(formData);
    if ("error" in planned) return fail(planned.error);
    const { plan, fileName } = planned;
    return ok({ fileName, counts: plan.counts, rows: plan.rows, stockNotAllowed: plan.stockCounts.length > 0 && !hasPermission(user.role, "inventory:adjust") });
  });
}

/** Imports a sheet, checking it again against the catalogue as it is now. All of it or nothing. */
export async function applyProductImport(formData: FormData): Promise<ActionResult<ImportPlan["counts"]>> {
  return runAction("admin.applyProductImport", async () => {
    const user = await authorize("catalog:edit");
    const planned = await planUpload(formData);
    if ("error" in planned) return fail(planned.error);
    const { plan, fileName } = planned;
    if (plan.counts.error > 0) return fail("Something changed since the preview and the sheet now has problems. Check it again.");
    if (plan.stockCounts.length > 0 && !hasPermission(user.role, "inventory:adjust")) return fail(STOCK_NOT_ALLOWED);
    const { counts } = plan;
    if (counts["new-product"] + counts["new-option"] + counts.update === 0) return ok(counts, "Nothing to change: the website already matches the sheet.");

    let backInStock: string[];
    try {
      backInStock = await applyImport(plan, user.id, fileName);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return fail("Another product took one of these SKUs, barcodes or web addresses while you were checking. Upload the sheet again.");
      }
      throw error;
    }
    refreshStorefront();
    revalidatePath("/admin/products");
    revalidatePath("/admin/inventory");
    if (backInStock.length > 0) await notifyBackInStock(backInStock);

    const parts = [
      counts["new-product"] > 0 ? `${counts["new-product"]} new product row${counts["new-product"] === 1 ? "" : "s"} saved as drafts` : null,
      counts["new-option"] > 0 ? `${counts["new-option"]} new size${counts["new-option"] === 1 ? "" : "s"} added` : null,
      counts.update > 0 ? `${counts.update} row${counts.update === 1 ? "" : "s"} updated` : null,
    ].filter(Boolean);
    return ok(counts, `Imported: ${parts.join(", ")}.`);
  });
}
