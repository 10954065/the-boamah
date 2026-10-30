import type { PosSaleResult, PosSaleUpload, PosShiftClose, PosShiftOpen, ShiftCloseResult, ShiftOpenResult } from "@/lib/pos";
import type {
  PosRefundRecord,
  PosRemovalInput,
  PosRemovalResult,
  PosReturnInput,
  PosReturnResult,
  PosSaleRecord,
  PosVoidInput,
  PosVoidResult,
} from "@/lib/pos-returns";
import type { OutboxApi, SyncFailure, TillFailure } from "@/lib/pos-sync";
import type { PosCatalogItem } from "@/lib/pos-till";

export type { TillFailure } from "@/lib/pos-sync";

/** A request that has not answered by then is treated as lost; the till sends it again later. */
const REQUEST_TIMEOUT_MS = 20_000;

export class TillRequestError extends Error {
  constructor(
    message: string,
    readonly kind: TillFailure,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new TillRequestError("No connection to the shop's system. Check the internet connection.", "offline");
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (response.status === 401) throw new TillRequestError("You have been signed out. Sign in again to carry on.", "signed-out", 401);
  if (!response.ok || data === null) {
    const kind = response.status >= 500 || data === null ? "server" : "refused";
    throw new TillRequestError(data?.error ?? "The shop's system did not answer. Try again.", kind, response.status);
  }
  return data;
}

type Stamped<T> = T & { serverTime: string };

export interface TillCatalogResponse {
  items: PosCatalogItem[];
  loadedAt: string;
}

export const tillApi = {
  catalog: () => request<TillCatalogResponse>("/api/pos/catalog"),
  openShift: (input: PosShiftOpen) => request<Stamped<ShiftOpenResult>>("/api/pos/shifts/open", input),
  closeShift: (input: PosShiftClose) => request<Stamped<ShiftCloseResult>>("/api/pos/shifts/close", input),
  sendSales: (sales: PosSaleUpload[]) => request<Stamped<{ results: PosSaleResult[] }>>("/api/pos/sales", { sales }),
} satisfies OutboxApi & { catalog: () => Promise<TillCatalogResponse> };

/** Requests that need the shop's system to answer there and then: nothing here waits on the till. */
export const tillOnlineApi = {
  shiftHistory: (shiftClientId: string) =>
    request<Stamped<{ sales: PosSaleRecord[]; refunds: PosRefundRecord[] }>>(`/api/pos/history?shift=${encodeURIComponent(shiftClientId)}`),
  findReceipt: (receiptNumber: string) => request<Stamped<{ sale: PosSaleRecord | null }>>(`/api/pos/history?receipt=${encodeURIComponent(receiptNumber)}`),
  voidSale: (input: PosVoidInput) => request<Stamped<PosVoidResult>>("/api/pos/voids", input),
  returnItems: (input: PosReturnInput) => request<Stamped<PosReturnResult>>("/api/pos/returns", input),
  recordRemoval: (input: PosRemovalInput) => request<Stamped<PosRemovalResult>>("/api/pos/removals", input),
};

export function failureOf(error: unknown): SyncFailure {
  if (error instanceof TillRequestError) return { message: error.message, kind: error.kind, status: error.status };
  return { message: "Something went wrong. Try again.", kind: "server" };
}
