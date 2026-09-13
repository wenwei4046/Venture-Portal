/**
 * The browser-safe half of a pull: what a sync counts, and the shape of one
 * planned item. No node imports — ErpLinkPanel (a client component) reads
 * these to show progress, and a `node:crypto` import here would be bundled
 * for the browser and fail the build.
 */

export interface PullItem {
  docNo: string
  /** The list row's hash, to remember once the document is in. */
  hash: string
  /** 'changed' = fetch and ingest; 'verify' = missing from the list, find out why. */
  kind: 'changed' | 'verify'
}

export interface PullStats {
  listed: number
  unchanged: number
  fetched: number
  applied: number
  duplicate: number
  stale: number
  held: number
  skipped: number
  deleted: number
  failed: number
}

export function emptyPullStats(): PullStats {
  return { listed: 0, unchanged: 0, fetched: 0, applied: 0, duplicate: 0, stale: 0, held: 0, skipped: 0, deleted: 0, failed: 0 }
}

export function addPullStats(a: PullStats, b: Partial<PullStats>): PullStats {
  const out = { ...a }
  for (const k of Object.keys(b) as Array<keyof PullStats>) {
    out[k] = a[k] + (b[k] ?? 0)
  }
  return out
}

/** "300 listed · 12 read · 9 applied · 2 held" — the summary a sync ends on. */
export function describePull(s: PullStats): string {
  const parts = [`${s.listed} listed`]
  if (s.unchanged > 0) parts.push(`${s.unchanged} unchanged`)
  parts.push(`${s.fetched} read`)
  if (s.applied > 0) parts.push(`${s.applied} applied`)
  if (s.duplicate > 0) parts.push(`${s.duplicate} duplicate`)
  if (s.stale > 0) parts.push(`${s.stale} stale`)
  if (s.held > 0) parts.push(`${s.held} held`)
  if (s.skipped > 0) parts.push(`${s.skipped} skipped`)
  if (s.deleted > 0) parts.push(`${s.deleted} deleted`)
  if (s.failed > 0) parts.push(`${s.failed} failed`)
  return parts.join(' · ')
}
