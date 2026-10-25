import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/server/notifications/account-emails";

const ONE_DAY = 60 * 60 * 24;

export const auth = betterAuth({
  appName: "The Boamah's Online Grocery Shop",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Not awaited: avoids leaking account existence through timing.
      void sendPasswordResetEmail({ email: user.email, name: user.name }, url);
    },
  },
  user: {
    additionalFields: {
      // input: false — these can never be set through sign-up or profile
      // updates, so customers cannot promote or un-suspend themselves.
      role: { type: "string", input: false, defaultValue: "CUSTOMER", required: false },
      status: { type: "string", input: false, defaultValue: "ACTIVE", required: false },
      phone: { type: "string", input: true, required: false },
    },
  },
  session: {
    expiresIn: 30 * ONE_DAY,
    updateAge: ONE_DAY,
    freshAge: ONE_DAY,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/reset-password": { window: 300, max: 5 },
      "/change-password": { window: 300, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { status: true } });
          if (user?.status === "SUSPENDED") {
            throw new APIError("FORBIDDEN", {
              message: "This account has been suspended. Please contact customer support.",
            });
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
