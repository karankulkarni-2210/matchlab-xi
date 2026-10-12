import { replayPrediction } from "./forecast";
import { errorStats, type ErrorStats } from "./metrics";
import { FACTORS, ROLES, type Factor, type FactorWeights, type Role, type RoleMultipliers } from "./types";
import { WEIGHT_BOUNDS, checkProposalBounds, round } from "./weights";

/**
 * Learning loop. Works only on stored, frozen inputs (factor estimates captured at prediction time)
 * and owner-entered actuals. Synthetic records are a separate dataset and never mix with real ones.
 */
export interface LearningRecord {
  matchId: string;
  teamId: string;
  playerKey: string;
  role: Role;
  predicted: number; // frozen predicted base
  actual: number;
  factors: Record<Factor, number>; // frozen factor estimates
  roleMultiplier: number; // multiplier in force when predicted
  weights: FactorWeights; // weights in force when predicted
  synthetic: boolean;
  contexts: string[]; // e.g. "captaincy-pick", "low-coverage", "high-scoring-venue"
}

export const GATE = {
  minRecords: 30, // qualifying player results overall
  minMatches: 3, // distinct matches overall
  minGroupRecords: 12, // records in a flagged group
  minGroupMatches: 3, // matches in a flagged group
  minAbsBias: 4, // points
  minRelBias: 0.12, // of mean predicted in group
  minConsistency: 0.6, // share of the group's matches whose mean error has the same sign
};

export interface GroupFinding {
  group: string; // "role:AR" or "context:low-coverage"
  label: string;
  stats: ErrorStats;
  consistentMatches: number;
  direction: "over" | "under";
  flagged: boolean;
  reasons: string[]; // why flagged / why not
}

export interface GateStatus {
  met: boolean;
  records: number;
  matches: number;
  requiredRecords: number;
  requiredMatches: number;
  messages: string[];
}

export function gateStatus(records: LearningRecord[]): GateStatus {
  const matches = new Set(records.map((r) => r.matchId)).size;
  const messages: string[] = [];
  if (records.length < GATE.minRecords)
    messages.push(`${records.length}/${GATE.minRecords} player results with actual points entered.`);
  if (matches < GATE.minMatches) messages.push(`${matches}/${GATE.minMatches} completed matches reviewed.`);
  return {
    met: records.length >= GATE.minRecords && matches >= GATE.minMatches,
    records: records.length,
    matches,
    requiredRecords: GATE.minRecords,
    requiredMatches: GATE.minMatches,
    messages,
  };
}

function analyseGroup(group: string, label: string, recs: LearningRecord[]): GroupFinding {
  const stats = errorStats(recs);
  const byMatch = new Map<string, number[]>();
  for (const r of recs) {
    const arr = byMatch.get(r.matchId) ?? [];
    arr.push(r.predicted - r.actual);
    byMatch.set(r.matchId, arr);
  }
  const direction: "over" | "under" = (stats.bias ?? 0) >= 0 ? "over" : "under";
  let consistent = 0;
  for (const errs of byMatch.values()) {
    const m = errs.reduce((a, b) => a + b, 0) / errs.length;
    if ((direction === "over" && m > 0) || (direction === "under" && m < 0)) consistent++;
  }
  const reasons: string[] = [];
  const absBias = Math.abs(stats.bias ?? 0);
  const relNeed = GATE.minRelBias * Math.abs(stats.meanPredicted ?? 0);
  const biasNeed = Math.max(GATE.minAbsBias, relNeed);
  const okN = stats.n >= GATE.minGroupRecords;
  const okM = stats.matches >= GATE.minGroupMatches;
  const okBias = absBias >= biasNeed;
  const okCons = stats.matches > 0 && consistent / stats.matches >= GATE.minConsistency;
  if (!okN) reasons.push(`only ${stats.n}/${GATE.minGroupRecords} results`);
  if (!okM) reasons.push(`only ${stats.matches}/${GATE.minGroupMatches} matches`);
  if (!okBias) reasons.push(`|bias| ${round(absBias, 1)} < ${round(biasNeed, 1)} pts threshold`);
  if (!okCons) reasons.push(`direction consistent in ${consistent}/${stats.matches} matches`);
  const flagged = okN && okM && okBias && okCons;
  if (flagged)
    reasons.push(
      `${direction === "over" ? "Overpredicted" : "Underpredicted"} by ${round(absBias, 1)} pts on average; same direction in ${consistent} of ${stats.matches} matches`,
    );
  return { group, label, stats, consistentMatches: consistent, direction, flagged, reasons };
}

export function detectPatterns(records: LearningRecord[]): GroupFinding[] {
  const out: GroupFinding[] = [];
  for (const role of ROLES) {
    const recs = records.filter((r) => r.role === role);
    if (recs.length) out.push(analyseGroup(`role:${role}`, roleLabel(role), recs));
  }
  const ctxs = new Set(records.flatMap((r) => r.contexts));
  for (const c of ctxs) {
    out.push(analyseGroup(`context:${c}`, contextLabel(c), records.filter((r) => r.contexts.includes(c))));
  }
  return out.sort((a, b) => Number(b.flagged) - Number(a.flagged) || Math.abs(b.stats.bias ?? 0) - Math.abs(a.stats.bias ?? 0));
}

