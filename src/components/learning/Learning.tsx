"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, FlaskConical, History, RotateCcw, SlidersHorizontal, Sparkles } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { learningOverview } from "@/lib/server/learning";
import { cx, Pill, Stat } from "@/components/ui";

type Overview = Awaited<ReturnType<typeof learningOverview>>;
type Version = {
  id: string;
  version: number;
  weights: Record<string, number>;
  role_multipliers: Record<string, number>;
  status: string;
  origin: string;
  rationale: string | null;
  ai: Record<string, unknown> | null;
  backtest: Record<string, number | string | null> | null;
  created_at: string;
  decided_at: string | null;
};

const FACT = ["form", "opportunity", "venue", "matchup"] as const;
const FACT_LABEL: Record<string, string> = { form: "Recent form", opportunity: "Opportunity", venue: "Venue", matchup: "Matchup" };

export function Learning({ data, canAct, actHint }: { data: Overview; canAct: boolean; actHint: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad" | "warn"; text: string } | null>(null);
  const versions = data.versions as unknown as Version[];
  const proposed = versions.find((v) => v.status === "proposed");
  const active = versions.find((v) => v.status === "active");
  const flagged = data.findings.filter((f) => f.flagged);
  const top = flagged[0];

  const call = async (label: string, url: string, body: unknown) => {
    setBusy(label);
    setMsg(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      if (label === "propose")
        setMsg({ tone: j.ai?.status === "fresh" || j.ai?.status === "cached" ? "ok" : "warn", text: j.ai?.status === "fresh" || j.ai?.status === "cached" ? `Proposal v${j.version} created with Gemini (${j.ai.status}).` : `Proposal v${j.version} created from the deterministic candidate — Gemini ${j.ai?.status}: ${j.ai?.error ?? ""}` });
      else setMsg({ tone: "ok", text: label === "accept" ? "Accepted. Future builds use the new version; saved teams keep theirs." : label === "reject" ? "Rejected and recorded." : label === "reset" ? "Demo dataset restored." : "Rolled back." });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const chartData = data.perMatch.map((m, i) => ({ name: `${i + 1}`, label: m.label, Predicted: m.predicted, Actual: m.actual, n: m.n }));
  const bias = data.overall.bias;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Reviewed matches" value={data.overall.matches} sub={data.synthetic ? "Synthetic demo history" : "Aryan's real matches"} />
        <Stat label="Player results with actuals" value={data.overall.n} sub={`MAE ${data.overall.mae ?? "—"} pts`} />
        <Stat label="Bias (predicted − actual)" value={bias === null ? "—" : `${bias > 0 ? "+" : ""}${bias} pts`} sub="Positive bias = overprediction" tone={bias === null ? undefined : bias > 0 ? "over" : "under"} />
      </div>

      <section className="panel p-4" aria-labelledby="pva">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pva" className="font-semibold">
            Predicted vs actual player points (mean per match)
          </h2>
          <span className="text-xs text-muted">
            {data.overall.matches} matches · {data.overall.n} player results{data.synthetic ? " · synthetic" : ""}
          </span>
        </div>
        {chartData.length ? (
          <div className="mt-3 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="#22322d" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: "#9fb0a8", fontSize: 11 }} label={{ value: "Match (chronological)", position: "insideBottom", offset: -2, fill: "#6c7d76", fontSize: 11 }} height={36} />
                <YAxis tick={{ fill: "#9fb0a8", fontSize: 11 }} width={36} />
                <Tooltip contentStyle={{ background: "#121c19", border: "1px solid #2c403a", borderRadius: 8, color: "#f6f7f2", fontSize: 12 }} labelFormatter={(_, p) => (p?.[0]?.payload as { label?: string })?.label ?? ""} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#9fb0a8" }} />
                <Line type="monotone" dataKey="Predicted" stroke="#c8f36a" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="Actual" stroke="#f6f7f2" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">No reviewed matches yet. Save a team, then enter actual points in Match Review.</p>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <section className="panel space-y-4 p-4" aria-labelledby="pat">
          {top ? (
            <div className="flex items-start gap-3 rounded-xl border border-bad/30 bg-bad/10 p-4">
              <CircleAlert className="mt-0.5 shrink-0 text-bad" size={22} aria-hidden />
              <div>
                <h2 id="pat" className="font-semibold text-bad">
                  Repeated pattern detected
                </h2>
                <p className="text-sm text-warm/90">
                  {top.label} {top.direction === "over" ? "overpredicted" : "underpredicted"} by {Math.abs(top.stats.bias ?? 0)} pts on average{data.synthetic ? " in this synthetic history" : ""}.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-line p-4">
              <h2 id="pat" className="font-semibold">
                No repeated pattern yet
              </h2>
              <p className="text-sm text-muted">A group is flagged only with ≥12 results across ≥3 matches, a bias above threshold, and the same direction in ≥60% of matches.</p>
            </div>
          )}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted">Evidence by group</h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {data.findings.slice(0, 7).map((f) => (
                <li key={f.group} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{f.label}</div>
                    <div className="text-xs text-faint">
                      n={f.stats.n} · {f.stats.matches} matches · pred {f.stats.meanPredicted} vs actual {f.stats.meanActual} · {f.reasons[f.reasons.length - 1]}
                    </div>
                  </div>
                  <Pill tone={f.flagged ? (f.direction === "over" ? "over" : "under") : "muted"}>
                    {(f.stats.bias ?? 0) > 0 ? "+" : ""}
                    {f.stats.bias} pts
                  </Pill>
                </li>
              ))}
              {!data.findings.length && <li className="px-3 py-3 text-sm text-faint">No results yet.</li>}
            </ul>
          </div>
          <div className="rounded-lg border border-line p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Minimum-evidence gate</span>
              <Pill tone={data.gate.met ? "ok" : "warn"}>{data.gate.met ? (data.synthetic ? "Met in demo (synthetic)" : "Met") : "Not met"}</Pill>
            </div>
            <p className="mt-1 text-xs text-muted">
              {data.gate.records}/{data.gate.requiredRecords} player results · {data.gate.matches}/{data.gate.requiredMatches} matches. {data.gate.messages.join(" ")}
            </p>
            {data.synthetic && <p className="mt-1 text-xs text-faint">Synthetic records qualify only inside the demo. They never count toward real accuracy.</p>}
          </div>
        </section>

        <section className="panel space-y-4 p-4" aria-labelledby="adj">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-3">
              <SlidersHorizontal className="mt-0.5 text-lime" size={22} aria-hidden />
              <div>
                <h2 id="adj" className="font-semibold">
                  Suggested adjustment
                </h2>
                <p className="text-sm text-muted">Bounded change to factor weights / role multipliers. Applies to future matches only.</p>
              </div>
            </div>
            {proposed ? <Pill tone="warn">Proposal · awaiting your approval</Pill> : <Pill tone="muted">No pending proposal</Pill>}
          </div>

          {proposed && active ? (
            <>
              {proposed.ai && (proposed.ai.headline as string) ? (
                <div className="rounded-lg border border-lime/25 bg-lime/5 p-3 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Sparkles size={14} className="text-lime" />
                    <b>{proposed.ai.headline as string}</b>
                    <Pill tone="lime">Gemini · {String(proposed.ai.status)}</Pill>
                  </div>
                  <p className="text-muted">{proposed.ai.explanation as string}</p>
                  {(proposed.ai.caveats as string[])?.length > 0 && <p className="mt-1 text-xs text-faint">Caveats: {(proposed.ai.caveats as string[]).join(" · ")}</p>}
                </div>
              ) : (
                <p className="rounded-lg border border-line p-3 text-sm text-muted">
                  Deterministic candidate (Gemini {String(proposed.ai?.status ?? "unavailable")}). {proposed.rationale}
                </p>
              )}
              {proposed.ai && (proposed.ai.aiProposalWithinBounds === false) && (
                <p className="text-xs text-warn">Gemini&apos;s own numbers broke the bounds ({(proposed.ai.aiBoundProblems as string[]).join("; ")}), so the deterministic candidate is shown instead.</p>
              )}
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-panel-2 text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2">Factor</th>
                      <th className="px-3 py-2">Current v{active.version}</th>
                      <th className="px-3 py-2 text-right">Proposed v{proposed.version}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {FACT.map((f) => {
                      const c = active.weights[f];
                      const p = proposed.weights[f];
                      return (
                        <tr key={f}>
                          <td className="px-3 py-2">{FACT_LABEL[f]}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-28 rounded-full bg-line">
                                <div className="h-2 rounded-full bg-lime" style={{ width: `${c * 100 * 1.4}%` }} />
                              </div>
                              <span className="num">{Math.round(c * 100)}%</span>
                            </div>
                          </td>
                          <td className={cx("num px-3 py-2 text-right font-semibold", p > c ? "text-lime" : p < c ? "text-over" : "text-muted")}>{Math.round(p * 100)}%</td>
                        </tr>
                      );
                    })}
                    {(["WK", "BAT", "AR", "BOWL"] as const).map((r) => {
                      const c = active.role_multipliers[r];
                      const p = proposed.role_multipliers[r];
                      if (c === p) return null;
                      return (
                        <tr key={r}>
                          <td className="px-3 py-2">{r} multiplier</td>
                          <td className="num px-3 py-2">{c}×</td>
                          <td className={cx("num px-3 py-2 text-right font-semibold", p < c ? "text-over" : "text-lime")}>{p}×</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {proposed.backtest && (
                <p className="text-xs text-muted">
                  Replay on the same {String(proposed.backtest.n)} stored results: MAE {String(proposed.backtest.currentMae)} → {String(proposed.backtest.proposedMae)}, bias {String(proposed.backtest.currentBias)} → {String(proposed.backtest.proposedBias)}.{" "}
                  <b className="text-warn">In-sample only — improvement not yet validated.</b>
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <button disabled={!canAct || !!busy} onClick={() => call("accept", "/api/learning/decide", { dataset: data.dataset, versionId: proposed.id, decision: "accept" })} className="focus-ring rounded-xl bg-lime px-4 py-3 font-semibold text-ink hover:bg-lime-2 disabled:opacity-40">
                  Accept for future matches
                </button>
                <button disabled={!canAct || !!busy} onClick={() => call("reject", "/api/learning/decide", { dataset: data.dataset, versionId: proposed.id, decision: "reject" })} className="focus-ring rounded-xl border border-line-2 px-4 py-3 font-semibold hover:border-lime/60 disabled:opacity-40">
                  Keep current
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted">
                {data.gate.met
                  ? flagged.length
                    ? "Evidence is sufficient and a pattern is flagged. Ask Gemini to summarise it and propose a bounded update — you decide."
                    : "Evidence is sufficient but no consistent pattern clears the thresholds, so no change is proposed."
                  : "Not enough reviewed results to propose any change. Keep entering actual points after matches."}
              </p>
              <button disabled={!canAct || !!busy || !data.gate.met || !flagged.length} onClick={() => call("propose", "/api/learning/propose", { dataset: data.dataset })} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-lime px-4 py-3 font-semibold text-ink hover:bg-lime-2 disabled:opacity-40">
                <Sparkles size={16} /> {busy === "propose" ? "Analysing…" : "Analyse & propose (Gemini)"}
              </button>
            </div>
          )}
          {actHint && <p className="text-xs text-warn">{actHint}</p>}
          {msg && (
            <p role="status" className={cx("text-sm", msg.tone === "ok" ? "text-ok" : msg.tone === "warn" ? "text-warn" : "text-bad")}>
              {msg.text}
            </p>
          )}

          <div className="rounded-lg border border-line p-3">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <History size={15} /> Version history
            </h3>
            <ol className="space-y-2">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={cx("h-2.5 w-2.5 rounded-full", v.status === "active" ? "bg-lime" : v.status === "proposed" ? "bg-warn" : "bg-faint")} />
                    <b>v{v.version}</b>
                    <span className="text-muted">{v.status}</span>
                    <span className="text-xs text-faint">{new Date(v.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  </div>
                  {v.status === "superseded" && (
                    <button disabled={!canAct || !!busy} onClick={() => call("rollback", "/api/learning/decide", { dataset: data.dataset, versionId: v.id, decision: "rollback" })} className="focus-ring inline-flex items-center gap-1 rounded-md border border-line-2 px-2 py-1 text-xs hover:border-lime/60 disabled:opacity-40">
                      <RotateCcw size={12} /> Roll back to v{v.version}
                    </button>
                  )}
                </li>
              ))}
              {!versions.length && <li className="text-sm text-faint">No stored versions (defaults v1 in use).</li>}
            </ol>
            {data.decisions.length > 0 && (
              <p className="mt-2 text-xs text-faint">
                Decisions: {(data.decisions as { decision: string; created_at: string }[]).slice(0, 4).map((d) => `${d.decision} ${new Date(d.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`).join(" · ")}
              </p>
            )}
          </div>
          {data.dataset === "demo" && (
            <button disabled={!!busy} onClick={() => call("reset", "/api/demo/reset", {})} className="focus-ring inline-flex items-center gap-2 text-xs text-muted hover:text-warm disabled:opacity-40">
              <FlaskConical size={13} /> Reset demo dataset (restores the synthetic seed; never touches real data)
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
