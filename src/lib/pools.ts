// src/lib/pools.ts
// Pool taxonomy used by the financial reports. Each money movement
// (payment_voucher_sources.pool) belongs to exactly one pool. Replaces the
// old GlSegment/SEGMENT_LABEL bucketing in the report layer.

export const POOL_LABEL: Record<string, string> = {
  venture_pool: 'Venture Pool',
  invoice_payout_pool: 'Invoice Payout Pool',
  dept_pool_marketing: 'Marketing',
  dept_pool_hr: 'HR',
  dept_pool_finance: 'Finance',
  dept_pool_director_office: 'Director Office',
  dept_pool_director: 'Director Pool',
  dept_pool_venture_office: 'Venture (Office)',
  operating_fund: 'Operating Fund',
}

// Display order for report sections.
export const KNOWN_POOLS: string[] = [
  'venture_pool',
  'dept_pool_marketing',
  'dept_pool_hr',
  'dept_pool_finance',
  'dept_pool_director_office',
  'dept_pool_director',
  'dept_pool_venture_office',
  'invoice_payout_pool',
  'operating_fund',
]

export function poolLabel(key: string): string {
  if (key in POOL_LABEL) return POOL_LABEL[key]
  return key
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Sort comparator: known pools first in KNOWN_POOLS order, then unknown
// pools alphabetically by label.
export function comparePools(a: string, b: string): number {
  const ia = KNOWN_POOLS.indexOf(a)
  const ib = KNOWN_POOLS.indexOf(b)
  if (ia !== -1 && ib !== -1) return ia - ib
  if (ia !== -1) return -1
  if (ib !== -1) return 1
  return poolLabel(a).localeCompare(poolLabel(b))
}
