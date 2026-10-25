/**
 * Creates (or promotes) the first Super Admin.
 *
 *   npm run admin:create -- --email owner@example.com --name "Owner Name"
 *
 * The password is read from ADMIN_PASSWORD if set; otherwise a strong random
 * password is generated and printed ONCE. Change it after first sign-in.
 * Nothing is hard-coded and no default admin exists in any environment.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../src/generated/prisma/client";

const { values } = parseArgs({
  options: { email: { type: "string" }, name: { type: "string" } },
});

const email = values.email?.trim().toLowerCase();
const name = values.name?.trim();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
  console.error('Usage: npm run admin:create -- --email owner@example.com --name "Owner Name"');
  process.exit(1);
}

const adminEmail: string = email;
const adminName: string = name;
const generated = !process.env.ADMIN_PASSWORD;
const password = process.env.ADMIN_PASSWORD || randomBytes(18).toString("base64url");
if (password.length < 12) {
  console.error("ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { role: "SUPER_ADMIN", status: "ACTIVE" } });
    await prisma.auditLog.create({ data: { action: "staff.bootstrap_promote", entityType: "User", entityId: existing.id, details: { via: "cli" } } });
    console.info(`Promoted existing account ${email} to Super Admin. Their password was not changed.`);
    return;
  }
  const id = randomBytes(16).toString("hex");
  const hash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.create({ data: { id, email: adminEmail, name: adminName, role: "SUPER_ADMIN", emailVerified: true } }),
    prisma.account.create({ data: { id: randomBytes(16).toString("hex"), accountId: id, providerId: "credential", userId: id, password: hash } }),
    prisma.auditLog.create({ data: { action: "staff.bootstrap_create", entityType: "User", entityId: id, details: { via: "cli" } } }),
  ]);
  console.info(`Created Super Admin ${email}.`);
  if (generated) {
    console.info(`Temporary password (shown once): ${password}`);
    console.info("Sign in at /login and change it immediately from your account settings.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
