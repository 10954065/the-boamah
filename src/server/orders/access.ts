import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hashGuestToken } from "./reference";

const GUEST_COOKIE_PREFIX = "bg_go_";
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export const customerOrderInclude = {
  items: true,
  statusHistory: { orderBy: { createdAt: "asc" } },
  payments: { orderBy: { createdAt: "desc" }, select: { reference: true, status: true, provider: true, createdAt: true } },
} satisfies Prisma.OrderInclude;

export type CustomerOrder = Prisma.OrderGetPayload<{ include: typeof customerOrderInclude }>;

function guestCookieName(reference: string): string {
  return `${GUEST_COOKIE_PREFIX}${reference.replace(/[^A-Z0-9-]/gi, "")}`;
}

/** Remembers a guest's order access token in an httpOnly cookie (Server Actions only). */
export async function rememberGuestOrder(reference: string, token: string): Promise<void> {
  (await cookies()).set(guestCookieName(reference), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  });
}

function tokenMatches(token: string | undefined, hash: string | null): boolean {
  if (!token || !hash) return false;
  const a = Buffer.from(hashGuestToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Returns the order only if the visitor holds its access token (URL or
 * cookie). Anyone else can track it with its reference and their email or
 * phone; staff use the admin area instead.
 */
export async function getAccessibleOrder(reference: string, tokenFromUrl?: string): Promise<CustomerOrder | null> {
  if (!/^BMH-\d{6}-[A-Z0-9]{6}$/.test(reference)) return null;
  const order = await prisma.order.findUnique({ where: { reference }, include: customerOrderInclude });
  if (!order) return null;

  const cookieToken = (await cookies()).get(guestCookieName(reference))?.value;
  if (tokenMatches(tokenFromUrl, order.guestTokenHash) || tokenMatches(cookieToken, order.guestTokenHash)) return order;
  return null;
}

/** Public, minimal tracking lookup: reference + matching email or phone. */
export async function findOrderForTracking(reference: string, contact: string) {
  const normalized = contact.trim().toLowerCase();
  const phone = normalized.replace(/[\s-]/g, "");
  const order = await prisma.order.findUnique({
    where: { reference: reference.trim().toUpperCase() },
    include: { statusHistory: { orderBy: { createdAt: "asc" } } },
  });
  if (!order) return null;
  const emailMatch = order.email !== null && order.email.toLowerCase() === normalized;
  const phoneMatch = order.phone.replace(/[\s-]/g, "") === phone || order.phone.replace(/^\+233/, "0") === phone.replace(/^\+233/, "0");
  return emailMatch || phoneMatch ? order : null;
}

/** Whether a confirmation email for this order was actually accepted by the email provider. */
export async function wasConfirmationEmailed(orderId: string): Promise<boolean> {
  const sent = await prisma.notification.count({
    where: { orderId, channel: "EMAIL", status: "SENT", type: { in: ["ORDER_CONFIRMATION", "PAYMENT_CONFIRMED"] } },
  });
  return sent > 0;
}
