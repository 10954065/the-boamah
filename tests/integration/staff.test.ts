import { randomUUID } from "node:crypto";
import { verifyPassword } from "better-auth/crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { entrySlug } from "@/lib/staff-gate";
import { auth } from "@/server/auth";
import { countCustomers, customerByKey, customerKey, listCustomers } from "@/server/customers";
import { SIGN_IN_LOCKED_MESSAGE, signInLocked } from "@/server/sign-in-limits";
import { addStaffMember, resetStaffMemberPassword, setStaffMemberSuspended, staffLinks } from "@/server/staff";
import { createStaff, createStaffWithPassword, resetDatabase } from "./factories";

beforeEach(resetDatabase);

const PASSWORD = "a-long-test-password";
const ORIGIN = process.env.BETTER_AUTH_URL ?? "http://localhost:3217";

let nextAddress = 0;
const freshAddress = () => `10.20.${Math.floor(++nextAddress / 250)}.${(nextAddress % 250) + 1}`;

/** Through the real auth handler. A new address each try keeps Better Auth's per-address limit out of the way. */
function signIn(email: string, password: string, headers: Record<string, string> = { "x-real-ip": freshAddress() }) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
      body: JSON.stringify({ email, password }),
    }),
  );
}

async function storedPassword(userId: string): Promise<string> {
  const account = await prisma.account.findFirstOrThrow({ where: { userId, providerId: "credential" } });
  return account.password ?? "";
}

