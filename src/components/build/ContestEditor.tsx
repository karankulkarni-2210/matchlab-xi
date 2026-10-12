"use client";
import { useMemo, useState } from "react";
import Papa from "papaparse";
import { Download, Upload, X } from "lucide-react";
import { RULE_PRESETS } from "@/lib/domain/rules";
import type { ContestPlayer } from "@/lib/domain/types";
import { cx, Pill } from "@/components/ui";
import type { BuildResult } from "./types";

export function ContestEditor({ data, onClose, onSaved }: { data: BuildResult; onClose: () => void; onSaved: () => void }) {
  const c = data.contest.contest;
  const [teamA, teamB] = data.bundle.match.teams;
  const [players, setPlayers] = useState<ContestPlayer[]>(c.players);
  const [ruleId, setRuleId] = useState(c.rules.id);
  const [rulesConfirmed, setRulesConfirmed] = useState(!!c.rulesConfirmedAt);
  const [lineups, setLineups] = useState(c.lineupsConfirmed);
  const [sourceLabel, setSourceLabel] = useState(data.contest.origin === "owner" ? c.sourceLabel : "Dream11 contest (owner-entered)");
  const [asOf, setAsOf] = useState(() => {
    const d = c.sourceAsOf ? new Date(c.sourceAsOf) : new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [csv, setCsv] = useState("");
  const [csvMsg, setCsvMsg] = useState<{ errors: { row: number; message: string }[]; matched: number; added: number } | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const isPractice = data.contest.origin === "practice";
  const readOnly = data.bundle.isDemo || isPractice;
  const known = useMemo(() => players.filter((p) => p.credits !== null).length, [players]);

  const update = (key: string, patch: Partial<ContestPlayer>) => setPlayers((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const template = () => {
    const text = Papa.unparse(
      players.map((p) => ({ name: p.name, team: p.team, role: p.role ?? "", credits: p.credits ?? "", lineup: p.lineup === "confirmed_xi" ? "xi" : p.lineup === "confirmed_out" ? "out" : p.lineup, history_name: p.historyName ?? "" })),
    );
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `matchlab-contest-${data.bundle.match.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewCsv = async () => {
    setBusy(true);
    setCsvMsg(null);
    try {
      const res = await fetch("/api/contest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchId: data.bundle.match.id, csv }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "CSV preview failed");
      setCsvMsg({ errors: j.errors, matched: j.matched, added: j.added });
      if (!j.errors.length) setPlayers(j.players);
    } catch (e) {
      setCsvMsg({ errors: [{ row: 0, message: (e as Error).message }], matched: 0, added: 0 });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/contest", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: data.bundle.match.id, players, ruleId, rulesConfirmed, lineupsConfirmed: lineups, sourceLabel, sourceAsOf: asOf ? new Date(asOf).toISOString() : null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error + (j.details ? ` — ${JSON.stringify(j.details).slice(0, 200)}` : ""));
      setMsg({ tone: "ok", text: "Saved. Rebuilding with your contest data…" });
      onSaved();
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-labelledby="ce-title">
      <div className="flex h-full w-full max-w-3xl flex-col border-l border-line bg-clover-2">
        <header className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 id="ce-title" className="text-lg font-semibold">
              Contest data · {data.bundle.match.teamShort[0]} vs {data.bundle.match.teamShort[1]}
            </h2>
            <p className="text-sm text-muted">
              Credits, contest roles and lineups come from Aryan&apos;s Dream11 contest. MatchLab never guesses them. {known}/{players.length} credits known.
            </p>
          </div>
          <button onClick={onClose} className="focus-ring rounded-md p-1 text-muted hover:text-cream" aria-label="Close">
            <X size={20} />
          </button>
        </header>
        <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-4">
          {readOnly && (
            <div className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
              {data.bundle.isDemo
                ? "The demo contest is fixed (synthetic). Pick a real match to enter your own contest data."
                : isPractice
                  ? "Practice credits are illustrative and cannot be saved as contest data. Exit practice mode to enter your real Dream11 credits."
                  : ""}
            </div>
          )}
          <section className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-muted">Rule preset</span>
              <select value={ruleId} onChange={(e) => setRuleId(e.target.value)} className="focus-ring mt-1 w-full rounded-lg border border-line-2 bg-pale px-3 py-2">
                {Object.values(RULE_PRESETS).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-faint">{RULE_PRESETS[ruleId]?.source}</span>
            </label>
            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 accent-[var(--gold)]" checked={rulesConfirmed} onChange={(e) => setRulesConfirmed(e.target.checked)} />
                <span>I checked these limits against my contest&apos;s rules screen</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 accent-[var(--gold)]" checked={lineups.teamA} onChange={(e) => setLineups({ ...lineups, teamA: e.target.checked })} />
                <span>{teamA} playing XI announced (statuses below reflect it)</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 accent-[var(--gold)]" checked={lineups.teamB} onChange={(e) => setLineups({ ...lineups, teamB: e.target.checked })} />
                <span>{teamB} playing XI announced</span>
              </label>
            </div>
            <label className="text-sm">
              <span className="text-muted">Source</span>
              <input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} maxLength={120} className="focus-ring mt-1 w-full rounded-lg border border-line-2 bg-pale px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="text-muted">Values read at (your local time)</span>
              <input type="datetime-local" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="focus-ring mt-1 w-full rounded-lg border border-line-2 bg-pale px-3 py-2" />
            </label>
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Import CSV</h3>
              <button onClick={template} className="focus-ring inline-flex items-center gap-1 text-sm text-gold">
                <Download size={14} /> Download template (current pool)
              </button>
            </div>
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={4}
              placeholder={"name,team,role,credits,lineup,history_name\nSanju Samson,India,WK,8.5,xi,"}
              className="focus-ring w-full rounded-lg border border-line-2 bg-pale p-3 font-mono text-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button disabled={!csv.trim() || busy} onClick={previewCsv} className="focus-ring inline-flex items-center gap-1 rounded-full border border-line-2 px-3 py-1.5 text-sm hover:border-gold/60 disabled:opacity-50">
                <Upload size={14} /> Validate & apply
              </button>
              <span className="text-xs text-faint">Columns: name, team, role (WK/BAT/AR/BOWL), credits (.5 steps), lineup (xi/out/probable/squad), history_name (optional Cricsheet name).</span>
            </div>
            {csvMsg && (
              <div className={cx("rounded-lg border p-3 text-xs", csvMsg.errors.length ? "border-bad/30 bg-bad/10 text-bad" : "border-ok/30 bg-ok/10 text-ok")}>
                {csvMsg.errors.length
                  ? csvMsg.errors.slice(0, 8).map((e) => (
                      <div key={`${e.row}-${e.message}`}>
                        Row {e.row}: {e.message}
                      </div>
                    ))
                  : `Applied: ${csvMsg.matched} matched, ${csvMsg.added} added. Review below, then save.`}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Player pool</h3>
            <div className="scroll-thin max-h-[50vh] overflow-auto rounded-lg border border-line">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="sticky top-0 bg-pale-2 text-left text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-2 py-2">Role</th>
                    <th className="px-2 py-2">Credits</th>
                    <th className="px-2 py-2">Lineup</th>
                    <th className="px-2 py-2">History name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {players.map((p) => (
                    <tr key={p.key}>
                      <td className="px-3 py-1.5">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-[11px] text-faint">
                          {p.team}
                          {p.providerRole ? ` · provider: ${p.providerRole}` : ""}
                        </div>
                      </td>
                      <td className="px-2">
                        <select aria-label={`${p.name} role`} value={p.role ?? ""} onChange={(e) => update(p.key, { role: (e.target.value || null) as ContestPlayer["role"] })} className="focus-ring rounded-md border border-line-2 bg-pale px-2 py-1">
                          <option value="">?</option>
                          {["WK", "BAT", "AR", "BOWL"].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2">
                        <input
                          aria-label={`${p.name} credits`}
                          inputMode="decimal"
                          value={p.credits ?? ""}
                          placeholder="?"
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            const n = Number(v);
                            update(p.key, { credits: v === "" ? null : Number.isFinite(n) ? n : p.credits });
                          }}
                          className={cx("focus-ring num w-16 rounded-md border bg-pale px-2 py-1", p.credits === null ? "border-warn/50" : "border-line-2")}
                        />
                      </td>
                      <td className="px-2">
                        <select aria-label={`${p.name} lineup`} value={p.lineup} onChange={(e) => update(p.key, { lineup: e.target.value as ContestPlayer["lineup"] })} className="focus-ring rounded-md border border-line-2 bg-pale px-2 py-1">
                          <option value="squad">squad</option>
                          <option value="probable">probable</option>
                          <option value="confirmed_xi">in XI</option>
                          <option value="confirmed_out">out</option>
                        </select>
                      </td>
                      <td className="px-2">
                        <input aria-label={`${p.name} history name`} value={p.historyName ?? ""} placeholder="auto" onChange={(e) => update(p.key, { historyName: e.target.value || null })} className="focus-ring w-32 rounded-md border border-line-2 bg-pale px-2 py-1" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
          <div className="text-sm">{msg ? <span className={msg.tone === "ok" ? "text-ok" : "text-bad"}>{msg.text}</span> : <Pill tone={known === players.length ? "ok" : "warn"}>{known}/{players.length} credits known</Pill>}</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="focus-ring rounded-full border border-line-2 px-4 py-2 text-sm">
              Cancel
            </button>
            <button disabled={readOnly || busy} onClick={save} className="focus-ring rounded-full bg-gold px-4 py-2 text-sm font-semibold text-clover disabled:opacity-40">
              Save contest data
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
