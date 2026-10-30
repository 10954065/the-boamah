import { describe, expect, test } from "vitest";
import { generateStaffPassword, loginMessage, newStaffSchema, signInPlaces, STAFF_PASSWORD_ALPHABET, STAFF_PASSWORD_LENGTH } from "@/lib/staff-onboarding";

const LINKS = { admin: "https://shop.example/admin-link", till: "https://till.example/till-link" };

describe("passwords made for new staff", () => {
  test("are 16 letters and digits that cannot be mixed up", () => {
    for (let i = 0; i < 50; i++) {
      const password = generateStaffPassword();
      expect(password).toHaveLength(STAFF_PASSWORD_LENGTH);
      expect([...password].every((letter) => STAFF_PASSWORD_ALPHABET.includes(letter))).toBe(true);
      expect(password).not.toMatch(/[0O1lI]/);
    }
  });

  test("are different every time", () => {
    const made = new Set(Array.from({ length: 200 }, generateStaffPassword));
    expect(made.size).toBe(200);
  });

  test("use the whole alphabet", () => {
    const seen = new Set(Array.from({ length: 300 }, generateStaffPassword).join(""));
    expect(seen.size).toBe(STAFF_PASSWORD_ALPHABET.length);
  });
});

describe("a new staff member's details", () => {
  const valid = { name: "Ama Mensah", email: "Ama@Example.com", role: "CASHIER" as const };

  test("email is kept in small letters and the phone is optional", () => {
    expect(newStaffSchema.parse(valid)).toEqual({ name: "Ama Mensah", email: "ama@example.com", role: "CASHIER" });
    expect(newStaffSchema.parse({ ...valid, phone: "  " }).phone).toBeUndefined();
  });

  test("a phone number is checked and kept without spaces", () => {
    expect(newStaffSchema.parse({ ...valid, phone: "024 123 4567" }).phone).toBe("0241234567");
    expect(newStaffSchema.safeParse({ ...valid, phone: "12345" }).success).toBe(false);
  });

  test("a typed password needs at least 10 characters and no spaces at the ends", () => {
    expect(newStaffSchema.safeParse({ ...valid, password: "short123" }).success).toBe(false);
    expect(newStaffSchema.safeParse({ ...valid, password: " padded-password " }).success).toBe(false);
    expect(newStaffSchema.parse({ ...valid, password: "kente-cloth-42" }).password).toBe("kente-cloth-42");
  });

  test("customer is not a staff role", () => {
    expect(newStaffSchema.safeParse({ ...valid, role: "CUSTOMER" }).success).toBe(false);
  });
});

describe("where each role signs in", () => {
  test.each([
    ["CASHIER", { admin: false, till: true }],
    ["ORDER_MANAGER", { admin: true, till: false }],
    ["INVENTORY_MANAGER", { admin: true, till: false }],
    ["STORE_MANAGER", { admin: true, till: true }],
    ["SUPER_ADMIN", { admin: true, till: true }],
  ] as const)("%s", (role, places) => {
    expect(signInPlaces(role)).toEqual(places);
  });
});

describe("the login message", () => {
  test("a cashier gets the till link and is told how to choose a password there", () => {
    const message = loginMessage({ name: "Ama Mensah", email: "ama@example.com", role: "CASHIER", password: "Abc123Abc123Abc1" }, LINKS);
    expect(message).toContain("Hello Ama,");
    expect(message).toContain("as Cashier");
    expect(message).toContain(LINKS.till);
    expect(message).not.toContain(LINKS.admin);
    expect(message).toContain("Email: ama@example.com");
    expect(message).toContain("Password: Abc123Abc123Abc1");
    expect(message).toContain("Forgot your password");
  });

  test("an order manager gets the admin link and is pointed to My account", () => {
    const message = loginMessage({ name: "Kofi", email: "kofi@example.com", role: "ORDER_MANAGER", password: "x".repeat(16) }, LINKS);
    expect(message).toContain(LINKS.admin);
    expect(message).not.toContain(LINKS.till);
    expect(message).toContain("My account");
  });

  test("a store manager gets both links, each named", () => {
    const message = loginMessage({ name: "Efua", email: "efua@example.com", role: "STORE_MANAGER", password: "x".repeat(16) }, LINKS);
    expect(message).toContain(`Admin: ${LINKS.admin}`);
    expect(message).toContain(`Till: ${LINKS.till}`);
  });

  test("uses no dashes", () => {
    const message = loginMessage({ name: "Ama", email: "ama@example.com", role: "SUPER_ADMIN", password: "Abc123Abc123Abc1" }, LINKS);
    expect(message).not.toMatch(/ - | -- |—|–/);
  });
});
