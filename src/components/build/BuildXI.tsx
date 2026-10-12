"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, ClipboardCopy, CloudRain, Coins, Database, FileSpreadsheet, FlaskConical, MapPin, RefreshCw, Save, ShieldCheck, Sparkles, TriangleAlert, Users, X } from "lucide-react";
import { ago, cx, FreshnessPill, Pill, RoleChip } from "@/components/ui";
import type { TeamSelection } from "@/lib/domain/types";
import { ContestEditor } from "./ContestEditor";
import { Pitch } from "./Pitch";
import { PlayerPanel } from "./PlayerPanel";
import type { BuildResult, ExplainResponse } from "./types";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) {
    const det = Array.isArray(j.details) ? ` — ${j.details.map((d: { message?: string } | string) => (typeof d === "string" ? d : d.message)).join("; ")}` : "";
    throw new Error((j.error ?? `HTTP ${res.status}`) + det);
  }
  return j as T;
}

export function BuildXI({ initial, signedIn }: { initial: BuildResult; signedIn: boolean }) {
  const [data, setData] = useState(initial);
  const [selectedKey, setSelectedKey] = useState<string | null>(initial.team?.captainKey ?? null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const tplOnly = (t: BuildResult["template"]): ExplainResponse | null => (t ? { status: "template", output: null, template: t, model: "", generatedAt: null } : null);
  const [explain, setExplain] = useState<ExplainResponse | null>(tplOnly(initial.template));
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set(initial.practice?.autoExcluded ?? []));
  const practice = !!initial.practice?.active;
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad" | "warn"; text: string; link?: string } | null>(null);
  const [editor, setEditor] = useState(false);

  const m = data.bundle.match;
  const fById = useMemo(() => new Map(data.forecasts.map((f) => [f.key, f])), [data.forecasts]);
  const xi = useMemo(() => (data.team?.playerKeys ?? []).map((k) => fById.get(k)!).filter(Boolean), [data.team, fById]);
  const selected = selectedKey ? fById.get(selectedKey) ?? null : null;
  const v = data.validation;
  const rules = data.contest.contest.rules;

  const run = useCallback(
    async (label: string, body: Record<string, unknown>) => {
      setBusy(label);
      setNotice(null);
      try {
        const r = await postJson<BuildResult>("/api/build", { matchId: m.id, practice, ...body });
        setData(r);
        setExplain(tplOnly(r.template));
        return r;
      } catch (e) {
        setNotice({ tone: "bad", text: (e as Error).message });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [m.id, practice],
  );

  const withSelection = (sel: TeamSelection, label: string) => run(label, { selection: sel });
  const reoptimize = () => run("optimize", { lockedKeys: [...locked], excludedKeys: [...excluded] });

  const swap = async (benchKey: string) => {
    if (!data.team || !selectedKey) return;
    const t = data.team;
    const sel: TeamSelection = {
      playerKeys: t.playerKeys.map((k) => (k === selectedKey ? benchKey : k)),
      captainKey: t.captainKey === selectedKey ? benchKey : t.captainKey,
      viceCaptainKey: t.viceCaptainKey === selectedKey ? benchKey : t.viceCaptainKey,
    };
    const r = await withSelection(sel, "swap");
    if (r) {
      setSelectedKey(benchKey);
      setNotice(r.validation?.valid ? { tone: "ok", text: "Swap applied and re-validated." } : { tone: "warn", text: "Swap applied but the team is now invalid — see the violations below." });
    }
  };
  const setCaptain = (k: string, vc: boolean) => {
    if (!data.team) return;
    const t = data.team;
    const sel: TeamSelection = vc
      ? { ...t, viceCaptainKey: k, captainKey: t.captainKey === k ? t.viceCaptainKey : t.captainKey }
      : { ...t, captainKey: k, viceCaptainKey: t.viceCaptainKey === k ? t.captainKey : t.viceCaptainKey };
    withSelection(sel, "cvc");
  };

  const generate = async (regenerate = false) => {
    if (!data.team || !v?.valid) return;
    setBusy("explain");
    setNotice(null);
    try {
      const r = await postJson<ExplainResponse>("/api/explain", { matchId: m.id, selection: data.team, regenerate, practice });
      setExplain(r);
      if (r.status !== "fresh" && r.status !== "cached")
        setNotice({ tone: "warn", text: `Gemini ${r.status.replace("_", " ")}: ${r.error ?? ""}. Showing reasons built directly from the evidence instead.` });
      else if (r.error) setNotice({ tone: "warn", text: `Showing cached reasons (${r.error}).` });
    } catch (e) {
      setNotice({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!data.team || !v?.valid) return;
    setBusy("save");
    setNotice(null);
    try {
      const r = await postJson<{ id: string; status: string }>("/api/teams", {
        matchId: m.id,
        playerKeys: data.team.playerKeys,
        captainKey: data.team.captainKey,
        viceCaptainKey: data.team.viceCaptainKey,
        explanation: explain?.output ?? explain?.template ?? undefined,
        practice,
      });
      setNotice({ tone: "ok", text: `Frozen and saved (${r.status === "ready" ? "Ready" : "valid · provisional"}). Enter actual points after the match.`, link: `/review?team=${r.id}` });
    } catch (e) {
      setNotice({ tone: "bad", text: `Save failed: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const copyXi = async () => {
    if (!data.team) return;
    const t = data.team;
    const byRole = (r: string) =>
      xi
        .filter((p) => p.role === r)
        .map((p) => `${p.name}${p.key === t.captainKey ? " (C)" : p.key === t.viceCaptainKey ? " (VC)" : ""} ${p.credits ?? "?"}cr`)
        .join(", ");
    const text = [
      `MatchLab XI — ${m.teamShort[0]} vs ${m.teamShort[1]} · ${m.title}${data.bundle.isDemo ? " (SYNTHETIC DEMO)" : practice ? " (PRACTICE — illustrative credits, not Dream11)" : ""}`,
      `Status: ${v?.status === "ready" ? "Ready" : v?.status === "valid_provisional" ? "Valid, provisional" : "Invalid"} · ${data.totals.credits ?? "?"}/${rules.creditCap} credits · ${rules.label}`,
      `C: ${fById.get(t.captainKey ?? "")?.name ?? "-"} · VC: ${fById.get(t.viceCaptainKey ?? "")?.name ?? "-"}`,
      `WK: ${byRole("WK")}`,
      `BAT: ${byRole("BAT")}`,
      `AR: ${byRole("AR")}`,
      `BOWL: ${byRole("BOWL")}`,
      `Projected ${data.totals.predicted} pts (forecast ${data.forecastVersion}, weights v${data.weights.version}). Enter the team manually in Dream11.`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ tone: "ok", text: "Team copied — paste it in your league chat or use it to enter the team in Dream11." });
    } catch {
      setNotice({ tone: "warn", text: "Clipboard unavailable in this browser." });
    }
  };

  const onSelect = (k: string) => {
    setSelectedKey(k);
    setSheetOpen(true);
  };

  const statusPill =
    v?.status === "ready" ? (
      <span className="inline-flex items-center gap-2 text-ok">
        <CheckCircle2 size={20} /> <b>Ready to submit</b>
      </span>
    ) : v?.status === "valid_provisional" ? (
      <span className="inline-flex items-center gap-2 text-warn">
        <TriangleAlert size={22} /> <b>Valid · provisional</b>
      </span>
    ) : (
      <span className="inline-flex items-center gap-2 text-bad">
        <CircleAlert size={22} /> <b>{data.team ? "Invalid team" : "No valid XI"}</b>
      </span>
    );
  const problems = [...(v?.violations.map((x) => x.message) ?? []), ...(data.optimizer && !data.optimizer.feasible ? data.optimizer.violations.map((x) => x.message) : [])];
  const blockers = v?.readinessBlockers.map((b) => b.message) ?? [];
  const venueEv = data.evidence.find((e) => e.kind === "venue");
  const weatherEv = data.evidence.find((e) => e.kind === "weather");
  const creditsKnown = data.contest.contest.players.filter((p) => p.credits !== null).length;

  const panel = selected ? (
    <PlayerPanel
      data={data}
      player={selected}
      explain={explain}
      busy={!!busy}
      locked={locked.has(selected.key)}
      excluded={excluded.has(selected.key)}
      onMakeCaptain={() => setCaptain(selected.key, false)}
      onMakeVc={() => setCaptain(selected.key, true)}
      onSwap={swap}
      onToggleLock={() => setLocked((s) => { const n = new Set(s); if (n.has(selected.key)) n.delete(selected.key); else n.add(selected.key); return n; })}
      onToggleExclude={() => setExcluded((s) => { const n = new Set(s); if (n.has(selected.key)) n.delete(selected.key); else n.add(selected.key); return n; })}
    />
  ) : (
    <p className="text-sm text-muted">Select a player on the pitch or in the pool to see the evidence behind the pick.</p>
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      {/* header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Build your match-day XI</h1>
            {data.bundle.isDemo && <Pill tone="info">Synthetic demo</Pill>}
            {practice && <Pill tone="info">Practice credits</Pill>}
          </div>
          <p className="mt-1 text-lg font-semibold">
            {m.teams[0]} vs {m.teams[1]} <span className="font-normal text-muted">· {m.title}</span>
          </p>
          <p className="text-sm text-muted">
            {m.format} · {m.venue} · starts {new Date(m.startsAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} IST
          </p>
          {m.formatNote && <p className="mt-1 text-xs text-warn">{m.formatNote}</p>}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="panel flex items-center gap-2 px-3 py-2">
            <Users size={20} className="text-lime" aria-hidden />
            <div>
              <div className="num font-semibold">{data.team?.playerKeys.length ?? 0}/{rules.players}</div>
              <div className="text-[11px] text-muted">players</div>
            </div>
          </div>
          <div className="panel flex items-center gap-2 px-3 py-2">
            <Coins size={20} className="text-lime" aria-hidden />
            <div>
              <div className="num font-semibold">{data.totals.credits ?? "?"}/{rules.creditCap}</div>
              <div className="text-[11px] text-muted">{practice ? "illustrative credits" : "credits"}</div>
            </div>
          </div>
          <div className="panel flex items-center gap-2 px-3 py-2">
            <ShieldCheck size={20} className={data.contest.contest.rulesConfirmedAt ? "text-ok" : "text-warn"} aria-hidden />
            <div>
              <div className="text-sm font-semibold">{data.contest.contest.rulesConfirmedAt ? "Rules confirmed" : "Rules unconfirmed"}</div>
              <div className="text-[11px] text-muted">{rules.id.includes("strict") ? "strict-compatible" : "expanded"}</div>
            </div>
          </div>
        </div>
      </header>

      {practice ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-wk/40 bg-wk/10 px-4 py-3 text-sm text-wk">
          <span className="flex items-start gap-2">
            <FlaskConical size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              <b>Practice mode.</b> {data.practice.filled} credits are illustrative values generated by MatchLab from projected points (6.5–11, stronger projection = pricier) — <b>not Dream11 credits</b>. Forecasts, evidence and rules are real; teams here are never marked Ready.
              {data.practice.autoExcluded.length > 0 && ` ${data.practice.autoExcluded.length} players with no T20I in the last 12 months start excluded (select one to allow).`}
            </span>
          </span>
          <Link href={`/build/${m.id}`} className="focus-ring rounded-md border border-wk/40 px-3 py-1 font-medium">
            Exit practice mode
          </Link>
        </div>
      ) : (
        data.contest.notes.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
            <span>{data.contest.notes.join(" ")}</span>
            <div className="flex flex-wrap gap-2">
              {data.practice.available && (
                <Link href={`/build/${m.id}?practice=1`} className="focus-ring inline-flex items-center gap-1 rounded-md bg-wk px-3 py-1 font-semibold text-ink">
                  <FlaskConical size={14} /> Try practice mode (illustrative credits)
                </Link>
              )}
              <button onClick={() => setEditor(true)} className="focus-ring inline-flex items-center gap-1 rounded-md border border-warn/40 px-3 py-1 font-medium">
                <FileSpreadsheet size={14} /> {signedIn ? "Enter contest data" : "Preview contest import"}
              </button>
            </div>
          </div>
        )
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] xl:grid-cols-[300px_minmax(0,1fr)_400px]">
        {/* left: match context */}
        <aside className="space-y-4 lg:col-start-1 lg:row-start-1" aria-label="Match context">
          <section className="panel space-y-4 p-4">
            <h2 className="font-semibold">Match context</h2>
            <div className="flex items-start gap-2 text-sm">
              <MapPin size={16} className="mt-0.5 shrink-0 text-faint" aria-hidden />
              <div>
                <div className="font-medium">{data.bundle.venue?.name ?? m.venue}</div>
                <div className="text-xs text-muted">{venueEv?.detail}</div>
              </div>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <CloudRain size={16} className="mt-0.5 shrink-0 text-faint" aria-hidden />
              <div>
                <div className="font-medium">{weatherEv ? weatherEv.title : "Weather"}</div>
                <div className="text-xs text-muted">{weatherEv ? weatherEv.detail : data.bundle.weatherNote}</div>
              </div>
            </div>
            {m.toss && <div className="text-sm">Toss: {m.toss}</div>}
          </section>

        </aside>

        {/* centre: pitch + pool */}
        <section className="min-w-0 space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label="Team">
          {data.team ? (
            <Pitch players={xi} teamA={m.teams[0]} captainKey={data.team.captainKey} viceCaptainKey={data.team.viceCaptainKey} selectedKey={selectedKey} onSelect={onSelect} locked={locked} />
          ) : (
            <div className="panel space-y-3 p-6" role="alert">
              <h2 className="flex items-center gap-2 font-semibold text-bad">
                <CircleAlert size={18} /> No valid XI can be built yet
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <p className="text-sm text-muted">MatchLab does not relax rules or estimate credits. Enter your contest data to continue — forecasts for every player are below.</p>
              {data.practice.available && !practice && (
                <Link href={`/build/${m.id}?practice=1`} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-wk px-4 py-2 text-sm font-semibold text-ink">
                  <FlaskConical size={15} /> Explore with illustrative practice credits
                </Link>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button disabled={!!busy} onClick={reoptimize} className="focus-ring inline-flex items-center gap-2 rounded-lg border border-line-2 px-3 py-2 text-sm hover:border-lime/60 disabled:opacity-50">
              <RefreshCw size={15} className={busy === "optimize" ? "animate-spin" : ""} /> Re-optimize{locked.size || excluded.size ? ` (${locked.size} locked, ${excluded.size} excluded)` : ""}
            </button>
            {data.optimizer && (
              <span className="text-xs text-faint">
                {data.optimizer.feasible ? `Exact search · ${data.optimizer.nodes.toLocaleString()} nodes${data.optimizer.optimal ? " · optimal" : " · node limit reached"}` : "Search found no feasible XI"} · forecast {data.forecastVersion} · weights v{data.weights.version}
              </span>
            )}
          </div>

          <section className="panel overflow-hidden" aria-labelledby="pool">
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 id="pool" className="font-semibold">
                Player pool <span className="text-sm font-normal text-muted">({data.forecasts.length})</span>
              </h2>
              <span className="text-xs text-faint">ranking = projection × availability × evidence</span>
            </header>
            <div className="scroll-thin max-h-[460px] overflow-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 z-10 bg-panel-2 text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2">Player</th>
                    <th className="px-2 py-2">Role</th>
                    <th className="px-2 py-2 text-right">Cr</th>
                    <th className="px-2 py-2 text-right">Proj.</th>
                    <th className="px-2 py-2 text-right">±</th>
                    <th className="px-2 py-2 text-right">Cov.</th>
                    <th className="px-2 py-2 text-right">Rank</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...data.forecasts]
                    .sort((a, b) => b.rankingScore - a.rankingScore)
                    .map((f) => {
                      const inXi = data.team?.playerKeys.includes(f.key);
                      const br = data.bench.find((b) => b.key === f.key);
                      return (
                        <tr key={f.key} className={cx("cursor-pointer hover:bg-white/[0.03]", selectedKey === f.key && "bg-lime/[0.06]")} onClick={() => onSelect(f.key)}>
                          <td className="px-4 py-2">
                            <button className="focus-ring text-left" onClick={(e) => { e.stopPropagation(); onSelect(f.key); }}>
                              <span className="font-medium">{f.name}</span>
                              <span className="block text-[11px] text-faint">
                                {f.team} · {f.lineup.replace("_", " ")}
                                {!f.historyMatched ? " · no history" : ""}
                                {f.staleHistory && <span className="text-warn"> · last T20I {f.lastT20I?.slice(0, 7)}</span>}
                              </span>
                            </button>
                          </td>
                          <td className="px-2"><RoleChip role={f.role} /></td>
                          <td className={cx("num px-2 text-right", f.credits === null && "text-warn")}>{f.credits ?? "?"}</td>
                          <td className="num px-2 text-right font-semibold">{f.predictedBase}</td>
                          <td className="num px-2 text-right text-muted">{f.uncertainty}</td>
                          <td className={cx("num px-2 text-right", f.coverage < 0.4 ? "text-bad" : f.coverage < 0.7 ? "text-warn" : "text-muted")}>{Math.round(f.coverage * 100)}%</td>
                          <td className="num px-2 text-right text-muted">{f.rankingScore}</td>
                          <td className="max-w-[260px] px-4 text-xs">
                            {inXi ? (
                              <span className="text-lime">
                                In XI{data.team?.captainKey === f.key ? " · C" : data.team?.viceCaptainKey === f.key ? " · VC" : ""}
                              </span>
                            ) : (
                              <span className="text-faint">{br?.text ?? "—"}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        {/* contest + sources: below the pitch on phones, left column on desktop */}
        <aside className="space-y-4 lg:col-start-1 lg:row-start-2" aria-label="Contest data and sources">
          <section className="panel space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Contest data</h2>
              <Pill tone={data.contest.origin === "owner" ? "ok" : data.contest.origin === "demo" ? "info" : "warn"}>{data.contest.origin}</Pill>
            </div>
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between gap-2">
                <span className="text-muted">Credits known</span>
                <span className={cx("num", creditsKnown < data.contest.contest.players.length && "text-warn")}>
                  {creditsKnown}/{data.contest.contest.players.length}
                </span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-muted">Lineups confirmed</span>
                <span>
                  {m.teamShort[0]} {data.contest.contest.lineupsConfirmed.teamA ? "✓" : "—"} · {m.teamShort[1]} {data.contest.contest.lineupsConfirmed.teamB ? "✓" : "—"}
                </span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-muted">Values as of</span>
                <span className="text-right text-xs">{data.contest.contest.sourceAsOf ? ago(data.contest.contest.sourceAsOf) : "—"}</span>
              </li>
            </ul>
            <p className="text-xs text-faint">{data.contest.contest.sourceLabel}</p>
            <button onClick={() => setEditor(true)} className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line-2 px-3 py-2 text-sm hover:border-lime/60">
              <FileSpreadsheet size={15} /> {data.bundle.isDemo ? "View contest data" : "Edit contest data / CSV"}
            </button>
          </section>

          <section className="panel space-y-3 p-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Database size={16} aria-hidden /> Evidence sources
            </h2>
            <ul className="space-y-2.5 text-sm">
              {data.bundle.sources.map((s) => (
                <li key={s.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{s.label}</span>
                    <FreshnessPill status={s.status} asOf={s.asOf} />
                  </div>
                  <div className="text-xs text-faint">{s.detail}</div>
                </li>
              ))}
            </ul>
            {data.bundle.squadNote && <p className="rounded-md border border-warn/25 bg-warn/5 p-2 text-xs text-warn">{data.bundle.squadNote}</p>}
            <p className="text-xs text-faint">
              History matched for {data.coverageSummary.matched}/{data.coverageSummary.total} players · mean coverage {Math.round(data.coverageSummary.mean * 100)}%.
            </p>
          </section>
        </aside>

        {/* right: why this pick (desktop xl) */}
        <aside className="panel hidden p-4 xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:block" aria-label="Why this pick">
          <h2 className="mb-3 text-lg font-semibold">Why this pick?</h2>
          {explain?.output?.summary || explain?.template?.summary ? (
            <p className="mb-4 rounded-lg border border-line bg-ink-2 p-3 text-sm text-muted">{explain.output?.summary ?? explain.template?.summary}</p>
          ) : null}
          {panel}
        </aside>
      </div>

      {/* mobile / tablet evidence sheet */}
      {sheetOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 xl:hidden" role="dialog" aria-modal="true" aria-label={`Evidence for ${selected.name}`} onClick={() => setSheetOpen(false)}>
          <div className="scroll-thin max-h-[78dvh] w-full overflow-y-auto rounded-t-2xl border-t border-line bg-ink-2 p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Why this pick?</h2>
              <button onClick={() => setSheetOpen(false)} aria-label="Close" className="focus-ring rounded-md p-1 text-muted">
                <X size={20} />
              </button>
            </div>
            {panel}
          </div>
        </div>
      )}

      {/* sticky validity / action bar */}
      <div className="sticky bottom-16 z-30 lg:bottom-3">
        <div className="panel flex flex-col gap-2 border-line-2 bg-panel/95 p-2.5 shadow-2xl backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {statusPill}
              {data.totals.predicted !== null && (
                <span className="num text-sm text-muted">
                  Projected <b className="text-warm">{data.totals.predicted}</b> pts (C {rules.captainMultiplier}× · VC {rules.viceCaptainMultiplier}×)
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-1 text-xs text-muted sm:line-clamp-2">
              {problems.length ? problems.join(" · ") : blockers.length ? `Not ready: ${blockers.join(" · ")}` : "All rules pass, lineups and rules confirmed."}
            </p>
            {notice && (
              <p className={cx("mt-1 text-xs", notice.tone === "ok" ? "text-ok" : notice.tone === "warn" ? "text-warn" : "text-bad")} role="status">
                {notice.text}{" "}
                {notice.link && (
                  <Link className="underline" href={notice.link}>
                    Open in Match Review →
                  </Link>
                )}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              disabled={!data.team || !!busy}
              onClick={copyXi}
              aria-label="Copy team as text"
              title="Copy team as text"
              className="focus-ring inline-flex items-center justify-center rounded-lg border border-line-2 px-3 py-2 text-sm hover:border-lime/60 disabled:opacity-40 sm:py-2.5"
            >
              <ClipboardCopy size={16} />
            </button>
            <button
              disabled={!v?.valid || !!busy}
              onClick={() => generate(explain?.status === "fresh" || explain?.status === "cached")}
              className="focus-ring inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-line-2 px-3 py-2 text-sm font-medium hover:border-lime/60 disabled:opacity-40 sm:flex-none sm:px-4 sm:py-2.5"
            >
              <Sparkles size={16} className={busy === "explain" ? "animate-pulse text-lime" : "text-lime"} />
              <span className="sm:hidden">{explain?.status === "fresh" || explain?.status === "cached" ? "Regenerate" : "AI reasons"}</span>
              <span className="hidden sm:inline">{explain?.status === "fresh" || explain?.status === "cached" ? "Regenerate with Gemini" : "Generate reasons (Gemini)"}</span>
            </button>
            <button
              disabled={!v?.valid || !!busy}
              onClick={save}
              title={!signedIn && !data.bundle.isDemo ? "Sign in to save" : undefined}
              className="focus-ring inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-ink hover:bg-lime-2 disabled:opacity-40 sm:flex-none sm:px-5 sm:py-2.5"
            >
              <Save size={16} /> {busy === "save" ? "Saving…" : "Save XI"}
            </button>
          </div>
        </div>
      </div>

      {editor && (
        <ContestEditor
          data={data}
          signedIn={signedIn}
          onClose={() => setEditor(false)}
          onSaved={async () => {
            setEditor(false);
            await reoptimize();
          }}
        />
      )}
    </div>
  );
}
