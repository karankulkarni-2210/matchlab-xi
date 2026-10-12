// Approximate Dream11 T20 base fantasy points from Cricsheet ball-by-ball JSON.
// Pure module: no I/O. Points are an APPROXIMATION of the official Dream11 T20 system
// (role-dependent rules are approximated from what the player actually did in the match).

export const SCORING_VERSION = "matchlab-approx-dream11-t20-2026.10";

// ---------- Minimal Cricsheet JSON v1.x types ----------

export interface CricsheetFielder {
  name?: string;
  substitute?: boolean;
}

export interface CricsheetWicket {
  player_out: string;
  kind: string;
  fielders?: CricsheetFielder[];
}

export interface CricsheetDelivery {
  batter: string;
  bowler: string;
  non_striker: string;
  runs: { batter: number; extras: number; total: number; non_boundary?: boolean };
  extras?: { wides?: number; noballs?: number; byes?: number; legbyes?: number; penalty?: number };
  wickets?: CricsheetWicket[];
}

export interface CricsheetOver {
  over: number;
  deliveries: CricsheetDelivery[];
}

export interface CricsheetInnings {
  team: string;
  overs?: CricsheetOver[];
  super_over?: boolean;
}

export interface CricsheetMatch {
  meta?: { data_version?: string; created?: string; revision?: number };
  info: {
    dates: string[];
    venue?: string;
    city?: string;
    teams: string[];
    players?: Record<string, string[]>;
    registry?: { people?: Record<string, string> };
    outcome?: {
      winner?: string;
      result?: string; // "tie" | "no result" | "draw"
      eliminator?: string;
      method?: string;
      by?: { runs?: number; wickets?: number; innings?: number };
    };
    match_type?: string;
    gender?: string;
    event?: { name?: string; match_number?: number; stage?: string };
    toss?: { winner?: string; decision?: string };
  };
  innings?: CricsheetInnings[];
}

export interface PlayerMatchPoints {
  name: string;
  team: string;
  pts: number;
  batPts: number;
  bowlPts: number;
  fieldPts: number;
  ballsFaced: number;
  ballsBowled: number;
  runs: number;
  wickets: number;
}

// ---------- Point constants ----------

export const POINTS = {
  lineup: 4,
  run: 1,
  boundaryBonus: 4,
  sixBonus: 6,
  duck: -2,
  wicket: 30,
  lbwBowledBonus: 8,
  dotBall: 1,
  maiden: 12,
  catch: 8,
  threeCatchBonus: 4,
  stumping: 12,
  runOutDirect: 12,
  runOutShared: 6,
} as const;

/** Dismissal kinds credited to the bowler. */
const BOWLER_WICKET_KINDS = new Set([
  "bowled",
  "caught",
  "caught and bowled",
  "lbw",
  "stumped",
  "hit wicket",
]);

/** Kinds that do NOT count as the batter being dismissed (for the duck rule). */
const NOT_DISMISSED_KINDS = new Set(["retired hurt", "retired not out"]);

export function milestoneBonus(runs: number): number {
  if (runs >= 100) return 16;
  if (runs >= 75) return 12;
  if (runs >= 50) return 8;
  if (runs >= 25) return 4;
  return 0;
}

export function strikeRatePoints(runs: number, balls: number): number {
  if (balls < 10) return 0;
  const sr = (runs / balls) * 100;
  if (sr > 170) return 6;
  if (sr > 150) return 4;
  if (sr >= 130) return 2;
  if (sr > 70) return 0;
  if (sr >= 60) return -2;
  if (sr >= 50) return -4;
  return -6;
}

export function haulBonus(wickets: number): number {
  if (wickets >= 5) return 12;
  if (wickets >= 4) return 8;
  if (wickets >= 3) return 4;
  return 0;
}

/** runsConceded / (legalBalls/6); returns 0 below the 2-over minimum. */
export function economyPoints(runsConceded: number, legalBalls: number): number {
  if (legalBalls < 12) return 0;
  const econ = runsConceded / (legalBalls / 6);
  if (econ < 5) return 6;
  if (econ < 6) return 4;
  if (econ <= 7) return 2;
  if (econ < 10) return 0;
  if (econ <= 11) return -2;
  if (econ <= 12) return -4;
  return -6;
}

// ---------- Accumulator ----------

interface Acc {
  name: string;
  team: string;
  inLineup: boolean;
  // batting
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  dismissed: boolean;
  // bowling
  deliveriesBowled: number; // incl. wides/noballs
  legalBalls: number;
  runsConceded: number;
  wickets: number;
  lbwBowled: number;
  dots: number;
  maidens: number;
  // fielding
  catches: number;
  stumpings: number;
  runOutPts: number;
}

function newAcc(name: string, team: string, inLineup: boolean): Acc {
  return {
    name,
    team,
    inLineup,
    runs: 0,
    ballsFaced: 0,
    fours: 0,
    sixes: 0,
    dismissed: false,
    deliveriesBowled: 0,
    legalBalls: 0,
    runsConceded: 0,
    wickets: 0,
    lbwBowled: 0,
    dots: 0,
    maidens: 0,
    catches: 0,
    stumpings: 0,
    runOutPts: 0,
  };
}

