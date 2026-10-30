import { z } from "zod";
import { hasPermission, ROLE_LABELS, STAFF_ROLES } from "@/lib/permissions";
import { emailField, ghanaPhone } from "@/lib/validation";

/** Used in the browser and on the server alike: no server-only imports here. */

/** Letters and digits that cannot be mistaken for each other when read out. */
export const STAFF_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export const STAFF_PASSWORD_LENGTH = 16;
export const STAFF_PASSWORD_MIN = 10;
const STAFF_PASSWORD_MAX = 128;

/** Draws below this are thrown away, so every letter is equally likely. */
const UNBIASED_LIMIT = Math.floor(2 ** 32 / STAFF_PASSWORD_ALPHABET.length) * STAFF_PASSWORD_ALPHABET.length;

export function generateStaffPassword(): string {
  const letters: string[] = [];
  const draws = new Uint32Array(STAFF_PASSWORD_LENGTH * 2);
  while (letters.length < STAFF_PASSWORD_LENGTH) {
    globalThis.crypto.getRandomValues(draws);
    for (const draw of draws) {
      if (draw < UNBIASED_LIMIT && letters.length < STAFF_PASSWORD_LENGTH) letters.push(STAFF_PASSWORD_ALPHABET[draw % STAFF_PASSWORD_ALPHABET.length]!);
    }
  }
  return letters.join("");
}

export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  CASHIER: "Sells on the shop till and packs website orders there.",
  ORDER_MANAGER: "Handles website orders, payments and customers.",
  INVENTORY_MANAGER: "Keeps stock right and can see products and orders.",
  STORE_MANAGER: "Runs the shop day to day: products, orders, the till and settings. Cannot manage staff.",
  SUPER_ADMIN: "Everything, including adding staff and changing roles.",
};

/** The order the roles are offered in, from the most common job to the most powerful. */
export const ROLE_CHOICES: readonly StaffRole[] = ["CASHIER", "ORDER_MANAGER", "INVENTORY_MANAGER", "STORE_MANAGER", "SUPER_ADMIN"];

export interface SignInPlaces {
  admin: boolean;
  till: boolean;
}

export function signInPlaces(role: StaffRole): SignInPlaces {
  return { admin: hasPermission(role, "dashboard:view"), till: hasPermission(role, "pos:sell") };
}

const optionalPhone = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .pipe(ghanaPhone.optional());

export const newStaffSchema = z.object({
  name: z.string().trim().min(2, "Enter their full name.").max(80),
  email: emailField.toLowerCase(),
  role: z.enum(STAFF_ROLES),
  phone: optionalPhone.optional(),
  password: z
    .string()
    .min(STAFF_PASSWORD_MIN, `Use at least ${STAFF_PASSWORD_MIN} characters.`)
    .max(STAFF_PASSWORD_MAX, `Use at most ${STAFF_PASSWORD_MAX} characters.`)
    .refine((value) => value.trim() === value, "Remove the spaces at the start or end.")
    .optional(),
});

export type NewStaffInput = z.input<typeof newStaffSchema>;

export interface LoginDetails {
  name: string;
  email: string;
  role: StaffRole;
  password: string;
}

export interface StaffLinks {
  admin: string;
  till: string;
}

/** The message a Super Admin sends a new member of staff, ready to paste into WhatsApp or a text. */
export function loginMessage(details: LoginDetails, links: StaffLinks): string {
  const places = signInPlaces(details.role);
  const firstName = details.name.trim().split(/\s+/)[0] ?? details.name;
  const where =
    places.admin && places.till
      ? [`Admin: ${links.admin}`, `Till: ${links.till}`]
      : [places.till ? links.till : links.admin];
  const changeIt = places.admin
    ? "You can choose your own password under My account after you sign in."
    : "To choose your own password, tap Forgot your password on the sign in page.";
  return [
    `Hello ${firstName},`,
    "",
    `You can now sign in to The Boamah's as ${ROLE_LABELS[details.role]}.`,
    "",
    `1. Open ${where.length > 1 ? "these links" : "this link"} on the device you will use:`,
    ...where,
    "",
    "2. Sign in with",
    `Email: ${details.email}`,
    `Password: ${details.password}`,
    "",
    `Keep these details to yourself. ${changeIt}`,
  ].join("\n");
}
