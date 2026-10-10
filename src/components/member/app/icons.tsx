import type { CSSProperties } from "react";

/**
 * The prototype's stroke icons, path for path (`ICON` in RevenueApp.dc.html
 * plus the paths written inline in its template). 24×24, round caps.
 */
export const ICON = {
  home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
  chart: "M4 20V10m5 10V4m5 16v-7m5 7V8M3 20h18",
  trophy: "M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 13v5m-5 3h10M9 18h6v3",
  user: "M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  wallet: "M3 6h17v15H3V6Zm0 0V3h14v3m-3 6h7v5h-7v-5Z",
  team: "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8m6 9v-2a4 4 0 0 0-3-3.87M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  receipt: "M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm3 5h8M8 12h8M8 16h4",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  calendar: "M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14",
  /* Waiting list & replacements (the HR revamp's handoff, 2026-10-10) */
  queue: "M4 6h16M4 12h16M4 18h10M21 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  install: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm4 5v7m-3-3 3 3 3-3m-4 7h2",
  percent: "M19 5 5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  eye: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  eyeOff: "m3 3 18 18M10 5c7-1 12 7 12 7s-2 4-5 5M6 6c-3 2-4 6-4 6s3 7 10 7c2 0 3-.3 4-1",
  /* written inline in the template */
  chevronDown: "m6 9 6 6 6-6",
  chevronRight: "m9 5 7 7-7 7",
  chevronRightWide: "m9 6 6 6-6 6",
  chevronLeft: "m15 18-6-6 6-6",
  back: "m15 5-7 7 7 7",
  arrowUp: "M12 19V5m-6 6 6-6 6 6",
  arrowLeft: "M19 12H5m6-6-6 6 6 6",
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  tick: "m5 12 5 5 9-10",
  quote: "M5 3h14v18H5V3Zm3 4h8M8 11h1m3 0h1m3 0h.1M8 15h1m3 0h1m3 0h.1M8 18h1m3 0h1m3 0h.1",
  quoteDesk: "M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 7h6M9 11h1M12 11h1M15 11h0M9 15h1M12 15h1M9 18h1M12 18h1M15 15v3",
  viewing: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  /* the desktop sidebar's Product List row and Module switcher (2026-10-08) */
  cube: "M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8",
  modules: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  chevronUp: "m6 15 6-6 6 6",
  check: "m5 12 5 5L20 7",
  /* pull to refresh — not in the prototype */
  refresh: "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5",
  /* the page that could not load (`AppError`) — not in the prototype */
  alert: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v5M12 16h.01",
  /* the notification icons (`IC`) */
  nOk: "M9 12l2 2 4-4M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  nMemo: "M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h4",
  nCup: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4",
  nCash: "M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  nBack: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
} as const;

export interface SvgProps {
  d: string;
  size: number;
  /** strokeWidth — the prototype writes it on every icon. */
  sw: number;
  /** A palette colour (`var(--rv-…)`); currentColor when absent. Set as a style
   *  because an SVG attribute cannot read a custom property. */
  stroke?: string;
  className?: string;
  style?: CSSProperties;
}

/** One stroke icon, drawn the way the prototype draws all of them. */
export function Svg({ d, size, sw, stroke, className, style }: SvgProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" className={className}
      style={stroke ? { ...style, stroke } : style} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
