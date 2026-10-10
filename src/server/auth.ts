import "server-only";
import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { captcha, username } from "better-auth/plugins";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import { adminEmails, env, integrations } from "@/server/env";
import { USERNAME_RE } from "@/lib/validation";

const secure = env.APP_URL.startsWith("https://");

export const auth = betterAuth({
  appName: "ChronoBlink Arcade",
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 30,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your ChronoBlink password",
        text: `Someone (hopefully you) asked to reset the password for ${user.email}.\n\nThe link expires in 30 minutes. If you didn't ask for this, you can ignore this email.`,
        actionUrl: url,
        actionLabel: "Choose a new password",
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your ChronoBlink account",
        text: `Welcome to ChronoBlink Arcade!\n\nConfirm your email address to start earning XP, achievements and leaderboard ranks.`,
        actionUrl: url,
        actionLabel: "Verify email",
      });
    },
  },
  socialProviders: integrations.googleAuth
    ? { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! } }
    : {},
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "user" },
      banned: { type: "boolean", input: false, defaultValue: false },
    },
    deleteUser: { enabled: true },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: !env.E2E_DISABLE_RATE_LIMITS && env.NODE_ENV !== "test",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-in/username": { window: 60, max: 8 },
      "/sign-up/email": { window: 300, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/send-verification-email": { window: 300, max: 3 },
    },
  },
  advanced: {
    useSecureCookies: secure,
    cookiePrefix: "cb",
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"] },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (u) => {
          const role = adminEmails.has(u.email.toLowerCase()) ? "admin" : "user";
          return { data: { ...u, role } };
        },
        after: async (u) => {
          await db.insert(schema.profiles).values({ userId: u.id, avatarHue: hashHue(u.id) }).onConflictDoNothing();
        },
      },
    },
    session: {
      create: {
        before: async (s) => {
          const [u] = await db
            .select({ banned: schema.user.banned })
            .from(schema.user)
            .where(eq(schema.user.id, s.userId));
          if (u?.banned) return false;
          return { data: s };
        },
      },
    },
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 24,
      usernameValidator: (name) => USERNAME_RE.test(name),
    }),
    ...(integrations.turnstile
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: env.TURNSTILE_SECRET_KEY!,
            endpoints: ["/sign-up/email", "/sign-in/email", "/sign-in/username", "/request-password-reset"],
          }),
        ]
      : []),
    nextCookies(),
  ],
});

function hashHue(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

export type AuthSession = typeof auth.$Infer.Session;
