import { describe, expect, it } from "vitest";
import { forecastPlayer, replayPrediction, type HistoryRec } from "@/lib/domain/forecast";
import { buildCandidate, detectPatterns, gateStatus, validateAiProposal, type LearningRecord } from "@/lib/domain/learning";
import { computeTeamMetrics, parseActualInput, type ResultRow } from "@/lib/domain/metrics";
import { DEFAULT_ROLE_MULTIPLIERS, DEFAULT_WEIGHTS, checkProposalBounds } from "@/lib/domain/weights";
import type { Role } from "@/lib/domain/types";

describe("actual points input", () => {
  it("distinguishes blank (not entered) from zero", () => {
    expect(parseActualInput("")).toEqual({ ok: true, value: null });
    expect(parseActualInput("   ")).toEqual({ ok: true, value: null });
    expect(parseActualInput("0")).toEqual({ ok: true, value: 0 });
    expect(parseActualInput("-2")).toEqual({ ok: true, value: -2 });
    expect(parseActualInput("12.5")).toEqual({ ok: true, value: 12.5 });
    expect(parseActualInput("abc").ok).toBe(false);
    expect(parseActualInput("12.3").ok).toBe(false);
    expect(parseActualInput("9999").ok).toBe(false);
  });
});

describe("team metrics", () => {
  const rows: ResultRow[] = [
    { key: "c", name: "C", role: "AR", predictedBase: 50, actualBase: 40, multiplier: 2 },
    { key: "vc", name: "VC", role: "BAT", predictedBase: 40, actualBase: 0, multiplier: 1.5 },
    { key: "p", name: "P", role: "BOWL", predictedBase: 30, actualBase: null, multiplier: 1 },
  ];

  it("applies C/VC multipliers exactly once and hides the final total until complete", () => {
    const m = computeTeamMetrics(rows);
    expect(m.predictedTotal).toBe(50 * 2 + 40 * 1.5 + 30); // 190
    expect(m.actualTotal).toBeNull();
    expect(m.partialActualTotal).toBe(40 * 2 + 0 * 1.5); // 80 — zero counts, blank excluded
    expect(m.nEntered).toBe(2);
    const done = computeTeamMetrics(rows.map((r) => (r.key === "p" ? { ...r, actualBase: 30 } : r)));
    expect(done.complete).toBe(true);
    expect(done.actualTotal).toBe(80 + 30);
  });

  it("computes MAE and signed bias (predicted − actual) over entered players only", () => {
    const m = computeTeamMetrics(rows);
    // errors: +10, +40 ; blank excluded
    expect(m.mae).toBe(25);
    expect(m.bias).toBe(25);
    expect(m.perPlayer.find((p) => p.key === "vc")!.error).toBe(40);
    expect(m.perPlayer.find((p) => p.key === "p")!.error).toBeNull();
    const under = computeTeamMetrics([{ key: "x", name: "X", role: "BAT", predictedBase: 10, actualBase: 30, multiplier: 1 }]);
    expect(under.bias).toBe(-20);
    expect(under.mae).toBe(20);
  });
});

function rec(matchId: string, role: Role, predicted: number, actual: number, synthetic = false): LearningRecord {
  return {
    matchId,
    teamId: `t-${matchId}`,
    playerKey: `${matchId}-${role}-${predicted}-${actual}`,
    role,
    predicted,
    actual,
    factors: { form: predicted * 1.1, opportunity: predicted, venue: predicted * 0.9, matchup: predicted },
    roleMultiplier: 1,
    weights: DEFAULT_WEIGHTS,
    synthetic,
    contexts: [],
  };
}

