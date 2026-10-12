import "server-only";
import { z } from "zod";
import { geminiJson } from "@/lib/ai/gemini";
import { buildCandidate, detectPatterns, gateStatus, replayBias, replayMae, validateAiProposal, type LearningRecord } from "@/lib/domain/learning";
import { errorStats } from "@/lib/domain/metrics";
import { FACTORS, ROLES, type Factor, type FactorWeights, type Role, type RoleMultipliers } from "@/lib/domain/types";
import { HttpError } from "./teams";
import { getActiveWeights, readClient, resolveScope, scopeFilter, writeClient, type Scope } from "./scope";

export async function loadRecords(scope: Scope): Promise<{ records: LearningRecord[]; perMatch: { matchId: string; label: string; start: string | null; predicted: number; actual: number; n: number }[] }> {
  const sb = readClient();
  const f = scopeFilter(scope);
  let tq = sb.from("teams").select("id, match_id, match_label, match_start, weights_snapshot, is_synthetic").eq("is_demo", f.is_demo);
  tq = tq.is("owner_id", null);
  const { data: teams } = await tq;
  if (!teams?.length) return { records: [], perMatch: [] };
  const ids = teams.map((t) => t.id);
  const [{ data: tps }, { data: acts }] = await Promise.all([
    sb.from("team_players").select("id, team_id, player_key, role, predicted_base, coverage, factors, role_multiplier, multiplier").in("team_id", ids),
    sb.from("actuals").select("team_player_id, actual_base").in("team_id", ids),
  ]);
  const actBy = new Map((acts ?? []).map((a) => [a.team_player_id, Number(a.actual_base)]));
  const teamBy = new Map(teams.map((t) => [t.id, t]));
  const records: LearningRecord[] = [];
  for (const tp of tps ?? []) {
    if (!actBy.has(tp.id)) continue; // blank = not entered: excluded (zero is included)
    const t = teamBy.get(tp.team_id)!;
    const factors = Object.fromEntries(FACTORS.map((k) => [k, Number((tp.factors as Record<string, { estimate: number }>)[k]?.estimate ?? 0)])) as Record<Factor, number>;
    const contexts: string[] = [];
    if (Number(tp.multiplier) > 1) contexts.push("captaincy-pick");
    if (Number(tp.coverage) < 0.5) contexts.push("low-coverage");
    records.push({
      matchId: t.match_id,
      teamId: t.id,
      playerKey: tp.player_key,
      role: tp.role as Role,
      predicted: Number(tp.predicted_base),
      actual: actBy.get(tp.id)!,
      factors,
      roleMultiplier: Number(tp.role_multiplier),
      weights: (t.weights_snapshot as { weights: FactorWeights }).weights,
      synthetic: !!t.is_synthetic,
      contexts,
    });
  }
  const perMatch = teams
    .map((t) => {
      const recs = records.filter((r) => r.teamId === t.id);
      const s = errorStats(recs.map((r) => ({ matchId: r.matchId, predicted: r.predicted, actual: r.actual })));
      return { matchId: t.match_id, label: t.match_label, start: t.match_start, predicted: s.meanPredicted ?? 0, actual: s.meanActual ?? 0, n: s.n };
    })
    .filter((m) => m.n > 0)
    .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
  return { records, perMatch };
}

export async function learningOverview(dataset: "demo" | "real") {
  const scope = resolveScope(dataset);
  const { records, perMatch } = await loadRecords(scope);
  const active = await getActiveWeights(scope);
  const overall = errorStats(records.map((r) => ({ matchId: r.matchId, predicted: r.predicted, actual: r.actual })));
  const byRole = Object.fromEntries(ROLES.map((r) => [r, errorStats(records.filter((x) => x.role === r).map((x) => ({ matchId: x.matchId, predicted: x.predicted, actual: x.actual })))]));
  const findings = detectPatterns(records);
  const gate = gateStatus(records);
  let versions: Record<string, unknown>[] = [];
  let decisions: Record<string, unknown>[] = [];
  {
    const sb = readClient();
    const f = scopeFilter(scope);
    let vq = sb.from("weight_versions").select("id, version, weights, role_multipliers, status, origin, rationale, ai, backtest, evidence, created_at, decided_at, parent_id").eq("is_demo", f.is_demo);
    let dq = sb.from("weight_decisions").select("id, decision, version_id, previous_active_id, note, created_at").eq("is_demo", f.is_demo);
    vq = vq.is("owner_id", null);
    dq = dq.is("owner_id", null);
    versions = (await vq.order("version", { ascending: false })).data ?? [];
    decisions = (await dq.order("created_at", { ascending: false }).limit(20)).data ?? [];
  }
  return {
    scope: scope.kind,
    dataset,
    synthetic: dataset === "demo",
    overall,
    byRole,
    perMatch,
    findings,
    gate,
    active,
    versions,
    decisions,
  };
}

