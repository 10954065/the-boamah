import "dotenv/config";
import { execSync } from "node:child_process";

/** Applies migrations to the disposable test database before the integration suite. */
export default function globalSetup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/test/i.test(new URL(url).pathname)) {
    throw new Error("TEST_DATABASE_URL must point at a database whose name contains 'test'.");
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
