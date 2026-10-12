"use client";
import { useEffect, useState } from "react";

/**
 * Chart animation gate: animate once on mount (no scroll/in-view gating), then freeze so re-renders and
 * hovers never redraw. Under prefers-reduced-motion the chart renders in its final state immediately.
 */
export function useAnimateOnce(durationMs = 1100) {
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const id = requestAnimationFrame(() => setAnimate(false));
      return () => cancelAnimationFrame(id);
    }
    const t = setTimeout(() => setAnimate(false), durationMs + 200);
    return () => clearTimeout(t);
  }, [durationMs]);
  return animate;
}
