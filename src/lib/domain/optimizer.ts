import { ROLES, type ContestPlayer, type PlayerForecast, type Role, type RuleSet, type Violation } from "./types";
import { validateTeam } from "./validate";
import { round } from "./weights";

export interface Candidate {
  key: string;
  name: string;
  team: string;
  role: Role;
  credits: number;
  score: number; // ranking score
}

export interface Exclusion {
  key: string;
  name: string;
  reason: "CONFIRMED_OUT" | "UNKNOWN_CREDITS" | "UNKNOWN_ROLE" | "EXCLUDED_BY_USER";
}

export interface OptimizeResult {
  feasible: boolean;
  optimal: boolean; // false only if node limit hit
  playerKeys: string[];
  captainKey: string | null;
  viceCaptainKey: string | null;
  objective: number | null;
  nodes: number;
  exclusions: Exclusion[];
  violations: Violation[]; // populated when infeasible
}

/** Objective for a fixed XI: Σ score + (cMult−1)·best + (vcMult−1)·second best. */
export function teamObjective(scores: number[], rules: RuleSet) {
  const sorted = [...scores].sort((a, b) => b - a);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return sum + (rules.captainMultiplier - 1) * (sorted[0] ?? 0) + (rules.viceCaptainMultiplier - 1) * (sorted[1] ?? 0);
}

export function eligibleCandidates(
  pool: ContestPlayer[],
  forecasts: Map<string, PlayerForecast>,
  excludedKeys: string[] = [],
): { candidates: Candidate[]; exclusions: Exclusion[] } {
  const candidates: Candidate[] = [];
  const exclusions: Exclusion[] = [];
  const excl = new Set(excludedKeys);
  for (const p of pool) {
    if (excl.has(p.key)) exclusions.push({ key: p.key, name: p.name, reason: "EXCLUDED_BY_USER" });
    else if (p.lineup === "confirmed_out") exclusions.push({ key: p.key, name: p.name, reason: "CONFIRMED_OUT" });
    else if (p.credits === null || !Number.isFinite(p.credits))
      exclusions.push({ key: p.key, name: p.name, reason: "UNKNOWN_CREDITS" });
    else if (!p.role) exclusions.push({ key: p.key, name: p.name, reason: "UNKNOWN_ROLE" });
    else
      candidates.push({
        key: p.key,
        name: p.name,
        team: p.team,
        role: p.role,
        credits: p.credits,
        score: forecasts.get(p.key)?.rankingScore ?? 0,
      });
  }
  return { candidates, exclusions };
}

/**
 * Exact branch-and-bound search for the XI maximising teamObjective subject to every rule.
 * Upper bound = objective of (chosen ∪ best remaining scores), which is valid because the objective
 * is monotone in the score multiset. Locked players are forced in.
 */
