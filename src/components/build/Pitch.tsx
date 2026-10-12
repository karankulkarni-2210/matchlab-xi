"use client";
import { cx } from "@/components/ui";
import type { Forecast } from "./types";

const ROWS = [
  { role: "WK", label: "Wicketkeeper" },
  { role: "BAT", label: "Batters" },
  { role: "AR", label: "All-rounders" },
  { role: "BOWL", label: "Bowlers" },
] as const;

export function Pitch({
  players,
  teamA,
  captainKey,
  viceCaptainKey,
  selectedKey,
  onSelect,
  locked,
}: {
  players: Forecast[];
  teamA: string;
  captainKey: string | null;
  viceCaptainKey: string | null;
  selectedKey: string | null;
  onSelect: (k: string) => void;
  locked: Set<string>;
}) {
  return (
    <div className="pitch-bg relative overflow-hidden rounded-[14px] border border-line px-2 py-4 sm:px-4">
      {/* oval + pitch strip, decorative */}
      <div aria-hidden className="pointer-events-none absolute inset-3 rounded-[50%] border border-white/15" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[18%] h-[64%] w-[64px] -translate-x-1/2 rounded-sm bg-[#b9a76a]/18 ring-1 ring-white/10" />
      <ol className="relative flex flex-col gap-5 sm:gap-6" aria-label="Selected XI by role">
        {ROWS.map((row) => {
          const inRow = players.filter((p) => p.role === row.role);
          return (
            <li key={row.role}>
              <div className="mb-2 flex justify-center">
                <span className="rounded-full border border-white/15 bg-ink/70 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-warm/90">
                  {row.label} ({inRow.length})
                </span>
              </div>
              <ul className="flex flex-wrap justify-center gap-2 sm:gap-3">
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
                        className={cx(
                          "focus-ring group relative flex w-[92px] flex-col items-center sm:w-[118px]",
                        )}
                      >
                        <span className="relative">
                          <span
                            className={cx(
                              "flex h-11 w-11 items-center justify-center rounded-full text-base font-bold shadow-lg ring-2 sm:h-12 sm:w-12",
                              p.team === teamA ? "bg-lime text-ink" : "bg-warn text-ink",
                              sel ? "ring-warm" : "ring-ink/50",
                            )}
                          >
                            {p.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                          </span>
                          {(isC || isVc) && (
                            <span className="absolute -right-2 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold text-lime ring-1 ring-lime">
                              {isC ? "C" : "VC"}
                            </span>
                          )}
                          {locked.has(p.key) && <span className="absolute -left-2 -top-1.5 rounded-full bg-ink px-1 text-[10px] text-muted ring-1 ring-line-2">🔒</span>}
                        </span>
                        <span
                          className={cx(
                            "mt-1 w-full rounded-md border bg-ink/85 px-1 py-1 text-center",
                            sel ? "border-lime/70" : "border-white/10 group-hover:border-white/30",
                          )}
                        >
                          <span className="block truncate text-[11px] font-semibold sm:text-xs">{p.name}</span>
                          <span className="num block text-[10px] text-muted sm:text-[11px]">
                            {p.credits ?? "?"} Cr | {p.predictedBase} pts
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {inRow.length === 0 && <li className="text-xs text-warm/60">none selected</li>}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
