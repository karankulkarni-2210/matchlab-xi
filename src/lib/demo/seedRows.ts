import { FORECAST_VERSION } from "@/lib/domain/forecast";
import { getRules } from "@/lib/domain/rules";
import { buildDemoSeed, DEMO_LABEL } from "./demo";

/** Converts the deterministic synthetic seed into table rows (is_demo = true, owner_id = null). */
export function demoSeedRows(uuid: () => string) {
  const seed = buildDemoSeed();
  const rules = getRules("dream11-t20-strict");
  const versionId = uuid();
  const weightVersion = {
    id: versionId,
    owner_id: null,
    is_demo: true,
    version: 1,
    weights: seed.version.weights,
    role_multipliers: seed.version.role_multipliers,
    status: "active",
    origin: "default",
    rationale: "System default weights (v1).",
  };
  const teams: Record<string, unknown>[] = [];
  const teamPlayers: Record<string, unknown>[] = [];
  const actuals: Record<string, unknown>[] = [];
  for (const t of seed.teams) {
    const teamId = uuid();
    teams.push({
      id: teamId,
      owner_id: null,
      is_demo: true,
      is_synthetic: true,
      match_id: t.match_id,
      match_label: t.match_label,
      match_start: t.match_start,
      match_snapshot: { label: DEMO_LABEL, venue: "Harbour Oval (fictional)", synthetic: true },
      rule_id: rules.id,
      rule_version: rules.version,
      rules,
      weight_version_id: versionId,
      weight_version: 1,
      weights_snapshot: { weights: seed.version.weights, roleMultipliers: seed.version.role_multipliers },
      forecast_version: FORECAST_VERSION,
      captain_key: t.captain_key,
      vice_captain_key: t.vice_captain_key,
      status: "ready",
      predicted_total: t.predicted_total,
      evidence_snapshot: { synthetic: true, note: DEMO_LABEL },
      explanation: null,
      created_at: t.match_start,
    });
    for (const p of t.players) {
      const tpId = uuid();
      teamPlayers.push({
        id: tpId,
        team_id: teamId,
        owner_id: null,
        is_demo: true,
        player_key: p.player_key,
        name: p.name,
        real_team: p.real_team,
        role: p.role,
        credits: p.credits,
        lineup: "confirmed_xi",
        predicted_base: p.predicted_base,
        ranking_score: p.ranking_score,
        coverage: p.coverage,
        uncertainty: p.uncertainty,
        factors: p.factors,
        role_multiplier: 1,
        multiplier: p.multiplier,
      });
      if (p.actual !== null)
        actuals.push({ id: uuid(), team_player_id: tpId, team_id: teamId, owner_id: null, is_demo: true, actual_base: p.actual });
    }
  }
  return { weightVersion, teams, teamPlayers, actuals };
}
