// Compact variant of demo-seed-sql.ts (same rows, positional JSON) for pasting into the SQL editor / MCP.
// Usage: npx tsx scripts/demo-seed-compact-sql.ts > supabase/seed.compact.sql
import { randomUUID } from "node:crypto";
import { demoSeedRows } from "../src/lib/demo/seedRows";

const { weightVersion, teams, teamPlayers, actuals } = demoSeedRows(randomUUID);
const esc = (o: unknown) => JSON.stringify(o).replace(/'/g, "''");
const t0 = teams[0] as Record<string, unknown>;
// ids are derived in SQL as md5(label || index)::uuid, so the payload carries indexes instead of UUIDs
const teamIdx = new Map(teams.map((t, i) => [t.id, i]));
const tpIdx = new Map(teamPlayers.map((p, i) => [p.id, i]));
const teamRows = teams.map((t) => [t.match_id, t.match_label, t.match_start, t.captain_key, t.vice_captain_key, t.predicted_total]);
const tpRows = teamPlayers.map((p) => {
  const f = p.factors as Record<string, { estimate: number; n: number }>;
  return [teamIdx.get(p.team_id as string), p.player_key, p.name, p.real_team, p.role, p.credits, p.predicted_base, p.ranking_score, p.coverage, p.uncertainty, p.multiplier, f.form.estimate, f.form.n, f.opportunity.estimate, f.opportunity.n, f.venue.estimate, f.venue.n, f.matchup.estimate, f.matchup.n];
});
const acRows = actuals.map((a) => [tpIdx.get(a.team_player_id as string), teamIdx.get(a.team_id as string), a.actual_base]);

process.stdout.write(`-- Synthetic demo dataset (fictional). Removes and re-creates ONLY is_demo rows.
begin;
delete from public.weight_decisions where is_demo;
delete from public.teams where is_demo;
delete from public.weight_versions where is_demo;
insert into public.weight_versions (id, owner_id, is_demo, version, weights, role_multipliers, status, origin, rationale)
values (md5('mlxi-demo-wv-1')::uuid, null, true, 1, '${esc(weightVersion.weights)}', '${esc(weightVersion.role_multipliers)}', 'active', 'default', 'System default weights (v1).');
insert into public.teams (id, owner_id, is_demo, is_synthetic, match_id, match_label, match_start, match_snapshot, rule_id, rule_version, rules, weight_version_id, weight_version, weights_snapshot, forecast_version, captain_key, vice_captain_key, status, predicted_total, evidence_snapshot, created_at)
select md5('mlxi-demo-team-' || (i - 1))::uuid, null, true, true, r->>0, r->>1, (r->>2)::timestamptz, '${esc(t0.match_snapshot)}', '${t0.rule_id}', '${t0.rule_version}', '${esc(t0.rules)}',
  md5('mlxi-demo-wv-1')::uuid, 1, '${esc(t0.weights_snapshot)}', '${t0.forecast_version}', r->>3, r->>4, 'ready', (r->>5)::numeric, '${esc(t0.evidence_snapshot)}', (r->>2)::timestamptz
from jsonb_array_elements('${esc(teamRows)}'::jsonb) with ordinality as x(r, i);
insert into public.team_players (id, team_id, owner_id, is_demo, player_key, name, real_team, role, credits, lineup, predicted_base, ranking_score, coverage, uncertainty, factors, role_multiplier, multiplier)
select md5('mlxi-demo-tp-' || (i - 1))::uuid, md5('mlxi-demo-team-' || (r->>0))::uuid, null, true, r->>1, r->>2, r->>3, r->>4, (r->>5)::numeric, 'confirmed_xi', (r->>6)::numeric, (r->>7)::numeric, (r->>8)::numeric, (r->>9)::numeric,
  jsonb_build_object('form', jsonb_build_object('estimate', (r->>11)::numeric, 'n', (r->>12)::int, 'note', 'synthetic'),
                     'opportunity', jsonb_build_object('estimate', (r->>13)::numeric, 'n', (r->>14)::int, 'note', 'synthetic'),
                     'venue', jsonb_build_object('estimate', (r->>15)::numeric, 'n', (r->>16)::int, 'note', 'synthetic'),
                     'matchup', jsonb_build_object('estimate', (r->>17)::numeric, 'n', (r->>18)::int, 'note', 'synthetic')),
  1, (r->>10)::numeric
from jsonb_array_elements('${esc(tpRows)}'::jsonb) with ordinality as x(r, i);
insert into public.actuals (id, team_player_id, team_id, owner_id, is_demo, actual_base)
select gen_random_uuid(), md5('mlxi-demo-tp-' || (r->>0))::uuid, md5('mlxi-demo-team-' || (r->>1))::uuid, null, true, (r->>2)::numeric
from jsonb_array_elements('${esc(acRows)}'::jsonb) r;
commit;
`);
