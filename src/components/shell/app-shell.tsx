"use client";

import {
  CalendarCheck,
  Code2,
  Compass,
  Heart,
  LayoutGrid,
  LogOut,
  Search,
  Settings,
  Shapes,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  User as UserIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { Avatar, Logo } from "@/components/brand";
import { ConsentPreferencesLink } from "@/components/consent";
import { SearchBox } from "@/components/shell/search-box";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export type ShellUser = {
  name: string;
  username: string | null;
  role: "user" | "developer" | "moderator" | "admin";
  avatarHue: number;
  avatarGlyph: string;
  frameId: string | null;
  level: number;
};

const NAV = [
  { href: "/", label: "Discover", icon: Compass, exact: true },
  { href: "/games", label: "All games", icon: LayoutGrid },
  { href: "/categories", label: "Categories", icon: Shapes },
  { href: "/new", label: "New", icon: Sparkles },
  { href: "/trending", label: "Trending", icon: TrendingUp },
  { href: "/leaderboards", label: "Leaderboards", icon: Trophy },
  { href: "/challenges", label: "Daily challenge", icon: CalendarCheck },
  { href: "/favorites", label: "Favorites", icon: Heart },
];

const MOBILE_NAV = [
  { href: "/", label: "Discover", icon: Compass, exact: true },
  { href: "/games", label: "Games", icon: LayoutGrid },
  { href: "/search", label: "Search", icon: Search },
  { href: "/leaderboards", label: "Ranks", icon: Trophy },
  { href: "/challenges", label: "Daily", icon: CalendarCheck },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ user, children }: { user: ShellUser | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const immersive = pathname.startsWith("/play/");

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only z-[60] rounded-lg bg-primary px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-ink/80 lg:flex" aria-label="Primary">
        <Link href="/" className="flex h-16 items-center px-5" aria-label="ChronoBlink Arcade home">
          <Logo />
        </Link>
        <nav className="no-scrollbar flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(pathname, item.href, item.exact)} />
          ))}
          <div className="px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Build</div>
          <NavLink href="/developers" label="Developers" icon={Code2} active={pathname.startsWith("/developers")} />
          {user && (user.role === "admin" || user.role === "moderator") ? (
            <NavLink href="/admin" label="Admin" icon={ShieldCheck} active={pathname.startsWith("/admin")} />
          ) : null}
        </nav>
        <div className="border-t border-line px-5 py-4 text-xs text-fg-subtle">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <Link href="/legal/privacy" className="hover:text-fg">
              Privacy
            </Link>
            <Link href="/legal/terms" className="hover:text-fg">
              Terms
            </Link>
            <ConsentPreferencesLink />
          </div>
          <p className="mt-2">© {new Date().getFullYear()} ChronoBlink</p>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="glass sticky top-0 z-20 border-b border-line">
          <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
            <Link href="/" className="lg:hidden" aria-label="ChronoBlink Arcade home">
              <Logo compact className="sm:hidden" />
              <Logo className="hidden sm:inline-flex" />
            </Link>
            <SearchBox className="hidden max-w-xl flex-1 md:block" />
            <div className="ml-auto flex items-center gap-2">
              <Link href="/search" className="grid size-10 place-items-center rounded-xl text-fg-muted hover:bg-raised hover:text-fg md:hidden" aria-label="Search">
                <Search className="size-5" />
              </Link>
              {user ? <UserMenu user={user} /> : <AuthButtons />}
            </div>
          </div>
        </header>
        <main id="main" className={cn("mx-auto max-w-[1600px] px-4 pb-28 pt-6 sm:px-6 lg:pb-16", immersive && "pt-4")}>
          {children}
        </main>
      </div>

      <nav
        className="glass fixed inset-x-0 bottom-0 z-30 border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Primary mobile"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {MOBILE_NAV.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                    active ? "text-fg" : "text-fg-subtle hover:text-fg-muted",
                  )}
                >
                  <item.icon className={cn("size-5", active && "text-primary")} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ElementType; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
        active ? "bg-raised text-fg" : "text-fg-muted hover:bg-raised/60 hover:text-fg",
      )}
    >
      {active ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" aria-hidden /> : null}
      <Icon className={cn("size-[18px]", active ? "text-primary" : "text-fg-subtle group-hover:text-fg-muted")} aria-hidden />
      {label}
    </Link>
  );
}

function AuthButtons() {
  const pathname = usePathname();
  const next = pathname && pathname !== "/login" && pathname !== "/register" ? `?next=${encodeURIComponent(pathname)}` : "";
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
        <Link href={`/login${next}`}>Sign in</Link>
      </Button>
      <Button asChild size="sm">
        <Link href={`/register${next}`}>Create account</Link>
      </Button>
    </>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const router = useRouter();
  const handle = user.username ?? "me";
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="flex items-center gap-2.5 rounded-xl p-1 pr-2 hover:bg-raised" aria-label="Account menu">
          <Avatar hue={user.avatarHue} glyph={user.avatarGlyph} frameId={user.frameId} size={32} />
          <span className="hidden text-left sm:block">
            <span className="block max-w-32 truncate text-sm font-semibold leading-tight text-fg">{user.name}</span>
            <span className="block text-[11px] leading-tight text-fg-subtle">Level {user.level}</span>
          </span>
        </button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Signed in as @{handle}</MenuLabel>
        <MenuItem asChild>
          <Link href={`/profile/${handle}`}>
            <UserIcon /> Profile
          </Link>
        </MenuItem>
        <MenuItem asChild>
          <Link href="/favorites">
            <Heart /> Favorites
          </Link>
        </MenuItem>
        <MenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </MenuItem>
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/developers/dashboard">
            <Code2 /> Developer dashboard
          </Link>
        </MenuItem>
        {user.role === "admin" || user.role === "moderator" ? (
          <MenuItem asChild>
            <Link href="/admin">
              <ShieldCheck /> Admin
            </Link>
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuItem
          onSelect={async () => {
            await authClient.signOut();
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
