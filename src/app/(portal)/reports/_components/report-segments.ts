// Segment options for the GL-driven statements, rendered as the left-rail
// radio list. Mirrors the dept labels used across /dept-pool.
// NOTE: 'treasury' is NOT listed separately — it's the auto-derived segment for
// fund_in / fund_out / loan repayment JEs (mig 217), and the portal-wide
// convention (Venture Pool, Dept Pool) folds it into Venture. Selecting
// Venture filters segment IN ('corporate','treasury').
export interface ReportSegmentOption {
  value: string
  label: string
  /** Tailwind bg token for the colour dot (CSS-var backed). */
  dot: string
}

export const REPORT_SEGMENTS: ReportSegmentOption[] = [
  { value: '', label: 'All segments (consolidated)', dot: 'bg-ink' },
  { value: 'corporate', label: 'Venture (Office)', dot: 'bg-accent' },
  { value: 'marketing', label: 'Marketing', dot: 'bg-info' },
  { value: 'hr', label: 'HR', dot: 'bg-ledger' },
  { value: 'finance', label: 'Finance', dot: 'bg-alert' },
  { value: 'director_office', label: 'Director Office', dot: 'bg-danger' },
  { value: 'director', label: 'Director', dot: 'bg-graphite' },
  { value: 'unallocated', label: 'Unallocated', dot: 'bg-muted' },
]

/** URL segment param → journal_entries.segment filter values.
 *  Venture (corporate) folds in treasury per the portal-wide convention. */
export function segmentFilterFor(value: string): string[] | undefined {
  if (!value) return undefined
  if (value === 'corporate') return ['corporate', 'treasury']
  return [value]
}
