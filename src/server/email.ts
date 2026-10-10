import "server-only";
import { db } from "@/server/db";
import { devMailbox } from "@/server/db/schema";
import { env } from "@/server/env";

type Mail = { to: string; subject: string; text: string; actionUrl?: string; actionLabel?: string };

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function render(m: Mail): string {
  const button = m.actionUrl
    ? `<p style="margin:28px 0"><a href="${escape(m.actionUrl)}" style="background:#7c5cff;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${escape(m.actionLabel ?? "Open")}</a></p><p style="color:#8b8b9a;font-size:12px">Or paste this link into your browser:<br>${escape(m.actionUrl)}</p>`
    : "";
  return `<!doctype html><html><body style="background:#0b0b10;color:#e9e7f2;font-family:system-ui,sans-serif;padding:32px"><div style="max-width:520px;margin:auto;background:#14141c;border:1px solid #262633;border-radius:16px;padding:32px"><p style="font-weight:800;letter-spacing:.08em;color:#a78bfa;margin:0 0 20px">CHRONOBLINK ARCADE</p>${m.text
    .split("\n\n")
    .map((p) => `<p style="line-height:1.6">${escape(p)}</p>`)
    .join("")}${button}</div></body></html>`;
}

/**
 * Sends a transactional email.
 * - console: development only — logs and stores in the dev mailbox (/dev/mailbox).
 * - resend:  real delivery through the Resend HTTP API.
 */
export async function sendEmail(m: Mail): Promise<void> {
  const html = render(m);
  const text = m.actionUrl ? `${m.text}\n\n${m.actionLabel ?? "Open"}: ${m.actionUrl}` : m.text;

  if (env.EMAIL_PROVIDER === "resend") {
    if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [m.to], subject: m.subject, html, text }),
    });
    if (!res.ok) throw new Error(`Email delivery failed (${res.status})`);
    return;
  }

  if (env.NODE_ENV === "production") throw new Error("EMAIL_PROVIDER=console is not allowed in production");
  await db.insert(devMailbox).values({ to: m.to.toLowerCase(), subject: m.subject, html, text });
  console.log(`[email:console] to=${m.to} subject="${m.subject}"${m.actionUrl ? ` link=${m.actionUrl}` : ""}`);
}
