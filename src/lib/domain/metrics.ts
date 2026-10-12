import { round } from "./weights";
import type { Role } from "./types";

/** Parse an owner-typed actual. Blank => null (not entered). "0" => 0 (a real zero). */
export function parseActualInput(raw: string | number | null | undefined): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, error: "Not a number" };
    return checkRange(raw);
  }
  const s = raw.trim();
  if (s === "") return { ok: true, value: null };
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, error: "Enter a number (e.g. 0, 42 or -2)" };
  return checkRange(Number(s));
}

function checkRange(n: number): { ok: true; value: number } | { ok: false; error: string } {
  if (n < -100 || n > 600) return { ok: false, error: "Base points must be between -100 and 600" };
  // Dream11 base points are whole or half points
  if (Math.round(n * 2) !== n * 2) return { ok: false, error: "Base points use whole or .5 steps" };
  return { ok: true, value: n };
}

export interface ResultRow {
  key: string;
  name: string;
  role: Role;
  predictedBase: number;
  actualBase: number | null; // null = not entered yet
  multiplier: number; // 1, 1.5 (VC) or 2 (C) — applied exactly once here
}

export interface TeamMetrics {
  nTotal: number;
  nEntered: number;
  complete: boolean;
  /** Σ predicted_base × multiplier over all selected players */
  predictedTotal: number;
  /** Σ actual_base × multiplier; null until every player has an entered actual */
  actualTotal: number | null;
  /** Σ over entered players only (labelled partial in UI) */
  partialActualTotal: number;
  partialPredictedTotal: number;
  /** player errors: predicted − actual (positive = overprediction). Entered players only. */
  mae: number | null;
  bias: number | null;
  perPlayer: { key: string; error: number | null; absError: number | null }[];
}

export function computeTeamMetrics(rows: ResultRow[]): TeamMetrics {
  const entered = rows.filter((r) => r.actualBase !== null);
  const errors = entered.map((r) => r.predictedBase - (r.actualBase as number));
  const predictedTotal = rows.reduce((s, r) => s + r.predictedBase * r.multiplier, 0);
  const partialActualTotal = entered.reduce((s, r) => s + (r.actualBase as number) * r.multiplier, 0);
  const partialPredictedTotal = entered.reduce((s, r) => s + r.predictedBase * r.multiplier, 0);
  const complete = rows.length > 0 && entered.length === rows.length;
  return {
    nTotal: rows.length,
    nEntered: entered.length,
    complete,
    predictedTotal: round(predictedTotal, 1),
    actualTotal: complete ? round(partialActualTotal, 1) : null,
    partialActualTotal: round(partialActualTotal, 1),
    partialPredictedTotal: round(partialPredictedTotal, 1),
    mae: errors.length ? round(errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length, 2) : null,
    bias: errors.length ? round(errors.reduce((s, e) => s + e, 0) / errors.length, 2) : null,
    perPlayer: rows.map((r) => {
      const e = r.actualBase === null ? null : round(r.predictedBase - r.actualBase, 1);
      return { key: r.key, error: e, absError: e === null ? null : Math.abs(e) };
    }),
  };
}

export interface ErrorStats {
  n: number;
  matches: number;
  mae: number | null;
  bias: number | null;
  meanPredicted: number | null;
  meanActual: number | null;
}

export function errorStats(records: { matchId: string; predicted: number; actual: number }[]): ErrorStats {
  if (!records.length) return { n: 0, matches: 0, mae: null, bias: null, meanPredicted: null, meanActual: null };
  const n = records.length;
  const errs = records.map((r) => r.predicted - r.actual);
  return {
    n,
    matches: new Set(records.map((r) => r.matchId)).size,
    mae: round(errs.reduce((s, e) => s + Math.abs(e), 0) / n, 2),
    bias: round(errs.reduce((s, e) => s + e, 0) / n, 2),
    meanPredicted: round(records.reduce((s, r) => s + r.predicted, 0) / n, 2),
    meanActual: round(records.reduce((s, r) => s + r.actual, 0) / n, 2),
  };
}
