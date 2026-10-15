import Link from "next/link";
import { CalendarClock, ChevronDown, Database, FlaskConical, MapPin, TriangleAlert } from "lucide-react";
import { BatIcon, BallIcon } from "@/components/cricket/icons";
import { StadiumScene } from "@/components/cricket/StadiumScene";
import { ago, cx, fmtTime, FreshnessPill, Initials, Pill } from "@/components/ui";
import { DEMO_MATCH, DEMO_MATCH_ID } from "@/lib/demo/demo";
import { listMatches, splitFixtures, trackedSeasons, type SourceBadge } from "@/lib/server/match";
import type { MatchSummary } from "@/lib/providers/cricketdata";

export const dynamic = "force-dynamic";
export const metadata = { title: "Match Desk · MatchLab XI" };

const competitionOf = (m: MatchSummary) => m.name.split(", ").slice(2).join(", ") || m.title;
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** Fixture without a published squad: shown for planning, not buildable (no player pool to optimise). */
function PendingRow({ m }: { m: MatchSummary }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
      <span className="min-w-0">
        <span className="text-cream">
          {m.teams[0]} vs {m.teams[1]}
        </span>
        <span className="block text-xs text-faint">
          {competitionOf(m)} · {m.title}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="num">{fmtTime(m.startsAt)} IST</span>
        <Pill tone="muted">Squad pending</Pill>
      </span>
    </li>
  );
}

