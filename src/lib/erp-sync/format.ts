import { formatDate } from '@/lib/utils'

/**
 * "12 s ago" for the sync panel. Seconds matter here — the whole point of the
 * live feed is that the page can say how live it is — so the scale starts
 * below a minute and stops pretending past a week.
 */
export function formatAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'never'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'never'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} d ago`
  return formatDate(iso)
}

/**
 * What a Match did, in a sentence.
 *
 * The row it was pressed on disappears — the name is placed, so the panel
 * stops listing it — and until 2026-09-16 that was the whole report. It is not
 * enough: a back-filled name can carry three years of orders, and the ones in a
 * month whose commission run is already applied are deliberately left where
 * they are. Those keep the name ON the list, which reads exactly like a match
 * that failed. So both numbers are said out loud.
 */
export function matchOutcomeNote(
  agentName: string,
  outcome: { matched: number; locked: number },
): string {
  const orders = (n: number) => `${n} ${n === 1 ? 'order' : 'orders'}`
  const head =
    outcome.matched > 0
      ? `${agentName}: ${orders(outcome.matched)} ${outcome.matched === 1 ? 'now pays' : 'now pay'} this salesperson.`
      : `${agentName} is remembered — no order was waiting on the answer.`
  if (outcome.locked === 0) return head
  return (
    `${head} ${orders(outcome.locked)} stayed put: their month's commission run ` +
    `is applied. Reopen that run and press Match again.`
  )
}

/**
 * Enough of a key to tell which one is in, never enough to use: the last four
 * characters. A key too short to show four of stays fully hidden.
 */
export function keyHint(key: string): string {
  const k = (key ?? '').trim()
  if (k.length < 12) return '····'
  return `····${k.slice(-4)}`
}
