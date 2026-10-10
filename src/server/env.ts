import "server-only";
import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  GAME_ORIGIN: z.string().url().default("http://127.0.0.1:3001"),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16),
  PLATFORM_SIGNING_SECRET: z.string().min(16),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  EMAIL_FROM: z.string().default("ChronoBlink Arcade <no-reply@chronoblink.xyz>"),
  RESEND_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  MEDIA_PUBLIC_BASE_URL: z.string().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  MALWARE_SCANNER: z.enum(["none", "clamav"]).default("none"),
  CLAMAV_HOST: z.string().default("127.0.0.1"),
  CLAMAV_PORT: z.coerce.number().default(3310),
  CRON_SECRET: z.string().optional(),
  ADMIN_EMAILS: z.string().optional(),
  ANALYTICS_RETENTION_DAYS: z.coerce.number().int().min(7).default(180),
  E2E_DISABLE_RATE_LIMITS: bool,
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    const problems: string[] = [];
    if (env.BETTER_AUTH_SECRET.startsWith("dev-only")) problems.push("BETTER_AUTH_SECRET is the development default");
    if (env.PLATFORM_SIGNING_SECRET.startsWith("dev-only")) problems.push("PLATFORM_SIGNING_SECRET is the development default");
    if (new URL(env.APP_URL).host === new URL(env.GAME_ORIGIN).host) problems.push("GAME_ORIGIN must be a different host from APP_URL");
    if (env.EMAIL_PROVIDER === "console") problems.push("EMAIL_PROVIDER=console cannot deliver mail in production");
    if (!env.TURNSTILE_SECRET_KEY) problems.push("TURNSTILE_SECRET_KEY is required in production");
    if (env.E2E_DISABLE_RATE_LIMITS) problems.push("E2E_DISABLE_RATE_LIMITS must not be set in production");
    if (problems.length && process.env.ALLOW_INSECURE_PRODUCTION !== "1") {
      throw new Error(`Refusing to start in production:\n - ${problems.join("\n - ")}`);
    }
  }
  return env;
}

export const env = load();

export const adminEmails = new Set(
  (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export const integrations = {
  googleAuth: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  turnstile: Boolean(env.TURNSTILE_SECRET_KEY && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
  email: env.EMAIL_PROVIDER === "resend" ? Boolean(env.RESEND_API_KEY) : false,
  r2: env.STORAGE_DRIVER === "r2",
  malwareScanner: env.MALWARE_SCANNER !== "none",
};
