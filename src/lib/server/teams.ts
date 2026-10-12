import "server-only";
import { z } from "zod";
import { computeTeamMetrics, parseActualInput, type ResultRow } from "@/lib/domain/metrics";
import type { Role } from "@/lib/domain/types";
import { DEMO_MATCH_ID } from "@/lib/demo/demo";
import type { Explanation } from "@/lib/ai/explain";
import { buildMatch } from "./build";
import { readClient, resolveScope, scopeFilter, writeClient, type Scope } from "./scope";

export const SaveTeamSchema = z.object({
  matchId: z.string().min(1).max(80),
  playerKeys: z.array(z.string().min(1).max(80)).length(11),
  captainKey: z.string().min(1).max(80),
  viceCaptainKey: z.string().min(1).max(80),
  explanation: z.unknown().optional(),
  practice: z.boolean().optional(),
});

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/**
 * Freeze a team: the server rebuilds forecasts from scratch for the submitted selection (client numbers
 * are never trusted), re-validates every rule, then stores evidence, factor inputs, predicted base points,
 * C/VC, rule version and weight version. Stored rows are immutable (DB trigger).
 */
export async function saveTeam(input: z.infer<typeof SaveTeamSchema>) {
  const b = await buildMatch(input.matchId, {
    selection: { playerKeys: input.playerKeys, captainKey: input.captainKey, viceCaptainKey: input.viceCaptainKey },
    practice: input.practice,
  });
  if (!b.validation?.valid) throw new HttpError(422, "Team is not valid; nothing was saved.", b.validation?.violations);
  const scope: Scope = resolveScope(input.matchId === DEMO_MATCH_ID ? "demo" : "real");
  const wc = writeClient();
  if ("error" in wc) throw new HttpError(wc.status, wc.error);
  if (!b.weights.id) throw new HttpError(503, "No stored weight version for this dataset yet (seed the demo or enable saving).");
  const rules = b.contest.contest.rules;
  const f = scopeFilter(scope);
  const explanation = input.explanation ? (input.explanation as Explanation) : null;

  const { data: team, error } = await wc.client
    .from("teams")
    .insert({
      ...f,
      is_synthetic: scope.kind === "demo",
      match_id: b.bundle.match.id,
      match_label: `${b.bundle.match.teamShort[0]} vs ${b.bundle.match.teamShort[1]} · ${b.bundle.match.title}${b.practice.active ? " · practice credits" : ""}`,
      match_start: b.bundle.match.startsAt,
      match_snapshot: { match: b.bundle.match, venue: b.bundle.venue, weather: b.bundle.weather, sources: b.bundle.sources, historyAsOf: b.bundle.historyAsOf },
      rule_id: rules.id,
      rule_version: rules.version,
      rules,
      weight_version_id: b.weights.id,
      weight_version: b.weights.version,
      weights_snapshot: { weights: b.weights.weights, roleMultipliers: b.weights.roleMultipliers },
      forecast_version: b.forecastVersion,
      captain_key: input.captainKey,
      vice_captain_key: input.viceCaptainKey,
      status: b.validation.status === "ready" ? "ready" : "valid_provisional",
      predicted_total: b.totals.predicted,
      evidence_snapshot: { evidence: b.evidence, contest: { origin: b.contest.origin, sourceLabel: b.contest.contest.sourceLabel, sourceAsOf: b.contest.contest.sourceAsOf, rulesConfirmedAt: b.contest.contest.rulesConfirmedAt, lineupsConfirmed: b.contest.contest.lineupsConfirmed }, readinessBlockers: b.validation.readinessBlockers },
      explanation,
    })
    .select("id")
    .single();
  if (error || !team) throw new HttpError(500, `Save failed: ${error?.message ?? "unknown error"}`);

  const rows = input.playerKeys.map((k) => {
    const fc = b.forecasts.find((x) => x.key === k)!;
    return {
      team_id: team.id,
      ...f,
      player_key: k,
      name: fc.name,
      real_team: fc.team,
      role: fc.role,
      credits: fc.credits,
      lineup: fc.lineup,
      predicted_base: fc.predictedBase,
      ranking_score: fc.rankingScore,
      coverage: fc.coverage,
      uncertainty: fc.uncertainty,
      factors: Object.fromEntries(Object.entries(fc.factors).map(([name, v]) => [name, { estimate: v.estimate, n: v.n, note: v.note, raw: v.raw }])),
      role_multiplier: fc.roleMultiplier,
      multiplier: k === input.captainKey ? rules.captainMultiplier : k === input.viceCaptainKey ? rules.viceCaptainMultiplier : 1,
    };
  });
  const { error: e2 } = await wc.client.from("team_players").insert(rows);
  if (e2) throw new HttpError(500, `Saving players failed: ${e2.message}`);
  return { id: team.id as string, status: b.validation.status, predictedTotal: b.totals.predicted };
}

