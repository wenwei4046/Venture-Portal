// My Space's My turn / Waiting cards in the Workflow Builder 2a handoff's words (`Marketing Prototype.dc.html`, step 3 —
// 2026-11-13): "Your turn"; "Needs your approval" with an orange Review; "{n}d overdue"; the grey line "{project} ·
// Stage n/N {stage} · due {date}"; and no Accept anywhere — a stage is its doer's to work as soon as it opens (the user's
// decision 5). The cards themselves are my-space.ts's (plateColumns); this only says them. Pure.

import { shortDay } from './board'
import type { ColumnKey, PlateCard } from './my-space'

export interface TileCardView {
  label: string
  meta: string
  /** The card's button: Review (orange) for an approval, Open otherwise; none for a delegated piece not ready. */
  act: 'review' | 'open' | null
}

const isApproval = (c: PlateCard) => c.kind === 'approve' || c.action === 'review' || c.key.endsWith(':approve') || /your approval/i.test(c.label)

export function tileCard(c: PlateCard, column: ColumnKey): TileCardView {
  const stage = c.stage ? c.stage.replace(/^(Stage \d+\/\d+) · /, '$1 ') : null
  const meta = [c.sub?.name ?? c.parent, c.parent && c.sub ? c.parent : null, stage, c.due ? `due ${shortDay(c.due)}` : null,
    c.assignee ? `with ${c.assignee}` : null].filter(Boolean).join(' · ')
  if (column !== 'turn') return { label: c.label, meta, act: c.action === 'none' ? null : c.action === 'review' ? 'review' : 'open' }
  if (isApproval(c) && !c.parent) return { label: 'Needs your approval', meta, act: 'review' }
  const late = c.late ? String(c.late) : /Overdue (\d+) day/.exec(c.label)?.[1]
  if (late && !c.parent && c.kind !== 'subtask') return { label: `${late}d overdue`, meta, act: 'open' }
  if (!c.parent && (c.kind === 'doer' || /:(todo|accepted|doer)$/.test(c.key)) && !/^Changes/.test(c.label)) return { label: 'Your turn', meta, act: 'open' }
  return { label: c.label, meta, act: 'open' }
}
