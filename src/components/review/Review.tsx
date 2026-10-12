"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Save } from "lucide-react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { computeTeamMetrics, parseActualInput, type ResultRow } from "@/lib/domain/metrics";
import { cx, Pill, RoleChip, Stat } from "@/components/ui";

export interface ReviewRow extends ResultRow {
  id: string;
  team: string;
  credits: number;
  uncertainty: number;
}

export interface ReviewTeam {
  id: string;
  label: string;
  createdAt: string;
  matchStart: string | null;
  status: string;
  ruleVersion: string;
  weightVersion: number;
  forecastVersion: string;
  isDemo: boolean;
  captainKey: string;
  viceCaptainKey: string;
}

export function Review({ team, rows: initialRows, canEdit }: { team: ReviewTeam; rows: ReviewRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [inputs, setInputs] = useState<Record<string, string>>(() => Object.fromEntries(initialRows.map((r) => [r.id, r.actualBase === null ? "" : String(r.actualBase)])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  // live metrics from the current inputs (server recomputes on save)
  const parsed = useMemo(() => Object.fromEntries(initialRows.map((r) => [r.id, parseActualInput(inputs[r.id] ?? "")])), [inputs, initialRows]);
  const rows: ReviewRow[] = initialRows.map((r) => {
    const p = parsed[r.id];
    return { ...r, actualBase: p && p.ok ? p.value : null };
  });
  const m = computeTeamMetrics(rows);
  const dirty = initialRows.some((r) => (r.actualBase === null ? "" : String(r.actualBase)) !== (inputs[r.id] ?? "").trim());
  const points = rows.filter((r) => r.actualBase !== null).map((r) => ({ x: r.predictedBase, y: r.actualBase as number, name: r.name }));
  const pending = rows.length - points.length;
  const max = Math.max(80, ...rows.map((r) => r.predictedBase), ...points.map((p) => p.y)) + 10;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    setFieldErr({});
    try {
      const entries = initialRows.map((r) => ({ teamPlayerId: r.id, value: (inputs[r.id] ?? "").trim() }));
      const res = await fetch(`/api/teams/${team.id}/actuals`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries }) });
      const j = await res.json();
      if (!res.ok) {
        if (Array.isArray(j.details)) setFieldErr(Object.fromEntries(j.details.map((d: { teamPlayerId: string; error: string }) => [d.teamPlayerId, d.error])));
        throw new Error(j.error ?? "Save failed");
      }
      setMsg({ tone: "ok", text: `Saved ${j.saved} value(s)${j.cleared ? `, cleared ${j.cleared}` : ""}. Predictions stay frozen.` });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Predicted total (C/VC applied)" value={m.predictedTotal} sub={`${m.nTotal} players, frozen`} />
        <Stat
          label={m.complete ? "Actual total (C/VC applied)" : "Actual total"}
          value={m.complete ? m.actualTotal : <span className="text-muted">pending</span>}
          sub={m.complete ? "All 11 entered" : `Partial ${m.partialActualTotal} from ${m.nEntered}/${m.nTotal} entered`}
          tone={m.complete ? "lime" : undefined}
        />
        <Stat label="Mean absolute error" value={m.mae === null ? "—" : `${m.mae} pts`} sub={`Entered players only · N = ${m.nEntered}`} />
        <Stat
          label="Signed bias (predicted − actual)"
          value={m.bias === null ? "—" : `${m.bias > 0 ? "+" : ""}${m.bias}`}
          sub={m.bias === null ? "No actuals yet" : m.bias > 0 ? "Positive = overprediction" : m.bias < 0 ? "Negative = underprediction" : "No bias"}
          tone={m.bias === null ? undefined : m.bias > 0 ? "over" : m.bias < 0 ? "under" : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="panel overflow-hidden" aria-labelledby="pr">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 id="pr" className="font-semibold">
              Player results
            </h2>
            <span className="text-xs text-muted">
              {m.nEntered} of {m.nTotal} actuals entered · blank = not entered, 0 = scored zero
            </span>
          </header>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-panel-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2">Player</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2 text-right">Predicted base</th>
                  <th className="px-2 py-2">Actual base</th>
                  <th className="px-4 py-2 text-right">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const p = parsed[r.id];
                  const err = r.actualBase === null ? null : Math.round((r.predictedBase - r.actualBase) * 10) / 10;
                  const big = err !== null && Math.abs(err) >= 20;
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{r.name}</span>
                          {r.multiplier === 2 && <Pill tone="lime">C 2×</Pill>}
                          {r.multiplier === 1.5 && <Pill tone="lime">VC 1.5×</Pill>}
                        </div>
                        <div className="text-[11px] text-faint">{r.team}</div>
                      </td>
                      <td className="px-2">
                        <RoleChip role={r.role} />
                      </td>
                      <td className="num px-2 text-right">{r.predictedBase}</td>
                      <td className="px-2 py-2">
                        <input
                          aria-label={`Actual base points for ${r.name}`}
                          inputMode="decimal"
                          disabled={!canEdit}
                          value={inputs[r.id] ?? ""}
                          placeholder="Enter"
                          onChange={(e) => setInputs((s) => ({ ...s, [r.id]: e.target.value }))}
                          className={cx(
                            "focus-ring num w-24 rounded-lg border bg-ink-2 px-3 py-1.5 disabled:opacity-60",
                            (p && !p.ok) || fieldErr[r.id] ? "border-bad" : "border-line-2",
                          )}
                        />
                        {((p && !p.ok && p.error) || fieldErr[r.id]) && <div className="mt-1 text-[11px] text-bad">{fieldErr[r.id] ?? (p && !p.ok ? p.error : "")}</div>}
                      </td>
                      <td className={cx("num px-4 text-right font-semibold", err === null ? "text-faint" : err > 0 ? "text-over" : err < 0 ? "text-under" : "text-muted")}>
                        {err === null ? "—" : `${err > 0 ? "+" : ""}${err}`}
                        {big && <span className="block text-[10px] font-normal text-faint">{err! > 0 ? "large over" : "large under"}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="panel p-4" aria-labelledby="sc">
            <h2 id="sc" className="font-semibold">
              Predicted vs actual base points
            </h2>
            <div className="mt-2 h-[280px]" role="img" aria-label={`Scatter of ${points.length} entered players; ${pending} pending not plotted`}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 12, bottom: 18, left: 0 }}>
                  <CartesianGrid stroke="#22322d" />
                  <XAxis type="number" dataKey="x" name="Predicted" domain={[0, max]} tick={{ fill: "#9fb0a8", fontSize: 11 }} label={{ value: "Predicted base", position: "insideBottom", offset: -8, fill: "#9fb0a8", fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" name="Actual" domain={[Math.min(0, ...points.map((p) => p.y)), max]} tick={{ fill: "#9fb0a8", fontSize: 11 }} width={36} />
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke="#f6f7f2" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{ background: "#121c19", border: "1px solid #2c403a", borderRadius: 8, color: "#f6f7f2", fontSize: 12 }}
                    formatter={(v) => String(v)}
                    labelFormatter={() => ""}
                  />
                  <Scatter data={points} fill="#c8f36a" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              <li>
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-lime" /> Actual entered ({points.length}) — a real 0 is plotted
              </li>
              <li>Actual pending ({pending}) — unknown, not plotted</li>
              <li>- - Perfect prediction (y = x); points below the line were overpredicted</li>
            </ul>
          </section>
          <section className="panel space-y-2 p-4 text-sm">
            <h2 className="flex items-center gap-2 font-semibold">
              <Lock size={15} className="text-lime" /> Forecast frozen before the match
            </h2>
            <p className="text-muted">
              Saved {new Date(team.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} IST · rules {team.ruleVersion} · weights v{team.weightVersion} · forecast {team.forecastVersion} · {team.status === "ready" ? "Ready" : "valid, provisional"}.
            </p>
            <p className="text-xs text-faint">Enter Dream11 base points (before C/VC). MatchLab applies the 2× / 1.5× multipliers exactly once. Predictions cannot be edited.</p>
          </section>
          {canEdit ? (
            <div className="sticky bottom-16 space-y-2 lg:bottom-3">
              <button disabled={busy || !dirty} onClick={save} className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl bg-lime px-5 py-3 font-semibold text-ink hover:bg-lime-2 disabled:opacity-40">
                <Save size={18} /> {busy ? "Saving…" : "Save actual points"}
              </button>
              {msg && (
                <p role="status" className={cx("text-sm", msg.tone === "ok" ? "text-ok" : "text-bad")}>
                  {msg.text}
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-lg border border-line p-3 text-sm text-muted">Only the owner of this team can enter actual points.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
