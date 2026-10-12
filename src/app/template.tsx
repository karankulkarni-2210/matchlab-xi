// Re-mounts on navigation: gentle page-entry fade (disabled under prefers-reduced-motion via CSS).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
