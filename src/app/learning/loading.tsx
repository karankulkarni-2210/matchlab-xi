import { CricketLoader } from "@/components/cricket/CricketLoader";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-5" aria-busy="true">
      <div className="skeleton h-24 w-full max-w-2xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="skeleton h-28 rounded-[20px]" />
        <div className="skeleton h-28 rounded-[20px]" />
        <div className="skeleton h-28 rounded-[20px]" />
        <div className="skeleton h-28 rounded-[20px]" />
      </div>
      <div className="flex h-[300px] items-center justify-center rounded-[20px] bg-clover-2">
        <CricketLoader message="Checking stored predictions and actual points…" size="sm" />
      </div>
    </div>
  );
}
