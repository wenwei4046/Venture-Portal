import { LUCIDE, type LucideName } from './lead-lucide'

/**
 * Lead View's glyphs: Lucide 0.460 at stroke 2, the version the v2 handoff draws (`docs/design_handoff_lead_view_v2`,
 * README §4.4). `lucide-react` is not installed, so the glyphs Lead View uses are generated into `lead-lucide.ts` from
 * `lucide-static@0.460.0`: add the name to `tools/lead-lucide-names.txt`, `npm pack lucide-static@0.460.0` somewhere outside
 * the repo, unpack it, then `node tools/gen-lead-lucide.mjs <package/icons> tools/lead-lucide-names.txt src/components/layout/lead-lucide.ts`.
 * A name is Lucide's own (`book-open`); the camelCase names screens used before v2 stay as aliases.
 */
const ALIASES = {
  chart: 'chart-column',
  bookOpen: 'book-open',
  scroll: 'scroll-text',
  panelClose: 'panel-left-close',
  panelOpen: 'panel-left-open',
  chevronDown: 'chevron-down',
  grip: 'grip-vertical',
  rotate: 'rotate-cw',
  pen: 'pen-line',
  creditCard: 'credit-card',
  shieldCheck: 'shield-check',
  fileText: 'file-text',
  filePen: 'file-pen',
  calendarClock: 'calendar-clock',
  grid: 'layout-grid',
  mapPin: 'map-pin',
  trash: 'trash-2',
  imagePlus: 'image-plus',
  alert: 'triangle-alert',
} as const satisfies Record<string, LucideName>

export type LeadIconName = LucideName | keyof typeof ALIASES

export function LeadIcon({ name, size = 16, className }: { name: LeadIconName; size?: number; className?: string }) {
  const key: LucideName = name in ALIASES ? ALIASES[name as keyof typeof ALIASES] : (name as LucideName)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={{ flex: 'none' }}
      dangerouslySetInnerHTML={{ __html: LUCIDE[key] }} />
  )
}
