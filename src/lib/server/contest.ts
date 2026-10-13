import "server-only";
import { getRules } from "@/lib/domain/rules";
import type { ContestInput, ContestPlayer } from "@/lib/domain/types";
import { demoContest } from "@/lib/demo/demo";
import type { MatchBundle } from "./match";
import { readClient, type Scope } from "./scope";

export type ContestOrigin = "demo" | "owner" | "provisional" | "practice";

export interface LoadedContest {
  contest: ContestInput;
  origin: ContestOrigin;
  updatedAt: string | null;
  notes: string[];
}

/** Provisional pool from the provider squad: provider roles shown, credits UNKNOWN (never invented). */
export function provisionalContest(bundle: MatchBundle): ContestInput {
  const players: ContestPlayer[] = bundle.squad.map((s) => ({
    key: s.key,
    name: s.name,
    team: s.team,
    role: s.role,
    credits: null,
    lineup: "squad",
    providerRole: s.providerRole,
    historyName: null,
  }));
  return {
    matchId: bundle.match.id,
    players,
    rules: getRules(null),
    rulesConfirmedAt: null,
    lineupsConfirmed: { teamA: false, teamB: false },
    sourceLabel: "Provider squad only: credits and contest roles not yet entered",
    sourceAsOf: null,
  };
}

export async function loadContest(bundle: MatchBundle, scope: Scope): Promise<LoadedContest> {
  if (bundle.isDemo || scope.kind === "demo") return { contest: demoContest(), origin: "demo", updatedAt: "2026-10-12T08:00:00Z", notes: [] };
  const { data } = await readClient()
    .from("contest_inputs")
    .select("*")
    .eq("is_demo", false)
    .is("owner_id", null)
    .eq("match_id", bundle.match.id)
    .maybeSingle();
  if (data) {
    return {
      contest: {
        matchId: data.match_id,
        players: data.players as ContestPlayer[],
        rules: getRules(data.rule_id),
        rulesConfirmedAt: data.rules_confirmed_at,
        lineupsConfirmed: data.lineups_confirmed,
        sourceLabel: data.source_label,
        sourceAsOf: data.source_as_of,
      },
      origin: "owner",
      updatedAt: data.updated_at,
      notes: [],
    };
  }
  return {
    contest: provisionalContest(bundle),
    origin: "provisional",
    updatedAt: null,
    notes: ["No contest data entered yet for this match: credits are unknown. Import credits/roles from Aryan's Dream11 contest, or explore with practice mode."],
  };
}
