"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookUser, DoorClosed, Globe, History, PauseCircle, Printer, ReceiptText, RefreshCw, ShoppingBasket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import type { TillCreditCustomer } from "@/lib/credit";
import { formatMoney } from "@/lib/money";
import { formatReceiptNumber, parseReceiptNumber, type PosShiftView, type PosTenderCode, type TenderLine } from "@/lib/pos";
import { journalSaleOf, newEntryState, type SaleEntry } from "@/lib/pos-outbox";
import {
  addToSale,
  buildSaleUpload,
  catalogCategories,
  findByCode,
  heldSaleOf,
  isWeighed,
  MAX_HELD_SALES,
  priceSale,
  receiptFor,
  resumeHeldSale,
  searchCatalog,
  setLineQuantity,
  type HeldSale,
  type PosCatalogItem,
  type PricedTillLine,
  type ReceiptData,
  type TillLine,
} from "@/lib/pos-till";
import { MILLI } from "@/lib/quantity";
import { CreditCustomersSheet } from "./credit-customers-sheet";
import { HeldSalesDialog, HoldSaleDialog } from "./held-sales";
import { ProductGrid } from "./product-grid";
import { QuantityDialog, type QuantityTarget } from "./quantity-dialog";
import type { ShopDetails } from "./receipt";
import { SalePanel } from "./sale-panel";
import { SalesHistorySheet } from "./sales-history";
import { SaleCheck } from "./sale-check";
import { ReceiptDialog, SendingDialog, type SendState } from "./sale-status";
import { SyncStatus, TillBanner } from "./sync-status";
import { TenderDialog } from "./tender-dialog";
import { HeaderAction, TillHeader, TillSignOut, TillTitle } from "./till-header";
import { TillSettingsDialog } from "./till-settings-dialog";
import {
  addToJournal,
  addToOutbox,
  holdSale,
  issueReceiptSequence,
  loadLastReceipt,
  loadOutbox,
  releaseReceiptSequence,
  removeFromJournal,
  removeFromOutbox,
  removeHeldSale,
  saveLastReceipt,
  type TillPrefs,
} from "./till-storage";
import { ANSWER_WAIT_MS, sendNow, STORAGE_FULL, useHeldSales } from "./till-sync";
import { useCreditCustomers } from "./use-credit-customers";
import { useTillCatalog } from "./use-till-catalog";
import { useWebsiteOrders } from "./use-website-orders";
import { WebsiteOrdersBoard } from "./website-orders";

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
  onCloseShift: () => void;
  /** A manager closed this shift; the server said so at serverTime. */
  onShiftClosedElsewhere: (serverTime: string) => void;
}

