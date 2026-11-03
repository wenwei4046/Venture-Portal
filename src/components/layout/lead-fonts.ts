import { Figtree } from 'next/font/google'

/**
 * Lead View's face (2026-11-02, the v2 handoff `docs/design_handoff_lead_view_v2` — the user: "字体，颜色，设计，排版，名称
 * （完全跟claude design 画的）"): Figtree 400 / 500 / 600 for every word; titles are Georgia (a system face, nothing to load).
 * Like the Revenue app's Inter Tight, only Lead View's shell loads it: LeadShell hangs the variable on its root
 * (`[data-lead-view]`, whose `--lv-font` reads `--font-figtree`), so the portal never downloads it.
 */
export const figtree = Figtree({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-figtree',
  display: 'swap',
})
