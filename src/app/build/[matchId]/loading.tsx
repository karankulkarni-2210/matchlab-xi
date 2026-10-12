import { CricketLoader } from "@/components/cricket/CricketLoader";

// Real server work happens here (match, squad, history, weather, forecasts, optimizer) — no fake progress.
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1560px] space-y-4" aria-busy="true">
      <div className="skeleton h-20 w-full max-w-xl" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] min-[1400px]:grid-cols-[minmax(0,22fr)_minmax(0,46fr)_minmax(0,32fr)]">
        <div className="hidden space-y-4 min-[1400px]:block">
          <div className="skeleton h-56 rounded-[20px]" />
          <div className="skeleton h-48 rounded-[20px]" />
        </div>
        <div className="relative flex min-h-[600px] items-center justify-center rounded-[28px] bg-clover-2">
          <CricketLoader message="Reading the pitch… loading match, squads, history and weather" />
        </div>
        <div className="skeleton hidden h-[600px] rounded-[20px] lg:block" />
      </div>
    </div>
  );
}
