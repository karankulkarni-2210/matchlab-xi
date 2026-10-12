import Link from "next/link";
import { Learning } from "@/components/learning/Learning";
import { cx, Pill } from "@/components/ui";
import { envStatus } from "@/lib/env";
import { learningOverview } from "@/lib/server/learning";

export const dynamic = "force-dynamic";
export const metadata = { title: "Learning Lab · MatchLab XI" };

export default async function LearningPage({ searchParams }: { searchParams: Promise<{ ds?: string }> }) {
  const sp = await searchParams;
  const dataset = sp.ds === "real" ? "real" : "demo";
  const data = await learningOverview(dataset);
  const env = envStatus();
  const canAct = dataset === "demo" ? env.supabaseSecret : data.scope === "owner";
  const actHint =
    dataset === "real" && data.scope !== "owner"
      ? "Sign in to analyse your own history and approve weight changes."
      : dataset === "demo" && !env.supabaseSecret
        ? "Demo sandbox writes are disabled on this server (no service key)."
        : null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime">Learning Lab</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">A better process, every match.</h1>
          <p className="mt-1 text-muted">Find repeated errors in stored predictions vs actual points, then approve or reject bounded weight changes.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div role="tablist" aria-label="Dataset" className="inline-flex rounded-xl border border-line-2 p-1 text-sm">
            <Link role="tab" aria-selected={dataset === "demo"} href="/learning?ds=demo" className={cx("focus-ring rounded-lg px-3 py-1.5", dataset === "demo" ? "bg-lime font-semibold text-ink" : "text-muted")}>
              Demo (synthetic)
            </Link>
            <Link role="tab" aria-selected={dataset === "real"} href="/learning?ds=real" className={cx("focus-ring rounded-lg px-3 py-1.5", dataset === "real" ? "bg-lime font-semibold text-ink" : "text-muted")}>
              My real matches
            </Link>
          </div>
          {dataset === "demo" ? <Pill tone="info">Illustrative synthetic history · not measured performance</Pill> : <Pill tone="muted">Real efficacy metrics · synthetic data excluded</Pill>}
        </div>
      </header>
      {dataset === "real" && data.scope !== "owner" ? (
        <div className="panel p-6 text-sm text-muted">
          <Link href="/login" className="text-lime underline">
            Sign in
          </Link>{" "}
          to see learning metrics for your own saved teams. Your records are private (row-level security).
        </div>
      ) : (
        <Learning data={data} canAct={canAct} actHint={actHint} />
      )}
    </div>
  );
}