/**
 * Score every player of one Cricsheet T20 match.
 * Returns a Map keyed by player name as it appears in the match file.
 * Super-over innings are ignored.
 */
export function scoreCricsheetMatch(match: CricsheetMatch): Map<string, PlayerMatchPoints> {
  const accs = new Map<string, Acc>();
  const teams = match.info.teams ?? [];
  const lineups = match.info.players ?? {};

  for (const [team, names] of Object.entries(lineups)) {
    for (const name of names) {
      if (!accs.has(name)) accs.set(name, newAcc(name, team, true));
    }
  }

  const get = (name: string, fallbackTeam: string): Acc => {
    let a = accs.get(name);
    if (!a) {
      a = newAcc(name, fallbackTeam, false);
      accs.set(name, a);
    }
    return a;
  };

  for (const inn of match.innings ?? []) {
    if (inn.super_over) continue;
    const batTeam = inn.team;
    const bowlTeam = teams.find((t) => t !== batTeam) ?? "";

    for (const over of inn.overs ?? []) {
      // per-over maiden tracking (per bowler)
      const overBowlers = new Set<string>();
      let overLegal = 0;
      let overCharged = 0;

      for (const d of over.deliveries ?? []) {
        const wides = d.extras?.wides ?? 0;
        const noballs = d.extras?.noballs ?? 0;
        const batterRuns = d.runs?.batter ?? 0;
        const legal = wides === 0 && noballs === 0;
        const charged = batterRuns + wides + noballs;

        // batting
        const bat = get(d.batter, batTeam);
        bat.runs += batterRuns;
        if (wides === 0) bat.ballsFaced += 1;
        if (!d.runs?.non_boundary) {
          if (batterRuns === 4) bat.fours += 1;
          else if (batterRuns === 6) bat.sixes += 1;
        }

        // bowling
        const bowl = get(d.bowler, bowlTeam);
        bowl.deliveriesBowled += 1;
        bowl.runsConceded += charged;
        if (legal) {
          bowl.legalBalls += 1;
          if (batterRuns === 0) bowl.dots += 1;
        }
        overBowlers.add(d.bowler);
        if (legal) overLegal += 1;
        overCharged += charged;

        // wickets & fielding
        for (const w of d.wickets ?? []) {
          const kind = (w.kind ?? "").toLowerCase();
          if (w.player_out && !NOT_DISMISSED_KINDS.has(kind)) {
            get(w.player_out, batTeam).dismissed = true;
          }
          if (BOWLER_WICKET_KINDS.has(kind)) {
            bowl.wickets += 1;
            if (kind === "lbw" || kind === "bowled") bowl.lbwBowled += 1;
          }
          const fielders = w.fielders ?? [];
          const regular = fielders.filter((f) => !f.substitute && f.name);
          if (kind === "caught") {
            const f = fielders[0];
            if (f && !f.substitute && f.name) get(f.name, bowlTeam).catches += 1;
          } else if (kind === "caught and bowled") {
            bowl.catches += 1;
          } else if (kind === "stumped") {
            const f = fielders[0];
            if (f && !f.substitute && f.name) get(f.name, bowlTeam).stumpings += 1;
          } else if (kind === "run out") {
            // Direct hit approximated as "exactly one fielder listed".
            if (fielders.length === 1 && regular.length === 1) {
              get(regular[0].name!, bowlTeam).runOutPts += POINTS.runOutDirect;
            } else if (fielders.length >= 2) {
              for (const f of regular) get(f.name!, bowlTeam).runOutPts += POINTS.runOutShared;
            }
          }
        }
      }

      if (overBowlers.size === 1 && overLegal >= 6 && overCharged === 0) {
        const [b] = overBowlers;
        get(b, bowlTeam).maidens += 1;
      }
    }
  }

  const out = new Map<string, PlayerMatchPoints>();
  for (const a of accs.values()) {
    // batting
    let batPts = a.runs * POINTS.run + a.fours * POINTS.boundaryBonus + a.sixes * POINTS.sixBonus;
    batPts += milestoneBonus(a.runs);
    if (a.dismissed && a.runs === 0 && a.deliveriesBowled === 0) batPts += POINTS.duck;
    if (a.legalBalls < 12) batPts += strikeRatePoints(a.runs, a.ballsFaced);

    // bowling
    let bowlPts =
      a.wickets * POINTS.wicket +
      a.lbwBowled * POINTS.lbwBowledBonus +
      haulBonus(a.wickets) +
      a.dots * POINTS.dotBall +
      a.maidens * POINTS.maiden;
    bowlPts += economyPoints(a.runsConceded, a.legalBalls);

    // fielding
    let fieldPts = a.catches * POINTS.catch + a.stumpings * POINTS.stumping + a.runOutPts;
    if (a.catches >= 3) fieldPts += POINTS.threeCatchBonus;

    const lineup = a.inLineup ? POINTS.lineup : 0;
    out.set(a.name, {
      name: a.name,
      team: a.team,
      pts: lineup + batPts + bowlPts + fieldPts,
      batPts,
      bowlPts,
      fieldPts,
      ballsFaced: a.ballsFaced,
      ballsBowled: a.legalBalls,
      runs: a.runs,
      wickets: a.wickets,
    });
  }
  return out;
}
