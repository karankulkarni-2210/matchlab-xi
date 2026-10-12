import "server-only";
import { forecastPlayer, FORECAST_VERSION, type ForecastContext } from "@/lib/domain/forecast";
import { benchReasons, eligibleCandidates, optimizeTeam, type BenchReason, type Exclusion } from "@/lib/domain/optimizer";
import type { PlayerForecast, TeamSelection, TeamValidation, Violation } from "@/lib/domain/types";
import { validateTeam } from "@/lib/domain/validate";
import { round } from "@/lib/domain/weights";
import { matchPlayer } from "@/lib/providers/history";
import { loadContest, type LoadedContest } from "./contest";
import { getMatchBundle, type MatchBundle } from "./match";
import { getActiveWeights, resolveScope, type ActiveWeights, type Scope } from "./scope";
import { DEMO_MATCH_ID } from "@/lib/demo/demo";

export interface EvidenceItem {
  id: string;
  kind: "venue" | "weather" | "history" | "matchup" | "lineup" | "rules" | "contest";
  title: string;
  detail: string;
  source: string;
  asOf: string | null;
}

export interface BuildResult {
  scope: Scope["kind"];
  bundle: Omit<MatchBundle, "squad"> & { squadSize: number };
  contest: LoadedContest;
  weights: ActiveWeights;
  forecastVersion: string;
  forecasts: (PlayerForecast & { matchMethod: string; historyName: string | null; lastT20I: string | null; staleHistory: boolean })[];
  team: TeamSelection | null;
  optimizer: { feasible: boolean; optimal: boolean; objective: number | null; nodes: number; violations: Violation[]; exclusions: Exclusion[] } | null;
  validation: TeamValidation | null;
  bench: BenchReason[];
  evidence: EvidenceItem[];
  totals: { predicted: number | null; credits: number | null };
  coverageSummary: { mean: number; matched: number; total: number };
}

export async function buildMatch(
  matchId: string,
  opts: { selection?: TeamSelection; lockedKeys?: string[]; excludedKeys?: string[] } = {},
): Promise<BuildResult> {
  const bundle = await getMatchBundle(matchId);
  const scope = await resolveScope(matchId === DEMO_MATCH_ID ? "demo" : "real");
  const [loaded, weights] = await Promise.all([loadContest(bundle, scope), getActiveWeights(scope)]);
  const { contest } = loaded;
  const [teamA, teamB] = bundle.match.teams;

  const ctx: ForecastContext = {
    venue: bundle.venue,
    opponentHistoryName: { [teamA]: teamB, [teamB]: teamA },
    globalMeanPts: bundle.globalMeanPts,
    weights: weights.weights,
    roleMultipliers: weights.roleMultipliers,
    asOfDate: bundle.match.startsAt.slice(0, 10),
  };

  const squadByKey = new Map(bundle.squad.map((s) => [s.key, s]));
  const forecasts = contest.players.map((p) => {
    const s = squadByKey.get(p.key);
    let history = s?.history ?? null;
    let method: string = s?.matchMethod ?? "none";
    let historyName = s?.historyName ?? null;
    let lastT20I = s?.lastT20I ?? null;
    if (!bundle.isDemo && (p.historyName || !s)) {
      const m = matchPlayer(p.name, p.team, p.historyName);
      history = m.history;
      method = m.method;
      historyName = m.historyName;
      lastT20I = m.lastDate;
    }
    const daysSinceLast = lastT20I ? Math.round((Date.parse(bundle.match.startsAt) - Date.parse(lastT20I)) / 86400000) : null;
    // Evidence-quality flag only: a long gap since the last T20I is shown, never used to guess the XI.
    const staleHistory = daysSinceLast !== null && daysSinceLast > 270;
    return { ...forecastPlayer(p, history, ctx), matchMethod: method, historyName, lastT20I, staleHistory };
  });
  const fMap = new Map(forecasts.map((f) => [f.key, f]));

  const contestCtx = { rulesConfirmedAt: contest.rulesConfirmedAt, lineupsConfirmed: contest.lineupsConfirmed, sourceAsOf: contest.sourceAsOf, teamA, teamB };
  const { candidates, exclusions } = eligibleCandidates(contest.players, fMap, opts.excludedKeys);

  let team: TeamSelection | null = null;
  let optimizer: BuildResult["optimizer"] = null;
  if (opts.selection) {
    team = opts.selection;
  } else {
    const r = optimizeTeam(candidates, contest.rules, [teamA, teamB], { exclusions, lockedKeys: opts.lockedKeys });
    optimizer = { feasible: r.feasible, optimal: r.optimal, objective: r.objective, nodes: r.nodes, violations: r.violations, exclusions };
    if (r.feasible) team = { playerKeys: r.playerKeys, captainKey: r.captainKey, viceCaptainKey: r.viceCaptainKey };
  }
  const validation = team ? validateTeam(team, contest.players, contest.rules, contestCtx) : null;
  const bench = team && validation ? benchReasons(contest.players, fMap, { ...team }, contest.rules, exclusions) : [];

  let predicted: number | null = null;
  if (team) {
    predicted = round(
      team.playerKeys.reduce((s, k) => {
        const f = fMap.get(k);
        const m = k === team!.captainKey ? contest.rules.captainMultiplier : k === team!.viceCaptainKey ? contest.rules.viceCaptainMultiplier : 1;
        return s + (f?.predictedBase ?? 0) * m;
      }, 0),
      1,
    );
  }

  const evidence = buildEvidence(bundle, loaded, forecasts);
  const matched = forecasts.filter((f) => f.historyMatched).length;
  const { squad, ...bundleRest } = bundle;
  return {
    scope: scope.kind,
    bundle: { ...bundleRest, squadSize: squad.length },
    contest: loaded,
    weights,
    forecastVersion: FORECAST_VERSION,
    forecasts,
    team,
    optimizer,
    validation,
    bench,
    evidence,
    totals: { predicted, credits: validation?.totals.credits ?? null },
    coverageSummary: {
      mean: forecasts.length ? round(forecasts.reduce((s, f) => s + f.coverage, 0) / forecasts.length, 3) : 0,
      matched,
      total: forecasts.length,
    },
  };
}

