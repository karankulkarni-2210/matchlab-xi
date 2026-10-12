import { FACTORS, ROLES, type FactorWeights, type RoleMultipliers } from "./types";

/** System default (v1). Owners start here; accepted proposals create new versions. */
export const DEFAULT_WEIGHTS: FactorWeights = { form: 0.45, opportunity: 0.25, venue: 0.2, matchup: 0.1 };
export const DEFAULT_ROLE_MULTIPLIERS: RoleMultipliers = { WK: 1, BAT: 1, AR: 1, BOWL: 1 };

/** Bounds every proposal (AI or deterministic) must satisfy before it can be shown for approval. */
export const WEIGHT_BOUNDS = {
  maxStep: 0.1, // per factor, absolute change vs current version
  minWeight: 0.05,
  maxWeight: 0.7,
  sumTolerance: 0.001,
  roleMultMin: 0.7,
  roleMultMax: 1.3,
  roleMultMaxStep: 0.15, // relative change vs current multiplier
};

export function round(n: number, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function isValidWeights(w: unknown): w is FactorWeights {
  if (!w || typeof w !== "object") return false;
  const rec = w as Record<string, unknown>;
  let sum = 0;
  for (const f of FACTORS) {
    const v = rec[f];
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
    if (v < WEIGHT_BOUNDS.minWeight - 1e-9 || v > WEIGHT_BOUNDS.maxWeight + 1e-9) return false;
    sum += v;
  }
  return Math.abs(sum - 1) <= WEIGHT_BOUNDS.sumTolerance;
}

export interface BoundCheck {
  ok: boolean;
  problems: string[];
}

/** Checks a proposed weight/multiplier set against the current version's bounds. No silent fixing. */
export function checkProposalBounds(
  current: { weights: FactorWeights; roleMultipliers: RoleMultipliers },
  proposed: { weights: FactorWeights; roleMultipliers: RoleMultipliers },
): BoundCheck {
  const problems: string[] = [];
  let sum = 0;
  for (const f of FACTORS) {
    const v = proposed.weights[f];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      problems.push(`${f}: not a number`);
      continue;
    }
    sum += v;
    if (v < WEIGHT_BOUNDS.minWeight - 1e-9) problems.push(`${f}: ${v} below minimum ${WEIGHT_BOUNDS.minWeight}`);
    if (v > WEIGHT_BOUNDS.maxWeight + 1e-9) problems.push(`${f}: ${v} above maximum ${WEIGHT_BOUNDS.maxWeight}`);
    const step = Math.abs(v - current.weights[f]);
    if (step > WEIGHT_BOUNDS.maxStep + 1e-9)
      problems.push(`${f}: change ${round(step, 3)} exceeds max step ${WEIGHT_BOUNDS.maxStep}`);
  }
  if (Math.abs(sum - 1) > WEIGHT_BOUNDS.sumTolerance) problems.push(`weights sum to ${round(sum, 4)}, must be 1`);
  for (const r of ROLES) {
    const m = proposed.roleMultipliers[r];
    if (typeof m !== "number" || !Number.isFinite(m)) {
      problems.push(`${r} multiplier: not a number`);
      continue;
    }
    if (m < WEIGHT_BOUNDS.roleMultMin - 1e-9 || m > WEIGHT_BOUNDS.roleMultMax + 1e-9)
      problems.push(`${r} multiplier ${m} outside [${WEIGHT_BOUNDS.roleMultMin}, ${WEIGHT_BOUNDS.roleMultMax}]`);
    const cur = current.roleMultipliers[r];
    if (Math.abs(m - cur) / cur > WEIGHT_BOUNDS.roleMultMaxStep + 1e-9)
      problems.push(`${r} multiplier change exceeds ${WEIGHT_BOUNDS.roleMultMaxStep * 100}%`);
  }
  return { ok: problems.length === 0, problems };
}
