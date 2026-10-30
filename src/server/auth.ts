import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { CLIENT_IP_HEADERS, clientIpFrom } from "@/lib/client-ip";
import { prisma } from "@/lib/db";
import { isStaffRole } from "@/lib/permissions";
import { posOrigin } from "@/lib/pos-host";
import { sendPasswordResetEmail } from "@/server/notifications/account-emails";
import { clearSignInFailures, noteSignInFailure, SIGN_IN_LOCKED_MESSAGE, signInLocked } from "@/server/sign-in-limits";

const SIGN_IN_PATH = "/sign-in/email";

function signInEmail(body: unknown): string {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

const ONE_DAY = 60 * 60 * 24;

export const auth = betterAuth({
  appName: "The Boamah's Online Grocery Shop",
  baseURL: process.env.BETTER_AUTH_URL,
  // Cashiers sign in on the till subdomain; its session cookie stays on that host.
  trustedOrigins: posOrigin() ? [posOrigin()] : [],
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Only staff have accounts, and the Super Admin creates them (Admin → Staff).
    disableSignUp: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    // Proving ownership of the email lifts a pause, so wrong guesses cannot keep someone out.
    onPasswordReset: async ({ user }) => {
      await clearSignInFailures(user.email);
    },
    sendResetPassword: async ({ user, url }) => {
      // Not awaited: avoids leaking account existence through timing.
      void sendPasswordResetEmail({ email: user.email, name: user.name }, url);
    },
  },
  user: {
    additionalFields: {
      // input: false — these can never be set through profile updates, so
      // nobody can promote or un-suspend themselves.
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
      "/request-password-reset": { window: 300, max: 3 },
      "/reset-password": { window: 300, max: 5 },
      "/change-password": { window: 300, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    ipAddress: { ipAddressHeaders: CLIENT_IP_HEADERS },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH) return;
      const email = signInEmail(ctx.body);
      if (email && (await signInLocked(email))) throw new APIError("TOO_MANY_REQUESTS", { message: SIGN_IN_LOCKED_MESSAGE });
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH) return;
      const returned = ctx.context.returned;
      const email = signInEmail(ctx.body);
      if (email && isAPIError(returned) && returned.statusCode === 401) {
        await noteSignInFailure(email, ctx.headers ? clientIpFrom(ctx.headers) : "unknown");
      }
    }),
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { status: true, role: true } });
          if (user?.status === "SUSPENDED") {
            throw new APIError("FORBIDDEN", { message: "This account has been suspended. Ask the Super Admin to reactivate it." });
          }
          // Shoppers check out as guests; only staff sign in.
          if (!user || !isStaffRole(user.role)) {
            throw new APIError("FORBIDDEN", { message: "This sign-in is for shop staff only." });
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
