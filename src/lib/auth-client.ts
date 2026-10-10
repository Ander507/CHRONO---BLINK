"use client";

import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [usernameClient()],
});

/** Better Auth error → friendly sentence. */
export function authErrorMessage(err: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!err) return "Something went wrong. Please try again.";
  switch (err.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_USERNAME_OR_PASSWORD":
      return "That email/username and password don't match.";
    case "EMAIL_NOT_VERIFIED":
      return "Please verify your email first — we've sent you a new link.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account with this email already exists.";
    case "USERNAME_IS_ALREADY_TAKEN":
    case "USERNAME_IS_ALREADY_TAKEN_PLEASE_TRY_ANOTHER":
      return "That username is taken — try another.";
    case "INVALID_USERNAME":
      return "Usernames are 3–24 letters, numbers or underscores.";
    case "PASSWORD_TOO_SHORT":
      return "Passwords need at least 10 characters.";
    case "INVALID_TOKEN":
      return "This link is invalid or has expired.";
  }
  if (err.status === 429) return "Too many attempts. Please wait a minute and try again.";
  if (err.status === 403 && /ban/i.test(err.message ?? "")) return "This account has been suspended.";
  return err.message || "Something went wrong. Please try again.";
}
