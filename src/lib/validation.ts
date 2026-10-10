/** Validation rules shared by client forms and server handlers. */
import { z } from "zod";

export const USERNAME_RE = /^[a-z0-9_]{3,24}$/i;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const usernameSchema = z
  .string()
  .trim()
  .regex(USERNAME_RE, "3–24 characters: letters, numbers and underscores");

export const passwordSchema = z.string().min(10, "At least 10 characters").max(128);

export const displayNameSchema = z.string().trim().min(1, "Required").max(40, "Max 40 characters");

export const registerSchema = z.object({
  name: displayNameSchema,
  username: usernameSchema,
  email: z.string().trim().email("Enter a valid email"),
  password: passwordSchema,
  acceptTerms: z.literal(true, { error: "You must accept the Terms and Privacy Policy" }),
});

export const slugSchema = z.string().trim().min(3).max(48).regex(SLUG_RE, "lowercase letters, numbers and dashes");

export const controlsSchema = z
  .array(z.object({ action: z.string().trim().min(1).max(40), keys: z.string().trim().min(1).max(60) }))
  .max(12);

export const gameListingSchema = z.object({
  title: z.string().trim().min(2).max(60),
  slug: slugSchema,
  shortDescription: z.string().trim().min(10).max(160),
  description: z.string().trim().min(40).max(4000),
  instructions: z.string().trim().max(1000).default(""),
  categoryId: z.coerce.number().int().positive(),
  tags: z
    .array(z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9 -]{0,23}$/))
    .max(8)
    .default([]),
  controls: controlsSchema.default([]),
  orientation: z.enum(["landscape", "portrait", "any"]).default("any"),
  supportsDesktop: z.boolean().default(true),
  supportsMobile: z.boolean().default(false),
});
export type GameListingInput = z.infer<typeof gameListingSchema>;

export const reportSchema = z.object({
  gameId: z.string().uuid(),
  reason: z.enum(["broken", "inappropriate", "malicious", "copyright", "other"]),
  details: z.string().trim().max(1000).default(""),
  turnstileToken: z.string().optional(),
});

/** Same-origin relative paths only — prevents open redirects. */
export function safeRedirect(target: string | null | undefined, fallback = "/"): string {
  if (!target || typeof target !== "string") return fallback;
  if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return fallback;
  try {
    const u = new URL(target, "http://x.invalid");
    if (u.origin !== "http://x.invalid") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
