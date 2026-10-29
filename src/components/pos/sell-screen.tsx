"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DoorClosed, Printer, ReceiptText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/money";
import { formatReceiptNumber, parseReceiptNumber, type TenderLine } from "@/lib/pos";
import {
  addToSale,
  buildSaleUpload,
  catalogCategories,
  findByCode,
  isWeighed,
  priceSale,
  receiptFor,
  searchCatalog,
  setLineQuantity,
  type PosCatalogItem,
  type PricedTillLine,
  type ReceiptData,
  type TillLine,
} from "@/lib/pos-till";
import { MILLI } from "@/lib/quantity";
import type { PosShiftView } from "@/server/pos/shifts";
import { CloseShiftDialog } from "./close-shift-dialog";
import { ProductGrid } from "./product-grid";
import { QuantityDialog, type QuantityTarget } from "./quantity-dialog";
import type { ShopDetails } from "./receipt";
import { SalePanel } from "./sale-panel";
import { PendingSaleDialog, ReceiptDialog, type SendState } from "./sale-status";
import { TenderDialog } from "./tender-dialog";
import { failureOf, tillApi } from "./till-api";
import { HeaderAction, TillHeader, TillSignOut, useOnline } from "./till-header";
import { TillSettingsDialog } from "./till-settings-dialog";
import {
  issueReceiptSequence,
  loadLastReceipt,
  loadPendingSale,
  otherCashiersPendingSales,
  releaseReceiptSequence,
  saveLastReceipt,
  savePendingSale,
  type PendingSale,
  type TillPrefs,
} from "./till-storage";
import { useTillCatalog } from "./use-till-catalog";

/** Times a sale is renumbered when another device has used its receipt number. */
const MAX_RENUMBER_ATTEMPTS = 3;

export interface TillInfo {
  code: string;
  name: string;
  lastReceiptSeq: number;
}

export interface TillCashier {
  id: string;
  name: string;
  canManage: boolean;
}

interface SellScreenProps {
  till: TillInfo;
  cashier: TillCashier;
  shift: PosShiftView;
  shop: ShopDetails;
  prefs: TillPrefs;
  onPrefsChange: (prefs: TillPrefs) => void;
  onShiftClosed: () => void;
}

