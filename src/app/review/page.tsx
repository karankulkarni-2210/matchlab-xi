import Link from "next/link";
import { Review, type ReviewRow } from "@/components/review/Review";
import { TeamPicker } from "@/components/review/TeamPicker";
import { Pill } from "@/components/ui";
import { listTeams, loadTeam } from "@/lib/server/teams";
import { resolveScope } from "@/lib/server/scope";

export const dynamic = "force-dynamic";
export const metadata = { title: "Match Review · MatchLab XI" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const sp = await searchParams;
  const demoScope = resolveScope("demo");
  const realScope = resolveScope("real");
  const [demoTeams, myTeams] = await Promise.all([listTeams(demoScope).catch(() => []), listTeams(realScope).catch(() => [])]);
  const all = [...myTeams, ...demoTeams];
  const teamId = sp.team ?? myTeams[0]?.id ?? demoTeams.find((t) => t.entered < 11)?.id ?? demoTeams[0]?.id;
  const loaded = teamId ? await loadTeam(teamId).catch(() => null) : null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Match Review</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Learn from every pick</h1>
          <p className="mt-1 text-muted">Enter the actual Dream11 base points for your frozen XI. Errors are predicted − actual: positive means MatchLab overpredicted.</p>
        </div>
        <TeamPicker
          current={teamId ?? null}
          mine={myTeams.map((t) => ({ id: t.id, label: t.match_label, entered: t.entered, start: t.match_start }))}
          demo={demoTeams.map((t) => ({ id: t.id, label: t.match_label, entered: t.entered, start: t.match_start }))}
        />
      </header>

      {!all.length && (
        <div className="panel space-y-2 p-6 text-sm text-muted">
          <p>No saved teams yet.</p>
          <p>
            Build and save an XI first — try the <Link className="text-gold underline" href="/build/demo-hh-dd">demo match</Link>.
          </p>
        </div>
      )}
      {teamId && !loaded && <p className="panel p-6 text-sm text-bad">That team was not found.</p>}
      {loaded && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-lg font-semibold">{loaded.team.match_label}</span>
            {loaded.team.is_demo && <Pill tone="info">Synthetic demo — fictional players</Pill>}
            <Pill tone={loaded.team.status === "ready" ? "ok" : "warn"}>{loaded.team.status === "ready" ? "Saved as Ready" : "Saved provisional"}</Pill>
          </div>
          <Review
            key={loaded.team.id + JSON.stringify(loaded.rows.map((r) => r.actualBase))}
            canEdit={loaded.canEdit}
            team={{
              id: loaded.team.id,
              label: loaded.team.match_label,
              createdAt: loaded.team.created_at,
              matchStart: loaded.team.match_start,
              status: loaded.team.status,
              ruleVersion: loaded.team.rule_version,
              weightVersion: loaded.team.weight_version,
              forecastVersion: loaded.team.forecast_version,
              isDemo: loaded.team.is_demo,
              captainKey: loaded.team.captain_key,
              viceCaptainKey: loaded.team.vice_captain_key,
            }}
            rows={loaded.rows as ReviewRow[]}
          />
        </>
      )}
    </div>
  );
}