function Seasons({ seasons }: { seasons: ReturnType<typeof trackedSeasons> }) {
  const shown = seasons.filter((s) => s.status !== "ended");
  if (!shown.length) return null;
  return (
    <div className="space-y-2 pt-2">
      <h3 className="eyebrow text-muted">Tracked series &amp; league seasons</h3>
      <ul className="flex flex-wrap gap-2 text-xs">
        {shown.map((s) => (
          <li key={s.id} className="rounded-full border border-line bg-pale px-3 py-1.5 text-muted">
            <span className="text-cream">{s.label}</span>
            {s.kind === "league" && <span className="ml-1 text-gold">League</span>}
            <span className="num ml-1.5">{s.status === "live" ? `in progress to ${shortDate(s.to)}` : `starts ${shortDate(s.from)}`}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-faint">Fixtures appear here from 14 days before a series starts, and become buildable once CricketData publishes squads.</p>
    </div>
  );
}

function StatusBadge({ m, demo }: { m: MatchSummary; demo: boolean }) {
  if (demo)
    return (
      <Pill tone="info">
        <FlaskConical size={12} aria-hidden /> Synthetic demo
      </Pill>
    );
  if (m.ended) return <Pill tone="muted">Completed</Pill>;
  if (m.started) return <Pill tone="warn">Live</Pill>;
  return <Pill tone="lime">Upcoming</Pill>;
}

/** Scoreboard-style fixture card: competition + truthful status, crests, full team names, venue/time, one action. */
function ScoreboardCard({ m, demo = false }: { m: MatchSummary; demo?: boolean }) {
  return (
    <article className={cx("panel lift flex flex-col gap-5 p-5", demo && "border-2 border-gold/70")}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {demo && <p className="eyebrow mb-1 text-gold">Featured</p>}
          <p className="eyebrow text-muted">{demo ? "Demo League" : competitionOf(m)}</p>
          <p className="mt-0.5 text-sm text-cream">{m.title}</p>
        </div>
        <StatusBadge m={m} demo={demo} />
      </header>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          <Initials name={m.teamShort[0]} size={48} />
          <span className="font-display text-lg leading-tight break-words">{m.teams[0]}</span>
        </div>
        <span className="font-display text-sm italic text-faint" aria-label="versus">
          vs
        </span>
        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          <Initials name={m.teamShort[1]} tone="warn" size={48} />
          <span className="font-display text-lg leading-tight break-words">{m.teams[1]}</span>
        </div>
      </div>
      <dl className="space-y-1.5 text-sm text-muted">
        <div className="flex items-start gap-2">
          <MapPin size={15} className="mt-0.5 shrink-0 text-faint" aria-hidden />
          <dt className="sr-only">Venue</dt>
          <dd>{m.venue}</dd>
        </div>
        <div className="flex items-start gap-2">
          <CalendarClock size={15} className="mt-0.5 shrink-0 text-faint" aria-hidden />
          <dt className="sr-only">Start</dt>
          <dd className="num">
            {fmtTime(m.startsAt)} IST
            {!m.started && !demo ? <span className="ml-1 rounded-full bg-clover-2 px-2 py-0.5 text-xs text-cream">starts {ago(m.startsAt)}</span> : null}
          </dd>
        </div>
        {m.ended && m.statusText ? <div className="text-xs text-faint">{m.statusText}</div> : null}
        {m.formatNote && (
          <div className="flex items-start gap-1.5 text-xs text-warn">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden /> {m.formatNote}
          </div>
        )}
      </dl>
      <Link href={`/build/${m.id}`} className="btn-primary focus-ring mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold">
        <BatIcon size={16} /> {m.ended ? "Open evidence" : "Build XI"}
      </Link>
    </article>
  );
}

function Sources({ sources }: { sources: SourceBadge[] }) {
  const issues = sources.filter((s) => s.status === "stale" || s.status === "missing").length;
  return (
    <details className="panel group p-0">
      <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-[20px] px-5 py-3">
        <span className="flex flex-wrap items-center gap-2">
          <Database size={16} className="text-gold" aria-hidden />
          <span className="font-display text-lg">Data sources &amp; freshness</span>
          {issues > 0 && <Pill tone="warn">{issues} stale or missing</Pill>}
        </span>
        <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line px-5 pb-5 pt-4">
        <ul className="space-y-3 text-sm">
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
          {!sources.length && <li className="text-faint">No live sources loaded.</li>}
        </ul>
        <p className="mt-4 text-xs text-faint">
          CricketData free plan allows 100 calls/day; fixtures are cached for 3 h, match status 20 min, squads 12 h. A failed refresh keeps the last good snapshot and marks it stale.
        </p>
      </div>
    </details>
  );
}

export default async function MatchDesk() {
  let data: Awaited<ReturnType<typeof listMatches>>;
  try {
    data = await listMatches();
  } catch (e) {
    data = { matches: [], sources: [], errors: [(e as Error).message] };
  }
  const { upcoming, pending, recent } = splitFixtures(data.matches);
  const seasons = trackedSeasons();
  const providerDown = data.errors.length > 0 || data.sources.some((x) => x.status === "stale" || x.status === "missing");
  const demo = { ...DEMO_MATCH, teams: [...DEMO_MATCH.teams] as [string, string], teamShort: [...DEMO_MATCH.teamShort] as [string, string] };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Stadium hero */}
      <section aria-labelledby="hero" className="field-lines grid items-center gap-6 overflow-hidden rounded-3xl bg-clover-2 px-6 py-6 sm:px-8 md:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="eyebrow text-gold">Your match-day edge</p>
          <h1 id="hero" className="mt-2 text-4xl leading-[1.05] [text-wrap:balance] sm:text-5xl">
            Read the pitch. Pick your XI.
          </h1>
          <p className="mt-3 max-w-md text-muted">Evidence-backed Dream11 teams with sourced forecasts, rule-checked picks and a learning loop you approve.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/build/${DEMO_MATCH_ID}`} className="btn-primary focus-ring inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold">
              <BallIcon size={16} /> Explore demo match
            </Link>
            <a href="#live" className="btn-ghost focus-ring inline-flex min-h-11 items-center rounded-full px-5 text-sm font-medium text-cream">
              View live fixtures
            </a>
          </div>
        </div>
        <StadiumScene className="mx-auto hidden h-auto max-h-[200px] w-full max-w-sm sm:block" />
      </section>

      {/* Featured demo */}
      <section aria-labelledby="demo" className="space-y-3">
        <h2 id="demo" className="eyebrow text-muted">
          Start here · demo match (synthetic)
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <ScoreboardCard m={demo} demo />
          <div className="panel flex flex-col justify-between gap-4 p-5 text-sm text-muted">
            <div className="space-y-3">
              <p className="font-display text-xl text-cream">What the demo includes</p>
              <p>Fictional teams with confirmed lineups and contest credits, so you can build a Ready XI. Then review 9 synthetic past matches and run the Learning Lab.</p>
              <p className="text-xs text-faint">Everything in the demo is synthetic and labelled. It is never mixed with real data or real accuracy metrics.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="btn-ghost focus-ring inline-flex min-h-11 items-center rounded-full px-4 text-cream" href="/review">
                Match Review
              </Link>
              <Link className="btn-ghost focus-ring inline-flex min-h-11 items-center rounded-full px-4 text-cream" href="/learning">
                Learning Lab
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Live fixtures */}
      <section id="live" aria-labelledby="up" className="scroll-mt-6 space-y-3">
        <h2 id="up" className="eyebrow text-muted">
          Live T20 fixtures · internationals &amp; leagues (CricketData)
        </h2>
        {providerDown && (
          <p role="status" className="rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            Live provider unavailable right now (CricketData free plan: 100 calls/day). Showing snapshots saved earlier with their age; the demo above is unaffected.
          </p>
        )}
        {upcoming.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {upcoming.map((m) => (
              <ScoreboardCard key={m.id} m={m} />
            ))}
          </div>
        ) : (
          <div className="panel p-6 text-sm text-muted">No buildable live fixtures right now. The demo match above works end to end.</div>
        )}
        {pending.length > 0 && (
          <div className="space-y-2 pt-2">
            <h3 className="eyebrow text-muted">Coming up · squads not announced yet</h3>
            <ul className="panel divide-y divide-line text-sm">
              {pending.map((m) => (
                <PendingRow key={m.id} m={m} />
              ))}
            </ul>
          </div>
        )}
        {recent.length > 0 && (
          <div className="space-y-2 pt-2">
            <h3 className="eyebrow text-muted">Recently completed</h3>
            <ul className="panel divide-y divide-line text-sm">
              {recent.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <span>
                    {m.teamShort[0]} vs {m.teamShort[1]} · {m.title}
                  </span>
                  <span className="text-xs text-faint">{m.statusText}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Seasons seasons={seasons} />
      </section>

      <Sources sources={data.sources} />
    </div>
  );
}
