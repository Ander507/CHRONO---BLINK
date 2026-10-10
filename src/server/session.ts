import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/server/auth";
import type { Role } from "@/server/db/schema";

export type AppUser = {
  id: string;
  email: string;
  name: string;
  username: string | null;
  image: string | null;
  role: Role;
  emailVerified: boolean;
};

const RANK: Record<Role, number> = { user: 0, developer: 1, moderator: 2, admin: 3 };

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const u = s.user as typeof s.user & { role?: string; banned?: boolean; username?: string | null };
  if (u.banned) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    username: u.username ?? null,
    image: u.image ?? null,
    role: (u.role as Role) ?? "user",
    emailVerified: u.emailVerified,
  };
});

export function hasRole(user: AppUser | null, min: Role): boolean {
  return Boolean(user && RANK[user.role] >= RANK[min]);
}

/** For pages: redirects to /login when signed out. */
export async function requireUser(returnTo?: string): Promise<AppUser> {
  const u = await getCurrentUser();
  if (!u) redirect(`/login${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}`);
  return u;
}

/** For pages: 404s (not 403) so protected areas aren't advertised. */
export async function requireRole(min: Role, returnTo?: string): Promise<AppUser> {
  const u = await requireUser(returnTo);
  if (!hasRole(u, min)) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  return u;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function assertUser(): Promise<AppUser> {
  const u = await getCurrentUser();
  if (!u) throw new HttpError(401, "unauthorized", "Sign in required");
  return u;
}
export async function assertRole(min: Role): Promise<AppUser> {
  const u = await assertUser();
  if (!hasRole(u, min)) throw new HttpError(403, "forbidden", "You don't have permission to do that");
  return u;
}
