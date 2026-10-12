// Match Desk skeleton: same blocks and sizes as the loaded page, so nothing shifts.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8" aria-busy="true">
      <p role="status" className="sr-only">
        Loading fixtures…
      </p>
      <div className="skeleton h-[272px] rounded-3xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="skeleton h-[360px] rounded-[20px]" />
        <div className="skeleton h-[360px] rounded-[20px]" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="skeleton h-[380px] rounded-[20px]" />
        <div className="skeleton h-[380px] rounded-[20px]" />
      </div>
    </div>
  );
}