const AiProposalSchema = z.object({
  headline: z.string().min(1).max(140),
  pattern: z.string().min(1).max(400),
  explanation: z.string().min(1).max(900),
  proposal: z.object({
    weights: z.object({ form: z.number(), opportunity: z.number(), venue: z.number(), matchup: z.number() }),
    roleMultipliers: z.object({ WK: z.number(), BAT: z.number(), AR: z.number(), BOWL: z.number() }),
  }),
  rationale: z.string().min(1).max(700),
  caveats: z.array(z.string().max(260)).max(5),
});
type AiProposal = z.infer<typeof AiProposalSchema>;

const proposalJsonSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    pattern: { type: "string" },
    explanation: { type: "string" },
    proposal: {
      type: "object",
      properties: {
        weights: { type: "object", properties: { form: { type: "number" }, opportunity: { type: "number" }, venue: { type: "number" }, matchup: { type: "number" } }, required: ["form", "opportunity", "venue", "matchup"] },
        roleMultipliers: { type: "object", properties: { WK: { type: "number" }, BAT: { type: "number" }, AR: { type: "number" }, BOWL: { type: "number" } }, required: ["WK", "BAT", "AR", "BOWL"] },
      },
      required: ["weights", "roleMultipliers"],
    },
    rationale: { type: "string" },
    caveats: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "pattern", "explanation", "proposal", "rationale", "caveats"],
};

