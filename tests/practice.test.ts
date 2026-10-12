import { describe, expect, it } from "vitest";
import { illustrativeCredits, PRACTICE_MAX, PRACTICE_MIN, withIllustrativeCredits } from "@/lib/domain/practice";
import { eligibleCandidates, optimizeTeam } from "@/lib/domain/optimizer";
import { getRules } from "@/lib/domain/rules";
import { validateTeam } from "@/lib/domain/validate";
import { fakeForecasts, makePool, TEAM_A, TEAM_B } from "./fixtures";

describe("practice mode illustrative credits", () => {
  it("are within 6.5–11, in .5 steps, and never cheaper for a stronger projection", () => {
    const proj = Array.from({ length: 40 }, (_, i) => ({ key: `p${i}`, projected: 20 + ((i * 37) % 60) }));
    const c = illustrativeCredits(proj);
    for (const v of c.values()) {
      expect(v).toBeGreaterThanOrEqual(PRACTICE_MIN);
      expect(v).toBeLessThanOrEqual(PRACTICE_MAX);
      expect(v * 2).toBe(Math.round(v * 2));
    }
    const sorted = [...proj].sort((a, b) => a.projected - b.projected);
    for (let i = 1; i < sorted.length; i++) expect(c.get(sorted[i].key)!).toBeGreaterThanOrEqual(c.get(sorted[i - 1].key)!);
  });

  it("fills only unknown credits and keeps owner-entered values", () => {
    const pool = makePool({ A1: { credits: 9 }, A2: { credits: null }, B3: { credits: null } });
    const known = pool.filter((p) => p.credits !== null).length;
    const { players, filled } = withIllustrativeCredits(pool, new Map(pool.map((p, i) => [p.key, 30 + i])));
    expect(filled.sort()).toEqual(["A2", "B3"]);
    expect(players.find((p) => p.key === "A1")!.credits).toBe(9);
    expect(players.filter((p) => p.credits !== null).length).toBe(known + 2);
  });

  it("makes the credit cap bind: the optimizer must trade off instead of taking the top 11", () => {
    const base = makePool(Object.fromEntries(makePool().map((p) => [p.key, { credits: null }])));
    const fc = fakeForecasts(base);
    const { players } = withIllustrativeCredits(base, new Map([...fc.values()].map((f) => [f.key, f.predictedBase])));
    const rules = getRules("dream11-t20-strict");
    const { candidates, exclusions } = eligibleCandidates(players, fc);
    const r = optimizeTeam(candidates, rules, [TEAM_A, TEAM_B], { exclusions });
    expect(r.feasible).toBe(true);
    const v = validateTeam({ playerKeys: r.playerKeys, captainKey: r.captainKey, viceCaptainKey: r.viceCaptainKey }, players, rules);
    expect(v.valid).toBe(true);
    const top11 = [...fc.values()].sort((a, b) => b.rankingScore - a.rankingScore).slice(0, 11).map((f) => f.key);
    const top11Cost = top11.reduce((s, k) => s + players.find((p) => p.key === k)!.credits!, 0);
    expect(top11Cost).toBeGreaterThan(rules.creditCap);
  });
});