/** The selling screen: products on the left, the sale on the right, payment and receipt in dialogs. */
export function SellScreen({ till, cashier, shift, shop, prefs, onPrefsChange, onCloseShift, onShiftClosedElsewhere }: SellScreenProps) {
  const catalog = useTillCatalog(till.code);
  const refreshCatalog = catalog.refresh;
  const searchRef = useRef<HTMLInputElement>(null);

  const [lines, setLines] = useState<TillLine[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showOrders, setShowOrders] = useState(false);
  // Prices depend on the time (sale prices end), so the clock ticks and is fixed when payment starts.
  const [now, setNow] = useState(() => new Date());
  const [quantityTarget, setQuantityTarget] = useState<QuantityTarget | null>(null);
  const [tenderMethod, setTenderMethod] = useState<PosTenderCode | null>(null);
  const [sending, setSending] = useState<SendState | null>(null);
  const [receipt, setReceipt] = useState<{ data: ReceiptData; copy: boolean; waiting: boolean } | null>(null);
  const [panel, setPanel] = useState<"sale" | "settings" | "hold" | "held" | "history" | "credit" | null>(null);
  const heldCount = useHeldSales(till.code).length;
  const websiteOrders = useWebsiteOrders();
  const credit = useCreditCustomers(till.code);

  const sale = useMemo(() => priceSale(lines, now), [lines, now]);
  const results = useMemo(() => searchCatalog(catalog.items, query, categoryId), [catalog.items, query, categoryId]);
  const categories = useMemo(() => catalogCategories(catalog.items), [catalog.items]);
  const busy = lines.length > 0 || sending !== null;
  const tendering = tenderMethod !== null;

  useEffect(() => {
    // The amount due must not change while the customer is paying.
    if (tendering) return;
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [tendering]);

  /** Goes back from the products looked up to the sale, ready for the next item. */
  const endLookup = useCallback(() => {
    setQuery("");
    setCategoryId(null);
    setShowOrders(false);
  }, []);

  const pick = useCallback(
    (item: PosCatalogItem) => {
      if (isWeighed(item.unit)) return setQuantityTarget({ item, quantityMilli: null });
      setLines((current) => addToSale(current, item, MILLI));
      setHighlightId(item.variantId);
      endLookup();
    },
    [endLookup],
  );

  function submitSearch() {
    const code = query.trim();
    if (!code) return;
    if (catalog.status === "loading") {
      toast.info("The products are still loading. Scan again in a moment.");
      return;
    }
    const match = findByCode(catalog.items, code) ?? (results.length === 1 ? results[0] : undefined);
    if (match) return pick(match);
    toast.error(results.length === 0 ? `Nothing matches "${code}".` : "More than one product matches. Tap the one you want.");
  }

  function confirmQuantity(item: PosCatalogItem, quantityMilli: number) {
    const editing = quantityTarget?.quantityMilli != null;
    setLines((current) => (editing ? setLineQuantity(current, item.variantId, quantityMilli) : addToSale(current, item, quantityMilli)));
    setHighlightId(item.variantId);
    setQuantityTarget(null);
    endLookup();
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

  function charge(method: PosTenderCode = "CASH") {
    if (lines.length === 0 || sending) return;
    setNow(new Date());
    setPanel(null);
    setTenderMethod(method);
  }

  function toggleOrders() {
    setQuery("");
    setCategoryId(null);
    setShowOrders((showing) => !showing);
  }

  /** The sale is done at the counter: clear it and show the receipt. */
  function finishSale(data: ReceiptData, waiting: boolean) {
    saveLastReceipt(till.code, data);
    setSending(null);
    setLines([]);
    setHighlightId(null);
    setReceipt({ data, copy: false, waiting });
    if (!waiting) void refreshCatalog(); // stock has changed
  }

  /**
   * Saves the paid sale on the till first, then sends it. Without an answer
   * in a few seconds the receipt shows anyway and the sale waits on the till.
   */
  async function complete(tenders: TenderLine[], creditCustomer: TillCreditCustomer | null) {
    const sequence = issueReceiptSequence(till.code, till.lastReceiptSeq);
    const upload = buildSaleUpload(
      { clientId: crypto.randomUUID(), receiptNumber: formatReceiptNumber(till.code, sequence), tillCode: till.code, shiftClientId: shift.clientId, cashierId: cashier.id, soldAt: now },
      sale,
      tenders,
      creditCustomer,
    );
    const data = receiptFor(upload, sale, cashier.name, creditCustomer);
    const entry: SaleEntry = { kind: "sale", id: upload.clientId, cashierId: cashier.id, cashierName: cashier.name, createdAt: new Date().toISOString(), ...newEntryState, upload, receipt: data, renumbered: 0 };
    if (!addToOutbox(till.code, entry)) {
      releaseReceiptSequence(till.code, sequence);
      toast.error(STORAGE_FULL);
      return;
    }
    addToJournal(till.code, shift.clientId, journalSaleOf(data, upload.clientId));
    setTenderMethod(null);
    if (!navigator.onLine) return finishSale(data, true);

    setSending({ status: "sending", receiptNumber: upload.receiptNumber });
    const outcome = await sendNow(till.code, cashier.id, entry.id, ANSWER_WAIT_MS);
    if (outcome?.kind === "sale") {
      // Recorded: the balance on the stored list is behind until it is loaded again.
      if (upload.creditCustomerId) void credit.refresh();
      return finishSale(outcome.receipt, false);
    }
    if (outcome?.kind === "refused") {
      setSending({
        status: "rejected",
        entryId: entry.id,
        receiptNumber: upload.receiptNumber,
        message: outcome.error,
        shiftClosed: outcome.reason === "shift-closed",
        serverTime: outcome.serverTime,
      });
      return;
    }
    // No answer yet: it may have been renumbered, or sent just after the wait.
    const current = loadOutbox(till.code).find((e) => e.id === entry.id);
    finishSale(current?.kind === "sale" ? current.receipt : data, current !== undefined);
  }

  /** The server refused the sale, so nothing was recorded and its receipt number is free again. */
  function dropRefusedSale() {
    if (sending?.status !== "rejected") return;
    const current = loadOutbox(till.code).find((e) => e.id === sending.entryId);
    const number = current?.kind === "sale" ? parseReceiptNumber(current.upload.receiptNumber) : null;
    if (number) releaseReceiptSequence(till.code, number.sequence);
    removeFromOutbox(till.code, sending.entryId);
    removeFromJournal(till.code, shift.clientId, sending.entryId);
    setSending(null);
  }

  /** Puts the sale aside for later; nothing is paid or taken off stock. */
  function holdCurrent(note: string) {
    if (!holdSale(till.code, heldSaleOf(sale, note, cashier.name, new Date()))) {
      toast.error(`The sale could not be put on hold. The till holds ${MAX_HELD_SALES} at most: pick one up or discard one first.`);
      return;
    }
    setPanel(null);
    setLines([]);
    setHighlightId(null);
    toast.success("Sale put on hold.");
  }

  function pickUp(held: HeldSale) {
    if (catalog.status === "loading") {
      toast.info("The products are still loading. Try again in a moment.");
      return;
    }
    const { lines: resumed, missing } = resumeHeldSale(held, catalog.items);
    removeHeldSale(till.code, held.id);
    setLines(resumed);
    setHighlightId(null);
    setPanel(null);
    if (missing.length > 0) toast.warning(`Left out because ${missing.length === 1 ? "it is" : "they are"} no longer sold: ${missing.join(", ")}.`);
  }

  function showLastReceipt() {
    const last = loadLastReceipt(till.code);
    if (last) setReceipt({ data: last, copy: true, waiting: false });
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

  const editLine = (line: PricedTillLine) => setQuantityTarget({ item: line.item, quantityMilli: line.quantityMilli });
  const salePanelProps = {
    sale,
    highlightId,
    onEdit: editLine,
    onStep: step,
    onRemove: removeLine,
    onClear: () => setLines([]),
    onHold: () => setPanel("hold"),
    onCharge: charge,
  };

  const ordersLabel = websiteOrders.waiting > 0 ? `Website orders, ${websiteOrders.waiting} to pack` : "Website orders";
  return (
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      <TillHeader
        till={till}
        cashierName={cashier.name}
        shiftOpenedAt={shift.openedAt}
        status={<SyncStatus tillCode={till.code} cashier={cashier} />}
        footer={<TillSignOut tillCode={till.code} cashierId={cashier.id} disabled={sending !== null} />}
      >
        <HeaderAction icon={ShoppingBasket} label="Sell" active={!showOrders} className="hidden md:inline-flex" onClick={endLookup} />
        <HeaderAction icon={Globe} label={ordersLabel} text="Website orders" count={websiteOrders.waiting} active={showOrders} onClick={toggleOrders} />
        <HeaderAction icon={History} label="Sales" onClick={() => setPanel("history")} />
        <HeaderAction icon={PauseCircle} label={heldCount > 0 ? `On hold (${heldCount})` : "On hold"} text="On hold" count={heldCount} onClick={() => setPanel("held")} />
        <HeaderAction icon={BookUser} label="Credit customers" text="Credit" onClick={() => setPanel("credit")} />
        <HeaderAction icon={ReceiptText} label="Last receipt" onClick={showLastReceipt} />
        <HeaderAction icon={Printer} label="Printer" onClick={() => setPanel("settings")} />
        <HeaderAction icon={RefreshCw} label="Refresh products" className="hidden sm:inline-flex" onClick={() => void refreshCatalog()} />
        <HeaderAction icon={DoorClosed} label="Close shift" title={busy ? "Finish or clear the sale first" : "Close shift"} disabled={busy} onClick={onCloseShift} />
      </TillHeader>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-soft">
        <TillTitle
          title={showOrders ? "Website orders" : "Sell"}
          detail={`Till ${till.code} · ${till.name} · ${cashier.name}`}
        />
        <TillBanner tillCode={till.code} cashier={cashier} shift={shift} pricesAsOf={catalog.loadedAt} onShiftClosedElsewhere={onShiftClosedElsewhere}>
          {catalog.status === "ready" && catalog.error ? (
            <p role="status" className="bg-warning-soft px-4 py-2 text-sm text-warning">
              Prices and stock could not be refreshed: {catalog.error}
            </p>
          ) : null}
        </TillBanner>

        <div className="flex min-h-0 flex-1">
          <main id="main" className="flex min-w-0 flex-1 flex-col">
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
              idle={
                showOrders ? (
                  <WebsiteOrdersBoard queue={websiteOrders} paper={prefs.paper} />
                ) : (
                  <SaleCheck sale={sale} highlightId={highlightId} ready={catalog.status === "ready"} onEdit={editLine} />
                )
              }
            />
          </main>
          <aside className="hidden w-[clamp(18.5rem,30vw,23rem)] shrink-0 py-3 pr-3 md:flex">
            <SalePanel {...salePanelProps} />
          </aside>
        </div>

        <div className="flex items-center gap-2 border-t border-line bg-surface px-3 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] pt-1.5 md:hidden">
          <div className="min-w-0">
            <p className="text-xs text-ink-muted">
              {lines.length} {lines.length === 1 ? "item" : "items"}
            </p>
            <p className="truncate font-display text-lg font-extrabold leading-6 tabular-nums">{formatMoney(sale.totalMinor)}</p>
          </div>
          <Button variant="outline" className="ml-auto h-11" onClick={() => setPanel("sale")}>
            View sale
          </Button>
          <Button className="h-11" disabled={lines.length === 0} onClick={() => charge()}>
            Charge
          </Button>
        </div>
      </div>

      <Dialog open={panel === "sale"} onOpenChange={(open) => setPanel(open ? "sale" : null)}>
        <SheetContent side="right" title="Current sale" closeLabel="Back to products" className="md:hidden">
          <SalePanel {...salePanelProps} inSheet />
        </SheetContent>
      </Dialog>

      <HoldSaleDialog open={panel === "hold"} onOpenChange={(open) => setPanel(open ? "hold" : null)} itemCount={lines.length} totalMinor={sale.totalMinor} onHold={holdCurrent} />
      <HeldSalesDialog open={panel === "held"} onOpenChange={(open) => setPanel(open ? "held" : null)} tillCode={till.code} canPickUp={lines.length === 0 && sending === null} onPickUp={pickUp} />
      <SalesHistorySheet
        open={panel === "history"}
        onOpenChange={(open) => setPanel(open ? "history" : null)}
        till={till}
        cashier={cashier}
        shift={shift}
        shop={shop}
        prefs={prefs}
        onStockChanged={() => void refreshCatalog()}
      />
      <QuantityDialog target={quantityTarget} onClose={() => setQuantityTarget(null)} onConfirm={confirmQuantity} onRemove={removeLine} />
      <TenderDialog
        open={tendering}
        initialMethod={tenderMethod ?? "CASH"}
        totalMinor={sale.totalMinor}
        credit={credit}
        onOpenChange={(open) => !open && setTenderMethod(null)}
        onComplete={(tenders, creditCustomer) => void complete(tenders, creditCustomer)}
      />
      <CreditCustomersSheet
        open={panel === "credit"}
        onOpenChange={(open) => setPanel(open ? "credit" : null)}
        credit={credit}
        cashier={cashier}
        shift={shift}
        tillCode={till.code}
        shop={shop}
        prefs={prefs}
      />
      <SendingDialog
        state={sending}
        onBack={dropRefusedSale}
        onShiftEnded={() => {
          const serverTime = sending?.status === "rejected" ? sending.serverTime : new Date().toISOString();
          dropRefusedSale();
          setLines([]);
          onShiftClosedElsewhere(serverTime);
        }}
      />
      <ReceiptDialog receipt={receipt?.data ?? null} copy={receipt?.copy ?? false} waiting={receipt?.waiting ?? false} shop={shop} prefs={prefs} onClose={() => setReceipt(null)} />
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
    </div>
  );
}
