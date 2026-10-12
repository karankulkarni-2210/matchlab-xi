"use client";
import { cx } from "@/components/ui";
import type { Forecast } from "./types";

const ROWS = [
  { role: "WK", label: "Wicketkeeper" },
  { role: "BAT", label: "Batters" },
  { role: "AR", label: "All-rounders" },
  { role: "BOWL", label: "Bowlers" },
] as const;

/** Decorative oval field: alternating grass bands, boundary rope, 30-yard circle, centre pitch + creases. */
function FieldArt() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 600 640" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <clipPath id="oval">
          <ellipse cx="300" cy="320" rx="296" ry="316" />
        </clipPath>
      </defs>
      <g clipPath="url(#oval)">
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x={i * 50} y="0" width="50" height="640" fill={i % 2 ? "var(--field-2)" : "var(--field)"} />
        ))}
      </g>
      <ellipse cx="300" cy="320" rx="292" ry="312" fill="none" stroke="var(--cream)" strokeOpacity="0.5" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
      <ellipse cx="300" cy="320" rx="170" ry="200" fill="none" stroke="var(--cream)" strokeOpacity="0.16" strokeWidth="2" strokeDasharray="10 8" />
      <rect x="282" y="230" width="36" height="180" rx="4" fill="var(--strip)" opacity="0.32" />
      <line x1="270" y1="248" x2="330" y2="248" stroke="var(--ivory)" strokeOpacity="0.45" strokeWidth="2" />
      <line x1="270" y1="392" x2="330" y2="392" stroke="var(--ivory)" strokeOpacity="0.45" strokeWidth="2" />
    </svg>
  );
}

export function Pitch({
  players,
  teamA,
  teamB,
  captainKey,
  viceCaptainKey,
  selectedKey,
  onSelect,
  locked,
}: {
  players: Forecast[];
  teamA: string;
  teamB: string;
  captainKey: string | null;
  viceCaptainKey: string | null;
  selectedKey: string | null;
  onSelect: (k: string) => void;
  locked: Set<string>;
}) {
  return (
    <div className="relative overflow-hidden rounded-[28px] bg-clover-2 px-3 py-5 sm:px-6 sm:py-6">
      <FieldArt />
      <ol className="relative flex min-h-[450px] flex-col justify-around gap-3" aria-label="Selected XI by role">
        {ROWS.map((row) => {
          const inRow = players.filter((p) => p.role === row.role);
          return (
            <li key={row.role}>
              <div className="mb-2 flex justify-center">
                <span className="eyebrow rounded-full bg-clover/85 px-3 py-1 text-[10px] text-cream">
                  {row.label} · {inRow.length}
                </span>
              </div>
              <ul className="flex flex-wrap justify-center gap-x-2 gap-y-3 sm:gap-x-3">
                {inRow.map((p) => {
                  const isC = p.key === captainKey;
                  const isVc = p.key === viceCaptainKey;
                  const sel = p.key === selectedKey;
                  return (
                    <li key={p.key}>
                      <button
                        type="button"
                        onClick={() => onSelect(p.key)}
                        aria-pressed={sel}
                        aria-label={`${p.name}, ${p.team}, ${p.role}${isC ? ", captain" : isVc ? ", vice-captain" : ""}. ${p.credits ?? "unknown"} credits, ${p.predictedBase} projected base points`}
                        className="focus-ring group flex w-[84px] flex-col items-center rounded-2xl sm:w-[96px]"
                      >
                        <span className="relative">
                          <span
                            className={cx(
                              "flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold shadow-md ring-2 transition-transform duration-200 group-hover:-translate-y-0.5",
                              p.team === teamA ? "bg-gold text-clover" : "text-clover",
                              sel ? "ring-cream ring-offset-2 ring-offset-[var(--field)]" : "ring-clover/40",
                            )}
                            style={p.team === teamA ? undefined : { background: "var(--ivory)" }}
                          >
                            {p.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                          </span>
                          {(isC || isVc) && (
                            <span
                              className={cx(
                                "absolute -right-2.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[10px] font-extrabold",
                                isC ? "bg-ball text-cream ring-2 ring-gold" : "bg-clover text-gold ring-2 ring-gold",
                              )}
                            >
                              {isC ? "C" : "VC"}
                            </span>
                          )}
                          {locked.has(p.key) && (
                            <span className="absolute -left-2 -top-1.5 rounded-full bg-clover px-1 text-[10px] text-cream ring-1 ring-line-2" aria-hidden>
                              🔒
                            </span>
                          )}
                        </span>
                        <span className={cx("mt-1.5 w-full rounded-xl px-1 py-1 text-center", sel ? "bg-gold text-clover" : "bg-clover/85 text-cream group-hover:bg-clover")}>
                          <span className="block text-[11px] font-semibold leading-tight [overflow-wrap:anywhere]">{p.name}</span>
                          <span className={cx("num block text-[10px]", sel ? "text-clover" : "text-muted")}>
                            {p.credits ?? "?"} Cr · {p.predictedBase} pts
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {inRow.length === 0 && <li className="text-xs text-muted">none selected</li>}
              </ul>
            </li>
          );
        })}
      </ol>
      <p className="relative mt-4 text-center text-[11px] text-muted">
        <span className="mr-3 inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-gold" aria-hidden /> {teamA}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--ivory)" }} aria-hidden /> {teamB}
        </span>
      </p>
    </div>
  );
}
