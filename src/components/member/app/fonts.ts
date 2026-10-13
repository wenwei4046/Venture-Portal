import { Inter_Tight } from "next/font/google";

/**
 * Inter Tight (2026-10-14, the HOUZS Venture Design System) — the Revenue app's
 * display face: its titles, greetings and amounts (every rule at 18px or more
 * and weight 650 or more). Body text stays Inter. Variable on weight, so the
 * prototype's 650 and 750 are real cuts.
 *
 * Only the app's layout loads it, so the portal never downloads it. The layout
 * hangs `--font-inter-tight` on a `display: contents` wrapper; the app root
 * (`[data-revenue-app]`) turns it into `--font-display-rv` (globals.css), which
 * falls back to Inter anywhere the wrapper is not.
 */
export const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});