/** The selling screen: products on the left, the sale on the right, payment and receipt in dialogs. */
export function SellScreen({ till, cashier, shift, shop, prefs, onPrefsChange, onShiftClosed }: SellScreenProps) {
  const catalog = useTillCatalog();
  const refreshCatalog = catalog.refresh;
  const online = useOnline();
  const searchRef = useRef<HTMLInputElement>(null);

  const [lines, setLines] = useState<TillLine[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  // Prices depend on the time (sale prices end), so the clock ticks and is fixed when payment starts.
  const [now, setNow] = useState(() => new Date());
  const [quantityTarget, setQuantityTarget] = useState<QuantityTarget | null>(null);
  const [tendering, setTendering] = useState(false);
  const [pending, setPending] = useState<PendingSale | null>(() => loadPendingSale(till.code, cashier.id));
  const [othersUnsent] = useState(() => otherCashiersPendingSales(till.code, cashier.id));
  const [sendState, setSendState] = useState<SendState | null>(() => (pending ? { status: "sending" } : null));
  const [receipt, setReceipt] = useState<{ data: ReceiptData; copy: boolean } | null>(null);
  const [panel, setPanel] = useState<"sale" | "close" | "settings" | null>(null);

  const sale = useMemo(() => priceSale(lines, now), [lines, now]);
  const results = useMemo(() => searchCatalog(catalog.items, query, categoryId), [catalog.items, query, categoryId]);
  const categories = useMemo(() => catalogCategories(catalog.items), [catalog.items]);
  const busy = lines.length > 0 || pending !== null;

  useEffect(() => {
    // The amount due must not change while the customer is paying.
    if (tendering) return;
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [tendering]);

  const deliver = useCallback(
    async (first: PendingSale) => {
      let unsent = first;
      for (let attempt = 0; ; attempt++) {
        let result;
        try {
          result = await tillApi.sendSale(unsent.upload);
        } catch (error) {
          setSendState({ status: "failed", ...failureOf(error) });
          return;
        }
        if (result.status === "rejected" && result.reason === "receipt-used" && attempt < MAX_RENUMBER_ATTEMPTS) {
          // Another device used this number: take the next free one. Nothing has been printed yet.
          const receiptNumber = formatReceiptNumber(till.code, issueReceiptSequence(till.code, result.lastReceiptSeq ?? 0));
          unsent = { upload: { ...unsent.upload, receiptNumber }, receipt: { ...unsent.receipt, receiptNumber } };
          savePendingSale(till.code, cashier.id, unsent);
          setPending(unsent);
          continue;
        }
        if (result.status === "rejected") {
          setSendState({ status: "rejected", message: result.error, shiftClosed: result.reason === "shift-closed" });
          return;
        }
        savePendingSale(till.code, cashier.id, null);
        saveLastReceipt(till.code, unsent.receipt);
        setPending(null);
        setSendState(null);
        setLines([]);
        setHighlightId(null);
        setReceipt({ data: unsent.receipt, copy: false });
        void refreshCatalog(); // stock has changed
        return;
      }
    },
    [till.code, cashier.id, refreshCatalog],
  );

  function send(unsent: PendingSale) {
    setSendState({ status: "sending" });
    void deliver(unsent);
  }

  // A paid sale left unsent (connection lost, page reloaded) goes again when the till opens.
  const unsentAtStart = useRef(pending);
  useEffect(() => {
    if (unsentAtStart.current) void deliver(unsentAtStart.current);
  }, [deliver]);

  const pick = useCallback((item: PosCatalogItem) => {
    if (isWeighed(item.unit)) return setQuantityTarget({ item, quantityMilli: null });
    setLines((current) => addToSale(current, item, MILLI));
    setHighlightId(item.variantId);
  }, []);

  function submitSearch() {
    const code = query.trim();
    if (!code) return;
    if (catalog.status === "loading") {
      toast.info("The products are still loading. Scan again in a moment.");
      return;
    }
    const match = findByCode(catalog.items, code) ?? (results.length === 1 ? results[0] : undefined);
    if (match) {
      pick(match);
      setQuery("");
      return;
    }
    toast.error(results.length === 0 ? `Nothing matches "${code}".` : "More than one product matches. Tap the one you want.");
  }

  function confirmQuantity(item: PosCatalogItem, quantityMilli: number) {
    const editing = quantityTarget?.quantityMilli != null;
    setLines((current) => (editing ? setLineQuantity(current, item.variantId, quantityMilli) : addToSale(current, item, quantityMilli)));
    setHighlightId(item.variantId);
    setQuantityTarget(null);
    searchRef.current?.focus();
  }

  function removeLine(variantId: string) {
    setLines((current) => setLineQuantity(current, variantId, 0));
    setQuantityTarget(null);
  }

  function step(line: PricedTillLine, direction: 1 | -1) {
    setLines((current) => setLineQuantity(current, line.item.variantId, line.quantityMilli + direction * MILLI));
    setHighlightId(line.item.variantId);
  }

  function charge() {
    if (lines.length === 0 || pending) return;
    setNow(new Date());
    setPanel(null);
    setTendering(true);
  }

  function complete(tenders: TenderLine[]) {
    const sequence = issueReceiptSequence(till.code, till.lastReceiptSeq);
    const upload = buildSaleUpload(
      { clientId: crypto.randomUUID(), receiptNumber: formatReceiptNumber(till.code, sequence), tillCode: till.code, shiftClientId: shift.clientId, cashierId: cashier.id, soldAt: now },
      sale,
      tenders,
    );
    const unsent: PendingSale = { upload, receipt: receiptFor(upload, sale, cashier.name) };
    savePendingSale(till.code, cashier.id, unsent);
    setPending(unsent);
    setTendering(false);
    send(unsent);
  }

  /** The server refused the sale, so nothing was recorded and its receipt number is free again. */
  function backToSale() {
    const number = pending ? parseReceiptNumber(pending.upload.receiptNumber) : null;
    if (number) releaseReceiptSequence(till.code, number.sequence);
    savePendingSale(till.code, cashier.id, null);
    setPending(null);
    setSendState(null);
  }

  /** Gives up on a sale that could not be sent. It may still have arrived, so its number is not reused. */
  function cancelPending() {
    savePendingSale(till.code, cashier.id, null);
    setPending(null);
    setSendState(null);
  }

  function showLastReceipt() {
    const last = loadLastReceipt(till.code);
    if (last) setReceipt({ data: last, copy: true });
    else toast.info("No receipt has been printed on this till yet.");
  }

  // F2 searches, F4 takes payment, and typing anywhere (or a scanner) goes to the search box.
  const chargeRef = useRef(charge);
  useEffect(() => {
    chargeRef.current = charge;
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector('[role="dialog"]')) return;
      if (event.key === "F2" || event.key === "F4") {
        event.preventDefault();
        if (event.key === "F2") searchRef.current?.focus();
        else chargeRef.current();
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (event.key.length === 1 && !target?.closest("input, textarea, select, [contenteditable='true']")) searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const salePanelProps = {
    sale,
    highlightId,
    onEdit: (line: PricedTillLine) => setQuantityTarget({ item: line.item, quantityMilli: line.quantityMilli }),
    onStep: step,
    onRemove: removeLine,
    onClear: () => setLines([]),
    onCharge: charge,
  };

  return (
    <div className="flex h-dvh flex-col">
      <TillHeader till={till} cashierName={cashier.name} shiftOpenedAt={shift.openedAt}>
        <HeaderAction icon={RefreshCw} label="Refresh products" className="hidden sm:inline-flex" onClick={() => void refreshCatalog()} />
        <HeaderAction icon={ReceiptText} label="Last receipt" onClick={showLastReceipt} />
        <HeaderAction icon={Printer} label="Printer" onClick={() => setPanel("settings")} />
        <HeaderAction
          icon={DoorClosed}
          label="Close shift"
          title={busy ? "Finish or clear the sale first" : "Close shift"}
          disabled={busy}
          onClick={() => setPanel("close")}
        />
        <TillSignOut disabled={pending !== null} />
      </TillHeader>

      {!online ? (
        <p role="status" className="bg-warning-soft px-4 py-2 text-sm font-medium text-warning">
          No internet connection. A paid sale waits on this till and is sent as soon as the connection is back.
        </p>
      ) : othersUnsent.length > 0 ? (
        <p role="status" className="bg-warning-soft px-4 py-2 text-sm text-warning">
          {othersUnsent.map((other) => `Receipt ${other.receiptNumber} by ${other.cashierName}`).join(", ")} has not reached the shop&apos;s system yet. Only
          that cashier can send it, by signing in on this till.
        </p>
      ) : catalog.status === "ready" && catalog.error ? (
        <p role="status" className="bg-warning-soft px-4 py-2 text-sm text-warning">
          Prices and stock could not be refreshed: {catalog.error}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <main id="main" className="flex min-w-0 flex-1 flex-col bg-soft">
          <ProductGrid
            results={results}
            categories={categories}
            categoryId={categoryId}
            onCategory={setCategoryId}
            query={query}
            onQuery={setQuery}
            onSubmitSearch={submitSearch}
            searchRef={searchRef}
            status={catalog.status}
            error={catalog.error}
            onRetry={() => void refreshCatalog()}
            onPick={pick}
            now={now}
          />
        </main>
        <aside className="hidden w-[min(26rem,40vw)] shrink-0 border-l border-line lg:flex">
          <SalePanel {...salePanelProps} />
        </aside>
      </div>

      <div className="flex items-center gap-3 border-t border-line bg-surface px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-2 lg:hidden">
        <div className="min-w-0">
          <p className="text-xs text-ink-muted">
            {lines.length} {lines.length === 1 ? "item" : "items"}
          </p>
          <p className="font-display text-xl font-extrabold tabular-nums">{formatMoney(sale.totalMinor)}</p>
        </div>
        <Button variant="outline" size="lg" className="ml-auto" onClick={() => setPanel("sale")}>
          View sale
        </Button>
        <Button size="lg" disabled={lines.length === 0} onClick={charge}>
          Charge
        </Button>
      </div>

      <Dialog open={panel === "sale"} onOpenChange={(open) => setPanel(open ? "sale" : null)}>
        <SheetContent side="right" title="Current sale" closeLabel="Back to products" className="lg:hidden">
          <SalePanel {...salePanelProps} inSheet />
        </SheetContent>
      </Dialog>

      <QuantityDialog target={quantityTarget} onClose={() => setQuantityTarget(null)} onConfirm={confirmQuantity} onRemove={removeLine} />
      <TenderDialog open={tendering} totalMinor={sale.totalMinor} onOpenChange={setTendering} onComplete={complete} />
      <PendingSaleDialog
        pending={pending}
        state={sendState}
        onRetry={() => pending && send(pending)}
        onBack={backToSale}
        onCancel={cancelPending}
        onShiftEnded={() => {
          backToSale();
          saveLastReceipt(till.code, null);
          onShiftClosed();
        }}
      />
      <ReceiptDialog receipt={receipt?.data ?? null} copy={receipt?.copy ?? false} shop={shop} prefs={prefs} onClose={() => setReceipt(null)} />
      <TillSettingsDialog
        open={panel === "settings"}
        onOpenChange={(open) => setPanel(open ? "settings" : null)}
        prefs={prefs}
        onChange={onPrefsChange}
        shop={shop}
        tillCode={till.code}
        cashierName={cashier.name}
        openedAt={shift.openedAt}
      />
      <CloseShiftDialog
        open={panel === "close"}
        onOpenChange={(open) => setPanel(open ? "close" : null)}
        shift={shift}
        shop={shop}
        paper={prefs.paper}
        onClosed={() => {
          setPanel(null);
          saveLastReceipt(till.code, null);
          onShiftClosed();
        }}
      />
    </div>
  );
}
