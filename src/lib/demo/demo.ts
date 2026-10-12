import { forecastPlayer, type HistoryRec, type PlayerHistory, type VenueProfile } from "@/lib/domain/forecast";
import { getRules } from "@/lib/domain/rules";
import type { ContestInput, ContestPlayer, Factor, Role } from "@/lib/domain/types";
import { DEFAULT_ROLE_MULTIPLIERS, DEFAULT_WEIGHTS, round } from "@/lib/domain/weights";

/**
 * SYNTHETIC DEMO DATASET. Fictional teams, players, credits, history and results, generated from a
 * fixed seed. It exists so a logged-out evaluator can exercise every screen. It is never mixed with
 * real data and is excluded from real efficacy metrics.
 */
export const DEMO_LABEL = "Synthetic demo · fictional teams & players";
export const DEMO_MATCH_ID = "demo-hh-dd";
export const DEMO_TEAMS: [string, string] = ["Harbour Hawks", "Deccan Dynamos"];
export const DEMO_SHORT: [string, string] = ["HAW", "DYN"];

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoPlayerSpec {
  key: string;
  name: string;
  team: string;
  role: Role;
  credits: number;
  mean: number;
  lineup: ContestPlayer["lineup"];
}

const SPECS: [string, Role, number, number, ContestPlayer["lineup"]][] = [
  // Harbour Hawks
  ["Arin Castell", "WK", 8.5, 44, "confirmed_xi"],
  ["Tobi Rennick", "WK", 7.0, 30, "confirmed_out"],
  ["Mateo Vance", "BAT", 9.5, 52, "confirmed_xi"],
  ["Ishan Corr", "BAT", 8.5, 41, "confirmed_xi"],
  ["Lio Bramwell", "BAT", 8.0, 37, "confirmed_xi"],
  ["Ned Okafor", "BAT", 7.0, 29, "confirmed_out"],
  ["Ravi Sandhu", "AR", 9.5, 55, "confirmed_xi"],
  ["Kai Morland", "AR", 8.5, 46, "confirmed_xi"],
  ["Jory Teale", "AR", 7.5, 35, "confirmed_xi"],
  ["Dev Halloran", "BOWL", 9.0, 47, "confirmed_xi"],
  ["Ozzy Pike", "BOWL", 8.0, 40, "confirmed_xi"],
  ["Samir Quell", "BOWL", 7.5, 36, "confirmed_xi"],
  ["Finn Arrow", "BOWL", 6.5, 27, "confirmed_out"],
  // Deccan Dynamos
  ["Varun Edge", "WK", 9.0, 47, "confirmed_xi"],
  ["Hugo Laine", "WK", 7.5, 33, "confirmed_xi"],
  ["Aditya Rowe", "BAT", 10.0, 56, "confirmed_xi"],
  ["Cole Banerjee", "BAT", 8.5, 42, "confirmed_xi"],
  ["Pranav Sule", "BAT", 7.5, 34, "confirmed_xi"],
  ["Marlon Keyes", "AR", 9.0, 50, "confirmed_xi"],
  ["Yusuf Brant", "AR", 8.0, 41, "confirmed_xi"],
  ["Rhys Calder", "AR", 7.0, 31, "confirmed_out"],
  ["Nikhil Dorai", "BOWL", 9.0, 48, "confirmed_xi"],
  ["Owen Tarrant", "BOWL", 8.5, 43, "confirmed_xi"],
  ["Jai Mercer", "BOWL", 7.0, 33, "confirmed_xi"],
  ["Ben Ashdown", "BOWL", 6.5, 28, "confirmed_out"],
];