export function optimizeTeam(
  candidatesIn: Candidate[],
  rules: RuleSet,
  teams: [string, string],
  opts: { lockedKeys?: string[]; nodeLimit?: number; exclusions?: Exclusion[] } = {},
): OptimizeResult {
  const nodeLimit = opts.nodeLimit ?? 3_000_000;
  const locked = new Set(opts.lockedKeys ?? []);
  const cands = [...candidatesIn].sort((a, b) => b.score - a.score || a.credits - b.credits || a.key.localeCompare(b.key));
  const N = cands.length;
  const K = rules.players;
  const cm = rules.captainMultiplier - 1;
  const vm = rules.viceCaptainMultiplier - 1;

  // suffix aggregates for pruning
  const suffixRole: Record<Role, number>[] = [];
  const suffixTeam: Record<string, number>[] = [];
  const suffixLocked: number[] = [];
  const suffixCredits: number[][] = [];
  for (let i = N; i >= 0; i--) {
    const r = Object.fromEntries(ROLES.map((x) => [x, 0])) as Record<Role, number>;
    const t: Record<string, number> = { [teams[0]]: 0, [teams[1]]: 0 };
    if (i < N) {
      Object.assign(r, suffixRole[i + 1]);
      Object.assign(t, suffixTeam[i + 1]);
      r[cands[i].role] += 1;
      t[cands[i].team] = (t[cands[i].team] ?? 0) + 1;
    }
    suffixRole[i] = r;
    suffixTeam[i] = t;
    suffixLocked[i] = (i < N ? suffixLocked[i + 1] : 0) + (i < N && locked.has(cands[i].key) ? 1 : 0);
    suffixCredits[i] = i < N ? [...suffixCredits[i + 1], cands[i].credits].sort((a, b) => a - b) : [];
  }
  const prefixScore: number[] = [0];
  for (let i = 0; i < N; i++) prefixScore.push(prefixScore[i] + cands[i].score);

  let best = -Infinity;
  let bestSet: number[] | null = null;
  let nodes = 0;
  let aborted = false;
  const chosen: number[] = [];
  const roleCount = Object.fromEntries(ROLES.map((x) => [x, 0])) as Record<Role, number>;
  const teamCount: Record<string, number> = { [teams[0]]: 0, [teams[1]]: 0 };
  let credits = 0;
  let chosenScore = 0;

  const feasibleFrom = (i: number): boolean => {
    const k = K - chosen.length;
    if (N - i < k) return false;
    if (suffixLocked[i] > k) return false;
    // credits: cheapest k remaining must fit
    const sc = suffixCredits[i];
    let minC = 0;
    for (let j = 0; j < k; j++) minC += sc[j];
    if (credits + minC > rules.creditCap + 1e-9) return false;
    let need = 0;
    for (const r of ROLES) {
      const n = Math.max(0, rules.roleLimits[r].min - roleCount[r]);
      if (n > suffixRole[i][r]) return false;
      need += n;
    }
    for (const t of teams) {
      const n = Math.max(0, rules.minFromEachTeam - (teamCount[t] ?? 0));
      if (n > (suffixTeam[i][t] ?? 0)) return false;
      need += 0; // team mins overlap with role needs; checked independently
    }
    if (need > k) return false;
    return true;
  };

  const upperBound = (i: number) => {
    const k = K - chosen.length;
    const add = prefixScore[Math.min(N, i + k)] - prefixScore[i];
    // top two of chosen ∪ cands[i..i+k-1]: chosen are earlier (higher or equal) scores
    const s1 = chosen.length > 0 ? cands[chosen[0]].score : k > 0 && i < N ? cands[i].score : 0;
    const s2 =
      chosen.length > 1
        ? cands[chosen[1]].score
        : chosen.length === 1
          ? k > 0 && i < N
            ? cands[i].score
            : 0
          : k > 1 && i + 1 < N
            ? cands[i + 1].score
            : 0;
    return chosenScore + add + cm * s1 + vm * s2;
  };

  const dfs = (i: number) => {
    if (aborted) return;
    nodes++;
    if (nodes > nodeLimit) {
      aborted = true;
      return;
    }
    if (chosen.length === K) {
      if (suffixLocked[i] > 0) return; // a locked player was left out
      for (const r of ROLES) if (roleCount[r] < rules.roleLimits[r].min) return;
      for (const t of teams) if ((teamCount[t] ?? 0) < rules.minFromEachTeam) return;
      const obj = upperBound(i); // exact when k=0
      if (obj > best + 1e-9) {
        best = obj;
        bestSet = [...chosen];
      }
      return;
    }
    if (i >= N) return;
    if (!feasibleFrom(i)) return;
    if (upperBound(i) <= best + 1e-9) return;

    const c = cands[i];
    const canTake =
      roleCount[c.role] < rules.roleLimits[c.role].max &&
      (teamCount[c.team] ?? 0) < rules.maxFromOneTeam &&
      credits + c.credits <= rules.creditCap + 1e-9;
    if (canTake) {
      chosen.push(i);
      roleCount[c.role]++;
      teamCount[c.team] = (teamCount[c.team] ?? 0) + 1;
      credits += c.credits;
      chosenScore += c.score;
      dfs(i + 1);
      chosen.pop();
      roleCount[c.role]--;
      teamCount[c.team]--;
      credits -= c.credits;
      chosenScore -= c.score;
    }
    if (!locked.has(c.key)) dfs(i + 1);
  };
  dfs(0);

  if (!bestSet) {
    return {
      feasible: false,
      optimal: !aborted,
      playerKeys: [],
      captainKey: null,
      viceCaptainKey: null,
      objective: null,
      nodes,
      exclusions: opts.exclusions ?? [],
      violations: diagnoseInfeasible(candidatesIn, rules, teams, opts.exclusions ?? [], [...locked]),
    };
  }
  const set = (bestSet as number[]).map((idx) => cands[idx]);
  const byScore = [...set].sort((a, b) => b.score - a.score);
  return {
    feasible: true,
    optimal: !aborted,
    playerKeys: set.map((c) => c.key),
    captainKey: byScore[0]?.key ?? null,
    viceCaptainKey: byScore[1]?.key ?? null,
    objective: round(best, 2),
    nodes,
    exclusions: opts.exclusions ?? [],
    violations: [],
  };
}

