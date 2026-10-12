import { describe, expect, it } from "vitest";
import {
  SCORING_VERSION,
  scoreCricsheetMatch,
  type CricsheetDelivery,
  type CricsheetInnings,
  type CricsheetMatch,
  type CricsheetWicket,
} from "../src/lib/domain/scoring";

// ---------- fixture helpers ----------

const A = "Alpha";
const B = "Beta";

const LINEUP: Record<string, string[]> = {
  [A]: ["A1", "A2", "A3", "AWK", "A5"],
  [B]: ["B1", "B2", "B3", "BWK", "B5"],
};

interface DOpts {
  batter?: string;
  bowler?: string;
  non_striker?: string;
  r?: number; // batter runs
  wides?: number;
  noballs?: number;
  byes?: number;
  legbyes?: number;
  nonBoundary?: boolean;
  wicket?: CricsheetWicket;
}

function d(o: DOpts = {}): CricsheetDelivery {
  const r = o.r ?? 0;
  const extrasObj: CricsheetDelivery["extras"] = {};
  if (o.wides) extrasObj.wides = o.wides;
  if (o.noballs) extrasObj.noballs = o.noballs;
  if (o.byes) extrasObj.byes = o.byes;
  if (o.legbyes) extrasObj.legbyes = o.legbyes;
  const ex = (o.wides ?? 0) + (o.noballs ?? 0) + (o.byes ?? 0) + (o.legbyes ?? 0);
  const del: CricsheetDelivery = {
    batter: o.batter ?? "A1",
    bowler: o.bowler ?? "B1",
    non_striker: o.non_striker ?? "A2",
    runs: { batter: r, extras: ex, total: r + ex, ...(o.nonBoundary ? { non_boundary: true } : {}) },
  };
  if (ex > 0) del.extras = extrasObj;
  if (o.wicket) del.wickets = [o.wicket];
  return del;
}

/** Split deliveries into overs of 6 legal balls each. */
function overs(deliveries: CricsheetDelivery[]): CricsheetInnings["overs"] {
  const out: NonNullable<CricsheetInnings["overs"]> = [];
  let cur: CricsheetDelivery[] = [];
  let legal = 0;
  for (const del of deliveries) {
    cur.push(del);
    if (!del.extras?.wides && !del.extras?.noballs) legal++;
    if (legal === 6) {
      out.push({ over: out.length, deliveries: cur });
      cur = [];
      legal = 0;
    }
  }
  if (cur.length) out.push({ over: out.length, deliveries: cur });
  return out;
}

function match(innings: CricsheetInnings[]): CricsheetMatch {
  return {
    info: {
      dates: ["2024-01-01"],
      venue: "Test Ground, Somewhere",
      city: "Somewhere",
      teams: [A, B],
      players: LINEUP,
      registry: { people: {} },
      match_type: "T20",
      gender: "male",
      outcome: { winner: A },
    },
    innings,
  };
}

const inn = (team: string, dels: CricsheetDelivery[], superOver = false): CricsheetInnings => ({
  team,
  overs: overs(dels),
  ...(superOver ? { super_over: true } : {}),
});

const rep = (n: number, f: (i: number) => CricsheetDelivery) => Array.from({ length: n }, (_, i) => f(i));

// ---------- tests ----------

describe("scoring basics", () => {
  it("exports version and gives every lineup player +4", () => {
    expect(SCORING_VERSION).toBe("matchlab-approx-dream11-t20-2026.10");
    const res = scoreCricsheetMatch(match([]));
    expect(res.size).toBe(10);
    for (const p of res.values()) {
      expect(p.pts).toBe(4);
      expect(p.batPts + p.bowlPts + p.fieldPts).toBe(0);
    }
    expect(res.get("B3")!.team).toBe(B);
  });
});

