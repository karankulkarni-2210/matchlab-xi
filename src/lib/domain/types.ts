// Core domain types shared by server and client. No I/O in this module.

export const ROLES = ["WK", "BAT", "AR", "BOWL"] as const;
export type Role = (typeof ROLES)[number];

export const FACTORS = ["form", "opportunity", "venue", "matchup"] as const;
export type Factor = (typeof FACTORS)[number];

export type FactorWeights = Record<Factor, number>;
export type RoleMultipliers = Record<Role, number>;

/**
 * Lineup status for one player in one contest.
 * confirmed_xi / confirmed_out only come from an announced lineup (provider or owner-entered with a source).
 * squad = named in the squad, XI not announced. Never inferred.
 */
export type LineupStatus = "confirmed_xi" | "confirmed_out" | "probable" | "squad";

export interface RuleSet {
  id: string; // e.g. "dream11-t20-classic-2024"
  version: string; // rule version stored with every frozen team
  label: string;
  players: number;
  creditCap: number;
  maxFromOneTeam: number;
  minFromEachTeam: number;
  roleLimits: Record<Role, { min: number; max: number }>;
  captainMultiplier: number;
  viceCaptainMultiplier: number;
  source: string;
  sourceAsOf: string; // ISO date of the source we read
}

/** One contest-pool row: what the owner's Dream11 contest says about a player. */
export interface ContestPlayer {
  key: string; // stable id within this match (provider id or slug)
  name: string;
  team: string; // real team short/full name as used by the match
  role: Role | null; // contest role; null = unknown
  credits: number | null; // contest credits; null = unknown (never invented)
  lineup: LineupStatus;
  historyName?: string | null; // optional override for Cricsheet name matching
  providerRole?: string | null; // role text from the data provider (informational)
}

export interface ContestInput {
  matchId: string;
  players: ContestPlayer[];
  rules: RuleSet;
  rulesConfirmedAt: string | null; // owner confirmed rules match their contest
  lineupsConfirmed: { teamA: boolean; teamB: boolean };
  sourceLabel: string; // where credits/roles came from (e.g. "Owner CSV from Dream11 app")
  sourceAsOf: string | null; // when the owner read those values
}

/** Per-factor evidence after shrinkage. `n` = direct player observations behind it. */
export interface FactorEstimate {
  raw: number | null; // player-specific raw average (null = no evidence)
  n: number;
  estimate: number; // shrunk estimate in Dream11 base points
  note: string; // short evidence description
}

export interface PlayerForecast {
  key: string;
  name: string;
  team: string;
  role: Role | null;
  credits: number | null;
  lineup: LineupStatus;
  factors: Record<Factor, FactorEstimate>;
  baseline: number; // shrunk long-run baseline (points)
  roleMultiplier: number;
  predictedBase: number; // forecast Dream11 base points (before C/VC)
  coverage: number; // 0..1, documented coverage metric
  uncertainty: number; // ± typical spread in points (not a confidence interval)
  rankingScore: number; // optimizer objective input, distinct from predictedBase
  availability: number;
  historyMatched: boolean;
  historySample: number; // matches in player history used
  evidenceIds: string[]; // ids of evidence items supporting this forecast
}

export interface Violation {
  code:
    | "WRONG_SIZE"
    | "DUPLICATE"
    | "NOT_IN_POOL"
    | "CONFIRMED_OUT"
    | "UNKNOWN_CREDITS"
    | "CREDITS_OVER_CAP"
    | "UNKNOWN_ROLE"
    | "ROLE_MIN"
    | "ROLE_MAX"
    | "TEAM_MAX"
    | "TEAM_MIN"
    | "CAPTAIN_MISSING"
    | "VC_MISSING"
    | "CAPTAIN_EQUALS_VC"
    | "CAPTAIN_NOT_IN_XI"
    | "VC_NOT_IN_XI"
    | "NO_FEASIBLE_TEAM";
  message: string;
  players?: string[];
}

export interface ReadinessBlocker {
  code: "RULES_UNCONFIRMED" | "LINEUP_NOT_CONFIRMED" | "PLAYER_NOT_CONFIRMED_XI" | "CONTEST_SOURCE_MISSING";
  message: string;
  players?: string[];
}

export type TeamStatus = "invalid" | "valid_provisional" | "ready";

export interface TeamValidation {
  status: TeamStatus;
  valid: boolean;
  violations: Violation[];
  readinessBlockers: ReadinessBlocker[];
  totals: {
    players: number;
    credits: number | null; // null when any credit unknown
    roleCounts: Record<Role, number>;
    teamCounts: Record<string, number>;
  };
}

export interface TeamSelection {
  playerKeys: string[];
  captainKey: string | null;
  viceCaptainKey: string | null;
}
