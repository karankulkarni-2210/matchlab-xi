import type { ContestPlayer, PlayerForecast, Role } from "@/lib/domain/types";

export const TEAM_A = "Alpha";
export const TEAM_B = "Bravo";

/** 22-player pool: per team 2 WK, 4 BAT, 2 AR, 3 BOWL. Credits 7.5–10. */
export function makePool(overrides: Partial<Record<string, Partial<ContestPlayer>>> = {}): ContestPlayer[] {
  const layout: Role[] = ["WK", "WK", "BAT", "BAT", "BAT", "BAT", "AR", "AR", "BOWL", "BOWL", "BOWL"];
  const pool: ContestPlayer[] = [];
  for (const team of [TEAM_A, TEAM_B]) {
    layout.forEach((role, i) => {
      const key = `${team[0]}${i + 1}`;
      pool.push({
        key,
        name: `${team} ${role} ${i + 1}`,
        team,
        role,
        credits: 7.5 + ((i * 7) % 6) * 0.5,
        lineup: "confirmed_xi",
        ...overrides[key],
      });
    });
  }
  return pool;
}

export function fakeForecasts(pool: ContestPlayer[], scores: Record<string, number> = {}): Map<string, PlayerForecast> {
  const m = new Map<string, PlayerForecast>();
  pool.forEach((p, i) => {
    const s = scores[p.key] ?? 20 + ((i * 13) % 17);
    m.set(p.key, {
      key: p.key,
      name: p.name,
      team: p.team,
      role: p.role,
      credits: p.credits,
      lineup: p.lineup,
      factors: {
        form: { raw: s, n: 5, estimate: s, note: "" },
        opportunity: { raw: 1, n: 10, estimate: s, note: "" },
        venue: { raw: null, n: 0, estimate: s, note: "" },
        matchup: { raw: null, n: 0, estimate: s, note: "" },
      },
      baseline: s,
      roleMultiplier: 1,
      predictedBase: s,
      coverage: 0.7,
      uncertainty: 15,
      rankingScore: s,
      availability: 1,
      historyMatched: true,
      historySample: 10,
      evidenceIds: [],
    });
  });
  return m;
}
