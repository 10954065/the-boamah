import type { PosSaleUpload, PosShiftClose, PosShiftOpen } from "@/lib/pos";
import type { PosCatalogItem } from "@/lib/pos-till";
import type { PosSaleResult } from "@/server/pos/sales";
import type { ShiftCloseResult, ShiftOpenResult } from "@/server/pos/shifts";

/** Why a request from the till did not go through. */
export type TillFailure = "offline" | "signed-out" | "refused" | "server";

export class TillRequestError extends Error {
  constructor(
    message: string,
    readonly kind: TillFailure,
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
    });
  } catch {
    throw new TillRequestError("No connection to the shop's system. Check the internet connection.", "offline");
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (response.status === 401) throw new TillRequestError("You have been signed out. Sign in again to carry on.", "signed-out");
  if (!response.ok || data === null) {
    const kind = response.status >= 500 || data === null ? "server" : "refused";
    throw new TillRequestError(data?.error ?? "The shop's system did not answer. Try again.", kind);
  }
  return data;
}

export const tillApi = {
  catalog: () => request<{ items: PosCatalogItem[]; loadedAt: string }>("/api/pos/catalog"),
  openShift: (input: PosShiftOpen) => request<ShiftOpenResult>("/api/pos/shifts/open", input),
  closeShift: (input: PosShiftClose) => request<ShiftCloseResult>("/api/pos/shifts/close", input),
  async sendSale(upload: PosSaleUpload): Promise<PosSaleResult> {
    const { results } = await request<{ results: PosSaleResult[] }>("/api/pos/sales", { sales: [upload] });
    const result = results.find((r) => r.clientId === upload.clientId);
    if (!result) throw new TillRequestError("The shop's system did not confirm the sale. Try again.", "server");
    return result;
  },
};

export function failureOf(error: unknown): { message: string; kind: TillFailure } {
  if (error instanceof TillRequestError) return { message: error.message, kind: error.kind };
  return { message: "Something went wrong. Try again.", kind: "server" };
}
