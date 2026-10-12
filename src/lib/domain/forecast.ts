import { round } from "./weights";
import type {
  ContestPlayer,
  Factor,
  FactorEstimate,
  FactorWeights,
  LineupStatus,
  PlayerForecast,
  Role,
  RoleMultipliers,
} from "./types";

/**
 * MatchLab forecast model, version f1. Every number here is reproducible from stored inputs.
 *
 * Units: Dream11 T20 base points (before captain/vice-captain multipliers), including the +4
 * announced-lineup points. Player history comes from Cricsheet ball-by-ball data scored with
 * MatchLab's documented approximation of Dream11 T20 points (see scoring.ts).
 *
 *   baseline_p  = (n_b·mean(last ≤20 pts) + K_BASE·prior_role) / (n_b + K_BASE)
 *   form_p      = (n_f·recencyMean(last ≤5, weights 5..1) + K_FORM·baseline) / (n_f + K_FORM)
 *   opportunity = baseline · (1 + (clamp(inv5/inv20, 0.6, 1.4) − 1) · n_f/(n_f + K_FORM)),
 *                 inv = balls faced + balls bowled per match
 *   venue_p     = (n_v·mean(pts at venue) + K_VENUE·ctx) / (n_v + K_VENUE),
 *                 ctx = 4 + bat_b·batIdx* + bowl_b·bowlIdx* + field_b, idx* = 1 + (idx−1)·N/(N+30)
 *   matchup_p   = (n_m·mean(pts vs opponent) + K_MATCHUP·baseline) / (n_m + K_MATCHUP)
 *   predicted   = roleMult[role] · Σ_f w_f · factor_f
 *   coverage    = Σ_f w_f · min(1, n_f / target_f)          targets: form 5, opp 10, venue 3, matchup 3
 *   uncertainty = sd_shrunk · (1 + 0.5·(1 − coverage))        sd_shrunk pools player SD with role SD
 *   ranking     = predicted · availability · (0.9 + 0.1·coverage)
 *   availability: confirmed XI 1.0, probable 0.9, squad only 0.75, confirmed out 0
 */
export const FORECAST_VERSION = "f1";

export const K_BASE = 4;
export const K_FORM = 2;
export const K_VENUE = 3;
export const K_MATCHUP = 3;
export const VENUE_INDEX_SHRINK = 30;
export const COVERAGE_TARGETS: Record<Factor, number> = { form: 5, opportunity: 10, venue: 3, matchup: 3 };

/** Assumed role priors (documented assumption, scaled by the dataset's global mean). */
export const ROLE_PRIOR_FACTOR: Record<Role, number> = { WK: 1.0, BAT: 1.0, AR: 1.15, BOWL: 0.95 };
export const ROLE_PRIOR_SD: Record<Role, number> = { WK: 22, BAT: 22, AR: 26, BOWL: 21 };

export const AVAILABILITY: Record<LineupStatus, number> = {
  confirmed_xi: 1,
  probable: 0.9,
  squad: 0.75,
  confirmed_out: 0,
};

export interface HistoryRec {
  date: string;
  venueKey: string;
  team: string;
  opp: string;
  pts: number;
  batPts: number;
  bowlPts: number;
  fieldPts: number;
  ballsFaced: number;
  ballsBowled: number;
  runs: number;
  wickets: number;
}

export interface PlayerHistory {
  id: string;
  name: string;
  recs: HistoryRec[]; // most recent first
}

export interface VenueProfile {
  key: string;
  name: string;
  matches: number;
  avgFirstInnings: number | null;
  avgSecondInnings: number | null;
  chaseWinPct: number | null;
  batIndex: number | null;
  bowlIndex: number | null;
  batIndexN: number;
  bowlIndexN: number;
}