describe("learning loop", () => {
  it("blocks proposals below the minimum-evidence gate", () => {
    const one = Array.from({ length: 11 }, (_, i) => rec("m1", "AR", 40, 20 + i));
    const g = gateStatus(one);
    expect(g.met).toBe(false);
    expect(g.messages.join(" ")).toMatch(/11\/30/);
    expect(g.messages.join(" ")).toMatch(/1\/3/);
    // a single match never flags a pattern even with a huge bias
    expect(detectPatterns(one).every((f) => !f.flagged)).toBe(true);
  });

  it("flags a repeated, consistent role bias and proposes a bounded correction", () => {
    const records: LearningRecord[] = [];
    for (let m = 0; m < 6; m++) {
      for (let i = 0; i < 3; i++) records.push(rec(`m${m}`, "AR", 40, 28 + i)); // AR overpredicted ~11
      for (let i = 0; i < 4; i++) records.push(rec(`m${m}`, "BAT", 30, 28 + (i % 3) * 2)); // ~unbiased
    }
    expect(gateStatus(records).met).toBe(true);
    const findings = detectPatterns(records);
    const ar = findings.find((f) => f.group === "role:AR")!;
    expect(ar.flagged).toBe(true);
    expect(ar.direction).toBe("over");
    expect(ar.consistentMatches).toBe(6);
    expect(findings.find((f) => f.group === "role:BAT")!.flagged).toBe(false);

    const current = { weights: DEFAULT_WEIGHTS, roleMultipliers: DEFAULT_ROLE_MULTIPLIERS };
    const cand = buildCandidate(records, current, findings);
    expect(cand.roleMultipliers.AR).toBeLessThan(1);
    expect(cand.roleMultipliers.BAT).toBe(1);
    expect(checkProposalBounds(current, cand).ok).toBe(true);
    expect(cand.backtest.candidateMae!).toBeLessThan(cand.backtest.currentMae!);
  });

  it("rejects out-of-bounds or malformed AI proposals instead of clipping them", () => {
    const current = { weights: DEFAULT_WEIGHTS, roleMultipliers: DEFAULT_ROLE_MULTIPLIERS };
    const jump = validateAiProposal(current, {
      weights: { form: 0.7, opportunity: 0.1, venue: 0.1, matchup: 0.1 },
      roleMultipliers: DEFAULT_ROLE_MULTIPLIERS,
    });
    expect(jump.ok).toBe(false);
    expect(jump.problems.join(" ")).toMatch(/max step/);
    const badSum = validateAiProposal(current, {
      weights: { form: 0.5, opportunity: 0.25, venue: 0.2, matchup: 0.1 },
      roleMultipliers: DEFAULT_ROLE_MULTIPLIERS,
    });
    expect(badSum.problems.join(" ")).toMatch(/sum/);
    const nan = validateAiProposal(current, {
      weights: { form: Number.NaN, opportunity: 0.25, venue: 0.2, matchup: 0.1 } as never,
      roleMultipliers: { ...DEFAULT_ROLE_MULTIPLIERS, AR: 0.5 },
    });
    expect(nan.ok).toBe(false);
  });

  it("a new weight version changes future predictions but replays past inputs deterministically", () => {
    const factors = { form: 40, opportunity: 30, venue: 20, matchup: 10 };
    const v1 = replayPrediction(factors, "AR", DEFAULT_WEIGHTS, DEFAULT_ROLE_MULTIPLIERS);
    expect(v1).toBeCloseTo(0.45 * 40 + 0.25 * 30 + 0.2 * 20 + 0.1 * 10, 6);
    const v2 = replayPrediction(factors, "AR", { form: 0.5, opportunity: 0.2, venue: 0.2, matchup: 0.1 }, { ...DEFAULT_ROLE_MULTIPLIERS, AR: 0.9 });
    expect(v2).not.toBeCloseTo(v1, 3);
    // the frozen value is what was stored; replaying v1 again reproduces it
    expect(replayPrediction(factors, "AR", DEFAULT_WEIGHTS, DEFAULT_ROLE_MULTIPLIERS)).toBe(v1);
  });
});

describe("forecast formulas", () => {
  const recs = (pts: number[], venueKey = "v1", opp = "Bravo"): HistoryRec[] =>
    pts.map((p, i) => ({
      date: `2026-0${(9 - Math.floor(i / 5)) as number}-${String(28 - (i % 5)).padStart(2, "0")}`,
      venueKey,
      team: "Alpha",
      opp,
      pts: p,
      batPts: p - 4,
      bowlPts: 0,
      fieldPts: 0,
      ballsFaced: 20,
      ballsBowled: 0,
      runs: p - 4,
      wickets: 0,
    }));
  const ctx = {
    venue: { key: "v1", name: "Test Ground", matches: 10, avgFirstInnings: 170, avgSecondInnings: 160, chaseWinPct: 50, batIndex: 1, bowlIndex: 1, batIndexN: 100, bowlIndexN: 100 },
    opponentHistoryName: { Alpha: "Bravo" },
    globalMeanPts: 25,
    weights: DEFAULT_WEIGHTS,
    roleMultipliers: DEFAULT_ROLE_MULTIPLIERS,
  };
  const player = { key: "p", name: "P", team: "Alpha", role: "BAT" as Role, credits: 9, lineup: "confirmed_xi" as const };

  it("separates predicted base, ranking score, coverage and uncertainty", () => {
    const f = forecastPlayer(player, { id: "x", name: "P", recs: recs(Array(20).fill(40)) }, ctx);
    // constant 40-pt history: every factor converges to 40 after shrinkage toward a lower prior
    expect(f.factors.form.estimate).toBeGreaterThan(35);
    expect(f.coverage).toBe(1);
    expect(f.rankingScore).toBeCloseTo(f.predictedBase * 1 * (0.9 + 0.1 * 1), 1);
    expect(f.uncertainty).toBeGreaterThan(0);
  });

  it("falls back to the role prior with zero coverage when no history matches", () => {
    const f = forecastPlayer(player, null, ctx);
    expect(f.historyMatched).toBe(false);
    expect(f.coverage).toBe(0);
    expect(f.predictedBase).toBeCloseTo(25, 0);
    expect(f.uncertainty).toBeGreaterThan(22); // inflated for missing evidence
  });

  it("does not use history on or after the as-of date (no leakage in replays)", () => {
    const h = { id: "x", name: "P", recs: recs([100, 10, 10, 10, 10]) };
    const all = forecastPlayer(player, h, ctx);
    const cut = forecastPlayer(player, h, { ...ctx, asOfDate: h.recs[0].date });
    expect(cut.historySample).toBe(4);
    expect(cut.predictedBase).toBeLessThan(all.predictedBase);
  });

  it("applies lower availability to unconfirmed lineups in ranking only", () => {
    const h = { id: "x", name: "P", recs: recs(Array(10).fill(30)) };
    const conf = forecastPlayer(player, h, ctx);
    const squad = forecastPlayer({ ...player, lineup: "squad" }, h, ctx);
    expect(squad.predictedBase).toBe(conf.predictedBase);
    expect(squad.rankingScore).toBeLessThan(conf.rankingScore);
  });
});