/** Explains WHY no valid XI exists. Never relaxes a rule. */
export function diagnoseInfeasible(
  cands: Candidate[],
  rules: RuleSet,
  teams: [string, string],
  exclusions: Exclusion[],
  lockedKeys: string[] = [],
): Violation[] {
  const v: Violation[] = [];
  const unknownCredits = exclusions.filter((e) => e.reason === "UNKNOWN_CREDITS");
  const unknownRole = exclusions.filter((e) => e.reason === "UNKNOWN_ROLE");
  const out = exclusions.filter((e) => e.reason === "CONFIRMED_OUT");
  const suffix =
    (unknownCredits.length ? ` ${unknownCredits.length} player(s) have unknown credits.` : "") +
    (unknownRole.length ? ` ${unknownRole.length} have unknown contest roles.` : "") +
    (out.length ? ` ${out.length} are confirmed out.` : "");

  if (cands.length < rules.players) {
    v.push({
      code: "NO_FEASIBLE_TEAM",
      message: `Only ${cands.length} eligible players; ${rules.players} needed.${suffix}`,
      players: unknownCredits.map((e) => e.key),
    });
    return v; // the pool itself is too small; per-role/team messages would only repeat this
  }
  for (const r of ROLES) {
    const avail = cands.filter((c) => c.role === r).length;
    if (avail < rules.roleLimits[r].min)
      v.push({ code: "ROLE_MIN", message: `Only ${avail} eligible ${r}; minimum is ${rules.roleLimits[r].min}.` });
  }
  for (const t of teams) {
    const avail = cands.filter((c) => c.team === t).length;
    if (avail < rules.minFromEachTeam)
      v.push({ code: "TEAM_MIN", message: `Only ${avail} eligible players from ${t}; minimum ${rules.minFromEachTeam}.` });
  }
  const cap = teams.reduce((s, t) => s + Math.min(rules.maxFromOneTeam, cands.filter((c) => c.team === t).length), 0);
  if (cap < rules.players && cands.length >= rules.players)
    v.push({
      code: "TEAM_MAX",
      message: `With at most ${rules.maxFromOneTeam} per team only ${cap} players can be selected.`,
    });
  // cheapest role-feasible XI (greedy lower bound: cheapest role minimums + cheapest fill)
  const byCost = [...cands].sort((a, b) => a.credits - b.credits);
  const picked = new Set<string>();
  let cost = 0;
  for (const r of ROLES) {
    for (const c of byCost.filter((x) => x.role === r).slice(0, rules.roleLimits[r].min)) {
      picked.add(c.key);
      cost += c.credits;
    }
  }
  for (const c of byCost) {
    if (picked.size >= rules.players) break;
    if (!picked.has(c.key)) {
      picked.add(c.key);
      cost += c.credits;
    }
  }
  if (picked.size >= rules.players && cost > rules.creditCap + 1e-9)
    v.push({
      code: "CREDITS_OVER_CAP",
      message: `Even the cheapest role-valid XI costs about ${round(cost, 1)} credits; cap is ${rules.creditCap}.`,
    });
  if (lockedKeys.length)
    v.push({
      code: "NO_FEASIBLE_TEAM",
      message: `${lockedKeys.length} locked player(s) may make the rules unsatisfiable; unlock some and retry.`,
      players: lockedKeys,
    });
  if (!v.length)
    v.push({
      code: "NO_FEASIBLE_TEAM",
      message: `No XI satisfies credits, roles and team limits together (exhaustive search).${suffix}`,
    });
  return v;
}

