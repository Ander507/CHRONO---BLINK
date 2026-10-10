import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { ConsentPreferencesLink } from "@/components/consent";
import { DataControls, DeviceImport, PasswordForm, PrivacyForm, ProfileForm, Section } from "@/components/settings/settings-forms";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/server/db";
import { account } from "@/server/db/schema";
import { requireUser } from "@/server/session";
import { getProfileRow } from "@/server/services/profiles";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const p = await getProfileRow(user.id);
  const credential = await db.query.account.findFirst({ where: and(eq(account.userId, user.id), eq(account.providerId, "credential")) });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Settings"
        description={
          <>
            Signed in as <span className="font-semibold text-fg">{user.email}</span>
            {user.username ? (
              <>
                {" "}
                ·{" "}
                <Link href={`/profile/${user.username}`} className="text-electric hover:underline">
                  view profile
                </Link>
              </>
            ) : null}
          </>
        }
      />
      <Section title="Profile" description="How you appear on leaderboards and your profile.">
        <ProfileForm
          initial={{ name: user.name, bio: p.bio, avatarHue: p.avatarHue, avatarGlyph: p.avatarGlyph, frameId: p.frameId, themeId: p.themeId, level: p.level }}
        />
      </Section>
      <Section title="Privacy">
        <PrivacyForm initial={{ isPublic: p.isPublic, showActivity: p.showActivity }} />
        <p className="mt-5 text-sm text-fg-muted">
          Cookie and analytics choices for this browser: <span className="font-semibold text-electric"><ConsentPreferencesLink /></span>
        </p>
      </Section>
      <Section title="Guest progress on this device" description="Games you played as a guest saved progress in this browser.">
        <DeviceImport />
      </Section>
      {credential ? (
        <Section title="Password">
          <PasswordForm />
        </Section>
      ) : null}
      <Section title="Your data" description="Download everything we store about you, or delete your account permanently.">
        <DataControls hasPassword={Boolean(credential)} />
      </Section>
    </div>
  );
}