describe("batting", () => {
  it("awards +1/run, +4 boundary bonus, +6 six bonus; non_boundary 4 gets no bonus", () => {
    const res = scoreCricsheetMatch(
      match([inn(A, [d({ r: 4 }), d({ r: 6 }), d({ r: 4, nonBoundary: true }), d({ r: 1 })])]),
    );
    const a1 = res.get("A1")!;
    expect(a1.runs).toBe(15);
    expect(a1.ballsFaced).toBe(4);
    // 15 runs + one 4-bonus + one 6-bonus; < 10 balls so no SR; < 25 no milestone
    expect(a1.batPts).toBe(15 + 4 + 6);
    expect(a1.pts).toBe(4 + 25);
  });

  it("awards only the highest milestone (80 -> +12, 100 -> +16)", () => {
    // 80 runs from 40 balls of 2s (SR 200 -> +6)
    let res = scoreCricsheetMatch(match([inn(A, rep(40, () => d({ r: 2 })))]));
    expect(res.get("A1")!.runs).toBe(80);
    expect(res.get("A1")!.batPts).toBe(80 + 12 + 6);

    // 100 runs from 50 balls of 2s (SR 200 -> +6)
    res = scoreCricsheetMatch(match([inn(A, rep(50, () => d({ r: 2 })))]));
    expect(res.get("A1")!.batPts).toBe(100 + 16 + 6);

    // 25 runs: 25 singles (SR 100 -> 0)
    res = scoreCricsheetMatch(match([inn(A, rep(25, () => d({ r: 1 })))]));
    expect(res.get("A1")!.batPts).toBe(25 + 4);
  });

  it("applies duck -2 only to non-bowlers dismissed for 0", () => {
    const dels = [
      d({ batter: "A1", bowler: "B1", wicket: { player_out: "A1", kind: "bowled" } }),
      d({ batter: "A2", bowler: "B1", wicket: { player_out: "A2", kind: "bowled" } }),
    ];
    // A2 also bowls one ball in the second innings -> no duck penalty
    const res = scoreCricsheetMatch(match([inn(A, dels), inn(B, [d({ batter: "B2", bowler: "A2" })])]));
    expect(res.get("A1")!.batPts).toBe(-2);
    expect(res.get("A2")!.batPts).toBe(0);
  });

  it("does not apply duck for retired hurt; applies to non-striker run out", () => {
    const dels = [
      d({ batter: "A1", wicket: { player_out: "A1", kind: "retired hurt" } }),
      d({
        batter: "A3",
        non_striker: "A2",
        wicket: { player_out: "A2", kind: "run out", fielders: [{ name: "B2" }] },
      }),
    ];
    const res = scoreCricsheetMatch(match([inn(A, dels)]));
    expect(res.get("A1")!.batPts).toBe(0);
    expect(res.get("A2")!.batPts).toBe(-2);
  });

  it("applies strike-rate bands with 10-ball minimum, excluding wides from balls faced", () => {
    // 10 balls, 5 runs => SR 50 -> -4 ; plus a wide that should not count as a ball faced
    const dels = [...rep(5, () => d({ r: 1 })), ...rep(5, () => d({ r: 0 })), d({ wides: 1 })];
    let res = scoreCricsheetMatch(match([inn(A, dels)]));
    expect(res.get("A1")!.ballsFaced).toBe(10);
    expect(res.get("A1")!.batPts).toBe(5 - 4);

    // 10 balls, 4 runs => SR 40 -> -6
    res = scoreCricsheetMatch(match([inn(A, [...rep(4, () => d({ r: 1 })), ...rep(6, () => d())])]));
    expect(res.get("A1")!.batPts).toBe(4 - 6);

    // 10 balls, 16 runs (4 fours) => SR 160 -> +4
    res = scoreCricsheetMatch(match([inn(A, [...rep(4, () => d({ r: 4 })), ...rep(6, () => d())])]));
    expect(res.get("A1")!.batPts).toBe(16 + 16 + 4);

    // 9 balls => no SR points
    res = scoreCricsheetMatch(match([inn(A, rep(9, () => d()))]));
    expect(res.get("A1")!.batPts).toBe(0);
  });

  it("skips SR penalty for players who bowled >= 12 legal balls", () => {
    const batting = inn(A, rep(10, () => d({ batter: "A5" }))); // SR 0 -> would be -6
    const bowling = inn(B, rep(12, () => d({ batter: "B2", bowler: "A5", r: 1 })));
    const res = scoreCricsheetMatch(match([batting, bowling]));
    expect(res.get("A5")!.batPts).toBe(0);
  });
});

