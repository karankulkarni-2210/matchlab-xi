import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { HistoryRec, PlayerHistory, VenueProfile } from "@/lib/domain/forecast";

type Rec = [string, string, string, string, number, number, number, number, number, number, number, number, string];
interface HistoryFile {
  meta: {
    source: string;
    dataset: string;
    url: string;
    license: string;
    attribution: string;
    generatedAt: string;
    firstDate: string;
    lastDate: string;
    matches: number;
    competitions: Record<string, { label: string; matches: number; firstDate: string; lastDate: string }>;
    scoringVersion: string;
    notes: string[];
  };
  venues: Record<string, Omit<VenueProfile, "key"> & { city: string | null; aliases: string[] }>;
  players: Record<string, { name: string; altNames: string[]; teams: string[]; lastDate: string; recs: Rec[] }>;
}

let cache: { file: HistoryFile; byName: Map<string, string[]>; globalMeanPts: number } | null = null;

export const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function venueKeyOf(venue: string): string {
  const head = venue.split(",")[0].toLowerCase();
  return head.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function load() {
  if (cache) return cache;
  const file = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", "history", "t20_male.json"), "utf8"),
  ) as HistoryFile;
  const byName = new Map<string, string[]>();
  let sum = 0;
  let n = 0;
  for (const [id, p] of Object.entries(file.players)) {
    for (const nm of [p.name, ...p.altNames]) {
      const k = normName(nm);
      byName.set(k, [...(byName.get(k) ?? []), id]);
    }
    for (const r of p.recs) {
      sum += r[4];
      n++;
    }
  }
  cache = { file, byName, globalMeanPts: n ? sum / n : 40 };
  return cache;
}

export function historyMeta() {
  return load().file.meta;
}
export function globalMeanPts() {
  return load().globalMeanPts;
}

const toRec = (r: Rec): HistoryRec => ({
  date: r[0],
  venueKey: r[1],
  team: r[2],
  opp: r[3],
  pts: r[4],
  batPts: r[5],
  bowlPts: r[6],
  fieldPts: r[7],
  ballsFaced: r[8],
  ballsBowled: r[9],
  runs: r[10],
  wickets: r[11],
  comp: r[12],
});

export type MatchMethod = "exact" | "alias" | "initials" | "name-only" | "override" | "none" | "ambiguous";

export interface PlayerMatch {
  history: PlayerHistory | null;
  method: MatchMethod;
  historyName: string | null;
  lastDate: string | null;
}

/**
 * Matches a provider player name to a Cricsheet identity, preferring players who have represented
 * `team`. Order: owner override → exact/alias name → surname + first initial → full name across all
 * teams (league transfers; only when exactly one player has that full name). Ambiguous matches are
 * NOT used (evidence shown as missing instead).
 */
export function matchPlayer(name: string, team: string, override?: string | null): PlayerMatch {
  const { file, byName } = load();
  const pick = (id: string, method: MatchMethod): PlayerMatch => {
    const p = file.players[id];
    return { history: { id, name: p.name, recs: p.recs.map(toRec) }, method, historyName: p.name, lastDate: p.lastDate };
  };
  const forTeam = (ids: string[]) => ids.filter((id) => file.players[id]?.teams.includes(team));

  if (override) {
    const ids = forTeam(byName.get(normName(override)) ?? []);
    if (ids.length >= 1) return pick(ids[0], "override");
  }
  const exact = forTeam(byName.get(normName(name)) ?? []);
  if (exact.length === 1) {
    const isPrimary = normName(file.players[exact[0]].name) === normName(name);
    return pick(exact[0], isPrimary ? "exact" : "alias");
  }
  if (exact.length > 1) return { history: null, method: "ambiguous", historyName: null, lastDate: null };

  const tokens = normName(name).split(" ");
  if (tokens.length >= 2) {
    const surname = tokens[tokens.length - 1];
    const first = tokens[0][0];
    const cands = Object.entries(file.players).filter(([, p]) => {
      if (!p.teams.includes(team)) return false;
      const t = p.name.split(" ");
      const sur = normName(t[t.length - 1]);
      const given = t.slice(0, -1);
      const initials = given.join("");
      // "M Prasidh Krishna" ~ "Prasidh Krishna": first initial OR a full given-name token must agree
      return sur === surname && initials.length > 0 && (initials[0].toLowerCase() === first || given.some((g) => normName(g) === tokens[0]));
    });
    if (cands.length === 1) return pick(cands[0][0], "initials");
    if (cands.length > 1) return { history: null, method: "ambiguous", historyName: null, lastDate: null };
    // Franchise squads change every season: a unique full-name match from another team is still the same person.
    const anyTeam = byName.get(normName(name)) ?? [];
    if (anyTeam.length === 1) return pick(anyTeam[0], "name-only");
    if (anyTeam.length > 1) return { history: null, method: "ambiguous", historyName: null, lastDate: null };
  }
  return { history: null, method: "none", historyName: null, lastDate: null };
}

export function venueProfile(providerVenue: string): (VenueProfile & { city: string | null; aliases: string[] }) | null {
  const { file } = load();
  const key = venueKeyOf(providerVenue);
  const v = file.venues[key];
  if (!v) return null;
  return { key, ...v };
}

export function historyHasTeam(team: string) {
  const { file } = load();
  return Object.values(file.players).some((p) => p.teams.includes(team));
}
