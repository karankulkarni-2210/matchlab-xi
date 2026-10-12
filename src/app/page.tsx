import Link from "next/link";
import { ArrowRight, CalendarClock, FlaskConical, MapPin, TriangleAlert } from "lucide-react";
import { ago, Card, fmtTime, FreshnessPill, Initials, Pill } from "@/components/ui";
import { DEMO_MATCH } from "@/lib/demo/demo";
import { listMatches, splitFixtures, type SourceBadge } from "@/lib/server/match";
import type { MatchSummary } from "@/lib/providers/cricketdata";

export const dynamic = "force-dynamic";
export const metadata = { title: "Match Desk · MatchLab XI" };

function MatchCard({ m, demo = false }: { m: MatchSummary; demo?: boolean }) {
  const upcoming = !m.started;
  return (
    <article className="panel flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-muted">{m.title}</div>
        {demo ? (
          <Pill tone="info">
            <FlaskConical size={12} /> Synthetic demo
          </Pill>
        ) : m.ended ? (
          <Pill tone="muted">Completed</Pill>
        ) : m.started ? (
          <Pill tone="warn">Live</Pill>
        ) : (
          <Pill tone="lime">Upcoming</Pill>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Initials name={m.teamShort[0]} size={42} />
          <div className="min-w-0">
            <div className="truncate font-semibold">{m.teams[0]}</div>
            <div className="text-xs text-faint">{m.teamShort[0]}</div>
          </div>
        </div>
        <span className="text-xs text-faint">vs</span>
        <div className="flex min-w-0 items-center gap-2 text-right">
          <div className="min-w-0">
            <div className="truncate font-semibold">{m.teams[1]}</div>
            <div className="text-xs text-faint">{m.teamShort[1]}</div>
          </div>
          <Initials name={m.teamShort[1]} tone="warn" size={42} />
        </div>
      </div>
      <dl className="space-y-1.5 text-sm text-muted">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="shrink-0 text-faint" aria-hidden />
          <dt className="sr-only">Venue</dt>
          <dd className="truncate">{m.venue}</dd>
        </div>
        <div className="flex items-center gap-2">
          <CalendarClock size={14} className="shrink-0 text-faint" aria-hidden />
          <dt className="sr-only">Start</dt>
          <dd className="num">
            {fmtTime(m.startsAt)} IST {upcoming && !demo ? <span className="text-faint">· starts {ago(m.startsAt)}</span> : null}
          </dd>
        </div>
        {m.winner || (m.ended && m.statusText) ? <div className="text-xs text-faint">{m.statusText}</div> : null}
        {m.formatNote && (
          <div className="flex items-start gap-1.5 text-xs text-warn">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden /> {m.formatNote}
          </div>
        )}
      </dl>
      <Link
        href={`/build/${m.id}`}
        className="focus-ring mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-lime px-4 py-2.5 text-sm font-semibold text-ink hover:bg-lime-2"
      >
        {m.ended ? "Open evidence" : "Build XI"} <ArrowRight size={16} aria-hidden />
      </Link>
    </article>
  );
}

function Sources({ sources, errors }: { sources: SourceBadge[]; errors: string[] }) {
  return (
    <Card title="Data sources & freshness">
      <ul className="space-y-2.5 text-sm">
        {sources.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium">{s.label}</div>
              <div className="text-xs text-faint">
                {s.provider} · {s.detail}
              </div>
            </div>
            <FreshnessPill status={s.status} asOf={s.asOf} />
          </li>
        ))}
      </ul>
      {errors.length > 0 && (
        <div role="alert" className="mt-3 rounded-lg border border-bad/30 bg-bad/10 p-3 text-xs text-bad">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-faint">
        CricketData free plan allows 100 calls/day; fixtures are cached for 3 h, match status 20 min, squads 12 h. A failed refresh keeps the last good snapshot and marks it stale.
      </p>
    </Card>
  );
}

export default async function MatchDesk() {
  let data: Awaited<ReturnType<typeof listMatches>>;
  try {
    data = await listMatches();
  } catch (e) {
    data = { matches: [], sources: [], errors: [(e as Error).message] };
  }
  const { upcoming, recent } = splitFixtures(data.matches);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime">Match Desk</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Pick a match. See the evidence.</h1>
          <p className="mt-1 max-w-2xl text-muted">
            Live T20 fixtures from CricketData, player and venue history from Cricsheet, weather from Open-Meteo. Every number shows where it came from and how fresh it is.
          </p>
        </div>
      </header>

      <section aria-labelledby="up">
        <h2 id="up" className="mb-3 text-sm font-semibold text-muted">
          Upcoming T20 fixtures (real)
        </h2>
        {upcoming.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        ) : (
          <div className="panel p-6 text-sm text-muted">
            No upcoming T20 fixtures could be loaded right now{data.errors.length ? " (see source errors below)" : ""}. The labelled demo below still works end to end.
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section aria-labelledby="demo" className="space-y-3">
          <h2 id="demo" className="text-sm font-semibold text-muted">
            Try the full loop with demo data
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <MatchCard m={{ ...DEMO_MATCH, teams: [...DEMO_MATCH.teams] as [string, string], teamShort: [...DEMO_MATCH.teamShort] as [string, string] }} demo />
            <div className="panel space-y-3 p-4 text-sm text-muted">
              <p className="font-semibold text-warm">What the demo includes</p>
              <p>Fictional teams with confirmed lineups and contest credits, so you can build a Ready XI, then review 9 synthetic past matches and run the Learning Lab without signing in.</p>
              <p className="text-xs text-faint">Everything in the demo is synthetic and labelled. It is never mixed with real data or real accuracy metrics.</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link className="focus-ring rounded-lg border border-line-2 px-3 py-1.5 text-warm hover:border-lime/50" href="/review">
                  Match Review
                </Link>
                <Link className="focus-ring rounded-lg border border-line-2 px-3 py-1.5 text-warm hover:border-lime/50" href="/learning">
                  Learning Lab
                </Link>
              </div>
            </div>
          </div>
          {recent.length > 0 && (
            <>
              <h2 className="pt-3 text-sm font-semibold text-muted">Recently completed (enter actuals in Match Review after saving a team)</h2>
              <ul className="panel divide-y divide-line text-sm">
                {recent.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span>
                      {m.teamShort[0]} vs {m.teamShort[1]} · {m.title}
                    </span>
                    <span className="text-xs text-faint">{m.statusText}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <Sources sources={data.sources} errors={data.errors} />
      </div>
    </div>
  );
}