export interface TeamListItem {
  id: string;
  match_label: string;
  match_start: string | null;
  status: string;
  predicted_total: number;
  is_demo: boolean;
  is_synthetic: boolean;
  created_at: string;
  weight_version: number;
  entered: number;
}

export async function listTeams(scope: Scope): Promise<TeamListItem[]> {
  const { data } = await readClient()
    .from("teams")
    .select("id, match_label, match_start, status, predicted_total, is_demo, is_synthetic, created_at, weight_version, actuals(count)")
    .eq("is_demo", scope.kind === "demo")
    .is("owner_id", null)
    .order("match_start", { ascending: false })
    .limit(50);
  return (data ?? []).map((t) => ({ ...(t as unknown as TeamListItem), entered: (t as unknown as { actuals: { count: number }[] }).actuals?.[0]?.count ?? 0 }));
}

export async function loadTeam(teamId: string) {
  const sb = readClient();
  const { data: team } = await sb.from("teams").select("*").eq("id", teamId).maybeSingle();
  if (!team) return null;
  const { data: players } = await sb.from("team_players").select("*").eq("team_id", teamId);
  const { data: actuals } = await sb.from("actuals").select("team_player_id, actual_base, updated_at").eq("team_id", teamId);
  const actualBy = new Map((actuals ?? []).map((a) => [a.team_player_id, a]));
  const rows = (players ?? []).map((p) => ({
    id: p.id as string,
    key: p.player_key as string,
    name: p.name as string,
    team: p.real_team as string,
    role: p.role as Role,
    credits: Number(p.credits),
    predictedBase: Number(p.predicted_base),
    uncertainty: Number(p.uncertainty),
    coverage: Number(p.coverage),
    multiplier: Number(p.multiplier),
    actualBase: actualBy.has(p.id) ? Number(actualBy.get(p.id)!.actual_base) : null,
    factors: p.factors,
  }));
  rows.sort((a, b) => b.multiplier - a.multiplier || b.predictedBase - a.predictedBase);
  const metrics = computeTeamMetrics(rows as ResultRow[]);
  const canEdit = team.owner_id === null; // single-user app: Aryan's workspace and the demo are editable through the server
  return { team, rows, metrics, canEdit };
}

export const ActualsSchema = z.object({
  entries: z.array(z.object({ teamPlayerId: z.string().uuid(), value: z.union([z.string().max(12), z.number(), z.null()]) })).min(1).max(11),
});

/** Saves actuals separately from predictions. Blank deletes a stored actual; "0" stores a real zero. */
export async function saveActuals(teamId: string, input: z.infer<typeof ActualsSchema>) {
  const pub = readClient();
  const { data: team } = await pub.from("teams").select("id, is_demo, owner_id").eq("id", teamId).maybeSingle();
  if (!team || team.owner_id !== null) throw new HttpError(404, "Team not found.");
  const scope: Scope = resolveScope(team.is_demo ? "demo" : "real");
  const wc = writeClient();
  if ("error" in wc) throw new HttpError(wc.status, wc.error);
  const { data: tps } = await pub.from("team_players").select("id").eq("team_id", teamId);
  const valid = new Set((tps ?? []).map((t) => t.id));
  const errors: { teamPlayerId: string; error: string }[] = [];
  const upserts: Record<string, unknown>[] = [];
  const deletes: string[] = [];
  for (const e of input.entries) {
    if (!valid.has(e.teamPlayerId)) {
      errors.push({ teamPlayerId: e.teamPlayerId, error: "Not a selected player of this team" });
      continue;
    }
    const p = parseActualInput(e.value);
    if (!p.ok) errors.push({ teamPlayerId: e.teamPlayerId, error: p.error });
    else if (p.value === null) deletes.push(e.teamPlayerId);
    else upserts.push({ team_player_id: e.teamPlayerId, team_id: teamId, ...scopeFilter(scope), actual_base: p.value });
  }
  if (errors.length) throw new HttpError(422, "Some values are invalid; nothing was saved.", errors);
  if (upserts.length) {
    const { error } = await wc.client.from("actuals").upsert(upserts, { onConflict: "team_player_id" });
    if (error) throw new HttpError(500, `Saving actuals failed: ${error.message}`);
  }
  if (deletes.length) {
    const { error } = await wc.client.from("actuals").delete().in("team_player_id", deletes).eq("team_id", teamId).eq("is_demo", team.is_demo).is("owner_id", null);
    if (error) throw new HttpError(500, `Clearing actuals failed: ${error.message}`);
  }
  return { saved: upserts.length, cleared: deletes.length };
}
