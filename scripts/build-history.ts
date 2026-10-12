/**
 * Build data/history/t20i_male.json from Cricsheet's t20s_male JSON dump.
 *
 * Prereqs (run from repo root):
 *   mkdir -p .cache/cricsheet && cd .cache/cricsheet
 *   curl -LO https://cricsheet.org/downloads/t20s_male_json.zip
 *   curl -LO https://cricsheet.org/register/names.csv
 *   unzip -q t20s_male_json.zip -d t20s_male_json
 * Then: npx tsx scripts/build-history.ts
 *
 * Cricsheet files are treated strictly as data.
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { SCORING_VERSION, scoreCricsheetMatch, type CricsheetMatch } from "../src/lib/domain/scoring";

const ROOT = process.cwd();
const CACHE = path.join(ROOT, ".cache", "cricsheet");
const MATCH_DIR = path.join(CACHE, "t20s_male_json");
const NAMES_CSV = path.join(CACHE, "names.csv");
const OUT = path.join(ROOT, "data", "history", "t20i_male.json");

const DATASET_URL = "https://cricsheet.org/downloads/t20s_male_json.zip";
const MIN_DATE = "2022-01-01";
const MAX_RECS = 40;
const MAX_ALT_NAMES = 5;
const SIZE_LIMIT = 6 * 1024 * 1024;
const RECENT_CUTOFF = "2023-01-01";
const FULL_MEMBERS = new Set([
  "India",
  "Australia",
  "England",
  "South Africa",
  "New Zealand",
  "Pakistan",
  "Sri Lanka",
  "West Indies",
  "Bangladesh",
  "Afghanistan",
  "Zimbabwe",
  "Ireland",
]);

type Rec = [
  date: string,
  venueKey: string,
  team: string,
  opp: string,
  pts: number,
  batPts: number,
  bowlPts: number,
  fieldPts: number,
  ballsFaced: number,
  ballsBowled: number,
  runs: number,
  wickets: number,
];

interface VenueOut {
  name: string;
  city: string | null;
  matches: number;
  avgFirstInnings: number | null;
  avgSecondInnings: number | null;
  chaseWinPct: number | null;
  batIndex: number | null;
  bowlIndex: number | null;
  batIndexN: number;
  bowlIndexN: number;
  aliases: string[];
}

interface PlayerOut {
  name: string;
  altNames: string[];
  teams: string[];
  lastDate: string;
  recs: Rec[];
}

interface HistoryFile {
  meta: {
    source: "Cricsheet";
    dataset: "t20s_male";
    url: string;
    license: "ODC-BY 1.0";
    attribution: "Ball-by-ball data from Cricsheet (cricsheet.org), ODC-BY 1.0";
    generatedAt: string;
    firstDate: string;
    lastDate: string;
    matches: number;
    scoringVersion: string;
    notes: string[];
  };
  venues: Record<string, VenueOut>;
  players: Record<string, PlayerOut>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const mean = (sum: number, n: number) => (n > 0 ? r2(sum / n) : null);

export function venueKeyOf(venue: string): string {
  const head = venue.split(",")[0].toLowerCase();
  return head.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

interface VenueAcc {
  names: Map<string, number>; // raw "before comma" display names -> count
  cities: Map<string, number>;
  aliases: Set<string>;
  lastDate: string;
  latestName: string;
  matches: number;
  inn1Sum: number;
  inn1N: number;
  inn2Sum: number;
  inn2N: number;
  decided: number;
  chaseWins: number;
  batSum: number;
  batN: number;
  bowlSum: number;
  bowlN: number;
}

interface PlayerAcc {
  names: { date: string; name: string }[];
  recs: { sortKey: string; rec: Rec }[];
}

function loadAltNames(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!fs.existsSync(NAMES_CSV)) {
    console.warn(`names.csv not found at ${NAMES_CSV}; altNames will be empty`);
    return out;
  }
  const parsed = Papa.parse<{ identifier: string; name: string }>(fs.readFileSync(NAMES_CSV, "utf8"), {
    header: true,
    skipEmptyLines: true,
  });
  for (const row of parsed.data) {
    if (!row.identifier || !row.name) continue;
    const list = out.get(row.identifier) ?? [];
    if (!list.includes(row.name)) list.push(row.name);
    out.set(row.identifier, list);
  }
  return out;
}

function hasDeliveries(m: CricsheetMatch): boolean {
  return (m.innings ?? []).some((i) => !i.super_over && (i.overs ?? []).some((o) => (o.deliveries ?? []).length > 0));
}

function main() {
  if (!fs.existsSync(MATCH_DIR)) {
    throw new Error(`Match dir not found: ${MATCH_DIR}`);
  }
  const files = fs
    .readdirSync(MATCH_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10) || a.localeCompare(b));

  const venues = new Map<string, VenueAcc>();
  const players = new Map<string, PlayerAcc>();
  const appearances: { venueKey: string; batPts: number; bowlPts: number; ballsBowled: number }[] = [];

  let included = 0;
  let skippedDate = 0;
  let skippedType = 0;
  let skippedEmpty = 0;
  let firstDate = "9999-12-31";
  let lastDate = "0000-01-01";

  for (const file of files) {
    let m: CricsheetMatch;
    try {
      m = JSON.parse(fs.readFileSync(path.join(MATCH_DIR, file), "utf8")) as CricsheetMatch;
    } catch {
      console.warn(`skip unparsable ${file}`);
      continue;
    }
    const info = m.info;
    const date = info?.dates?.[0];
    if (!date || date < MIN_DATE) {
      skippedDate++;
      continue;
    }
    if (info.match_type !== "T20" || (info.gender && info.gender !== "male")) {
      skippedType++;
      continue;
    }
    if (!hasDeliveries(m)) {
      skippedEmpty++;
      continue;
    }
    included++;
    if (date < firstDate) firstDate = date;
    if (date > lastDate) lastDate = date;

    const rawVenue = (info.venue ?? "Unknown").trim();
    const vKey = venueKeyOf(rawVenue);
    let v = venues.get(vKey);
    if (!v) {
      v = {
        names: new Map(),
        cities: new Map(),
        aliases: new Set(),
        lastDate: "",
        latestName: "",
        matches: 0,
        inn1Sum: 0,
        inn1N: 0,
        inn2Sum: 0,
        inn2N: 0,
        decided: 0,
        chaseWins: 0,
        batSum: 0,
        batN: 0,
        bowlSum: 0,
        bowlN: 0,
      };
      venues.set(vKey, v);
    }
    const displayName = rawVenue.split(",")[0].trim();
    v.names.set(displayName, (v.names.get(displayName) ?? 0) + 1);
    if (info.city) v.cities.set(info.city, (v.cities.get(info.city) ?? 0) + 1);
    v.aliases.add(rawVenue);
    if (date >= v.lastDate) {
      v.lastDate = date;
      v.latestName = displayName;
    }
    v.matches++;

    // innings totals (regular innings only); skip no-result matches to avoid truncated totals
    const regular = (m.innings ?? []).filter((i) => !i.super_over);
    const noResult = info.outcome?.result === "no result";
    const totals = regular.map((i) =>
      (i.overs ?? []).reduce((s, o) => s + (o.deliveries ?? []).reduce((t, d) => t + (d.runs?.total ?? 0), 0), 0),
    );
    if (!noResult) {
      if (totals.length >= 1) {
        v.inn1Sum += totals[0];
        v.inn1N++;
      }
      if (totals.length >= 2) {
        v.inn2Sum += totals[1];
        v.inn2N++;
      }
    }
    const winner = info.outcome?.winner;
    if (winner && regular.length >= 1) {
      const firstBat = regular[0].team;
      const secondBat = regular[1]?.team ?? info.teams.find((t) => t !== firstBat);
      v.decided++;
      if (winner === secondBat) v.chaseWins++;
    }

    // player points
    const scored = scoreCricsheetMatch(m);
    const registry = info.registry?.people ?? {};
    const matchId = file.replace(/\.json$/, "");
    for (const p of scored.values()) {
      appearances.push({ venueKey: vKey, batPts: p.batPts, bowlPts: p.bowlPts, ballsBowled: p.ballsBowled });
      v.batSum += p.batPts;
      v.batN++;
      if (p.ballsBowled > 0) {
        v.bowlSum += p.bowlPts;
        v.bowlN++;
      }
      const id = registry[p.name];
      if (!id) continue;
      const opp = info.teams.find((t) => t !== p.team) ?? "";
      const rec: Rec = [
        date,
        vKey,
        p.team,
        opp,
        p.pts,
        p.batPts,
        p.bowlPts,
        p.fieldPts,
        p.ballsFaced,
        p.ballsBowled,
        p.runs,
        p.wickets,
      ];
      let pa = players.get(id);
      if (!pa) {
        pa = { names: [], recs: [] };
        players.set(id, pa);
      }
      pa.names.push({ date, name: p.name });
      pa.recs.push({ sortKey: `${date}|${matchId.padStart(12, "0")}`, rec });
    }
  }

  // global means for indices
  let gBatSum = 0;
  let gBatN = 0;
  let gBowlSum = 0;
  let gBowlN = 0;
  for (const a of appearances) {
    gBatSum += a.batPts;
    gBatN++;
    if (a.ballsBowled > 0) {
      gBowlSum += a.bowlPts;
      gBowlN++;
    }
  }
  const gBat = gBatN ? gBatSum / gBatN : 0;
  const gBowl = gBowlN ? gBowlSum / gBowlN : 0;

  const venuesOut: Record<string, VenueOut> = {};
  for (const [key, v] of [...venues.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const topCity = [...v.cities.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    venuesOut[key] = {
      name: v.latestName,
      city: topCity,
      matches: v.matches,
      avgFirstInnings: mean(v.inn1Sum, v.inn1N),
      avgSecondInnings: mean(v.inn2Sum, v.inn2N),
      chaseWinPct: v.decided >= 1 ? r2((v.chaseWins / v.decided) * 100) : null,
      batIndex: v.batN > 0 && gBat !== 0 ? r2(v.batSum / v.batN / gBat) : null,
      bowlIndex: v.bowlN > 0 && gBowl !== 0 ? r2(v.bowlSum / v.bowlN / gBowl) : null,
      batIndexN: v.batN,
      bowlIndexN: v.bowlN,
      aliases: [...v.aliases].sort(),
    };
  }

  const altNamesById = loadAltNames();
  const buildPlayers = (filter: (pa: PlayerAcc, teams: string[]) => boolean): Record<string, PlayerOut> => {
    const out: Record<string, PlayerOut> = {};
    for (const id of [...players.keys()].sort()) {
      const pa = players.get(id)!;
      const sorted = [...pa.recs].sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
      const teams: string[] = [];
      for (const { rec } of sorted) if (!teams.includes(rec[2])) teams.push(rec[2]);
      if (!filter(pa, teams)) continue;
      const latestName = [...pa.names].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0].name;
      out[id] = {
        name: latestName,
        altNames: (altNamesById.get(id) ?? []).filter((n) => n !== latestName).slice(0, MAX_ALT_NAMES),
        teams,
        lastDate: sorted[0].rec[0],
        recs: sorted.slice(0, MAX_RECS).map((s) => s.rec),
      };
    }
    return out;
  };

  const notes: string[] = [
    `Matches with date >= ${MIN_DATE}, match_type T20, gender male; matches with no regular-innings deliveries skipped.`,
    "Points approximate the official Dream11 T20 system (2026) from ball-by-ball data; role-dependent rules (duck, strike rate) are approximated from bowling usage; run-out direct hits are approximated as 'single fielder listed'.",
    "Super-over innings are excluded from points and venue stats.",
    "avgFirstInnings/avgSecondInnings exclude 'no result' matches; chaseWinPct uses matches with an outright winner (ties excluded).",
    "batIndex/bowlIndex = venue mean per player-appearance / global mean (bowlIndex only over appearances with ballsBowled > 0).",
    `recs are most recent first, at most ${MAX_RECS} per player. Rec = [date, venueKey, team, opp, pts, batPts, bowlPts, fieldPts, ballsFaced, ballsBowled, runs, wickets].`,
    "altNames come from Cricsheet register names.csv and exclude the primary name.",
  ];

  const build = (playersOut: Record<string, PlayerOut>, extraNotes: string[]): HistoryFile => ({
    meta: {
      source: "Cricsheet",
      dataset: "t20s_male",
      url: DATASET_URL,
      license: "ODC-BY 1.0",
      attribution: "Ball-by-ball data from Cricsheet (cricsheet.org), ODC-BY 1.0",
      generatedAt: new Date().toISOString(),
      firstDate,
      lastDate,
      matches: included,
      scoringVersion: SCORING_VERSION,
      notes: [...notes, ...extraNotes],
    },
    venues: venuesOut,
    players: playersOut,
  });

  let playersOut = buildPlayers(() => true);
  let json = JSON.stringify(build(playersOut, []));
  if (Buffer.byteLength(json) > SIZE_LIMIT) {
    const before = Object.keys(playersOut).length;
    playersOut = buildPlayers((pa, teams) => {
      const recentMatches = pa.recs.filter((r) => r.rec[0] >= RECENT_CUTOFF).length;
      return recentMatches >= 3 || teams.some((t) => FULL_MEMBERS.has(t));
    });
    const after = Object.keys(playersOut).length;
    json = JSON.stringify(
      build(playersOut, [
        `Size-limited: players restricted to those with >= 3 matches since ${RECENT_CUTOFF} or who played for a full member (+Ireland/Zimbabwe/Afghanistan) team (${after} of ${before} kept).`,
      ]),
    );
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  const bytes = Buffer.byteLength(json);
  console.log(
    JSON.stringify({
      files: files.length,
      included,
      skippedDate,
      skippedType,
      skippedEmpty,
      venues: Object.keys(venuesOut).length,
      players: Object.keys(playersOut).length,
      bytes,
      mb: r2(bytes / 1024 / 1024),
      out: path.relative(ROOT, OUT),
    }),
  );
}

main();
