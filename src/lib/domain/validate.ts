import {
  ROLES,
  type ContestInput,
  type ContestPlayer,
  type ReadinessBlocker,
  type Role,
  type RuleSet,
  type TeamSelection,
  type TeamValidation,
  type Violation,
} from "./types";

const roundCredits = (n: number) => Math.round(n * 100) / 100;

/**
 * Deterministic team validation. Server is the authority; the client runs the same
 * function for instant feedback. Rules are never relaxed silently.
 */
export function validateTeam(
  selection: TeamSelection,
  pool: ContestPlayer[],
  rules: RuleSet,
  contest?: Pick<ContestInput, "rulesConfirmedAt" | "lineupsConfirmed" | "sourceAsOf"> & {
    teamA: string;
    teamB: string;
  },
): TeamValidation {
  const violations: Violation[] = [];
  const byKey = new Map(pool.map((p) => [p.key, p]));
  const keys = selection.playerKeys;

  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) dupes.add(k);
    seen.add(k);
  }
  if (dupes.size > 0) {
    violations.push({
      code: "DUPLICATE",
      message: `Duplicate player selected: ${[...dupes].map((k) => byKey.get(k)?.name ?? k).join(", ")}`,
      players: [...dupes],
    });
  }
  const unique = [...seen];
  if (keys.length !== rules.players) {
    violations.push({
      code: "WRONG_SIZE",
      message: `Team has ${keys.length} players; ${rules.players} required.`,
    });
  }

  const missing = unique.filter((k) => !byKey.has(k));
  if (missing.length) {
    violations.push({
      code: "NOT_IN_POOL",
      message: `${missing.length} selected player(s) are not in this match's contest pool.`,
      players: missing,
    });
  }
  const players = unique.map((k) => byKey.get(k)).filter((p): p is ContestPlayer => !!p);

  const out = players.filter((p) => p.lineup === "confirmed_out");
  if (out.length) {
    violations.push({
      code: "CONFIRMED_OUT",
      message: `${out.map((p) => p.name).join(", ")} ${out.length === 1 ? "is" : "are"} confirmed out of the announced XI.`,
      players: out.map((p) => p.key),
    });
  }

  // Credits
  const unknownCredits = players.filter((p) => p.credits === null || !Number.isFinite(p.credits));
  let credits: number | null = null;
  if (unknownCredits.length) {
    violations.push({
      code: "UNKNOWN_CREDITS",
      message: `Credits unknown for ${unknownCredits.map((p) => p.name).join(", ")}. Enter them from your contest; MatchLab never estimates credits.`,
      players: unknownCredits.map((p) => p.key),
    });
  } else {
    credits = roundCredits(players.reduce((s, p) => s + (p.credits as number), 0));
    if (credits > rules.creditCap + 1e-9) {
      violations.push({
        code: "CREDITS_OVER_CAP",
        message: `Team uses ${credits} credits; cap is ${rules.creditCap}.`,
      });
    }
  }

  // Roles
  const roleCounts = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
  const unknownRole = players.filter((p) => !p.role);
  for (const p of players) if (p.role) roleCounts[p.role] += 1;
  if (unknownRole.length) {
    violations.push({
      code: "UNKNOWN_ROLE",
      message: `Contest role unknown for ${unknownRole.map((p) => p.name).join(", ")}.`,
      players: unknownRole.map((p) => p.key),
    });
  }
  for (const r of ROLES) {
    const { min, max } = rules.roleLimits[r];
    if (roleCounts[r] < min)
      violations.push({ code: "ROLE_MIN", message: `${r}: ${roleCounts[r]} selected, minimum ${min}.` });
    if (roleCounts[r] > max)
      violations.push({ code: "ROLE_MAX", message: `${r}: ${roleCounts[r]} selected, maximum ${max}.` });
  }

  // Real-team balance
  const teamCounts: Record<string, number> = {};
  for (const p of players) teamCounts[p.team] = (teamCounts[p.team] ?? 0) + 1;
  for (const [team, n] of Object.entries(teamCounts)) {
    if (n > rules.maxFromOneTeam)
      violations.push({
        code: "TEAM_MAX",
        message: `${n} players from ${team}; maximum ${rules.maxFromOneTeam} from one team.`,
      });
  }
  const teamNames = contest ? [contest.teamA, contest.teamB] : [...new Set(pool.map((p) => p.team))];
  for (const t of teamNames) {
    if ((teamCounts[t] ?? 0) < rules.minFromEachTeam)
      violations.push({
        code: "TEAM_MIN",
        message: `${teamCounts[t] ?? 0} players from ${t}; minimum ${rules.minFromEachTeam}.`,
      });
  }

  // Captain / vice-captain
  const { captainKey: c, viceCaptainKey: vc } = selection;
  if (!c) violations.push({ code: "CAPTAIN_MISSING", message: "Choose a captain." });
  if (!vc) violations.push({ code: "VC_MISSING", message: "Choose a vice-captain." });
  if (c && vc && c === vc)
    violations.push({ code: "CAPTAIN_EQUALS_VC", message: "Captain and vice-captain must be different players." });
  if (c && !seen.has(c)) violations.push({ code: "CAPTAIN_NOT_IN_XI", message: "Captain is not in the selected XI." });
  if (vc && !seen.has(vc))
    violations.push({ code: "VC_NOT_IN_XI", message: "Vice-captain is not in the selected XI." });

  const valid = violations.length === 0;

  // Readiness: valid AND externally confirmed facts. Provisional teams are never "Ready".
  const readinessBlockers: ReadinessBlocker[] = [];
  if (contest) {
    if (!contest.rulesConfirmedAt)
      readinessBlockers.push({
        code: "RULES_UNCONFIRMED",
        message: "Contest rules not confirmed against your Dream11 contest.",
      });
    if (!contest.sourceAsOf)
      readinessBlockers.push({
        code: "CONTEST_SOURCE_MISSING",
        message: "Credits/roles have no source timestamp.",
      });
    const unconfirmedTeams = [
      !contest.lineupsConfirmed.teamA ? contest.teamA : null,
      !contest.lineupsConfirmed.teamB ? contest.teamB : null,
    ].filter(Boolean);
    if (unconfirmedTeams.length)
      readinessBlockers.push({
        code: "LINEUP_NOT_CONFIRMED",
        message: `Playing XI not confirmed for ${unconfirmedTeams.join(" & ")}.`,
      });
    const notXi = players.filter((p) => p.lineup !== "confirmed_xi");
    if (notXi.length)
      readinessBlockers.push({
        code: "PLAYER_NOT_CONFIRMED_XI",
        message: `${notXi.length} selected player(s) not in a confirmed playing XI.`,
        players: notXi.map((p) => p.key),
      });
  } else {
    readinessBlockers.push({ code: "RULES_UNCONFIRMED", message: "No contest context supplied." });
  }

  return {
    status: !valid ? "invalid" : readinessBlockers.length ? "valid_provisional" : "ready",
    valid,
    violations,
    readinessBlockers,
    totals: { players: keys.length, credits, roleCounts, teamCounts },
  };
}
