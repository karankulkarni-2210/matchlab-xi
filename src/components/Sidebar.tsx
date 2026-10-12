"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, House, Users } from "lucide-react";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Match Desk", icon: House, match: (p: string) => p === "/" },
  { href: "/build/demo-hh-dd", label: "Build XI", icon: Users, match: (p: string) => p.startsWith("/build") },
  { href: "/review", label: "Match Review", icon: BarChart3, match: (p: string) => p.startsWith("/review") },
  { href: "/learning", label: "Learning Lab", icon: BookOpen, match: (p: string) => p.startsWith("/learning") },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 focus-ring rounded-md">
      <span className="flex items-end gap-[3px]" aria-hidden>
        <span className="h-3 w-[5px] rounded-sm bg-lime" />
        <span className="h-5 w-[5px] rounded-sm bg-lime" />
        <span className="h-4 w-[5px] rounded-sm bg-lime/70" />
      </span>
      <span className="text-lg font-bold tracking-tight">
        MatchLab <span className="text-lime">XI</span>
      </span>
    </Link>
  );
}

export function Sidebar() {
  const path = usePathname();
  return (
    <>
      {/* desktop */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-ink-2 px-4 py-5 lg:flex">
        <Logo />
        <p className="mt-1 text-xs text-faint">Evidence-first match-day picks.</p>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {NAV.map((n) => {
            const active = n.match(path);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active ? "border border-lime/25 bg-lime/10 font-semibold text-lime" : "text-muted hover:bg-white/5 hover:text-warm",
                )}
              >
                <n.icon size={18} aria-hidden />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-3 text-xs">
          <div className="rounded-lg border border-line p-3 text-muted">
            <div className="font-medium text-warm">Aryan&apos;s workspace</div>
            <div className="mt-1">Single-user app — no sign-in. The demo match is synthetic and kept separate.</div>
          </div>
          <div className="text-faint">Gemini Flash · CricketData · Cricsheet · Open-Meteo</div>
        </div>
      </aside>
      {/* mobile top bar + bottom nav */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-ink/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <span className="text-xs text-muted">Aryan&apos;s workspace</span>
      </div>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-ink-2/95 backdrop-blur lg:hidden">
        {NAV.map((n) => {
          const active = n.match(path);
          return (
            <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cx("focus-ring flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-lime" : "text-muted")}>
              <n.icon size={18} aria-hidden />
              {n.label.replace("Match ", "")}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
