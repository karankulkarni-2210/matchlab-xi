import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { cachedFetch, fetchJson, ProviderError, type Sourced } from "./cache";

/**
 * CricketData.org (CricAPI v1) — free plan, 100 hits/day.
 * Observed 2026-10-12: match_squad works on the free plan but costs 10 hits; it returns the whole tour
 * squad (ODI + T20I), not the match XI. matchType is sometimes wrong ("odi" for T20Is).
 */
const BASE = "https://api.cricapi.com/v1";
export const CD_SOURCE_URL = "https://cricketdata.org";

export interface TrackedSeries {
  id: string;
  label: string;
  kind: "international" | "league";
  /** First and last T20 fixture dates (YYYY-MM-DD, from CricketData series search). */
  from: string;
  to: string;
}

/**
 * Series MatchLab tracks on the Match Desk (IDs verified via CricketData series search, 2026-10-12 and 2026-10-15).
 * Men's T20 only: internationals plus franchise/domestic leagues that share Dream11's T20 scoring.
 */
export const TRACKED_SERIES: TrackedSeries[] = [
  { id: "702ce6cb-a551-4aab-961e-0ed1548a3c74", label: "West Indies tour of India, 2026", kind: "international", from: "2026-10-06", to: "2026-10-17" },
  { id: "a67cb0af-300c-4449-8e80-e006301e5706", label: "Sri Lanka tour of Pakistan, 2026", kind: "international", from: "2026-10-09", to: "2026-10-13" },
  { id: "7d61737b-c4d8-4f44-b8cb-309ce4d9c57a", label: "Afghanistan vs Zimbabwe in UAE, 2026", kind: "international", from: "2026-10-27", to: "2026-11-01" },
  { id: "3010394d-4de6-4843-8782-f41ecadf17b7", label: "CSA T20 Challenge 2026", kind: "league", from: "2026-09-25", to: "2026-11-14" },
  { id: "d7c7977a-0a0a-41d2-9e2b-6481943eee7c", label: "Syed Mushtaq Ali Trophy 2026", kind: "league", from: "2026-11-14", to: "2026-12-06" },
  { id: "03ae5892-ea9f-4662-95f4-879d04dd2399", label: "International League T20 2026", kind: "league", from: "2026-11-21", to: "2026-12-20" },
  { id: "c6ae878d-fcb7-4342-a7d7-a65ee3fe3de2", label: "Big Bash League 2026-27", kind: "league", from: "2026-12-12", to: "2027-01-26" },
  { id: "f55cb152-7e06-4640-b4d6-abf7af1b7bba", label: "Super Smash 2026-27", kind: "league", from: "2026-12-27", to: "2027-01-30" },
  { id: "945b11eb-ccb7-46af-b0bb-3dcda50330dd", label: "SA20 2027", kind: "league", from: "2027-01-17", to: "2027-02-21" },
];

const DAY = 86400e3;
/** Quota guard: a series is only fetched from 14 days before its first T20 to 7 days after its last. */
export function seriesInWindow(s: Pick<TrackedSeries, "from" | "to">, nowMs: number) {
  return nowMs >= Date.parse(`${s.from}T00:00:00Z`) - 14 * DAY && nowMs <= Date.parse(`${s.to}T23:59:59Z`) + 7 * DAY;
}

export function seasonStatus(s: Pick<TrackedSeries, "from" | "to">, nowMs: number): "upcoming" | "live" | "ended" {
  if (nowMs < Date.parse(`${s.from}T00:00:00Z`)) return "upcoming";
  if (nowMs > Date.parse(`${s.to}T23:59:59Z`)) return "ended";
  return "live";
}

const Info = z.object({ hitsToday: z.number().optional(), hitsLimit: z.number().optional() }).passthrough();
// `data` is omitted on failures (e.g. quota exceeded), so it must be optional.
const Envelope = z.object({ status: z.string(), reason: z.string().optional(), info: Info.optional(), data: z.unknown().optional() });

const MatchRaw = z
  .object({
    id: z.string(),
    name: z.string(),
    matchType: z.string().nullable().optional(),
    status: z.string().optional().default(""),
    venue: z.string().optional().default(""),
    date: z.string().optional(),
    dateTimeGMT: z.string(),
    teams: z.array(z.string()).min(2),
    teamInfo: z.array(z.object({ name: z.string(), shortname: z.string().optional(), img: z.string().optional() })).optional(),
    series_id: z.string().optional(),
    fantasyEnabled: z.boolean().optional(),
    hasSquad: z.boolean().optional(),
    matchStarted: z.boolean().optional(),
    matchEnded: z.boolean().optional(),
    tossWinner: z.string().optional(),
    tossChoice: z.string().optional(),
    matchWinner: z.string().optional(),
  })
  .passthrough();
type MatchRawT = z.infer<typeof MatchRaw>;

const SquadRaw = z.array(
  z.object({
    teamName: z.string(),
    shortname: z.string().optional(),
    players: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        role: z.string().nullable().optional(),
        battingStyle: z.string().nullable().optional(),
        bowlingStyle: z.string().nullable().optional(),
      }),
    ),
  }),
);
export type SquadTeam = z.infer<typeof SquadRaw>[number];

export interface MatchSummary {
  id: string;
  name: string;
  title: string; // e.g. "4th T20I"
  teams: [string, string];
  teamShort: [string, string];
  venue: string;
  city: string | null;
  startsAt: string; // ISO UTC
  statusText: string;
  started: boolean;
  ended: boolean;
  format: "T20" | "ODI" | "Test" | "Other";
  formatNote: string | null;
  seriesId: string | null;
  hasSquad: boolean;
  toss: string | null;
  winner: string | null;
}

