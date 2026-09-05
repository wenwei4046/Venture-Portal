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
