import { describe, expect, it } from "vitest";
import type { MatchSummary } from "@/lib/providers/cricketdata";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const fixture = (id: string, startsAt: string, extra: Partial<MatchSummary> = {}): MatchSummary => ({
  id,
  name: `A vs B, 1st Match, Test League 2026`,
  title: "1st Match",
  teams: ["A", "B"],
  teamShort: ["A", "B"],
  venue: "Ground, City",
  city: "City",
  startsAt,
  statusText: "",
  started: false,
  ended: false,
  format: "T20",
  formatNote: null,
  seriesId: null,
  hasSquad: true,
  toss: null,
  winner: null,
  ...extra,
});

describe("tracked series windows (quota guard)", () => {
  it("fetches a series only from 14 days before its first T20 to 7 days after its last", async () => {
    const { seriesInWindow, seasonStatus } = await import("@/lib/providers/cricketdata");
    const bbl = { from: "2026-12-12", to: "2027-01-26" };
    expect(seriesInWindow(bbl, NOW)).toBe(false);
    expect(seriesInWindow(bbl, Date.parse("2026-11-29T00:00:00Z"))).toBe(true);
    expect(seriesInWindow(bbl, Date.parse("2027-02-03T00:00:00Z"))).toBe(false);
    expect(seasonStatus(bbl, NOW)).toBe("upcoming");
    expect(seasonStatus({ from: "2026-10-06", to: "2026-10-17" }, NOW)).toBe("live");
    expect(seasonStatus({ from: "2026-10-09", to: "2026-10-13" }, NOW)).toBe("ended");
  });
});

describe("Match Desk fixture split", () => {
  it("separates buildable fixtures from squad-pending ones and ignores fixtures beyond 14 days", async () => {
    const { splitFixtures } = await import("@/lib/server/match");
    const r = splitFixtures(
      [
        fixture("ready", "2026-10-17T13:30:00Z"),
        fixture("pending", "2026-10-27T14:30:00Z", { hasSquad: false }),
        fixture("far", "2026-11-20T14:30:00Z", { hasSquad: false }),
        fixture("done", "2026-10-14T13:30:00Z", { ended: true }),
      ],
      NOW,
    );
    expect(r.upcoming.map((m) => m.id)).toEqual(["ready"]);
    expect(r.pending.map((m) => m.id)).toEqual(["pending"]);
    expect(r.recent.map((m) => m.id)).toEqual(["done"]);
  });
});

describe("combined men's T20 history (internationals + leagues)", () => {
  it("loads league competitions and tags each record with its competition", async () => {
    const { historyMeta, matchPlayer } = await import("@/lib/providers/history");
    const meta = historyMeta();
    expect(Object.keys(meta.competitions)).toEqual(expect.arrayContaining(["T20I", "IPL", "BBL", "SA20"]));
    const m = matchPlayer("Virat Kohli", "Royal Challengers Bengaluru");
    expect(m.history).not.toBeNull();
    expect(m.history!.recs.some((r) => r.comp === "IPL")).toBe(true);
  });

  it("matches a league transfer by unique full name, labelled name-only", async () => {
    const { matchPlayer } = await import("@/lib/providers/history");
    const m = matchPlayer("Virat Kohli", "A Franchise He Never Played For");
    expect(m.method).toBe("name-only");
    expect(m.historyName).toBe("V Kohli");
  });
});
