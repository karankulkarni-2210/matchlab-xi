import { cx } from "@/components/ui";

/**
 * Signature wicket loader: a seamed red ball hits three ivory stumps, the bails lift and one stump tilts.
 * ~2 s loop (CSS), static under prefers-reduced-motion. The message names the real operation; no fake progress.
 */
export function CricketLoader({ message, size = "md", className }: { message: string; size?: "sm" | "md"; className?: string }) {
  const w = size === "sm" ? 92 : 132;
  return (
    <div role="status" aria-live="polite" className={cx("flex flex-col items-center gap-2", className)}>
      <svg width={w} height={w * 0.62} viewBox="0 0 132 82" aria-hidden="true">
        <rect x="6" y="66" width="120" height="12" rx="6" fill="var(--field-2)" />
        <rect x="44" y="64" width="44" height="14" rx="3" fill="var(--strip)" opacity="0.55" />
        <g className="wk-burst">
          <circle cx="66" cy="40" r="15" fill="none" stroke="var(--gold)" strokeWidth="2" strokeDasharray="3 5" />
        </g>
        <rect x="56" y="28" width="4.5" height="40" rx="2" fill="var(--ivory)" />
        <rect className="wk-stump" x="63.75" y="28" width="4.5" height="40" rx="2" fill="var(--ivory)" />
        <rect x="71.5" y="28" width="4.5" height="40" rx="2" fill="var(--ivory)" />
        <rect className="wk-bail-l" x="56.5" y="24.5" width="9.5" height="3" rx="1.5" fill="var(--ivory)" />
        <rect className="wk-bail-r" x="66" y="24.5" width="9.5" height="3" rx="1.5" fill="var(--ivory)" />
        <g className="wk-ball" style={{ transformOrigin: "52px 44px" }}>
          <circle cx="52" cy="44" r="6.5" fill="var(--ball)" />
          <path d="M49 38.6c1.8 2 1.8 8.8 0 10.8M55 38.6c-1.8 2-1.8 8.8 0 10.8" fill="none" stroke="var(--ball-seam)" strokeWidth="0.9" strokeDasharray="1.2 1" />
        </g>
      </svg>
      <p className="text-sm font-medium text-muted">{message}</p>
    </div>
  );
}
