import type { Metadata, Viewport } from "next";
import { Manrope, Syne } from "next/font/google";
import { Toaster } from "sonner";
import { ConsentProvider } from "@/components/consent";
import { AppShell } from "@/components/shell/app-shell";
import { env } from "@/server/env";
import { getCurrentUser } from "@/server/session";
import { getShellUser } from "@/server/services/profiles";
import "./globals.css";

const syne = Syne({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-syne", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: {
    default: "ChronoBlink Arcade — Play free browser games instantly",
    template: "%s · ChronoBlink Arcade",
  },
  description:
    "Instant-play HTML5 games with no downloads. Climb leaderboards, take on daily challenges, earn XP and achievements — free, no account required.",
  applicationName: "ChronoBlink Arcade",
  openGraph: { type: "website", siteName: "ChronoBlink Arcade", locale: "en_US" },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#09090e",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const shellUser = await getShellUser(await getCurrentUser());
  return (
    <html lang="en" className={`${syne.variable} ${manrope.variable}`}>
      <body>
        <ConsentProvider>
          <AppShell user={shellUser}>{children}</AppShell>
          <Toaster
            theme="dark"
            position="top-center"
            toastOptions={{ className: "!bg-raised !border-line-strong !text-fg !rounded-xl" }}
          />
        </ConsentProvider>
      </body>
    </html>
  );
}
