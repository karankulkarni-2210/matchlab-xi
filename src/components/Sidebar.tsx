"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, House, Users } from "lucide-react";
import { cx } from "./ui";
import { BallIcon } from "./cricket/icons";

const NAV = [
  { href: "/", label: "Match Desk", icon: House, match: (p: string) => p === "/" },
  { href: "/build/demo-hh-dd", label: "Build XI", icon: Users, match: (p: string) => p.startsWith("/build") },
  { href: "/review", label: "Match Review", icon: BarChart3, match: (p: string) => p.startsWith("/review") },
  { href: "/learning", label: "Learning Lab", icon: BookOpen, match: (p: string) => p.startsWith("/learning") },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 focus-ring rounded-md">
      <BallIcon size={22} />
      <span className="font-display text-xl tracking-tight">
        MatchLab <span className="text-gold">XI</span>
      </span>
    </Link>
  );
}

export function Sidebar() {
  const path = usePathname();
  return (
    <>
      {/* desktop */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-clover-2 px-4 py-5 lg:flex">
        <Logo />
        <p className="eyebrow mt-2 text-faint">Your match-day edge</p>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {NAV.map((n) => {
            const active = n.match(path);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "focus-ring flex min-h-11 items-center gap-3 rounded-full px-4 text-sm transition-colors duration-200",
                  active ? "bg-gold font-semibold text-clover" : "text-muted hover:bg-gold/10 hover:text-cream",
                )}
              >
                <n.icon size={18} aria-hidden />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-3 text-xs">
          <div className="rounded-2xl bg-[var(--logo-panel)] p-2">
            <Image src="/cricket-logo.png" alt="Cricket illustration with helmet, bat, ball and stumps" width={736} height={736} sizes="200px" className="h-auto w-full rounded-xl" />
          </div>
          <div className="rounded-2xl border border-line p-3 text-muted">
            <div className="font-medium text-cream">Aryan&apos;s workspace</div>
            <div className="mt-1">Single-user app, no sign-in. The demo match is synthetic and kept separate.</div>
          </div>
          <div className="text-faint">Gemini Flash · CricketData · Cricsheet · Open-Meteo</div>
        </div>
      </aside>
      {/* mobile top bar + bottom nav */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-clover/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <span className="text-xs text-muted">Aryan&apos;s workspace</span>
      </div>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-clover-2/95 backdrop-blur lg:hidden">
        {NAV.map((n) => {
          const active = n.match(path);
          return (
            <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cx("focus-ring relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors", active ? "text-gold" : "text-muted")}>
              <span aria-hidden className={cx("absolute inset-x-5 top-0 h-[3px] rounded-b-full", active ? "bg-gold" : "bg-transparent")} />
              <n.icon size={18} aria-hidden />
              {n.label.replace("Match ", "")}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
