import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // The CLI (migrate, db execute) needs a direct connection; the app itself
  // uses DATABASE_URL, which may be a pooled connection string.
  datasource: {
    url: process.env.DIRECT_DATABASE_URL || env("DATABASE_URL"),
  },
});
