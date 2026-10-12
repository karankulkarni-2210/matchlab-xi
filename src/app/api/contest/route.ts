import { NextResponse } from "next/server";
import { z } from "zod";
import { applyContestCsv, ContestSaveSchema } from "@/lib/domain/contestCsv";
import { loadContest } from "@/lib/server/contest";
import { handleError } from "@/lib/server/http";
import { getMatchBundle } from "@/lib/server/match";
import { resolveScope, writeClient } from "@/lib/server/scope";
import { HttpError } from "@/lib/server/teams";
import { DEMO_MATCH_ID } from "@/lib/demo/demo";
import { RULE_PRESETS } from "@/lib/domain/rules";

const CsvBody = z.object({ matchId: z.string().min(1).max(80), csv: z.string().min(1).max(20000) });

/** CSV preview: merges owner CSV onto the current pool and returns row errors. Nothing is saved. */
export async function POST(req: Request) {
  try {
    const { matchId, csv } = CsvBody.parse(await req.json());
    const bundle = await getMatchBundle(matchId);
    const scope = resolveScope(matchId === DEMO_MATCH_ID ? "demo" : "real");
    const { contest } = await loadContest(bundle, scope);
    return NextResponse.json(applyContestCsv(csv, contest.players, bundle.match.teams));
  } catch (e) {
    return handleError(e);
  }
}

/** Save contest data (credits, contest roles, lineups, rule confirmation) to Aryan's workspace (server-validated). */
export async function PUT(req: Request) {
  try {
    const body = ContestSaveSchema.parse(await req.json());
    if (body.matchId === DEMO_MATCH_ID) throw new HttpError(403, "The demo contest is fixed. Pick a real match to enter contest data.");
    if (!RULE_PRESETS[body.ruleId]) throw new HttpError(400, "Unknown rule preset");
    const bundle = await getMatchBundle(body.matchId);
    const teams = new Set(bundle.match.teams);
    const badTeam = body.players.find((p) => !teams.has(p.team));
    if (badTeam) throw new HttpError(400, `${badTeam.name}: team must be ${bundle.match.teams.join(" or ")}`);
    const keys = new Set<string>();
    for (const p of body.players) {
      if (keys.has(p.key)) throw new HttpError(400, `Duplicate player key ${p.key}`);
      keys.add(p.key);
    }
    const wc = writeClient();
    if ("error" in wc) throw new HttpError(wc.status, wc.error);
    const row = {
      owner_id: null,
      is_demo: false,
      match_id: body.matchId,
      players: body.players,
      rule_id: body.ruleId,
      rules_confirmed_at: body.rulesConfirmed ? new Date().toISOString() : null,
      lineups_confirmed: body.lineupsConfirmed,
      source_label: body.sourceLabel || "Entered from Aryan's Dream11 contest",
      source_as_of: body.sourceAsOf,
      updated_at: new Date().toISOString(),
    };
    const { data: existing } = await wc.client.from("contest_inputs").select("id").is("owner_id", null).eq("match_id", body.matchId).eq("is_demo", false).maybeSingle();
    const res = existing
      ? await wc.client.from("contest_inputs").update(row).eq("id", existing.id)
      : await wc.client.from("contest_inputs").insert(row);
    if (res.error) throw new HttpError(500, `Save failed: ${res.error.message}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