let lastQuota: { hitsToday: number; hitsLimit: number; at: string } | null = null;
export const quotaSnapshot = () => lastQuota;

async function call(pathAndQuery: string, revalidate: number, setAsOf?: (d: string | null) => void) {
  if (!env.cricketDataApiKey) throw new ProviderError("CRICKETDATA_API_KEY not configured", "config");
  if (lastQuota && lastQuota.hitsToday >= lastQuota.hitsLimit - 5)
    throw new ProviderError(`CricketData daily limit nearly used (${lastQuota.hitsToday}/${lastQuota.hitsLimit}); showing saved snapshots`, "quota");
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  // _d (UTC day) bounds how long any cached provider response — including a quota failure — can live: quota resets daily.
  const day = new Date().toISOString().slice(0, 10);
  const raw = await fetchJson(`${BASE}/${pathAndQuery}${sep}_d=${day}&apikey=${encodeURIComponent(env.cricketDataApiKey)}`, { revalidate, onDate: setAsOf });
  const parsed = Envelope.safeParse(raw);
  if (!parsed.success) throw new ProviderError("Malformed CricketData response", "invalid");
  const { status, reason, info, data } = parsed.data;
  if (info?.hitsToday !== undefined && info.hitsLimit !== undefined)
    lastQuota = { hitsToday: info.hitsToday, hitsLimit: info.hitsLimit, at: new Date().toISOString() };
  if (status !== "success") {
    const quota = /limit|quota|hits|blocked/i.test(reason ?? "");
    throw new ProviderError(
      quota ? "CricketData free-plan daily limit (100 calls) reached. Resets at 05:30 IST" : `CricketData: ${reason ?? "request failed"}`,
      quota ? "quota" : "http",
    );
  }
  return data;
}

export function inferFormat(m: Pick<MatchRawT, "name" | "matchType">): { format: MatchSummary["format"]; note: string | null } {
  const byName = /\bT20I?\b|Twenty20/i.test(m.name) ? "T20" : /\bODI\b/i.test(m.name) ? "ODI" : /\bTest\b/i.test(m.name) ? "Test" : null;
  const byType = m.matchType === "t20" ? "T20" : m.matchType === "odi" ? "ODI" : m.matchType === "test" ? "Test" : null;
  if (byName && byType && byName !== byType)
    return { format: byName, note: `Provider labels this "${m.matchType}"; format taken from the match name (${byName}).` };
  return { format: (byName ?? byType ?? "Other") as MatchSummary["format"], note: null };
}

export function normaliseMatch(m: MatchRawT): MatchSummary {
  const short = (name: string) => m.teamInfo?.find((t) => t.name === name)?.shortname ?? name.slice(0, 3).toUpperCase();
  const { format, note } = inferFormat(m);
  const parts = m.venue.split(",").map((s) => s.trim());
  const title = m.name.split(",")[1]?.trim() ?? m.name;
  return {
    id: m.id,
    name: m.name,
    title,
    teams: [m.teams[0], m.teams[1]],
    teamShort: [short(m.teams[0]), short(m.teams[1])],
    venue: m.venue,
    city: parts.length > 1 ? parts[parts.length - 1] : null,
    startsAt: m.dateTimeGMT.endsWith("Z") ? m.dateTimeGMT : `${m.dateTimeGMT}Z`,
    statusText: m.status ?? "",
    started: !!m.matchStarted,
    ended: !!m.matchEnded,
    format,
    formatNote: note,
    seriesId: m.series_id ?? null,
    hasSquad: !!m.hasSquad,
    toss: m.tossWinner ? `${m.tossWinner} chose to ${m.tossChoice ?? "?"}` : null,
    winner: m.matchWinner ?? null,
  };
}

export async function getSeriesMatches(seriesId: string): Promise<Sourced<MatchSummary[]>> {
  return cachedFetch(`cd:series:${seriesId}`, "CricketData series_info", 3 * 3600, async ({ setAsOf }) => {
    const data = (await call(`series_info?id=${encodeURIComponent(seriesId)}`, 3 * 3600, setAsOf)) as { matchList?: unknown };
    const list = z.array(MatchRaw).safeParse(data?.matchList);
    if (!list.success) throw new ProviderError("Malformed series match list", "invalid");
    return list.data.map(normaliseMatch);
  });
}

export async function getMatchInfo(id: string, forceRefresh = false): Promise<Sourced<MatchSummary>> {
  return cachedFetch(
    `cd:match:${id}`,
    "CricketData match_info",
    20 * 60,
    async ({ setAsOf }) => {
      const m = MatchRaw.safeParse(await call(`match_info?id=${encodeURIComponent(id)}`, forceRefresh ? 0 : 20 * 60, setAsOf));
      if (!m.success) throw new ProviderError("Malformed match_info response", "invalid");
      return normaliseMatch(m.data);
    },
    { forceRefresh },
  );
}

/** Tour squad (costs 10 hits on the free plan) — cached for 12 hours. */
export async function getMatchSquad(id: string): Promise<Sourced<SquadTeam[]>> {
  return cachedFetch(`cd:squad:${id}`, "CricketData match_squad", 12 * 3600, async ({ setAsOf }) => {
    const s = SquadRaw.safeParse(await call(`match_squad?id=${encodeURIComponent(id)}`, 12 * 3600, setAsOf));
    if (!s.success) throw new ProviderError("Malformed match_squad response", "invalid");
    return s.data;
  });
}

export function providerRoleToContest(role: string | null | undefined) {
  if (!role) return null;
  const r = role.toLowerCase();
  if (r.includes("wk")) return "WK" as const;
  if (r.includes("allrounder")) return "AR" as const;
  if (r.includes("bowler")) return "BOWL" as const;
  if (r.includes("bats")) return "BAT" as const;
  return null;
}