describe("signing in", () => {
  test("staff can sign in", async () => {
    const staff = await createStaffWithPassword(PASSWORD);
    const response = await signIn(staff.email, PASSWORD);
    expect(response.status).toBe(200);
    expect(await prisma.session.count({ where: { userId: staff.id } })).toBe(1);
  });

  test("an old customer account is refused even with the right password", async () => {
    const customer = await createStaffWithPassword(PASSWORD, "CUSTOMER");
    const response = await signIn(customer.email, PASSWORD);
    expect(response.status).toBe(403);
    expect(await prisma.session.count({ where: { userId: customer.id } })).toBe(0);
  });

  test("nobody can register", async () => {
    const response = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, "x-real-ip": freshAddress() },
        body: JSON.stringify({ name: "New Person", email: "new.person@example.com", password: PASSWORD }),
      }),
    );
    expect(response.ok).toBe(false);
    expect(await prisma.user.count({ where: { email: "new.person@example.com" } })).toBe(0);
  });

  test("five wrong passwords pause the account, even for the right one, and only that account", async () => {
    const staff = await createStaffWithPassword(PASSWORD);
    const other = await createStaffWithPassword(PASSWORD);
    for (let attempt = 0; attempt < 5; attempt++) expect((await signIn(staff.email, "wrong-password")).status).toBe(401);

    const locked = await signIn(staff.email, PASSWORD);
    expect(locked.status).toBe(429);
    expect((await locked.json()).message).toBe(SIGN_IN_LOCKED_MESSAGE);
    expect(await prisma.session.count({ where: { userId: staff.id } })).toBe(0);
    expect((await signIn(other.email, PASSWORD)).status).toBe(200);

    const audit = await prisma.auditLog.findMany({ where: { action: "auth.sign_in.locked" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.details).toMatchObject({ email: staff.email });
  });

  test("the pause counts capital letters as the same account", async () => {
    const staff = await createStaffWithPassword(PASSWORD);
    for (let attempt = 0; attempt < 5; attempt++) await signIn(attempt % 2 ? staff.email.toUpperCase() : staff.email, "wrong-password");
    expect(await signInLocked(staff.email)).toBe(true);
  });

  test("an email with no account is paused the same way, so tries reveal nothing", async () => {
    for (let attempt = 0; attempt < 5; attempt++) expect((await signIn("nobody@example.com", "wrong-password")).status).toBe(401);
    expect((await signIn("nobody@example.com", "wrong-password")).status).toBe(429);
  });

  test("a reset from the emailed link lifts a pause, so wrong guesses cannot keep someone out", async () => {
    const staff = await createStaffWithPassword(PASSWORD);
    for (let attempt = 0; attempt < 5; attempt++) await signIn(staff.email, "wrong-password");
    expect(await signInLocked(staff.email)).toBe(true);

    const post = (path: string, body: object) =>
      auth.handler(
        new Request(`${ORIGIN}/api/auth/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: ORIGIN, "x-real-ip": freshAddress() },
          body: JSON.stringify(body),
        }),
      );
    expect((await post("request-password-reset", { email: staff.email, redirectTo: "/reset-password" })).status).toBe(200);
    const stored = await prisma.verification.findFirstOrThrow({ where: { identifier: { startsWith: "reset-password:" } } });
    const newPassword = "another-long-test-password";
    expect((await post("reset-password", { token: stored.identifier.slice("reset-password:".length), newPassword })).status).toBe(200);

    expect(await signInLocked(staff.email)).toBe(false);
    expect((await signIn(staff.email, newPassword)).status).toBe(200);
  });

  test("sign-ins that work never count", async () => {
    const staff = await createStaffWithPassword(PASSWORD);
    for (let attempt = 0; attempt < 6; attempt++) expect((await signIn(staff.email, PASSWORD)).status).toBe(200);
    expect(await signInLocked(staff.email)).toBe(false);
  });

  test("changing X-Forwarded-For does not get round the limit per address", async () => {
    const address = freshAddress();
    const statuses = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await signIn(`someone.${attempt}@example.com`, "wrong-password", { "x-real-ip": address, "x-forwarded-for": `6.6.6.${attempt}` });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });
});

describe("staff accounts", () => {
  test("adding someone creates an account that can sign in with the temporary password", async () => {
    const admin = await createStaff("SUPER_ADMIN");
    const { userId, temporaryPassword } = await addStaffMember(admin.id, { name: "Ama Mensah", email: "  Ama@Example.com ", role: "CASHIER" });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ email: "ama@example.com", name: "Ama Mensah", role: "CASHIER", status: "ACTIVE", emailVerified: true });
    expect(temporaryPassword).toHaveLength(16);
    expect((await signIn(user.email, temporaryPassword)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "staff.create", entityId: userId, actorId: admin.id } })).toBe(1);
  });

  test("a password the Super Admin typed is the one that works, and the phone is kept", async () => {
    const admin = await createStaff("SUPER_ADMIN");
    const chosen = "kente-cloth-2026";
    const { userId, temporaryPassword } = await addStaffMember(admin.id, { name: "Efua Owusu", email: "efua@example.com", role: "STORE_MANAGER", phone: "0241234567", password: chosen });

    expect(temporaryPassword).toBe(chosen);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({ phone: "0241234567", role: "STORE_MANAGER" });
    expect((await signIn("efua@example.com", chosen)).status).toBe(200);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "staff.create", entityId: userId } });
    expect(JSON.stringify(audit.details)).not.toContain(chosen);
  });

  test("the password is only ever stored hashed, and the audit log does not hold it", async () => {
    const admin = await createStaff("SUPER_ADMIN");
    const { userId, temporaryPassword } = await addStaffMember(admin.id, { name: "Kofi", email: "kofi@example.com", role: "CASHIER" });
    const hash = await storedPassword(userId);
    expect(hash).not.toContain(temporaryPassword);
    expect(await verifyPassword({ hash, password: temporaryPassword })).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "staff.create" } });
    expect(JSON.stringify(audit.details)).not.toContain(temporaryPassword);
  });

  test("an email already in use is refused", async () => {
    const admin = await createStaff("SUPER_ADMIN");
    const staff = await createStaff("CASHIER");
    const customer = await createStaff("CUSTOMER");
    await expect(addStaffMember(admin.id, { name: "Copy", email: staff.email, role: "CASHIER" })).rejects.toThrow(/already belongs/);
    await expect(addStaffMember(admin.id, { name: "Copy", email: customer.email, role: "CASHIER" })).rejects.toThrow(/old shop account/);
  });

  test("resetting a password replaces it, signs them out and lifts a pause", async () => {
    const admin = await createStaff("SUPER_ADMIN");
    const staff = await createStaffWithPassword(PASSWORD, "CASHIER");
    await signIn(staff.email, PASSWORD);
    for (let attempt = 0; attempt < 5; attempt++) await signIn(staff.email, "wrong-password");
    expect(await signInLocked(staff.email)).toBe(true);

    const { temporaryPassword, ...card } = await resetStaffMemberPassword(admin.id, staff.id);

    expect(card).toEqual({ name: staff.name, email: staff.email, role: "CASHIER" });
    expect(await prisma.session.count({ where: { userId: staff.id } })).toBe(0);
    expect(await signInLocked(staff.email)).toBe(false);
    expect((await signIn(staff.email, PASSWORD)).status).toBe(401);
    expect((await signIn(staff.email, temporaryPassword)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "staff.password_reset", entityId: staff.id } })).toBe(1);
  });

  test("a staff account with no password yet gets one", async () => {
    const admin = await createStaff("SUPER_ADMIN");
    const staff = await createStaff("CASHIER");
    const { temporaryPassword } = await resetStaffMemberPassword(admin.id, staff.id);
    expect((await signIn(staff.email, temporaryPassword)).status).toBe(200);
  });

  test("nobody resets their own password here, or a shopper's", async () => {
    const admin = await createStaff("SUPER_ADMIN");
    const customer = await createStaff("CUSTOMER");
    await expect(resetStaffMemberPassword(admin.id, admin.id)).rejects.toThrow(/My account/);
    await expect(resetStaffMemberPassword(admin.id, customer.id)).rejects.toThrow(/not found/);
  });

  test("suspending signs them out and stops sign-in until reactivated", async () => {
    const admin = await createStaff("SUPER_ADMIN");
    const staff = await createStaffWithPassword(PASSWORD, "CASHIER");
    await signIn(staff.email, PASSWORD);

    await setStaffMemberSuspended(admin.id, staff.id, true);
    expect(await prisma.session.count({ where: { userId: staff.id } })).toBe(0);
    expect((await signIn(staff.email, PASSWORD)).status).toBe(403);

    await setStaffMemberSuspended(admin.id, staff.id, false);
    expect((await signIn(staff.email, PASSWORD)).status).toBe(200);
  });

  test("the last active Super Admin cannot be suspended, and nobody suspends themselves", async () => {
    const admin = await createStaff("SUPER_ADMIN");
    const other = await createStaff("SUPER_ADMIN");
    await expect(setStaffMemberSuspended(admin.id, admin.id, true)).rejects.toThrow(/your own/);
    await setStaffMemberSuspended(admin.id, other.id, true);
    await expect(setStaffMemberSuspended(other.id, admin.id, true)).rejects.toThrow(/must remain/);
  });
});

describe("private links", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("are worked out for each address", () => {
    const key = "a-test-key-that-is-long-enough-for-the-gate";
    vi.stubEnv("STAFF_GATE_KEY", key);
    vi.stubEnv("POS_HOST", "till.example");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shop.example");
    expect(staffLinks()).toEqual({ admin: `https://shop.example/${entrySlug(key, "admin")}`, till: `https://till.example/${entrySlug(key, "till")}` });
  });

  test("are not available without a key", () => {
    vi.stubEnv("STAFF_GATE_KEY", "");
    expect(staffLinks()).toBeNull();
  });
});

describe("customers come from checkout details", () => {
  async function createOrder(fields: { customerName: string; phone: string; email?: string | null; totalMinor?: number; paid?: boolean; createdAt?: Date; addressLine?: string }) {
    return prisma.order.create({
      data: {
        reference: `BMH-TEST-${randomUUID().slice(0, 8)}`,
        idempotencyKey: randomUUID(),
        customerName: fields.customerName,
        phone: fields.phone,
        email: fields.email ?? null,
        fulfilmentMethod: "DELIVERY",
        addressLine: fields.addressLine,
        area: fields.addressLine ? "Osu" : undefined,
        city: fields.addressLine ? "Accra" : undefined,
        subtotalMinor: fields.totalMinor ?? 1000,
        totalMinor: fields.totalMinor ?? 1000,
        paymentMethod: "CASH_ON_DELIVERY",
        paymentStatus: fields.paid ? "PAID" : "UNPAID",
        status: "PROCESSING",
        createdAt: fields.createdAt,
      },
    });
  }

  test("the same number in either form is one customer, shown with their latest details", async () => {
    await createOrder({ customerName: "Ama Old Name", phone: "0241234567", email: "ama@example.com", totalMinor: 1000, paid: true, createdAt: new Date("2026-01-01") });
    await createOrder({ customerName: "Ama Mensah", phone: "+233241234567", totalMinor: 2500, paid: true, createdAt: new Date("2026-02-01") });
    await createOrder({ customerName: "Ama Mensah", phone: "0241234567", totalMinor: 9999, createdAt: new Date("2026-03-01") });
    await createOrder({ customerName: "Kofi", phone: "0559876543", createdAt: new Date("2026-02-15") });

    const { rows, total } = await listCustomers("", 1, 25);
    expect(total).toBe(2);
    expect(await countCustomers()).toBe(2);
    expect(rows.map((row) => row.key)).toEqual(["0241234567", "0559876543"]);
    expect(rows[0]).toMatchObject({ name: "Ama Mensah", email: "ama@example.com", orders: 3, paidTotalMinor: 3500 });
  });

  test("can be found by name, email or phone in either form, and wildcards mean themselves", async () => {
    await createOrder({ customerName: "Ama Mensah", phone: "0241234567", email: "ama@example.com" });
    await createOrder({ customerName: "Kofi Boateng", phone: "0559876543", email: "kofi@example.com" });
    const keys = async (q: string) => (await listCustomers(q, 1, 25)).rows.map((row) => row.key);

    expect(await keys("mensah")).toEqual(["0241234567"]);
    expect(await keys("KOFI@EXAMPLE")).toEqual(["0559876543"]);
    expect(await keys("024 123")).toEqual(["0241234567"]);
    expect(await keys("+233241234567")).toEqual(["0241234567"]);
    expect(await keys("233241234567")).toEqual(["0241234567"]);
    expect(await keys("%")).toEqual([]);
    expect(await keys("no such person")).toEqual([]);
  });

  test("pages through the list", async () => {
    for (let index = 0; index < 3; index++) await createOrder({ customerName: `Customer ${index}`, phone: `024000000${index}`, createdAt: new Date(2026, 0, index + 1) });
    const second = await listCustomers("", 2, 2);
    expect(second.total).toBe(3);
    expect(second.rows.map((row) => row.name)).toEqual(["Customer 0"]);
  });

  test("a page far past the end is empty rather than an error", async () => {
    await createOrder({ customerName: "Ama", phone: "0241234567" });
    expect((await listCustomers("", 100_000_000, 25)).rows).toEqual([]);
  });

  test("the first order date holds when there are more orders than the page shows", async () => {
    const first = new Date("2025-01-01");
    await createOrder({ customerName: "Ama", phone: "0241234567", createdAt: first });
    for (let index = 0; index < 50; index++) await createOrder({ customerName: "Ama", phone: "0241234567", createdAt: new Date(2026, 0, index + 1) });

    const customer = await customerByKey("0241234567");
    expect(customer?.orders).toHaveLength(50);
    expect(customer?.orderCount).toBe(51);
    expect(customer?.firstOrderAt).toEqual(first);
  });

  test("one customer's page has their orders, paid total and last address", async () => {
    await createOrder({ customerName: "Ama", phone: "0241234567", email: "ama@example.com", totalMinor: 1500, paid: true, createdAt: new Date("2026-01-01"), addressLine: "12 Ring Road" });
    await createOrder({ customerName: "Ama Mensah", phone: "+233241234567", totalMinor: 700, createdAt: new Date("2026-02-01") });

    const customer = await customerByKey("0241234567");
    expect(customer).toMatchObject({ name: "Ama Mensah", phone: "0241234567", email: "ama@example.com", paidTotalMinor: 1500, orderCount: 2 });
    expect(customer?.lastAddress).toEqual({ addressLine: "12 Ring Road", area: "Osu", city: "Accra" });
    expect(customer?.orders).toHaveLength(2);
    expect(await customerByKey("0200000000")).toBeNull();
  });

  test("a key is one form of the number", () => {
    expect(customerKey("+233241234567")).toBe("0241234567");
    expect(customerKey("024 123-4567")).toBe("0241234567");
  });
});
