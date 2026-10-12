import { extraFullDepts, type DeptRegistryRow } from './dept-registry'

// Each department's own P&L and Cash Flow, under Dept Pool (2026-10-09, the
// user: 我要把每个 department 的 cash flow, P&L 放过来 — Venture, Marketing,
// Finance, HR, Director Office, IT, Revenue Department). The figures are the
// reports' own, read for one segment — the same as picking it in Reports.
// The Director is not listed (the user's list leaves it out).

export interface StatementDept {
  /** The page's address: /dept-pool/statements/<slug>. */
  slug: string
  label: string
  /** The report segment (Venture = corporate, treasury folded in by the reports). */
  segment: string
  /** The pool page the department already had, if any (its balance and history). */
  poolPath?: string
}

const CORE: readonly StatementDept[] = [
  { slug: 'venture', label: 'Venture', segment: 'corporate' },
  { slug: 'marketing', label: 'Marketing', segment: 'marketing', poolPath: '/dept-pool/marketing' },
  { slug: 'finance', label: 'Finance', segment: 'finance', poolPath: '/dept-pool/finance' },
  { slug: 'hr', label: 'HR', segment: 'hr', poolPath: '/dept-pool/hr' },
  { slug: 'director-office', label: 'Director Office', segment: 'director_office', poolPath: '/dept-pool/director-office' },
]

/** The five, then every department added since (IT, Revenue Department …) in the registry's order. */
export function statementDepts(registry: readonly DeptRegistryRow[]): StatementDept[] {
  const extras = extraFullDepts([...registry]).map((d) => ({
    slug: (d.segmentKey as string).replace(/_/g, '-'),
    label: d.name,
    segment: d.segmentKey as string,
  }))
  return [...CORE, ...extras]
}

export type StatementView = 'pnl' | 'cash-flow'

/** A department's page: the Cash Flow unless the P&L is asked for (2026-10-12,
 *  user: default 开 cash flow 先), with the period kept. */
export function statementPath(slug: string, view: StatementView = 'cash-flow', period: { period?: string; from?: string } = {}): string {
  const qs = new URLSearchParams()
  if (view === 'pnl') qs.set('view', 'pnl')
  if (period.period) qs.set('period', period.period)
  if (period.from) qs.set('from', period.from)
  const q = qs.toString()
  return `/dept-pool/statements/${slug}${q ? `?${q}` : ''}`
}