/** Detect → gate → deterministic bounded candidate → Gemini summary/proposal (validated) → stored as 'proposed'. */
export async function proposeAdjustment(dataset: "demo" | "real") {
  const scope = resolveScope(dataset);
  const wc = writeClient();
  if ("error" in wc) throw new HttpError(wc.status, wc.error);
  const { records } = await loadRecords(scope);
  const gate = gateStatus(records);
  if (!gate.met) throw new HttpError(409, `Minimum evidence not met: ${gate.messages.join(" ")}`, gate);
  const findings = detectPatterns(records);
  const flagged = findings.filter((f) => f.flagged);
  if (!flagged.length) throw new HttpError(409, "No repeated, consistent error pattern meets the thresholds. Current weights stay.", findings.slice(0, 6));
  const active = await getActiveWeights(scope);
  if (!active.id) throw new HttpError(503, "No stored active weight version.");
  const current = { weights: active.weights, roleMultipliers: active.roleMultipliers };
  const candidate = buildCandidate(records, current, findings);

  const evidence = {
    dataset: dataset === "demo" ? "SYNTHETIC demo history (fictional)" : "Owner's real match history",
    gate,
    currentVersion: active.version,
    current,
    bounds: "Each factor weight may move at most 0.10 from current, stay within [0.05, 0.70], and all four must sum to 1. Role multipliers may move at most 15% and stay within [0.70, 1.30].",
    flaggedPatterns: flagged.map((f) => ({ group: f.group, label: f.label, n: f.stats.n, matches: f.stats.matches, bias: f.stats.bias, mae: f.stats.mae, meanPredicted: f.stats.meanPredicted, meanActual: f.stats.meanActual, consistentMatches: f.consistentMatches })),
    otherGroups: findings.filter((f) => !f.flagged).slice(0, 6).map((f) => ({ group: f.group, n: f.stats.n, bias: f.stats.bias, why: f.reasons })),
    deterministicCandidate: { weights: candidate.weights, roleMultipliers: candidate.roleMultipliers, backtest: candidate.backtest, changes: candidate.changes },
  };
  const ai = await geminiJson<AiProposal>({
    kind: "learning-proposal",
    evidence,
    system:
      "You review prediction errors for a fantasy cricket forecaster. Use ONLY the evidence JSON. Explain the repeated pattern in plain language, then propose factor weights and role multipliers that stay within the stated bounds (you may adopt the deterministic candidate). Never claim the change is proven to improve future results; in-sample replay is not validation. If the dataset is synthetic, say so.",
    prompt: `EVIDENCE JSON:\n${JSON.stringify(evidence)}`,
    responseSchema: proposalJsonSchema,
    validate: (raw) => {
      const p = AiProposalSchema.safeParse(raw);
      if (!p.success) return { ok: false, error: p.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
      return { ok: true, value: p.data };
    },
  });

  // Choose proposal: AI if within bounds, otherwise the deterministic candidate. Never silently clip.
  let chosen = { weights: candidate.weights, roleMultipliers: candidate.roleMultipliers };
  let aiBounds: { ok: boolean; problems: string[] } | null = null;
  if (ai.output) {
    const prop = { weights: ai.output.proposal.weights as FactorWeights, roleMultipliers: ai.output.proposal.roleMultipliers as RoleMultipliers };
    aiBounds = validateAiProposal(current, prop);
    if (aiBounds.ok) chosen = prop;
  }
  const backtest = {
    n: records.length,
    currentMae: replayMae(records, current.weights, current.roleMultipliers),
    proposedMae: replayMae(records, chosen.weights, chosen.roleMultipliers),
    currentBias: replayBias(records, current.weights, current.roleMultipliers),
    proposedBias: replayBias(records, chosen.weights, chosen.roleMultipliers),
    note: "In-sample replay on the same stored records; not evidence of future improvement.",
  };

  const sb = wc.client;
  const f = scopeFilter(scope);
  // supersede older pending proposals
  let up = sb.from("weight_versions").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("status", "proposed").eq("is_demo", f.is_demo);
  up = up.is("owner_id", null);
  await up;
  let mq = sb.from("weight_versions").select("version").eq("is_demo", f.is_demo);
  mq = mq.is("owner_id", null);
  const { data: maxRow } = await mq.order("version", { ascending: false }).limit(1).maybeSingle();
  const { data: created, error } = await sb
    .from("weight_versions")
    .insert({
      ...f,
      version: (maxRow?.version ?? 1) + 1,
      weights: chosen.weights,
      role_multipliers: chosen.roleMultipliers,
      status: "proposed",
      origin: "proposal",
      parent_id: active.id,
      rationale: ai.output?.rationale ?? `Deterministic bounded candidate: ${candidate.changes.join("; ") || "no change"}`,
      evidence: { gate, flagged: evidence.flaggedPatterns, synthetic: dataset === "demo" },
      ai: {
        status: ai.status,
        model: ai.model,
        generatedAt: ai.generatedAt,
        error: ai.error ?? null,
        headline: ai.output?.headline ?? null,
        pattern: ai.output?.pattern ?? null,
        explanation: ai.output?.explanation ?? null,
        caveats: ai.output?.caveats ?? [],
        aiProposalWithinBounds: aiBounds?.ok ?? null,
        aiBoundProblems: aiBounds?.problems ?? [],
        source: aiBounds?.ok ? "gemini" : "deterministic",
      },
      backtest,
    })
    .select("id, version")
    .single();
  if (error || !created) throw new HttpError(500, `Could not store proposal: ${error?.message}`);
  return { id: created.id, version: created.version, ai: { status: ai.status, error: ai.error }, backtest };
}

export const DecideSchema = z.object({
  dataset: z.enum(["demo", "real"]),
  versionId: z.string().uuid(),
  decision: z.enum(["accept", "reject", "rollback"]),
  note: z.string().max(300).optional(),
});

/** Human decision. Accept/rollback switch the active version for FUTURE builds only; frozen teams keep theirs. */
export async function decide(input: z.infer<typeof DecideSchema>) {
  const scope = resolveScope(input.dataset);
  const wc = writeClient();
  if ("error" in wc) throw new HttpError(wc.status, wc.error);
  const sb = wc.client;
  const f = scopeFilter(scope);
  let vq = sb.from("weight_versions").select("id, status, version").eq("id", input.versionId).eq("is_demo", f.is_demo);
  vq = vq.is("owner_id", null);
  const { data: target } = await vq.maybeSingle();
  if (!target) throw new HttpError(404, "Weight version not found in this dataset.");
  const active = await getActiveWeights(scope);
  const now = new Date().toISOString();

  if (input.decision === "reject") {
    if (target.status !== "proposed") throw new HttpError(409, "Only a pending proposal can be rejected.");
    await sb.from("weight_versions").update({ status: "rejected", decided_at: now }).eq("id", target.id);
  } else {
    if (input.decision === "accept" && target.status !== "proposed") throw new HttpError(409, "Only a pending proposal can be accepted.");
    if (input.decision === "rollback" && target.status !== "superseded") throw new HttpError(409, "Roll back to a previous (superseded) version.");
    if (active.id === target.id) throw new HttpError(409, "That version is already active.");
    if (active.id) {
      const { error: e1 } = await sb.from("weight_versions").update({ status: "superseded", decided_at: now }).eq("id", active.id);
      if (e1) throw new HttpError(500, e1.message);
    }
    const { error: e2 } = await sb.from("weight_versions").update({ status: "active", decided_at: now }).eq("id", target.id);
    if (e2) {
      if (active.id) await sb.from("weight_versions").update({ status: "active" }).eq("id", active.id);
      throw new HttpError(500, e2.message);
    }
  }
  const { error: de } = await sb.from("weight_decisions").insert({ ...f, decision: input.decision, version_id: target.id, previous_active_id: active.id, note: input.note ?? null });
  if (de) throw new HttpError(500, `Decision not recorded: ${de.message}`);
  return { ok: true };
}
