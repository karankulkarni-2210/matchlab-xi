// Small decorative cricket icons (aria-hidden; pair them with visible text).
type P = { size?: number; className?: string };

export function BallIcon({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="10" fill="var(--ball)" />
      <path d="M7 4.2c2.4 2.6 2.4 13 0 15.6M17 4.2c-2.4 2.6-2.4 13 0 15.6" fill="none" stroke="var(--ball-seam)" strokeWidth="1.2" strokeDasharray="1.6 1.4" />
    </svg>
  );
}

export function BatIcon({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 3.5l6 6-9.5 9.5a2.1 2.1 0 0 1-3 0l-3-3a2.1 2.1 0 0 1 0-3z" />
      <path d="M5 19l-2 2" />
    </svg>
  );
}

export function StumpsIcon({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M7 7v14M12 7v14M17 7v14" />
      <path d="M6 5h5M13 5h5" />
    </svg>
  );
}

export function FieldIcon({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <ellipse cx="12" cy="12" rx="10" ry="8" />
      <rect x="10.5" y="8" width="3" height="8" rx="0.5" />
    </svg>
  );
}
