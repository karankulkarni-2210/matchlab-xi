import "server-only";
import type { PlayerHistory, VenueProfile } from "@/lib/domain/forecast";
import { DEMO_MATCH, DEMO_MATCH_ID, DEMO_VENUE, demoHistory } from "@/lib/demo/demo";
import { ProviderError, type Sourced } from "@/lib/providers/cache";
import {
  CD_SOURCE_URL,
  getMatchInfo,
  getMatchSquad,
  getSeriesMatches,
  providerRoleToContest,
  TRACKED_SERIES,
  type MatchSummary,
  type SquadTeam,
} from "@/lib/providers/cricketdata";
import { globalMeanPts, historyMeta, matchPlayer, venueProfile, type MatchMethod } from "@/lib/providers/history";
import { getMatchWeather, OPEN_METEO_URL, type MatchWeather } from "@/lib/providers/weather";

export interface SourceBadge {
  id: string;
  label: string;
  provider: string;
  url: string;
  asOf: string | null;
  status: "fresh" | "cached" | "stale" | "missing" | "synthetic" | "static";
  detail: string;
}

export interface SquadPlayer {
  key: string;
  name: string;
  team: string;
  providerRole: string | null;
  role: ReturnType<typeof providerRoleToContest>;
  history: PlayerHistory | null;
  matchMethod: MatchMethod | "synthetic";
  historyName: string | null;
  lastT20I: string | null;
}

export interface MatchBundle {
  isDemo: boolean;
  match: MatchSummary;
  venue: (VenueProfile & { city: string | null; aliases: string[] }) | null;
  weather: MatchWeather | null;
  weatherNote: string | null;
  squad: SquadPlayer[];
  squadNote: string | null;
  sources: SourceBadge[];
  globalMeanPts: number;
  historyAsOf: string;
}

const badge = (id: string, label: string, s: Sourced<unknown>, url: string, detail: string): SourceBadge => ({
  id,
  label,
  provider: s.provider,
  url,
  asOf: s.fetchedAt,
  status: s.status,
  detail: s.error ? `${detail} — refresh failed: ${s.error}` : detail,
});

export async function listMatches(): Promise<{ matches: MatchSummary[]; sources: SourceBadge[]; errors: string[] }> {
  const matches: MatchSummary[] = [];
  const sources: SourceBadge[] = [];
  const errors: string[] = [];
  await Promise.all(
    TRACKED_SERIES.map(async (s) => {
      try {
        const r = await getSeriesMatches(s.id);
        matches.push(...r.data);
        sources.push(badge(`series:${s.id}`, s.label, r, CD_SOURCE_URL, `${r.data.length} fixtures`));
      } catch (e) {
        errors.push(`${s.label}: ${(e as Error).message}`);
        sources.push({
          id: `series:${s.id}`,
          label: s.label,
          provider: "CricketData series_info",
          url: CD_SOURCE_URL,
          asOf: null,
          status: "missing",
          detail: (e as ProviderError).message,
        });
      }
    }),
  );
  const t20 = matches.filter((m) => m.format === "T20").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { matches: t20, sources, errors };
}

/** Splits fixtures into upcoming (not ended, starting no more than 6 h ago) and recently completed. */
export function splitFixtures(matches: MatchSummary[], nowMs: number = Date.now()) {
  return {
    upcoming: matches.filter((m) => m.hasSquad && !m.ended && new Date(m.startsAt).getTime() > nowMs - 6 * 3600e3),
    recent: matches.filter((m) => m.ended).slice(-3).reverse(),
  };
}

const historySource = (): SourceBadge => {
  const meta = historyMeta();
  return {
    id: "cricsheet",
    label: "Player & venue history",
    provider: "Cricsheet (men's T20Is)",
    url: "https://cricsheet.org",
    asOf: meta.lastDate,
    status: "static",
    detail: `${meta.matches} T20Is ${meta.firstDate} → ${meta.lastDate}; points use MatchLab's approximation of Dream11 T20 scoring. ${meta.license}.`,
  };
};