function buildEvidence(bundle: MatchBundle, loaded: LoadedContest, forecasts: BuildResult["forecasts"]): EvidenceItem[] {
  const ev: EvidenceItem[] = [];
  const histSrc = bundle.isDemo ? "Synthetic demo history" : "Cricsheet men's T20Is";
  const v = bundle.venue;
  if (v) {
    ev.push({
      id: `venue:${v.key}`,
      kind: "venue",
      title: `${v.name}: ${v.matches} T20I(s) in history`,
      detail: [
        v.avgFirstInnings !== null ? `avg 1st-innings ${v.avgFirstInnings}` : null,
        v.avgSecondInnings !== null ? `avg 2nd-innings ${v.avgSecondInnings}` : null,
        v.chaseWinPct !== null ? `chasing side won ${v.chaseWinPct}%` : null,
        v.batIndex !== null ? `batting points index ${v.batIndex} (n=${v.batIndexN})` : null,
        v.bowlIndex !== null ? `bowling points index ${v.bowlIndex} (n=${v.bowlIndexN})` : null,
        v.matches < 5 ? "small sample — venue signal is shrunk heavily toward neutral" : null,
      ]
        .filter(Boolean)
        .join("; "),
      source: histSrc,
      asOf: bundle.historyAsOf,
    });
  } else {
    ev.push({ id: "venue:none", kind: "venue", title: "Venue not in history", detail: `${bundle.match.venue} has no T20Is in the dataset; venue factor uses player baselines.`, source: histSrc, asOf: bundle.historyAsOf });
  }
  if (bundle.weather) {
    const w = bundle.weather;
    ev.push({
      id: "weather",
      kind: "weather",
      title: `Forecast at start: ${w.temperatureC ?? "?"}°C, rain ${w.precipitationProbability ?? "?"}%`,
      detail: `Humidity ${w.humidity ?? "?"}% at start, ${w.laterHumidity ?? "?"}% three hours later; wind ${w.windKph ?? "?"} km/h. ${w.place}.`,
      source: "Open-Meteo",
      asOf: bundle.sources.find((s) => s.id === "weather")?.asOf ?? null,
    });
  }
  const c = loaded.contest;
  ev.push({
    id: "contest",
    kind: "contest",
    title: `Contest data: ${c.sourceLabel}`,
    detail: `${c.players.filter((p) => p.credits !== null).length}/${c.players.length} credits known; lineups confirmed — ${bundle.match.teams[0]}: ${c.lineupsConfirmed.teamA ? "yes" : "no"}, ${bundle.match.teams[1]}: ${c.lineupsConfirmed.teamB ? "yes" : "no"}.`,
    source: loaded.origin === "demo" ? "Synthetic demo" : loaded.origin === "owner" ? "Owner-entered" : "Provider squad",
    asOf: c.sourceAsOf,
  });
  ev.push({
    id: "rules",
    kind: "rules",
    title: c.rules.label,
    detail: `${c.rules.players} players, ${c.rules.creditCap} credits, ≤${c.rules.maxFromOneTeam} per team; WK ${c.rules.roleLimits.WK.min}–${c.rules.roleLimits.WK.max}, BAT ${c.rules.roleLimits.BAT.min}–${c.rules.roleLimits.BAT.max}, AR ${c.rules.roleLimits.AR.min}–${c.rules.roleLimits.AR.max}, BOWL ${c.rules.roleLimits.BOWL.min}–${c.rules.roleLimits.BOWL.max}. ${c.rulesConfirmedAt ? "Confirmed by owner." : "Not yet confirmed against your contest."}`,
    source: c.rules.source,
    asOf: c.rulesConfirmedAt ?? c.rules.sourceAsOf,
  });
  for (const f of forecasts) {
    ev.push({
      id: `hist:${f.key}`,
      kind: "history",
      title: `${f.name}: ${f.historySample} recent T20I(s)`,
      detail: `${f.factors.form.note}. ${f.factors.opportunity.note}. ${f.factors.venue.note}.${f.historyMatched ? ` Matched as "${f.historyName}" (${f.matchMethod}).` : " No history match — forecast is the role prior."}${f.staleHistory ? ` Last T20I in the data was ${f.lastT20I}: recent selection unknown — confirm they are in your contest pool.` : ""}`,
      source: histSrc,
      asOf: f.lastT20I,
    });
    if (f.factors.matchup.n > 0)
      ev.push({ id: `matchup:${f.key}`, kind: "matchup", title: `${f.name} vs opponent`, detail: f.factors.matchup.note, source: histSrc, asOf: f.lastT20I });
    ev.push({
      id: `lineup:${f.key}`,
      kind: "lineup",
      title: `${f.name}: ${f.lineup.replace("_", " ")}`,
      detail: f.lineup === "confirmed_xi" ? "In the announced playing XI." : f.lineup === "confirmed_out" ? "Not in the announced XI." : "XI not announced — availability uncertain.",
      source: loaded.origin === "owner" ? "Owner-entered lineup" : loaded.origin === "demo" ? "Synthetic demo" : "Provider squad (not an XI)",
      asOf: c.sourceAsOf,
    });
  }
  return ev;
}
