"use client";
import { ArrowLeftRight, Ban, ChevronDown, Lock, LockOpen, Sparkles } from "lucide-react";
import { cx, Pill, RoleChip } from "@/components/ui";
import type { BuildResult, ExplainResponse, Forecast } from "./types";

const FACTOR_LABEL: Record<string, string> = { form: "Recent form", opportunity: "Opportunity", venue: "Venue", matchup: "Matchup" };

export function PlayerPanel({
  data,
  player,
  explain,
  onMakeCaptain,
  onMakeVc,
  onSwap,
  onToggleLock,
  onToggleExclude,
  locked,
  excluded,
  busy,
}: {
  data: BuildResult;
  player: Forecast;
  explain: ExplainResponse | null;
  onMakeCaptain: () => void;
  onMakeVc: () => void;
  onSwap: (benchKey: string) => void;
  onToggleLock: () => void;
  onToggleExclude: () => void;
  locked: boolean;
  excluded: boolean;
  busy: boolean;
}) {
  const team = data.team;
  const inXi = !!team?.playerKeys.includes(player.key);
  const isC = team?.captainKey === player.key;
  const isVc = team?.viceCaptainKey === player.key;
  const rules = data.contest.contest.rules;
  const mult = isC ? rules.captainMultiplier : isVc ? rules.viceCaptainMultiplier : 1;
  const ai = explain?.output ?? null;
  const tpl = explain?.template ?? null;
  const source = ai ?? tpl;
  const reason =
    source && (isC ? source.captain.key === player.key && source.captain : isVc ? source.viceCaptain.key === player.key && source.viceCaptain : null);
  const playerReason = source?.players.find((p) => p.key === player.key);
  const benchReasonAi = source?.bench.find((b) => b.key === player.key);
  const benchDet = data.bench.find((b) => b.key === player.key);
  const evById = new Map(data.evidence.map((e) => [e.id, e]));
  const alternatives = inXi
    ? data.bench
        .filter((b) => b.bestSwapKey === player.key && b.code === "LOWER_SCORE")
        .sort((a, b) => (b.scoreDelta ?? -1e9) - (a.scoreDelta ?? -1e9))
        .slice(0, 3)
        .map((b) => ({ b, f: data.forecasts.find((f) => f.key === b.key)! }))
    : [];
  const sameRoleBench = inXi
    ? data.forecasts
        .filter((f) => f.role === player.role && !team?.playerKeys.includes(f.key) && f.lineup !== "confirmed_out" && f.credits !== null)
        .sort((a, b) => b.rankingScore - a.rankingScore)
        .slice(0, 4)
    : [];
  const aiLabel =
    explain?.status === "fresh" ? <Pill tone="ok">Gemini · just generated</Pill> : explain?.status === "cached" ? <Pill tone="lime">Gemini · cached {explain.generatedAt ? new Date(explain.generatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : ""}</Pill> : <Pill tone="muted">Template from evidence</Pill>;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-clover", player.team === data.bundle.match.teams[0] ? "bg-gold" : "bg-warn")}>
          {player.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-2xl leading-tight">{player.name}</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            {player.team} <RoleChip role={player.role} />
            <Pill tone={player.lineup === "confirmed_xi" ? "ok" : player.lineup === "confirmed_out" ? "bad" : "warn"}>{player.lineup.replace("_", " ")}</Pill>
          </div>
        </div>
        <div className="text-right">
          <div className="num text-sm">{player.credits ?? "?"} Cr</div>
          <div className="num text-lg font-semibold text-gold">{player.predictedBase} pts</div>
          <div className="text-[11px] text-faint">base projection</div>
        </div>
      </div>

      {inXi && (
        <div className="flex flex-wrap items-center gap-2">
          {isC || isVc ? (
            <span className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-sm text-gold">
              <b>{isC ? "Captain" : "Vice-captain"}</b> · {mult}× points in this XI
            </span>
          ) : null}
          {!isC && (
            <button disabled={busy} onClick={onMakeCaptain} className="btn-ghost focus-ring min-h-11 rounded-full px-4 text-sm disabled:opacity-50">
              Make C
            </button>
          )}
          {!isVc && (
            <button disabled={busy} onClick={onMakeVc} className="btn-ghost focus-ring min-h-11 rounded-full px-4 text-sm disabled:opacity-50">
              Make VC
            </button>
          )}
          <button disabled={busy} onClick={onToggleLock} className="btn-ghost focus-ring inline-flex min-h-11 items-center gap-1 rounded-full px-4 text-sm disabled:opacity-50">
            {locked ? <LockOpen size={14} /> : <Lock size={14} />} {locked ? "Unlock" : "Lock"}
          </button>
        </div>
      )}
      {!inXi && (
        <div className="space-y-2">
          <div className="rounded-lg border border-line bg-clover-2 p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-faint">Why benched</div>
            <p className="mt-1">{benchReasonAi?.reason ?? benchDet?.text ?? "Not selected."}</p>
            {benchReasonAi && benchDet && benchReasonAi.reason !== benchDet.text && <p className="mt-1 text-xs text-faint">Computed: {benchDet.text}</p>}
          </div>
          <button disabled={busy} onClick={onToggleExclude} className="btn-ghost focus-ring inline-flex min-h-11 items-center gap-1 rounded-full px-4 text-sm disabled:opacity-50">
            <Ban size={14} /> {excluded ? "Allow optimizer to pick" : "Exclude from optimizer"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-clover-2 p-3">
          <div className="eyebrow text-[10px] text-faint">Projected base</div>
          <div className="num mt-1 text-2xl font-semibold">
            {player.predictedBase} <span className="text-sm font-normal text-faint">± {player.uncertainty}</span>
          </div>
          <div className="text-[11px] text-faint">± is typical spread, not a confidence interval{player.roleMultiplier !== 1 ? ` · role multiplier ${player.roleMultiplier}` : ""}</div>
        </div>
        <div className="rounded-2xl bg-clover-2 p-3" title="Coverage = Σ factor weight × min(1, player sample / target). Targets: form 5, opportunity 10, venue 3, matchup 3 matches.">
          <div className="eyebrow text-[10px] text-faint">Evidence coverage</div>
          <div className={cx("num mt-1 text-2xl font-semibold", player.coverage >= 0.7 ? "text-gold" : player.coverage >= 0.4 ? "text-warn" : "text-bad")}>
            {Math.round(player.coverage * 100)}%
          </div>
          <div className="text-[11px] text-faint">
            {player.historyMatched ? `History: ${player.historyName} (${player.matchMethod})` : "No history match, role prior used"}
          </div>
        </div>
      </div>

      <section aria-labelledby="kr">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 id="kr" className="eyebrow text-muted">Key reasons</h4>
          {aiLabel}
        </div>
        {reason || playerReason ? (
          <div className="space-y-2 text-sm">
            {reason && (
              <p className="rounded-2xl border border-gold/30 bg-gold/5 p-3">
                <Sparkles size={14} className="mr-1 inline text-gold" aria-hidden />
                {reason.reason}
              </p>
            )}
            {playerReason && (!reason || !reason.reason.includes(playerReason.reason)) && <p className="rounded-2xl bg-clover-2 p-3">{playerReason.reason}</p>}
            <details className="group rounded-2xl bg-clover-2">
              <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between rounded-2xl px-3 text-xs font-semibold text-muted">
                Sources cited ({[...new Set([...(reason ? reason.evidenceIds : []), ...(playerReason?.evidenceIds ?? [])])].length})
                <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <ul className="space-y-2 px-3 pb-3">
                {[...new Set([...(reason ? reason.evidenceIds : []), ...(playerReason?.evidenceIds ?? [])])].map((id) => {
                  const ev = evById.get(id);
                  return (
                    <li key={id} className="text-xs">
                      <span className="font-semibold text-cream">{ev?.title ?? id}</span>
                      {ev && <span className="block text-faint">{ev.detail} · Source: {ev.source}</span>}
                    </li>
                  );
                })}
              </ul>
            </details>
          </div>
        ) : (
          <p className="text-sm text-faint">{inXi ? "Generate reasons to see the match-specific case." : "No reasons yet."}</p>
        )}
      </section>

      <details className="group rounded-2xl bg-clover-2">
        <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between rounded-2xl px-3 text-xs font-semibold text-muted">
          Forecast inputs &amp; formula · weights v{data.weights.version} · model {data.forecastVersion}
          <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <p className="px-3 text-[11px] text-faint">
          projected = role multiplier × Σ weight × factor; each factor is shrunk toward the player&apos;s baseline when the sample (n) is small.
        </p>
        <ul className="space-y-2 p-3">
          {(Object.keys(player.factors) as (keyof Forecast["factors"])[]).map((k) => {
            const f = player.factors[k];
            const w = data.weights.weights[k];
            return (
              <li key={k} className="rounded-xl bg-clover/60 p-2.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {FACTOR_LABEL[k]} <span className="text-faint">· weight {Math.round(w * 100)}%</span>
                  </span>
                  <span className="num font-semibold">{f.estimate.toFixed(1)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-faint">
                  <span>{f.note}</span>
                  <span className={cx("num shrink-0", f.n === 0 && "text-warn")}>n={f.n}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </details>

      {inXi && (alternatives.length > 0 || sameRoleBench.length > 0) && (
        <section aria-labelledby="ci">
          <h4 id="ci" className="mb-2 text-sm font-semibold">
            Consider instead
          </h4>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(alternatives.length ? alternatives.map((a) => a.f) : sameRoleBench).map((f) => {
              const a = alternatives.find((x) => x.f.key === f.key);
              return (
                <li key={f.key} className="flex items-center gap-2 rounded-lg border border-line p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{f.name}</div>
                    <div className="num text-xs text-muted">
                      {f.credits ?? "?"} Cr | {f.predictedBase} pts <RoleChip role={f.role} />
                    </div>
                    <div className="text-[11px] text-faint">{a ? `Valid swap · score ${a.b.scoreDelta}` : "Swap will be re-validated"}</div>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => onSwap(f.key)}
                    aria-label={`Swap ${player.name} for ${f.name}`}
                    className="focus-ring rounded-full border border-line-2 p-2 hover:border-gold/60 disabled:opacity-50"
                  >
                    <ArrowLeftRight size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