describe("bowling", () => {
  it("awards +30 per wicket and +8 for lbw/bowled; run out not credited to bowler", () => {
    const dels = [
      d({ batter: "A1", wicket: { player_out: "A1", kind: "lbw" } }),
      d({ batter: "A2", wicket: { player_out: "A2", kind: "caught", fielders: [{ name: "B3" }] } }),
      d({ batter: "A3", r: 1, wicket: { player_out: "A3", kind: "run out", fielders: [{ name: "B2" }] } }),
    ];
    const res = scoreCricsheetMatch(match([inn(A, dels)]));
    const b1 = res.get("B1")!;
    expect(b1.wickets).toBe(2);
    expect(b1.ballsBowled).toBe(3);
    // 2 wickets (60) + lbw bonus (8) + dots: lbw ball, caught ball (2) ; run-out ball had 1 run
    expect(b1.bowlPts).toBe(60 + 8 + 2);
  });

  it("awards haul bonus (highest only): 3w +4, 5w +12", () => {
    const wk = (n: number) =>
      rep(n, (i) => d({ batter: `X${i}`, wicket: { player_out: `X${i}`, kind: "caught", fielders: [{ name: "B3" }] } }));
    let res = scoreCricsheetMatch(match([inn(A, wk(3))]));
    expect(res.get("B1")!.bowlPts).toBe(90 + 4 + 3);
    res = scoreCricsheetMatch(match([inn(A, wk(5))]));
    // 5 wickets + 12 haul + 5 dots
    expect(res.get("B1")!.bowlPts).toBe(150 + 12 + 5);
  });

  it("counts dot balls including byes/legbyes but not wides/noballs; awards maiden", () => {
    // Over 1: 6 legal balls, 2 of them leg-byes, no runs charged -> maiden (+12) and 6 dots
    const over1 = [d(), d({ legbyes: 1 }), d(), d({ byes: 4 }), d(), d()];
    const res = scoreCricsheetMatch(match([inn(A, over1)]));
    const b1 = res.get("B1")!;
    expect(b1.ballsBowled).toBe(6);
    expect(b1.bowlPts).toBe(6 + 12);

    // An over with a wide is not a maiden, and the wide is not a dot
    const over2 = [d({ wides: 1 }), d(), d(), d(), d(), d(), d()];
    const r2 = scoreCricsheetMatch(match([inn(A, over2)]));
    expect(r2.get("B1")!.ballsBowled).toBe(6);
    expect(r2.get("B1")!.bowlPts).toBe(6);
  });

  it("applies economy bands with a 2-over minimum", () => {
    // 2 overs, 8 runs conceded (econ 4.0 -> +6), 4 dots, no maidens (runs in both overs)
    const tight = [d({ r: 4 }), d(), d(), d(), d(), d(), d({ r: 4 }), d(), d(), d(), d(), d()];
    let res = scoreCricsheetMatch(match([inn(A, tight)]));
    expect(res.get("B1")!.bowlPts).toBe(10 + 6);

    // 2 overs, 26 runs (econ 13 -> -6), one dot
    const exp = [...rep(11, (i) => d({ r: i < 2 ? 4 : 2 })), d()];
    const runs = exp.reduce((s, x) => s + x.runs.batter, 0);
    expect(runs).toBe(4 + 4 + 2 * 9);
    res = scoreCricsheetMatch(match([inn(A, exp)]));
    expect(res.get("B1")!.bowlPts).toBe(1 - 6);

    // 2 overs, 22 runs charged incl. 1 wide + 1 noball -> econ 11.0 -> -2
    const mid = [...rep(10, () => d({ r: 2 })), d({ wides: 1 }), d({ noballs: 1 }), d(), d()];
    res = scoreCricsheetMatch(match([inn(A, mid)]));
    expect(res.get("B1")!.ballsBowled).toBe(12);
    expect(res.get("B1")!.bowlPts).toBe(2 - 2);

    // 1 over only -> no economy points
    res = scoreCricsheetMatch(match([inn(A, rep(6, () => d({ r: 6 })))]));
    expect(res.get("B1")!.bowlPts).toBe(0);
  });
});

describe("fielding", () => {
  it("awards +8 per catch and +4 once for 3+ catches; caught-and-bowled goes to bowler", () => {
    const c = (i: number, fielder = "BWK") =>
      d({ batter: `X${i}`, wicket: { player_out: `X${i}`, kind: "caught", fielders: [{ name: fielder }] } });
    const dels = [c(1), c(2), c(3), c(4), d({ batter: "X5", wicket: { player_out: "X5", kind: "caught and bowled" } })];
    const res = scoreCricsheetMatch(match([inn(A, dels)]));
    expect(res.get("BWK")!.fieldPts).toBe(4 * 8 + 4);
    expect(res.get("B1")!.fieldPts).toBe(8);
  });

  it("gives substitute fielders nothing", () => {
    const dels = [
      d({ batter: "A1", wicket: { player_out: "A1", kind: "caught", fielders: [{ name: "SubGuy", substitute: true }] } }),
    ];
    const res = scoreCricsheetMatch(match([inn(A, dels)]));
    expect(res.has("SubGuy")).toBe(false);
    expect(res.get("B1")!.wickets).toBe(1);
  });

  it("awards +12 per stumping", () => {
    const dels = [d({ batter: "A1", wicket: { player_out: "A1", kind: "stumped", fielders: [{ name: "BWK" }] } })];
    const res = scoreCricsheetMatch(match([inn(A, dels)]));
    expect(res.get("BWK")!.fieldPts).toBe(12);
    expect(res.get("B1")!.bowlPts).toBe(30 + 1);
  });

  it("run out: one fielder = direct hit +12; two fielders = +6 each", () => {
    const dels = [
      d({ batter: "A1", wicket: { player_out: "A1", kind: "run out", fielders: [{ name: "B2" }] } }),
      d({ batter: "A2", wicket: { player_out: "A2", kind: "run out", fielders: [{ name: "B3" }, { name: "BWK" }] } }),
    ];
    const res = scoreCricsheetMatch(match([inn(A, dels)]));
    expect(res.get("B2")!.fieldPts).toBe(12);
    expect(res.get("B3")!.fieldPts).toBe(6);
    expect(res.get("BWK")!.fieldPts).toBe(6);
    expect(res.get("B1")!.wickets).toBe(0);
  });
});

describe("super over", () => {
  it("excludes super-over innings entirely", () => {
    const main = inn(A, [d({ r: 1 })]);
    const so = inn(A, [d({ r: 6 }), d({ batter: "A2", wicket: { player_out: "A2", kind: "bowled" } })], true);
    const res = scoreCricsheetMatch(match([main, so]));
    expect(res.get("A1")!.runs).toBe(1);
    expect(res.get("A1")!.batPts).toBe(1);
    expect(res.get("A2")!.batPts).toBe(0);
    expect(res.get("B1")!.wickets).toBe(0);
  });
});
