import { describe, expect, it } from "vitest";
import { benchReasons, eligibleCandidates, optimizeTeam, teamObjective } from "@/lib/domain/optimizer";
import { getRules } from "@/lib/domain/rules";
import { validateTeam } from "@/lib/domain/validate";
import type { ContestPlayer, RuleSet } from "@/lib/domain/types";
import { fakeForecasts, makePool, TEAM_A, TEAM_B } from "./fixtures";

const strict = getRules("dream11-t20-strict");
const expanded = getRules("dream11-t20-expanded");
const ctx = (over: Partial<{ rulesConfirmedAt: string | null; a: boolean; b: boolean; asOf: string | null }> = {}) => ({
  rulesConfirmedAt: "rulesConfirmedAt" in over ? over.rulesConfirmedAt! : "2026-10-12T10:00:00Z",
  lineupsConfirmed: { teamA: over.a ?? true, teamB: over.b ?? true },
  sourceAsOf: "asOf" in over ? over.asOf! : "2026-10-12T09:00:00Z",
  teamA: TEAM_A,
  teamB: TEAM_B,
});

// A known-valid XI from the fixture pool: A: WK1,BAT3,BAT4,AR7,BOWL9,BOWL10 ; B: WK1? use explicit keys
const VALID = ["A1", "A3", "A4", "A7", "A9", "A10", "B3", "B5", "B7", "B9", "B11"];

function sumCredits(pool: ContestPlayer[], keys: string[]) {
  return keys.reduce((s, k) => s + (pool.find((p) => p.key === k)!.credits ?? 0), 0);
}

describe("validateTeam", () => {
  it("accepts a valid XI and marks it ready only when every external fact is confirmed", () => {
    const pool = makePool();
    expect(sumCredits(pool, VALID)).toBeLessThanOrEqual(100);
    const v = validateTeam({ playerKeys: VALID, captainKey: "A1", viceCaptainKey: "B3" }, pool, strict, ctx());
    expect(v.violations).toEqual([]);
    expect(v.status).toBe("ready");
    expect(v.totals.roleCounts).toEqual({ WK: 1, BAT: 4, AR: 2, BOWL: 4 });
  });

  it("is only provisional when lineups or rules are unconfirmed", () => {
    const pool = makePool();
    const sel = { playerKeys: VALID, captainKey: "A1", viceCaptainKey: "B3" };
    expect(validateTeam(sel, pool, strict, ctx({ b: false })).status).toBe("valid_provisional");
    const noRules = validateTeam(sel, pool, strict, ctx({ rulesConfirmedAt: null }));
    expect(noRules.status).toBe("valid_provisional");
    expect(noRules.readinessBlockers.map((b) => b.code)).toContain("RULES_UNCONFIRMED");
    const squadOnly = makePool({ A1: { lineup: "squad" } });
    expect(validateTeam(sel, squadOnly, strict, ctx()).readinessBlockers.map((b) => b.code)).toContain(
      "PLAYER_NOT_CONFIRMED_XI",
    );
  });

  it("rejects duplicates, wrong size and players outside the pool", () => {
    const pool = makePool();
    const dup = validateTeam({ playerKeys: [...VALID.slice(0, 10), "A1"], captainKey: "A1", viceCaptainKey: "B3" }, pool, strict);
    expect(dup.violations.map((v) => v.code)).toContain("DUPLICATE");
    const ten = validateTeam({ playerKeys: VALID.slice(0, 10), captainKey: "A1", viceCaptainKey: "B3" }, pool, strict);
    expect(ten.violations.map((v) => v.code)).toContain("WRONG_SIZE");
    const ghost = validateTeam({ playerKeys: [...VALID.slice(0, 10), "Z9"], captainKey: "A1", viceCaptainKey: "B3" }, pool, strict);
    expect(ghost.violations.map((v) => v.code)).toContain("NOT_IN_POOL");
  });

  it("enforces credit cap at the boundary (exactly 100 ok, 100.5 not)", () => {
    const base = makePool();
    const current = sumCredits(base, VALID);
    // push A1's credits so the XI totals exactly 100, then 100.5
    const exact = makePool({ A1: { credits: base.find((p) => p.key === "A1")!.credits! + (100 - current) } });
    expect(validateTeam({ playerKeys: VALID, captainKey: "A1", viceCaptainKey: "B3" }, exact, strict).valid).toBe(true);
    const over = makePool({ A1: { credits: base.find((p) => p.key === "A1")!.credits! + (100.5 - current) } });
    const v = validateTeam({ playerKeys: VALID, captainKey: "A1", viceCaptainKey: "B3" }, over, strict);
    expect(v.violations.map((x) => x.code)).toEqual(["CREDITS_OVER_CAP"]);
  });

  it("enforces role min/max under strict rules but not under expanded rules", () => {
    const pool = makePool();
    // two bowlers only (strict needs ≥3)
    const twoBowl = ["A1", "A3", "A4", "A5", "A7", "A9", "B3", "B4", "B5", "B7", "B10"];
    const s = validateTeam({ playerKeys: twoBowl, captainKey: "A1", viceCaptainKey: "B3" }, pool, strict);
    expect(s.violations.some((v) => v.code === "ROLE_MIN" && v.message.startsWith("BOWL"))).toBe(true);
    const e = validateTeam({ playerKeys: twoBowl, captainKey: "A1", viceCaptainKey: "B3" }, pool, expanded);
    expect(e.violations.filter((v) => v.code.startsWith("ROLE"))).toEqual([]);
    // 5 WK impossible in strict (max 4)
    const pool5 = makePool({ A3: { role: "WK" }, A4: { role: "WK" }, B3: { role: "WK" } });
    const fiveWk = ["A1", "A2", "A3", "A4", "B3", "A7", "A9", "A10", "B7", "B9", "B11"];
    const v5 = validateTeam({ playerKeys: fiveWk, captainKey: "A1", viceCaptainKey: "B3" }, pool5, strict);
    expect(v5.violations.some((v) => v.code === "ROLE_MAX" && v.message.startsWith("WK"))).toBe(true);
  });

  it("enforces max players from one real team", () => {
    const pool = makePool();
    const eightA = ["A1", "A3", "A4", "A5", "A7", "A9", "A10", "A11", "B3", "B7", "B9"];
    const v = validateTeam({ playerKeys: eightA, captainKey: "A1", viceCaptainKey: "B3" }, pool, strict);
    expect(v.violations.map((x) => x.code)).toContain("TEAM_MAX");
    expect(validateTeam({ playerKeys: eightA, captainKey: "A1", viceCaptainKey: "B3" }, pool, expanded).valid).toBe(true);
  });

  it("rejects captain = vice-captain and C/VC outside the XI", () => {
    const pool = makePool();
    const same = validateTeam({ playerKeys: VALID, captainKey: "A1", viceCaptainKey: "A1" }, pool, strict);
    expect(same.violations.map((v) => v.code)).toContain("CAPTAIN_EQUALS_VC");
    const outside = validateTeam({ playerKeys: VALID, captainKey: "A2", viceCaptainKey: null }, pool, strict);
    expect(outside.violations.map((v) => v.code)).toEqual(expect.arrayContaining(["CAPTAIN_NOT_IN_XI", "VC_MISSING"]));
  });

  it("rejects a confirmed non-participant and unknown credits (never estimated)", () => {
    const pool = makePool({ A3: { lineup: "confirmed_out" }, B5: { credits: null } });
    const v = validateTeam({ playerKeys: VALID, captainKey: "A1", viceCaptainKey: "B3" }, pool, strict);
    const codes = v.violations.map((x) => x.code);
    expect(codes).toContain("CONFIRMED_OUT");
    expect(codes).toContain("UNKNOWN_CREDITS");
    expect(v.totals.credits).toBeNull();
  });
});

