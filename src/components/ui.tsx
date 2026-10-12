import type { ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Tone = "lime" | "ok" | "warn" | "bad" | "muted" | "over" | "under" | "info";
const toneCls: Record<Tone, string> = {
  lime: "bg-lime/15 text-lime border-lime/30",
  ok: "bg-ok/12 text-ok border-ok/30",
  warn: "bg-warn/12 text-warn border-warn/30",
  bad: "bg-bad/12 text-bad border-bad/35",
  muted: "bg-white/5 text-muted border-line-2",
  over: "bg-over/12 text-over border-over/30",
  under: "bg-under/12 text-under border-under/30",
  info: "bg-wk/10 text-wk border-wk/30",
};

export function Pill({ tone = "muted", children, title, className }: { tone?: Tone; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap", toneCls[tone], className)}>
      {children}
    </span>
  );
}

export const ROLE_TONE: Record<string, string> = {
  WK: "text-wk border-wk/40 bg-wk/10",
  BAT: "text-bat border-bat/40 bg-bat/10",
  AR: "text-ar border-ar/40 bg-ar/10",
  BOWL: "text-bowl border-bowl/40 bg-bowl/10",
};

export function RoleChip({ role }: { role: string | null }) {
  return (
    <span className={cx("inline-flex min-w-[40px] justify-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold", role ? ROLE_TONE[role] : "text-faint border-line-2")}>
      {role ?? "?"}
    </span>
  );
}

export function Card({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("panel p-4", className)}>
      {(title || right) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "lime" | "over" | "under" | "bad" }) {
  const c = tone === "lime" ? "text-lime" : tone === "over" ? "text-over" : tone === "under" ? "text-under" : tone === "bad" ? "text-bad" : "text-warm";
  return (
    <div className="panel p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx("num mt-1 text-2xl font-semibold tracking-tight", c)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-faint">{sub}</div>}
    </div>
  );
}

export function Initials({ name, tone = "lime", size = 40 }: { name: string; tone?: "lime" | "wk" | "warn"; size?: number }) {
  const ini = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
  const bg = tone === "lime" ? "bg-lime text-ink" : tone === "wk" ? "bg-wk text-ink" : "bg-warn text-ink";
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-2 ring-ink/60", bg)} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {ini}
    </span>
  );
}

export function fmtTime(iso: string | null | undefined, withDate = true) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    ...(withDate ? { day: "numeric", month: "short" } : {}),
    hour: iso.length === 10 ? undefined : "2-digit",
    minute: iso.length === 10 ? undefined : "2-digit",
  });
}

export function ago(iso: string | null | undefined) {
  if (!iso) return "unknown time";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 0) return `in ${fmtDur(-s)}`;
  return `${fmtDur(s)} ago`;
}
function fmtDur(s: number) {
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}

export function FreshnessPill({ status, asOf }: { status: string; asOf: string | null }) {
  const map: Record<string, [Tone, string]> = {
    fresh: ["ok", "Live"],
    cached: ["lime", "Cached"],
    stale: ["warn", "Stale"],
    missing: ["bad", "Unavailable"],
    synthetic: ["info", "Synthetic"],
    static: ["muted", "Dataset"],
  };
  const [tone, label] = map[status] ?? ["muted", status];
  return (
    <Pill tone={tone} title={asOf ? `As of ${asOf}` : undefined}>
      {label}
      {asOf && status !== "synthetic" ? <span className="opacity-75">· {status === "static" ? asOf.slice(0, 10) : ago(asOf)}</span> : null}
    </Pill>
  );
}