export interface ForecastContext {
  venue: VenueProfile | null;
  /** opponent name as it appears in history, keyed by the player's team in the contest */
  opponentHistoryName: Record<string, string | null>;
  globalMeanPts: number;
  weights: FactorWeights;
  roleMultipliers: RoleMultipliers;
  /** Only use history strictly before this date (prevents leakage when replaying). */
  asOfDate?: string;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const shrink = (n: number, raw: number, k: number, prior: number) => (n * raw + k * prior) / (n + k);

export function rolePrior(role: Role | null, globalMeanPts: number) {
  const r = role ?? "BAT";
  return { mean: globalMeanPts * ROLE_PRIOR_FACTOR[r], sd: ROLE_PRIOR_SD[r] };
}

export function forecastPlayer(
  player: ContestPlayer,
  history: PlayerHistory | null,
  ctx: ForecastContext,
): PlayerForecast {
  const prior = rolePrior(player.role, ctx.globalMeanPts);
  const recsAll = (history?.recs ?? []).filter((r) => !ctx.asOfDate || r.date < ctx.asOfDate);
  const last20 = recsAll.slice(0, 20);
  const last5 = recsAll.slice(0, 5);
  const nB = last20.length;
  const nF = last5.length;

  const baselineRaw = mean(last20.map((r) => r.pts));
  const baseline = shrink(nB, baselineRaw, K_BASE, prior.mean);

  // form: recency-weighted mean of last ≤5 (weights 5,4,3,2,1)
  let formRaw: number | null = null;
  if (nF) {
    let ws = 0;
    let acc = 0;
    last5.forEach((r, i) => {
      const w = 5 - i;
      ws += w;
      acc += w * r.pts;
    });
    formRaw = acc / ws;
  }
  const formEst = formRaw === null ? baseline : shrink(nF, formRaw, K_FORM, baseline);

  // opportunity: recent involvement vs long-run involvement
  const inv = (r: HistoryRec) => r.ballsFaced + r.ballsBowled;
  const inv5 = mean(last5.map(inv));
  const inv20 = mean(last20.map(inv));
  const ratio = inv20 > 0 ? clamp(inv5 / inv20, 0.6, 1.4) : 1;
  const ratioShrunk = 1 + (ratio - 1) * (nF / (nF + K_FORM));
  const oppEst = baseline * ratioShrunk;

  // venue: player at venue, shrunk toward venue-adjusted baseline
  const venue = ctx.venue;
  const atVenue = venue ? recsAll.filter((r) => r.venueKey === venue.key) : [];
  const nV = atVenue.length;
  let venueCtx = baseline;
  if (venue && nB > 0) {
    const bat = mean(last20.map((r) => r.batPts));
    const bowl = mean(last20.map((r) => r.bowlPts));
    const field = mean(last20.map((r) => r.fieldPts));
    const rawSum = bat + bowl + field;
    const scale = rawSum > 0 ? Math.max(0, baseline - 4) / rawSum : 0;
    const bi = venue.batIndex === null ? 1 : 1 + (venue.batIndex - 1) * (venue.batIndexN / (venue.batIndexN + VENUE_INDEX_SHRINK));
    const wi =
      venue.bowlIndex === null ? 1 : 1 + (venue.bowlIndex - 1) * (venue.bowlIndexN / (venue.bowlIndexN + VENUE_INDEX_SHRINK));
    venueCtx = 4 + scale * (bat * bi + bowl * wi + field);
  }
  const venueRaw = nV ? mean(atVenue.map((r) => r.pts)) : null;
  const venueEst = venueRaw === null ? venueCtx : shrink(nV, venueRaw, K_VENUE, venueCtx);

  // matchup: vs this opponent
  const opp = ctx.opponentHistoryName[player.team] ?? null;
  const vsOpp = opp ? recsAll.filter((r) => r.opp === opp) : [];
  const nM = vsOpp.length;
  const matchupRaw = nM ? mean(vsOpp.map((r) => r.pts)) : null;
  const matchupEst = matchupRaw === null ? baseline : shrink(nM, matchupRaw, K_MATCHUP, baseline);

  const factors: Record<Factor, FactorEstimate> = {
    form: {
      raw: formRaw === null ? null : round(formRaw, 1),
      n: nF,
      estimate: round(formEst, 2),
      note: nF ? `Recency-weighted ${round(formRaw!, 1)} pts over last ${nF} T20I(s)` : "No recent T20I history; uses baseline",
    },
    opportunity: {
      raw: nB ? round(ratio, 2) : null,
      n: nB,
      estimate: round(oppEst, 2),
      note: nB
        ? `Involvement ${round(inv5, 0)} balls/match recently vs ${round(inv20, 0)} long-run`
        : "No involvement history; uses role prior",
    },
    venue: {
      raw: venueRaw === null ? null : round(venueRaw, 1),
      n: nV,
      estimate: round(venueEst, 2),
      note: !venue
        ? "Venue not in history; uses baseline"
        : nV
          ? `${round(venueRaw!, 1)} pts avg in ${nV} T20I(s) at ${venue.name}`
          : `No T20Is at ${venue.name}; venue scoring index applied (${venue.matches} matches)`,
    },
    matchup: {
      raw: matchupRaw === null ? null : round(matchupRaw, 1),
      n: nM,
      estimate: round(matchupEst, 2),
      note: nM ? `${round(matchupRaw!, 1)} pts avg in ${nM} T20I(s) vs ${opp}` : `No T20Is vs ${opp ?? "opponent"}; uses baseline`,
    },
  };

  const w = ctx.weights;
  const blended =
    w.form * factors.form.estimate +
    w.opportunity * factors.opportunity.estimate +
    w.venue * factors.venue.estimate +
    w.matchup * factors.matchup.estimate;
  const roleMultiplier = ctx.roleMultipliers[player.role ?? "BAT"] ?? 1;
  const predictedBase = roleMultiplier * blended;

  const nByFactor: Record<Factor, number> = { form: nF, opportunity: nB, venue: nV, matchup: nM };
  const coverage =
    w.form * Math.min(1, nByFactor.form / COVERAGE_TARGETS.form) +
    w.opportunity * Math.min(1, nByFactor.opportunity / COVERAGE_TARGETS.opportunity) +
    w.venue * Math.min(1, nByFactor.venue / COVERAGE_TARGETS.venue) +
    w.matchup * Math.min(1, nByFactor.matchup / COVERAGE_TARGETS.matchup);

  const sdRaw = nB > 1 ? Math.sqrt(mean(last20.map((r) => (r.pts - baselineRaw) ** 2))) : 0;
  const sd = Math.sqrt((nB * sdRaw ** 2 + K_BASE * prior.sd ** 2) / (nB + K_BASE));
  const uncertainty = sd * (1 + 0.5 * (1 - coverage));

  const availability = AVAILABILITY[player.lineup];
  const rankingScore = predictedBase * availability * (0.9 + 0.1 * coverage);

  const evidenceIds = [`hist:${player.key}`];
  if (venue) evidenceIds.push(`venue:${venue.key}`);
  if (nM) evidenceIds.push(`matchup:${player.key}`);
  evidenceIds.push(`lineup:${player.key}`);

  return {
    key: player.key,
    name: player.name,
    team: player.team,
    role: player.role,
    credits: player.credits,
    lineup: player.lineup,
    factors,
    baseline: round(baseline, 2),
    roleMultiplier,
    predictedBase: round(predictedBase, 1),
    coverage: round(coverage, 3),
    uncertainty: round(uncertainty, 1),
    rankingScore: round(rankingScore, 2),
    availability,
    historyMatched: !!history,
    historySample: nB,
    evidenceIds,
  };
}

/** Recompute a prediction from stored factor estimates under a different weight version (learning replay). */
export function replayPrediction(
  factorEstimates: Record<Factor, number>,
  role: Role,
  weights: FactorWeights,
  roleMultipliers: RoleMultipliers,
) {
  const blended =
    weights.form * factorEstimates.form +
    weights.opportunity * factorEstimates.opportunity +
    weights.venue * factorEstimates.venue +
    weights.matchup * factorEstimates.matchup;
  return roleMultipliers[role] * blended;
}
