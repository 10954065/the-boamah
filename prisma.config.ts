import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // The CLI (migrate, db execute) needs a direct connection; the app itself
  // uses DATABASE_URL, which may be a pooled connection string. No URL is
  // needed for `prisma generate`, which runs on install, so a fresh build on a
  // host without database variables (e.g. Railway, CI) still installs.
  datasource: {
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || "",
  },
});