export function roleLabel(r: Role) {
  return { WK: "Wicketkeepers", BAT: "Batters", AR: "All-rounders", BOWL: "Bowlers" }[r];
}
export function contextLabel(c: string) {
  const map: Record<string, string> = {
    "captaincy-pick": "Captain / vice-captain picks",
    "low-coverage": "Low evidence coverage (<50%)",
    "high-scoring-venue": "High-scoring venues",
    "chasing-venue": "Chase-friendly venues",
  };
  return map[c] ?? c;
}

/** MAE of replayed predictions under a candidate weight/multiplier set (in-sample replay). */
export function replayMae(records: LearningRecord[], weights: FactorWeights, mult: RoleMultipliers) {
  if (!records.length) return null;
  let s = 0;
  for (const r of records) s += Math.abs(replayPrediction(r.factors, r.role, weights, mult) - r.actual);
  return round(s / records.length, 2);
}
export function replayBias(records: LearningRecord[], weights: FactorWeights, mult: RoleMultipliers) {
  if (!records.length) return null;
  let s = 0;
  for (const r of records) s += replayPrediction(r.factors, r.role, weights, mult) - r.actual;
  return round(s / records.length, 2);
}

export interface Candidate {
  weights: FactorWeights;
  roleMultipliers: RoleMultipliers;
  backtest: { currentMae: number | null; candidateMae: number | null; currentBias: number | null; candidateBias: number | null; n: number; note: string };
  changes: string[];
}

/**
 * Deterministic bounded candidate:
 *  1. For each flagged role: multiplier' = m · clamp(1 − shrink·bias/meanPred, 1 ± roleMultMaxStep), shrink = n/(n+20)
 *  2. Factor weights: grid search (step 0.05) over vectors within ±maxStep of current, each ≥ minWeight, sum 1,
 *     minimising replay MAE with the new multipliers. Ties keep the current weights.
 */
export function buildCandidate(
  records: LearningRecord[],
  current: { weights: FactorWeights; roleMultipliers: RoleMultipliers },
  findings: GroupFinding[],
): Candidate {
  const mult: RoleMultipliers = { ...current.roleMultipliers };
  const changes: string[] = [];
  for (const f of findings) {
    if (!f.flagged || !f.group.startsWith("role:")) continue;
    const role = f.group.slice(5) as Role;
    const { bias, meanPredicted, n } = f.stats;
    if (bias === null || !meanPredicted) continue;
    const shrinkF = n / (n + 20);
    const factor = Math.min(1 + WEIGHT_BOUNDS.roleMultMaxStep, Math.max(1 - WEIGHT_BOUNDS.roleMultMaxStep, 1 - (shrinkF * bias) / meanPredicted));
    const next = round(Math.min(WEIGHT_BOUNDS.roleMultMax, Math.max(WEIGHT_BOUNDS.roleMultMin, current.roleMultipliers[role] * factor)), 3);
    if (next !== current.roleMultipliers[role]) {
      mult[role] = next;
      changes.push(`${roleLabel(role)} multiplier ${current.roleMultipliers[role]} → ${next}`);
    }
  }

  // grid search over weights
  const step = 0.05;
  const ranges = FACTORS.map((f) => {
    const lo = Math.max(WEIGHT_BOUNDS.minWeight, current.weights[f] - WEIGHT_BOUNDS.maxStep);
    const hi = Math.min(WEIGHT_BOUNDS.maxWeight, current.weights[f] + WEIGHT_BOUNDS.maxStep);
    const vals: number[] = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) vals.push(round(v, 2));
    if (!vals.includes(round(current.weights[f], 2))) vals.push(round(current.weights[f], 2));
    return vals;
  });
  let bestW = { ...current.weights };
  let bestMae = replayMae(records, bestW, mult) ?? Infinity;
  const [r0, r1, r2] = ranges;
  for (const a of r0)
    for (const b of r1)
      for (const c of r2) {
        const d = round(1 - a - b - c, 2);
        const fLast = FACTORS[3];
        if (d < WEIGHT_BOUNDS.minWeight - 1e-9 || Math.abs(d - current.weights[fLast]) > WEIGHT_BOUNDS.maxStep + 1e-9) continue;
        const w = { [FACTORS[0]]: a, [FACTORS[1]]: b, [FACTORS[2]]: c, [fLast]: d } as FactorWeights;
        const mae = replayMae(records, w, mult) ?? Infinity;
        if (mae < bestMae - 0.05) {
          bestMae = mae;
          bestW = w;
        }
      }
  for (const f of FACTORS)
    if (round(bestW[f], 2) !== round(current.weights[f], 2))
      changes.push(`${f} weight ${round(current.weights[f] * 100, 0)}% → ${round(bestW[f] * 100, 0)}%`);

  return {
    weights: bestW,
    roleMultipliers: mult,
    backtest: {
      currentMae: replayMae(records, current.weights, current.roleMultipliers),
      candidateMae: replayMae(records, bestW, mult),
      currentBias: replayBias(records, current.weights, current.roleMultipliers),
      candidateBias: replayBias(records, bestW, mult),
      n: records.length,
      note: "In-sample replay on the same records used to fit; not evidence of future improvement.",
    },
    changes,
  };
}

/** Validates an AI-proposed set. Invalid proposals are rejected (never silently clipped). */
export function validateAiProposal(
  current: { weights: FactorWeights; roleMultipliers: RoleMultipliers },
  proposed: { weights: FactorWeights; roleMultipliers: RoleMultipliers },
) {
  return checkProposalBounds(current, proposed);
}
