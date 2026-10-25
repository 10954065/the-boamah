/**
 * Role-based access control. Permissions are explicitly defined here and
 * enforced on the server for every admin page and server action.
 */

export const ROLES = [
  "CUSTOMER",
  "SUPER_ADMIN",
  "STORE_MANAGER",
  "INVENTORY_MANAGER",
  "ORDER_MANAGER",
] as const;

export type RoleCode = (typeof ROLES)[number];

export const STAFF_ROLES = ROLES.filter((role) => role !== "CUSTOMER") as Exclude<RoleCode, "CUSTOMER">[];

export const PERMISSIONS = [
  "dashboard:view",
  "catalog:view",
  "catalog:edit",
  "inventory:adjust",
  "orders:view",
  "orders:update",
  "orders:cancel",
  "payments:record",
  "customers:view",
  "customers:suspend",
  "promotions:manage",
  "delivery:manage",
  "settings:manage",
  "staff:manage",
  "notifications:view",
  "audit:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  CUSTOMER: [],
  SUPER_ADMIN: ALL,
  STORE_MANAGER: ALL.filter((permission) => permission !== "staff:manage"),
  INVENTORY_MANAGER: ["dashboard:view", "catalog:view", "inventory:adjust", "orders:view"],
  ORDER_MANAGER: [
    "dashboard:view",
    "catalog:view",
    "orders:view",
    "orders:update",
    "orders:cancel",
    "payments:record",
    "customers:view",
    "notifications:view",
  ],
};

export const ROLE_LABELS: Record<RoleCode, string> = {
  CUSTOMER: "Customer",
  SUPER_ADMIN: "Super Admin",
  STORE_MANAGER: "Store Manager",
  INVENTORY_MANAGER: "Inventory Manager",
  ORDER_MANAGER: "Order Manager",
};

export function isRole(value: unknown): value is RoleCode {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isStaffRole(role: unknown): boolean {
  return isRole(role) && role !== "CUSTOMER";
}

export function hasPermission(role: unknown, permission: Permission): boolean {
  if (!isRole(role)) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Only a Super Admin may grant or revoke roles, and nobody may change their
 * own role (prevents accidental lock-out and self-promotion).
 */
export function canAssignRole(actorRole: unknown, actorId: string, targetId: string): boolean {
  return actorRole === "SUPER_ADMIN" && actorId !== targetId;
}
