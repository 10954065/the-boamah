import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { isValidPaystackSignature } from "@/server/payments/paystack";
import { verifyAndApply } from "@/server/payments/service";

const MAX_BODY_BYTES = 256 * 1024;

/**
 * Paystack webhook. Steps:
 * 1. Reject requests without a valid HMAC-SHA512 signature.
 * 2. Store the event under a unique key — duplicate deliveries are ignored.
 * 3. Re-verify the transaction with Paystack's API (never trust the payload
 *    alone), then apply the result idempotently.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  if (!isValidPaystackSignature(raw, request.headers.get("x-paystack-signature"))) {
    console.warn("[paystack/webhook] rejected request with invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: { id?: number | string; reference?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = String(event.event ?? "unknown");
  const reference = typeof event.data?.reference === "string" ? event.data.reference : null;
  const eventKey = `paystack:${eventType}:${event.data?.id ?? "na"}:${reference ?? "na"}`;

  let stored;
  try {
    stored = await prisma.paymentEvent.create({
      data: { provider: "PAYSTACK", eventKey, eventType, reference, signatureValid: true, payload: event as Prisma.InputJsonValue },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw error;
  }

  if (!reference || !eventType.startsWith("charge.")) {
    await prisma.paymentEvent.update({ where: { id: stored.id }, data: { processedAt: new Date(), outcome: "IGNORED" } });
    return NextResponse.json({ received: true });
  }

  try {
    const result = await verifyAndApply(reference);
    await prisma.paymentEvent.update({ where: { id: stored.id }, data: { processedAt: new Date(), outcome: result.outcome } });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[paystack/webhook] processing failed", { reference, error });
    // Remove the record so Paystack's retry can be processed again.
    await prisma.paymentEvent.delete({ where: { id: stored.id } }).catch(() => undefined);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