export async function getMatchBundle(matchId: string): Promise<MatchBundle> {
  if (matchId === DEMO_MATCH_ID) return demoBundle();

  const info = await getMatchInfo(matchId);
  const match = info.data;
  const sources: SourceBadge[] = [badge("match", "Fixture & status", info, CD_SOURCE_URL, match.statusText)];

  let squadTeams: SquadTeam[] = [];
  let squadNote: string | null = null;
  try {
    const sq = await getMatchSquad(matchId);
    squadTeams = sq.data;
    const total = sq.data.reduce((n, t) => n + t.players.length, 0);
    if (total === 0) {
      squadNote = "CricketData has not published a squad for this fixture yet, so there is no player pool. Add players with the contest CSV, or check back once squads are announced.";
      sources.push({ id: "squad", label: "Squads", provider: "CricketData match_squad", url: CD_SOURCE_URL, asOf: sq.fetchedAt, status: "missing", detail: "No squad published yet" });
    } else {
      const sizes = sq.data.map((t) => `${t.teamName} ${t.players.length}`).join(", ");
      squadNote = `Provider squad lists the whole tour (${sizes}); it is not the match XI. Confirm your contest pool.`;
      sources.push(badge("squad", "Squads", sq, CD_SOURCE_URL, sizes));
    }
  } catch (e) {
    squadNote = `Squad unavailable: ${(e as Error).message}`;
    sources.push({ id: "squad", label: "Squads", provider: "CricketData match_squad", url: CD_SOURCE_URL, asOf: null, status: "missing", detail: squadNote });
  }

  const squad: SquadPlayer[] = [];
  for (const t of squadTeams) {
    const team = match.teams.find((x) => x.toLowerCase() === t.teamName.toLowerCase()) ?? t.teamName;
    for (const p of t.players) {
      const hm = matchPlayer(p.name, team);
      squad.push({
        key: p.id,
        name: p.name,
        team,
        providerRole: p.role ?? null,
        role: providerRoleToContest(p.role),
        history: hm.history,
        matchMethod: hm.method,
        historyName: hm.historyName,
        lastT20I: hm.lastDate,
      });
    }
  }

  const venue = venueProfile(match.venue);
  sources.push(historySource());

  let weather: MatchWeather | null = null;
  let weatherNote: string | null = null;
  if (match.city) {
    const w = await getMatchWeather(match.city, match.startsAt);
    if ("unavailable" in w) {
      weatherNote = w.unavailable;
      sources.push({ id: "weather", label: "Weather", provider: "Open-Meteo", url: OPEN_METEO_URL, asOf: null, status: "missing", detail: w.unavailable });
    } else {
      weather = w.data;
      sources.push(badge("weather", "Weather", w, OPEN_METEO_URL, `${w.data.place} at ${w.data.hourUtc} UTC`));
    }
  } else {
    weatherNote = "Venue city unknown; no forecast.";
  }

  return {
    isDemo: false,
    match,
    venue,
    weather,
    weatherNote,
    squad,
    squadNote,
    sources,
    globalMeanPts: globalMeanPts(),
    historyAsOf: historyMeta().lastDate,
  };
}

function demoBundle(): MatchBundle {
  const hist = demoHistory();
  return {
    isDemo: true,
    match: { ...DEMO_MATCH, teams: [...DEMO_MATCH.teams] as [string, string], teamShort: [...DEMO_MATCH.teamShort] as [string, string] },
    venue: DEMO_VENUE,
    weather: null,
    weatherNote: "Synthetic fixture — no real weather.",
    squad: [...hist.values()].map((h) => ({
      key: h.id,
      name: h.name,
      team: h.recs[0].team,
      providerRole: null,
      role: null,
      history: h,
      matchMethod: "synthetic",
      historyName: h.name,
      lastT20I: h.recs[0].date,
    })),
    squadNote: null,
    sources: [
      {
        id: "demo",
        label: "Demo dataset",
        provider: "MatchLab synthetic seed",
        url: "",
        asOf: "2026-10-12T08:00:00Z",
        status: "synthetic",
        detail: "Fictional teams, players, credits, history and results. Not real data.",
      },
    ],
    globalMeanPts: 40,
    historyAsOf: "2026-10-01",
  };
}
