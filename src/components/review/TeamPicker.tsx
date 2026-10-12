"use client";
import { useRouter } from "next/navigation";

interface Item {
  id: string;
  label: string;
  entered: number;
  start: string | null;
}

export function TeamPicker({ current, mine, demo, signedIn }: { current: string | null; mine: Item[]; demo: Item[]; signedIn: boolean }) {
  const router = useRouter();
  const opt = (t: Item) => (
    <option key={t.id} value={t.id}>
      {t.label} · {t.entered}/11 entered
    </option>
  );
  return (
    <label className="w-full text-sm sm:w-auto">
      <span className="mb-1 block text-xs text-muted">Saved team</span>
      <select
        value={current ?? ""}
        onChange={(e) => router.push(`/review?team=${e.target.value}`)}
        className="focus-ring w-full rounded-xl border border-line-2 bg-panel px-3 py-2.5 sm:min-w-[340px]"
      >
        {!current && <option value="">Select a team</option>}
        {mine.length > 0 && <optgroup label="My teams">{mine.map(opt)}</optgroup>}
        {!signedIn && <option disabled>Sign in to see your own teams</option>}
        {demo.length > 0 && <optgroup label="Demo (synthetic)">{demo.map(opt)}</optgroup>}
      </select>
    </label>
  );
}