export interface BenchReason {
  key: string;
  code: "CONFIRMED_OUT" | "UNKNOWN_CREDITS" | "UNKNOWN_ROLE" | "EXCLUDED_BY_USER" | "LOWER_SCORE" | "CONSTRAINT";
  text: string;
  bestSwapKey: string | null;
  scoreDelta: number | null; // objective change of best valid single swap (≤ 0 for an optimal XI)
}

/** Deterministic, match-specific bench reasons: best valid single swap or the binding constraint. */
export function benchReasons(
  pool: ContestPlayer[],
  forecasts: Map<string, PlayerForecast>,
  xi: { playerKeys: string[]; captainKey: string | null; viceCaptainKey: string | null },
  rules: RuleSet,
  exclusions: Exclusion[],
): BenchReason[] {
  const inXi = new Set(xi.playerKeys);
  const exclByKey = new Map(exclusions.map((e) => [e.key, e]));
  const scoreOf = (k: string) => forecasts.get(k)?.rankingScore ?? 0;
  const baseObj = teamObjective(xi.playerKeys.map(scoreOf), rules);
  const reasons: BenchReason[] = [];
  for (const p of pool) {
    if (inXi.has(p.key)) continue;
    const ex = exclByKey.get(p.key);
    if (ex) {
      const text =
        ex.reason === "CONFIRMED_OUT"
          ? "Not in the announced playing XI."
          : ex.reason === "UNKNOWN_CREDITS"
            ? "Credits unknown — enter contest credits to consider this player."
            : ex.reason === "UNKNOWN_ROLE"
              ? "Contest role unknown — set WK/BAT/AR/BOWL to consider this player."
              : "Excluded by you.";
      reasons.push({ key: p.key, code: ex.reason, text, bestSwapKey: null, scoreDelta: null });
      continue;
    }
    let bestDelta = -Infinity;
    let bestOut: string | null = null;
    const blockers = new Map<string, number>();
    for (const outKey of xi.playerKeys) {
      const keys = xi.playerKeys.map((k) => (k === outKey ? p.key : k));
      const c = xi.captainKey === outKey ? p.key : xi.captainKey;
      const vc = xi.viceCaptainKey === outKey ? p.key : xi.viceCaptainKey;
      const val = validateTeam({ playerKeys: keys, captainKey: c, viceCaptainKey: vc }, pool, rules);
      if (val.valid) {
        const d = teamObjective(keys.map(scoreOf), rules) - baseObj;
        if (d > bestDelta) {
          bestDelta = d;
          bestOut = outKey;
        }
      } else {
        for (const vio of val.violations) blockers.set(vio.code, (blockers.get(vio.code) ?? 0) + 1);
      }
    }
    if (bestOut) {
      const outName = pool.find((x) => x.key === bestOut)?.name ?? bestOut;
      reasons.push({
        key: p.key,
        code: "LOWER_SCORE",
        text: `Best valid swap (for ${outName}) lowers team ranking score by ${round(Math.abs(bestDelta), 1)}.`,
        bestSwapKey: bestOut,
        scoreDelta: round(bestDelta, 2),
      });
    } else {
      const top = [...blockers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const text =
        top === "CREDITS_OVER_CAP"
          ? `No single swap fits the ${rules.creditCap}-credit cap.`
          : top === "TEAM_MAX"
            ? `Adding would exceed ${rules.maxFromOneTeam} players from ${p.team}.`
            : top === "ROLE_MAX" || top === "ROLE_MIN"
              ? `No single swap keeps role limits valid.`
              : "No single valid swap available.";
      reasons.push({ key: p.key, code: "CONSTRAINT", text, bestSwapKey: null, scoreDelta: null });
    }
  }
  return reasons;
}