export const DEMO_PLAYERS: DemoPlayerSpec[] = SPECS.map(([name, role, credits, mean, lineup], i) => ({
  key: `demo-${i < 13 ? "haw" : "dyn"}-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
  name,
  team: i < 13 ? DEMO_TEAMS[0] : DEMO_TEAMS[1],
  role,
  credits,
  mean,
  lineup,
}));

export const DEMO_VENUE: VenueProfile & { city: string | null; aliases: string[] } = {
  key: "demo-harbour-oval",
  name: "Harbour Oval (fictional)",
  city: null,
  aliases: [],
  matches: 14,
  avgFirstInnings: 182,
  avgSecondInnings: 168,
  chaseWinPct: 43,
  batIndex: 1.12,
  bowlIndex: 0.93,
  batIndexN: 160,
  bowlIndexN: 90,
};

export const DEMO_MATCH = {
  id: DEMO_MATCH_ID,
  name: `${DEMO_TEAMS[0]} vs ${DEMO_TEAMS[1]}, Demo League Match`,
  title: "Demo League Match",
  teams: DEMO_TEAMS,
  teamShort: DEMO_SHORT,
  venue: DEMO_VENUE.name,
  city: null,
  startsAt: "2026-10-20T14:00:00Z",
  statusText: "Synthetic fixture",
  started: false,
  ended: false,
  format: "T20" as const,
  formatNote: null,
  seriesId: null,
  hasSquad: true,
  toss: null,
  winner: null,
};

/** Deterministic synthetic history (20 matches per player). */
export function demoHistory(): Map<string, PlayerHistory> {
  const rand = mulberry32(20261012);
  const out = new Map<string, PlayerHistory>();
  for (const p of DEMO_PLAYERS) {
    const recs: HistoryRec[] = [];
    for (let i = 0; i < 20; i++) {
      const atVenue = i % 5 === 2;
      const vsOpp = i % 3 === 0;
      const swing = (rand() - 0.5) * 2 * p.mean * 0.75;
      const pts = Math.max(-4, Math.round(p.mean + swing + (atVenue ? 4 : 0)));
      const bat = p.role === "BOWL" ? Math.round(pts * 0.1) : p.role === "AR" ? Math.round(pts * 0.5) : Math.round(pts * 0.8);
      const bowl = p.role === "BOWL" ? Math.round(pts * 0.8) : p.role === "AR" ? Math.round(pts * 0.4) : 0;
      const d = new Date(Date.UTC(2026, 9, 1) - i * 9 * 86400000).toISOString().slice(0, 10);
      recs.push({
        date: d,
        venueKey: atVenue ? DEMO_VENUE.key : "demo-elsewhere",
        team: p.team,
        opp: vsOpp ? (p.team === DEMO_TEAMS[0] ? DEMO_TEAMS[1] : DEMO_TEAMS[0]) : "Other Demo XI",
        pts,
        batPts: bat,
        bowlPts: bowl,
        fieldPts: Math.max(0, pts - 4 - bat - bowl),
        ballsFaced: p.role === "BOWL" ? 3 : p.role === "AR" ? 14 : 22,
        ballsBowled: p.role === "BOWL" ? 24 : p.role === "AR" ? 15 : 0,
        runs: Math.max(0, bat),
        wickets: p.role === "BOWL" || p.role === "AR" ? Math.max(0, Math.round(bowl / 34)) : 0,
      });
    }
    out.set(p.key, { id: p.key, name: p.name, recs });
  }
  return out;
}

export function demoContest(): ContestInput {
  return {
    matchId: DEMO_MATCH_ID,
    players: DEMO_PLAYERS.map((p) => ({
      key: p.key,
      name: p.name,
      team: p.team,
      role: p.role,
      credits: p.credits,
      lineup: p.lineup,
      providerRole: null,
      historyName: null,
    })),
    rules: getRules("dream11-t20-strict"),
    rulesConfirmedAt: "2026-10-12T08:00:00Z",
    lineupsConfirmed: { teamA: true, teamB: true },
    sourceLabel: "Synthetic demo contest (fictional credits)",
    sourceAsOf: "2026-10-12T08:00:00Z",
  };
}

// ------------------------------------------------------------------ synthetic learning history
export interface DemoSeed {
  version: { weights: typeof DEFAULT_WEIGHTS; role_multipliers: typeof DEFAULT_ROLE_MULTIPLIERS };
  teams: {
    ref: string;
    match_id: string;
    match_label: string;
    match_start: string;
    captain_key: string;
    vice_captain_key: string;
    predicted_total: number;
    players: {
      player_key: string;
      name: string;
      real_team: string;
      role: Role;
      credits: number;
      predicted_base: number;
      ranking_score: number;
      coverage: number;
      uncertainty: number;
      factors: Record<Factor, { estimate: number; n: number; note: string }>;
      multiplier: number;
      actual: number | null;
    }[];
  }[];
}

/**
 * 8 completed synthetic matches + 1 awaiting actuals. Built-in pattern: all-rounder forecasts run
 * high (actual ≈ predicted − 11), others are noisy but unbiased — so the Learning Lab has a real,
 * reproducible signal to detect. Labelled synthetic everywhere.
 */
export function buildDemoSeed(): DemoSeed {
  const rand = mulberry32(777);
  const hist = demoHistory();
  const ctx = {
    venue: DEMO_VENUE,
    opponentHistoryName: { [DEMO_TEAMS[0]]: DEMO_TEAMS[1], [DEMO_TEAMS[1]]: DEMO_TEAMS[0] },
    globalMeanPts: 40,
    weights: DEFAULT_WEIGHTS,
    roleMultipliers: DEFAULT_ROLE_MULTIPLIERS,
  };
  const eligible = DEMO_PLAYERS.filter((p) => p.lineup === "confirmed_xi");
  const byRole = (r: Role) => eligible.filter((p) => p.role === r);
  const teams: DemoSeed["teams"] = [];
  for (let m = 1; m <= 9; m++) {
    const pick = [
      ...byRole("WK").sort(() => rand() - 0.5).slice(0, 1),
      ...byRole("BAT").sort(() => rand() - 0.5).slice(0, 4),
      ...byRole("AR").sort(() => rand() - 0.5).slice(0, 3),
      ...byRole("BOWL").sort(() => rand() - 0.5).slice(0, 3),
    ];
    const players = pick.map((p) => {
      const f = forecastPlayer(
        { key: p.key, name: p.name, team: p.team, role: p.role, credits: p.credits, lineup: "confirmed_xi" },
        hist.get(p.key)!,
        ctx,
      );
      const jitter = (rand() - 0.5) * 8;
      const predicted = round(f.predictedBase + jitter, 1);
      const bias = p.role === "AR" ? 11 + (rand() - 0.5) * 6 : (rand() - 0.5) * 4;
      const noise = (rand() - 0.5) * 2 * 14;
      const actual = Math.max(-4, Math.round(predicted - bias + noise));
      const scale = predicted / f.predictedBase;
      return {
        player_key: p.key,
        name: p.name,
        real_team: p.team,
        role: p.role,
        credits: p.credits,
        predicted_base: predicted,
        ranking_score: round(f.rankingScore * scale, 2),
        coverage: f.coverage,
        uncertainty: f.uncertainty,
        factors: Object.fromEntries(
          (Object.keys(f.factors) as Factor[]).map((k) => [k, { estimate: round(f.factors[k].estimate * scale, 2), n: f.factors[k].n, note: `${f.factors[k].note} (synthetic)` }]),
        ) as Record<Factor, { estimate: number; n: number; note: string }>,
        multiplier: 1,
        actual: m === 9 && rand() < 0.45 ? null : actual,
      };
    });
    const sorted = [...players].sort((a, b) => b.ranking_score - a.ranking_score);
    sorted[0].multiplier = 2;
    sorted[1].multiplier = 1.5;
    teams.push({
      ref: `demo-team-${m}`,
      match_id: `demo-past-${m}`,
      match_label: `${DEMO_TEAMS[m % 2]} vs ${DEMO_TEAMS[(m + 1) % 2]} · Demo match ${m}`,
      match_start: new Date(Date.UTC(2026, 7, 1) + m * 5 * 86400000).toISOString(),
      captain_key: sorted[0].player_key,
      vice_captain_key: sorted[1].player_key,
      predicted_total: round(players.reduce((s, p) => s + p.predicted_base * p.multiplier, 0), 1),
      players,
    });
  }
  return { version: { weights: DEFAULT_WEIGHTS, role_multipliers: DEFAULT_ROLE_MULTIPLIERS }, teams };
}
