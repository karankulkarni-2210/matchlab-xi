"use client";
import { useEffect, useState } from "react";

const KEY = "mlxi-intro-seen";

/**
 * Stadium entrance, once per browser session, ≤1.8 s, skippable. Pure CSS animation; the page underneath
 * is fully rendered and loading immediately. An inline script in <head> adds `intro-seen` to <html> before
 * paint for repeat visits, so the overlay never flashes. Hidden under prefers-reduced-motion (CSS).
 */
export function Intro() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {}
    const t = setTimeout(() => setGone(true), 1850);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  return (
    <div className="intro fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-clover" aria-hidden="false">
      {/* floodlight beams + crease (decorative) */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <polygon points="80,0 140,0 520,600 260,600" fill="var(--cream)" opacity="0.05" />
        <polygon points="860,0 920,0 740,600 480,600" fill="var(--cream)" opacity="0.05" />
        <ellipse cx="500" cy="620" rx="620" ry="260" fill="var(--clover-2)" />
        <rect x="455" y="360" width="90" height="240" fill="var(--strip)" opacity="0.18" />
        <line x1="420" y1="400" x2="580" y2="400" stroke="var(--cream)" strokeOpacity="0.35" strokeWidth="2" />
      </svg>
      <div className="relative text-center">
        <p className="intro-title font-display text-5xl text-cream sm:text-7xl">
          MatchLab <span className="text-gold">XI</span>
        </p>
        <p className="intro-sub eyebrow mt-4 text-muted">Read the pitch. Pick your XI.</p>
      </div>
      <svg className="intro-ball pointer-events-none absolute left-1/2 top-1/2 -ml-5 -mt-5" width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="var(--ball)" />
        <path d="M7 4.2c2.4 2.6 2.4 13 0 15.6M17 4.2c-2.4 2.6-2.4 13 0 15.6" fill="none" stroke="var(--ball-seam)" strokeWidth="1.2" strokeDasharray="1.6 1.4" />
      </svg>
      <button onClick={() => setGone(true)} className="btn-ghost focus-ring absolute bottom-6 right-6 min-h-11 rounded-full px-4 text-sm text-cream">
        Skip intro
      </button>
    </div>
  );
}

export const INTRO_HEAD_SCRIPT = `try{if(sessionStorage.getItem("${KEY}"))document.documentElement.classList.add("intro-seen")}catch(e){document.documentElement.classList.add("intro-seen")}`;
