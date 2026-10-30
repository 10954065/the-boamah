import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { entrySlug, gateKey } from "../src/lib/staff-gate";
import { db } from "./db";

export const PASSWORD = "e2e-password-123";

const key = gateKey();
/** The gate only runs with a key, which production builds always need. */
export const gateIsOn = key !== null;
export const adminLink = key ? `/${entrySlug(key, "admin")}` : "/admin";
export const tillLink = key ? `/${entrySlug(key, "till")}` : "/pos";

type StaffRole = "CASHIER" | "STORE_MANAGER" | "SUPER_ADMIN" | "CUSTOMER";

/** Staff cannot register, so tests create the account as the Super Admin would. */
export async function createStaff(name: string, email: string, role: StaffRole = "CASHIER"): Promise<string> {
  const id = randomUUID();
  await db.user.create({ data: { id, name, email, role, emailVerified: true } });
  await db.account.create({ data: { id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(PASSWORD) } });
  return id;
}

let nextAddress = 0;

/** A visitor of their own, so Better Auth's limit per address stays out of the way across tests. */
export async function asNewVisitor(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ "x-real-ip": `10.77.${process.pid % 250}.${(++nextAddress % 250) + 1}` });
}

export async function fillSignIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signInToTill(page: Page, email: string): Promise<void> {
  await asNewVisitor(page);
  await page.goto(tillLink);
  await expect(page).toHaveURL(/\/pos\/login/);
  await fillSignIn(page, email, PASSWORD);
  await page.waitForURL(/\/pos$/);
}

export async function signInToAdmin(page: Page, email: string): Promise<void> {
  await asNewVisitor(page);
  await page.goto(adminLink);
  await expect(page).toHaveURL(/\/login/);
  await fillSignIn(page, email, PASSWORD);
  await page.waitForURL(/\/admin$/);
}
