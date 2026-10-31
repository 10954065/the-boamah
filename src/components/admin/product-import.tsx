"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { applyProductImport, previewProductImport, type ImportPreview } from "@/actions/admin/product-import";
import { Panel, TableWrap, td, th } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/feedback";
import type { RowKind } from "@/lib/product-import";
import { IMPORT_COLUMNS } from "@/lib/product-import-sheet";
import { cn } from "@/lib/utils";

const KINDS: Record<RowKind, { label: string; tone: "brand" | "info" | "gold" | "neutral" | "danger" }> = {
  error: { label: "Problem", tone: "danger" },
  "new-product": { label: "New product", tone: "brand" },
  "new-option": { label: "New size", tone: "info" },
  update: { label: "Update", tone: "gold" },
  unchanged: { label: "No change", tone: "neutral" },
};

const ORDER: RowKind[] = ["error", "new-product", "new-option", "update", "unchanged"];

function asUpload(file: File): FormData {
  const form = new FormData();
  form.append("file", file);
  return form;
}

/** Upload an Excel sheet of products, check what it changes, then import it. */
export function ProductImport() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [checking, startChecking] = useTransition();
  const [importing, startImport] = useTransition();

  function choose(chosen: File | undefined) {
    if (!chosen) return;
    setFile(chosen);
    setPreview(null);
    setError(null);
    setDone(null);
    startChecking(async () => {
      const result = await previewProductImport(asUpload(chosen));
      if (result.ok) setPreview(result.data);
      else setError(result.error);
    });
  }

  function runImport() {
    if (!file) return;
    startImport(async () => {
      const result = await applyProductImport(asUpload(file));
      if (!result.ok) return setError(result.error);
      setDone(result.message ?? "Imported.");
      setPreview(null);
      setFile(null);
      if (input.current) input.current.value = "";
    });
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setError(null);
    setDone(null);
    if (input.current) input.current.value = "";
  }

  const counts = preview?.counts;
  const changes = counts ? counts["new-product"] + counts["new-option"] + counts.update : 0;
  const blocked = !counts || counts.error > 0 || preview.stockNotAllowed || changes === 0;
  const rows = preview
    ? [...preview.rows].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.row - b.row).filter((row) => showUnchanged || row.kind !== "unchanged")
    : [];

  return (
    <div className="space-y-5">
      <Panel title="1. Get the sheet" description="Fill in one row for each size of a product.">
        <div className="flex flex-wrap gap-2">
          <a href="/admin/products/import/template" download className={buttonVariants({ variant: "outline" })}>
            <Download /> Blank template
          </a>
          <a href="/admin/products/import/template?products=all" download className={buttonVariants({ variant: "outline" })}>
            <Download /> All current products
          </a>
        </div>
        <p className="mt-3 max-w-3xl text-[13px] leading-6 text-ink-muted">
          Needed for a new product: <b className="text-ink">{IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.header).join(", ")}</b>. Also read:{" "}
          {IMPORT_COLUMNS.filter((c) => !c.required).map((c) => c.header).join(", ")}. To change prices or stock, download all current products, edit the sheet
          and upload it here. The sheet&apos;s second tab explains every column.
        </p>
      </Panel>

      <Panel title="2. Upload it and check" description="Nothing is saved until you press Import.">
        <input
          ref={input}
          id="product-sheet"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(event) => choose(event.target.files?.[0])}
        />
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="product-sheet" className={cn(buttonVariants(), "cursor-pointer", (checking || importing) && "pointer-events-none opacity-55")}>
            <Upload /> {file ? "Choose another file" : "Choose the Excel file"}
          </label>
          {file ? (
            <span className="inline-flex min-w-0 items-center gap-2 text-sm text-ink-muted">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
              <span className="truncate">{file.name}</span>
            </span>
          ) : null}
          {checking ? <Spinner label="Checking the sheet" className="text-brand-700" /> : null}
        </div>

        {error ? (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        ) : null}
        {done ? (
          <Alert tone="success" title={done} className="mt-4">
            New products are drafts: add photos and a description, then publish them.{" "}
            <Link href="/admin/products?status=DRAFT" className="font-semibold underline">
              See the drafts
            </Link>{" "}
            or{" "}
            <button type="button" onClick={reset} className="font-semibold underline">
              import another sheet
            </button>
            .
          </Alert>
        ) : null}

        {preview && counts ? (
          <div className="mt-5 space-y-4">
            <ul className="flex flex-wrap items-center gap-2" aria-label="What the sheet changes">
              {ORDER.map((kind) => (
                <li key={kind}>
                  <Badge tone={counts[kind] > 0 ? KINDS[kind].tone : "neutral"} className="text-xs">
                    {counts[kind]} {KINDS[kind].label.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
            {counts.error > 0 ? (
              <Alert tone="warning" title={`${counts.error} row${counts.error === 1 ? " has a problem" : "s have problems"}`}>
                Fix them in your sheet, save it and choose it again. Nothing is imported until every row is right.
              </Alert>
            ) : null}
            {preview.stockNotAllowed ? (
              <Alert tone="warning">
                This sheet changes stock, which your role cannot do. Ask a Store Manager to import it, or clear the Stock column for products already on the website.
              </Alert>
            ) : null}

            <TableWrap>
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-line bg-soft/60">
                  <tr>
                    <th scope="col" className={cn(th, "w-16")}>Row</th>
                    <th scope="col" className={th}>Product</th>
                    <th scope="col" className={cn(th, "w-32")}>What happens</th>
                    <th scope="col" className={th}>Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={cn(td, "text-ink-muted")}>
                        Every row already matches the website.
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((row) => (
                    <tr key={row.row} className={row.kind === "error" ? "bg-danger-soft/40" : undefined}>
                      <td className={cn(td, "tabular-nums text-ink-muted")}>{row.row}</td>
                      <td className={td}>
                        <span className="font-semibold">{row.product || "No name"}</span>
                        {row.option ? <span className="block text-xs text-ink-muted">{row.option}</span> : null}
                      </td>
                      <td className={td}>
                        <Badge tone={KINDS[row.kind].tone}>{KINDS[row.kind].label}</Badge>
                      </td>
                      <td className={cn(td, row.kind === "error" ? "text-danger" : "text-ink-muted")}>
                        {row.notes.length > 0 ? (
                          <ul className="space-y-0.5">
                            {row.notes.map((note) => (
                              <li key={note}>{note}</li>
                            ))}
                          </ul>
                        ) : (
                          "Matches the website"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {counts.unchanged > 0 ? (
              <button type="button" onClick={() => setShowUnchanged((on) => !on)} className="text-sm font-semibold text-brand-700 hover:underline">
                {showUnchanged ? "Hide" : "Show"} the {counts.unchanged} row{counts.unchanged === 1 ? "" : "s"} with no change
              </button>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <Button size="lg" disabled={blocked || importing} onClick={runImport}>
                {importing ? "Importing..." : changes === 0 ? "Nothing to import" : `Import ${changes} row${changes === 1 ? "" : "s"}`}
              </Button>
              <Button variant="ghost" onClick={reset} disabled={importing}>
                Start again
              </Button>
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
