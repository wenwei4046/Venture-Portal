// Lead View (2026-10-16): the month Leads and Insight read, as `?m=YYYY-MM` (the office's month when absent).

import { officeMonth } from '@/lib/office-time'

export interface LeadPeriod {
  /** YYYY-MM */
  month: string
  /** [from, to) as YYYY-MM-DD — what lead_list takes. */
  from: string
  to: string
  label: string
}

const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function leadPeriod(raw: string | undefined, now: string = officeMonth()): LeadPeriod {
  const month = raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : now.slice(0, 7)
  const [y, m] = month.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return { month, from: `${month}-01`, to: `${next}-01`, label: `${NAMES[m - 1]} ${y}` }
}

/** The twelve months up to `now`, newest first — the period picker. */
export function recentMonths(now: string = officeMonth()): LeadPeriod[] {
  const out: LeadPeriod[] = []
  let [y, m] = now.slice(0, 7).split('-').map(Number)
  for (let i = 0; i < 12; i++) {
    out.push(leadPeriod(`${y}-${String(m).padStart(2, '0')}`, now))
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
  }
  return out
}
