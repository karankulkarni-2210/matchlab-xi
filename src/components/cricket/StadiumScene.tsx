// Original SVG cricket scene for the Match Desk hero: oval boundary, centre pitch, stumps, red ball, floodlights.
export function StadiumScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 260" className={className} aria-hidden="true">
      <polygon points="40,0 70,0 190,260 110,260" fill="var(--cream)" opacity="0.05" />
      <polygon points="350,0 380,0 310,260 230,260" fill="var(--cream)" opacity="0.05" />
      <circle cx="55" cy="10" r="6" fill="var(--gold)" opacity="0.9" />
      <circle cx="365" cy="10" r="6" fill="var(--gold)" opacity="0.9" />
      <ellipse cx="210" cy="150" rx="190" ry="100" fill="var(--field)" />
      <ellipse cx="210" cy="150" rx="190" ry="100" fill="none" stroke="var(--cream)" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="2 5" />
      <ellipse cx="210" cy="150" rx="110" ry="58" fill="none" stroke="var(--cream)" strokeOpacity="0.18" strokeWidth="1.5" strokeDasharray="6 6" />
      <rect x="196" y="104" width="28" height="92" rx="3" fill="var(--strip)" opacity="0.7" />
      <line x1="188" y1="116" x2="232" y2="116" stroke="var(--ivory)" strokeOpacity="0.8" strokeWidth="1.5" />
      <line x1="188" y1="184" x2="232" y2="184" stroke="var(--ivory)" strokeOpacity="0.8" strokeWidth="1.5" />
      <g fill="var(--ivory)">
        <rect x="203" y="96" width="3" height="20" rx="1.5" />
        <rect x="208.5" y="96" width="3" height="20" rx="1.5" />
        <rect x="214" y="96" width="3" height="20" rx="1.5" />
        <rect x="202.5" y="93.5" width="7" height="2" rx="1" />
        <rect x="210" y="93.5" width="7" height="2" rx="1" />
      </g>
      <g transform="translate(286 128)">
        <circle r="11" fill="var(--ball)" />
        <path d="M-5.5 -9c3 3 3 15 0 18M5.5 -9c-3 3-3 15 0 18" fill="none" stroke="var(--ball-seam)" strokeWidth="1.2" strokeDasharray="1.8 1.5" />
      </g>
    </svg>
  );
}
