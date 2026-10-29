import { describe, expect, test } from "vitest";
import { canAssignRole, hasPermission, isStaffRole } from "@/lib/permissions";

describe("role permissions", () => {
  test("customers have no administrative permissions", () => {
    expect(isStaffRole("CUSTOMER")).toBe(false);
    expect(hasPermission("CUSTOMER", "dashboard:view")).toBe(false);
    expect(hasPermission("CUSTOMER", "catalog:edit")).toBe(false);
  });

  test("super admin can do everything", () => {
    expect(hasPermission("SUPER_ADMIN", "staff:manage")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "settings:manage")).toBe(true);
  });

  test("store manager cannot manage staff roles", () => {
    expect(hasPermission("STORE_MANAGER", "catalog:edit")).toBe(true);
    expect(hasPermission("STORE_MANAGER", "staff:manage")).toBe(false);
  });

  test("inventory manager can adjust stock but not edit prices or orders", () => {
    expect(hasPermission("INVENTORY_MANAGER", "inventory:adjust")).toBe(true);
    expect(hasPermission("INVENTORY_MANAGER", "catalog:edit")).toBe(false);
    expect(hasPermission("INVENTORY_MANAGER", "orders:update")).toBe(false);
  });

  test("order manager can update orders but not products or settings", () => {
    expect(hasPermission("ORDER_MANAGER", "orders:update")).toBe(true);
    expect(hasPermission("ORDER_MANAGER", "payments:record")).toBe(true);
    expect(hasPermission("ORDER_MANAGER", "catalog:edit")).toBe(false);
    expect(hasPermission("ORDER_MANAGER", "settings:manage")).toBe(false);
  });

  test("store managers moderate reviews; inventory and order managers do not", () => {
    expect(hasPermission("STORE_MANAGER", "reviews:manage")).toBe(true);
    expect(hasPermission("INVENTORY_MANAGER", "reviews:manage")).toBe(false);
    expect(hasPermission("ORDER_MANAGER", "reviews:manage")).toBe(false);
  });

  test("cashiers can only sell at the till; managers can run it too", () => {
    expect(isStaffRole("CASHIER")).toBe(true);
    expect(hasPermission("CASHIER", "pos:sell")).toBe(true);
    expect(hasPermission("CASHIER", "pos:manage")).toBe(false);
    expect(hasPermission("CASHIER", "dashboard:view")).toBe(false);
    expect(hasPermission("CASHIER", "inventory:adjust")).toBe(false);
    expect(hasPermission("STORE_MANAGER", "pos:sell")).toBe(true);
    expect(hasPermission("STORE_MANAGER", "pos:manage")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "pos:manage")).toBe(true);
    expect(hasPermission("ORDER_MANAGER", "pos:sell")).toBe(false);
    expect(hasPermission("INVENTORY_MANAGER", "pos:sell")).toBe(false);
  });

  test("unknown roles are denied", () => {
    expect(hasPermission("ADMIN", "dashboard:view")).toBe(false);
    expect(hasPermission(undefined, "dashboard:view")).toBe(false);
  });

  test("only a super admin may assign roles, and never to themselves", () => {
    expect(canAssignRole("SUPER_ADMIN", "a", "b")).toBe(true);
    expect(canAssignRole("SUPER_ADMIN", "a", "a")).toBe(false);
    expect(canAssignRole("STORE_MANAGER", "a", "b")).toBe(false);
  });
});
