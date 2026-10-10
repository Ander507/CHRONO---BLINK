import { desc } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/misc";
import { timeAgo } from "@/lib/utils";
import { db } from "@/server/db";
import { devMailbox } from "@/server/db/schema";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Dev mailbox", robots: { index: false } };

/** Development-only inbox for EMAIL_PROVIDER=console. 404s in production or with a real provider. */
export default async function DevMailboxPage() {
  if (env.NODE_ENV === "production" || env.EMAIL_PROVIDER !== "console") notFound();
  const mails = await db.select().from(devMailbox).orderBy(desc(devMailbox.id)).limit(30);
  const linkRe = /(https?:\/\/\S+)/;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Dev mailbox" description="Development only: emails sent while EMAIL_PROVIDER=console. Never available in production." />
      <ul className="space-y-3" data-testid="mailbox">
        {mails.length === 0 ? <li className="text-fg-muted">No emails yet.</li> : null}
        {mails.map((m) => {
          const link = m.text.match(linkRe)?.[1];
          return (
            <li key={m.id} className="surface p-4" data-testid="mail">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-fg">{m.subject}</p>
                <span className="text-xs text-fg-subtle">{timeAgo(m.createdAt)}</span>
              </div>
              <p className="text-xs text-fg-subtle" data-testid="mail-to">
                to {m.to}
              </p>
              {link ? (
                <a href={link} className="mt-2 block break-all text-sm text-electric hover:underline" data-testid="mail-link">
                  {link}
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