describe("optimizeTeam", () => {
  function bruteForce(pool: ContestPlayer[], scores: Map<string, number>, rules: RuleSet) {
    // exhaustive over all 11-subsets of a small pool
    const keys = pool.map((p) => p.key);
    let best = -Infinity;
    const n = keys.length;
    const pick: string[] = [];
    const rec = (i: number) => {
      if (pick.length === 11) {
        const v = validateTeam({ playerKeys: pick, captainKey: pick[0], viceCaptainKey: pick[1] }, pool, rules);
        if (v.violations.every((x) => x.code.startsWith("CAPTAIN") || x.code.startsWith("VC"))) {
          best = Math.max(best, teamObjective(pick.map((k) => scores.get(k)!), rules));
        }
        return;
      }
      if (i >= n || n - i < 11 - pick.length) return;
      pick.push(keys[i]);
      rec(i + 1);
      pick.pop();
      rec(i + 1);
    };
    rec(0);
    return best;
  }

  it("finds the exact optimum (matches brute force) and returns a valid team with distinct C/VC", () => {
    const pool = makePool().filter((p) => !["A6", "B6", "A2", "B2"].includes(p.key)); // 18 players
    const fc = fakeForecasts(pool);
    const { candidates, exclusions } = eligibleCandidates(pool, fc);
    const r = optimizeTeam(candidates, strict, [TEAM_A, TEAM_B], { exclusions });
    expect(r.feasible).toBe(true);
    expect(r.optimal).toBe(true);
    const scores = new Map([...fc.entries()].map(([k, f]) => [k, f.rankingScore]));
    expect(r.objective).toBeCloseTo(bruteForce(pool, scores, strict), 1);
    const v = validateTeam({ playerKeys: r.playerKeys, captainKey: r.captainKey, viceCaptainKey: r.viceCaptainKey }, pool, strict);
    expect(v.valid).toBe(true);
    expect(r.captainKey).not.toBe(r.viceCaptainKey);
    // captain is the top ranking score in the XI
    const top = [...r.playerKeys].sort((a, b) => scores.get(b)! - scores.get(a)!)[0];
    expect(r.captainKey).toBe(top);
  });

  it("never selects confirmed-out or unknown-credit players", () => {
    const pool = makePool({ A1: { lineup: "confirmed_out" }, B1: { credits: null } });
    const fc = fakeForecasts(pool, { A1: 99, B1: 99 });
    const { candidates, exclusions } = eligibleCandidates(pool, fc);
    const r = optimizeTeam(candidates, strict, [TEAM_A, TEAM_B], { exclusions });
    expect(r.feasible).toBe(true);
    expect(r.playerKeys).not.toContain("A1");
    expect(r.playerKeys).not.toContain("B1");
    expect(exclusions.map((e) => e.reason).sort()).toEqual(["CONFIRMED_OUT", "UNKNOWN_CREDITS"]);
  });

  it("returns useful violations instead of relaxing rules when no XI is possible", () => {
    // all players cost 10 => any XI costs 110 > 100
    const pricey = makePool(Object.fromEntries(makePool().map((p) => [p.key, { credits: 10 }])));
    const fc = fakeForecasts(pricey);
    const { candidates, exclusions } = eligibleCandidates(pricey, fc);
    const r = optimizeTeam(candidates, strict, [TEAM_A, TEAM_B], { exclusions });
    expect(r.feasible).toBe(false);
    expect(r.playerKeys).toEqual([]);
    expect(r.violations.map((v) => v.code)).toContain("CREDITS_OVER_CAP");

    // only 2 bowlers in pool, strict needs 3
    const fewBowlers = makePool({ A9: { role: "BAT" }, A10: { role: "BAT" }, A11: { role: "BAT" }, B9: { role: "BAT" } });
    const c2 = eligibleCandidates(fewBowlers, fakeForecasts(fewBowlers));
    const r2 = optimizeTeam(c2.candidates, strict, [TEAM_A, TEAM_B], { exclusions: c2.exclusions });
    expect(r2.feasible).toBe(false);
    expect(r2.violations.some((v) => v.code === "ROLE_MIN" && v.message.includes("BOWL"))).toBe(true);
  });

  it("explains unknown credits when they make the pool too small", () => {
    const pool = makePool(Object.fromEntries(makePool().map((p) => [p.key, { credits: null }])));
    const { candidates, exclusions } = eligibleCandidates(pool, fakeForecasts(pool));
    const r = optimizeTeam(candidates, strict, [TEAM_A, TEAM_B], { exclusions });
    expect(r.feasible).toBe(false);
    expect(r.violations[0].message).toMatch(/unknown credits/);
  });

  it("respects locked players and gives bench reasons with valid swaps", () => {
    const pool = makePool();
    const fc = fakeForecasts(pool);
    const { candidates, exclusions } = eligibleCandidates(pool, fc);
    const locked = optimizeTeam(candidates, strict, [TEAM_A, TEAM_B], { exclusions, lockedKeys: ["B2"] });
    expect(locked.playerKeys).toContain("B2");
    expect(validateTeam({ playerKeys: locked.playerKeys, captainKey: locked.captainKey, viceCaptainKey: locked.viceCaptainKey }, pool, strict).valid).toBe(true);
    const r = optimizeTeam(candidates, strict, [TEAM_A, TEAM_B], { exclusions });
    const reasons = benchReasons(pool, fc, r, strict, exclusions);
    expect(reasons).toHaveLength(pool.length - 11);
    for (const br of reasons) {
      if (br.code === "LOWER_SCORE") {
        expect(br.scoreDelta).toBeLessThanOrEqual(0.0001);
        // the proposed swap must itself validate
        const keys = r.playerKeys.map((k) => (k === br.bestSwapKey ? br.key : k));
        const c = r.captainKey === br.bestSwapKey ? br.key : r.captainKey;
        const vc = r.viceCaptainKey === br.bestSwapKey ? br.key : r.viceCaptainKey;
        expect(validateTeam({ playerKeys: keys, captainKey: c, viceCaptainKey: vc }, pool, strict).valid).toBe(true);
      }
    }
  });

  it("revalidates swaps: an invalid swap is reported, a valid one passes", () => {
    const pool = makePool();
    const fc = fakeForecasts(pool);
    const { candidates } = eligibleCandidates(pool, fc);
    const r = optimizeTeam(candidates, strict, [TEAM_A, TEAM_B]);
    const bowlerIn = r.playerKeys.find((k) => pool.find((p) => p.key === k)!.role === "BOWL")!;
    const benchWk = pool.find((p) => p.role === "WK" && !r.playerKeys.includes(p.key))!;
    // replacing a bowler with a WK may break BOWL minimum; validation must catch whatever breaks
    const swapped = r.playerKeys.map((k) => (k === bowlerIn ? benchWk.key : k));
    const v = validateTeam({ playerKeys: swapped, captainKey: r.captainKey, viceCaptainKey: r.viceCaptainKey }, pool, strict);
    const bowlCount = swapped.filter((k) => pool.find((p) => p.key === k)!.role === "BOWL").length;
    expect(v.valid).toBe(bowlCount >= 3 && v.violations.length === 0);
    if (bowlCount < 3) expect(v.violations.map((x) => x.code)).toContain("ROLE_MIN");
  });
});
