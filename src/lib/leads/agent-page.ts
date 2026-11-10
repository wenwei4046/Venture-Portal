// Lead View v2 › AI Agent (2026-11-02, the v2 handoff §7.12): the page's pure parts — the left lists' categories, the
// Knowledge tab's History (the portal's own audit of lead_ai_knowledge, plus the picked files that ended), a file's
// warning. The settings, the prompt and what the agent reads are agent.ts's and data-center.ts's.

import type { AuditChange } from '@/lib/audit/changes'

/** Fixed answers' three lists, as drawn: Payment · Delivery · Product, by the question's words. */
export const FAQ_CATS: ReadonlyArray<['pay' | 'del' | 'prod', string, string]> = [['pay', 'Payment', 'credit-card'], ['del', 'Delivery', 'truck'], ['prod', 'Product', 'sofa']]
export function faqCat(q: string): 'pay' | 'del' | 'prod' {
  if (/instal|pay|price|cash|card|bayar|分期|付款/i.test(q)) return 'pay'
  if (/deliver|penang|ship|送/i.test(q)) return 'del'
  return 'prod'
}

/** The playbook's three lists, as drawn: Price · Hesitating · Choosing, by the situation's name. */
export const PLAY_CATS: ReadonlyArray<['price' | 'hes' | 'choose', string, string]> = [['price', 'Price', 'badge-dollar-sign'], ['hes', 'Hesitating', 'hourglass'], ['choose', 'Choosing', 'list-checks']]
export function pbCat(name: string): 'price' | 'hes' | 'choose' {
  if (/expens|price|cheap|mahal|贵|貴/i.test(name)) return 'price'
  if (/which|sure|choose|compare/i.test(name)) return 'choose'
  return 'hes'
}

const MS_DAY = 864e5
const daysTo = (iso: string, today: string) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / MS_DAY)

/** Knowledge › a file's warning: "Ends in 3 days" (7 or fewer), "Ended 2 days ago", or nothing. */
export function endsWarn(validUntil: string | null | undefined, today: string): { text: string; ended: boolean } | null {
  if (!validUntil) return null
  const n = daysTo(validUntil, today)
  if (n < 0) return { text: `Ended ${-n} ${n === -1 ? 'day' : 'days'} ago`, ended: true }
  if (n <= 7) return { text: `Ends in ${n} ${n === 1 ? 'day' : 'days'}`, ended: false }
  return null
}

export type LogAct = 'Added' | 'Removed' | 'Paused' | 'Resumed' | 'Expired'
export interface LogRow { key: string; at: string; act: LogAct; kind: 'folder' | 'file' | 'link'; ref: string; by: string }

/**
 * Knowledge › History, newest first: this brand's picks added, removed, paused and resumed (audit_changes of
 * lead_ai_knowledge — who and when), and each picked file whose end date passed ("Expired", by Auto, on that day).
 */
export function knowledgeLog(changes: AuditChange[], brandId: string, expired: Array<{ id: string; validUntil: string }>): LogRow[] {
  const rows: LogRow[] = []
  for (const c of changes) {
    if (c.table_name !== 'lead_ai_knowledge') continue
    const row = (c.new_row ?? c.old_row) as Record<string, unknown> | null
    if (!row || row.brand_id !== brandId) continue
    const kind = row.kind as LogRow['kind'], ref = String(row.ref ?? '')
    const by = c.actor_name || (c.actor_source === 'database' ? 'Auto' : '—')
    let act: LogAct | null = null
    if (c.op === 'INSERT') act = 'Added'
    else if (c.op === 'DELETE') act = 'Removed'
    else if (c.old_row?.paused !== c.new_row?.paused) act = c.new_row?.paused ? 'Paused' : 'Resumed'
    if (act) rows.push({ key: `a${c.id}`, at: c.occurred_at, act, kind, ref, by })
  }
  for (const f of expired) rows.push({ key: `x${f.id}`, at: `${f.validUntil}T16:00:00Z`, act: 'Expired', kind: 'file', ref: f.id, by: 'Auto' })
  return rows.sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * Knowledge › Add files: a brand's own folder (or Shared) is picked through what sits right in it — added once each of
 * those is, and then locked, so its box never looks clickable when a click would add nothing (the user, 2026-11-10:
 * "为什么不能勾"). Empty, it is locked too. `on` = everything in it is added or picked now, some of it picked now.
 */
export function brandRowState(inner: string[], have: ReadonlySet<string>, pick: readonly string[]): { added: boolean; lock: boolean; on: boolean } {
  const added = inner.length > 0 && inner.every(k => have.has(k))
  return { added, lock: added || !inner.length, on: !added && inner.length > 0 && inner.every(k => have.has(k) || pick.includes(k)) }
}
