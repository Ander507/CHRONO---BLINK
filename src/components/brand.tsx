import {
  Bolt,
  Brain,
  Building2,
  CalendarCheck,
  CalendarDays,
  Compass,
  Crown,
  Flame,
  Footprints,
  Gamepad2,
  Gauge,
  Gem,
  Ghost,
  Hourglass,
  Joystick,
  Orbit,
  Puzzle,
  Rocket,
  Shield,
  Skull,
  Sparkles,
  Star,
  Swords,
  Target,
  Timer,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { COSMETICS } from "@/lib/progression";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-8" />
      {compact ? null : (
        <span className="font-display text-[17px] font-extrabold leading-none tracking-tight text-fg">
          Chrono<span className="text-primary">Blink</span>
        </span>
      )}
    </span>
  );
}

/** A clock face split by a blink stroke — the platform mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="cb-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b6cff" />
          <stop offset="1" stopColor="#3cc4ff" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#13131c" stroke="url(#cb-g)" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="#2a2a3a" strokeWidth="2" />
      <path d="M16 10.5V16l3.5 2" fill="none" stroke="#eceaf6" strokeWidth="2" strokeLinecap="round" />
      <path d="M6.5 24.5 25.5 7.5" stroke="url(#cb-g)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

const ICONS: Record<string, LucideIcon> = {
  swords: Swords,
  joystick: Joystick,
  shield: Shield,
  puzzle: Puzzle,
  gauge: Gauge,
  brain: Brain,
  footprints: Footprints,
  timer: Timer,
  users: Users,
  hourglass: Hourglass,
  trophy: Trophy,
  flame: Flame,
  compass: Compass,
  "calendar-check": CalendarCheck,
  "calendar-days": CalendarDays,
  crown: Crown,
  zap: Zap,
  gem: Gem,
  sparkles: Sparkles,
  target: Target,
  building: Building2,
  "gamepad-2": Gamepad2,
  bolt: Bolt,
  ghost: Ghost,
  rocket: Rocket,
  skull: Skull,
  star: Star,
  orbit: Orbit,
};

export function NamedIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Gamepad2;
  return <Icon className={className} aria-hidden />;
}

export function Avatar({
  hue,
  glyph,
  frameId,
  size = 40,
  className,
  label,
}: {
  hue: number;
  glyph: string;
  frameId?: string | null;
  size?: number;
  className?: string;
  label?: string;
}) {
  const frame = COSMETICS.find((c) => c.id === frameId && c.kind === "frame");
  const ring = frame && frame.preview !== "transparent" ? frame.preview : null;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("relative inline-grid shrink-0 place-items-center rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue + 50) % 360} 75% 42%))`,
        boxShadow: ring ? `0 0 0 2px var(--color-canvas), 0 0 0 ${size > 60 ? 4 : 3.5}px ${ring}` : undefined,
      }}
    >
      <span style={{ width: size * 0.48, height: size * 0.48 }} className="grid place-items-center [&_svg]:size-full">
        <NamedIcon name={glyph} className="text-white/95" />
      </span>
    </span>
  );
}
