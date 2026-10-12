import { describe, expect, it } from 'vitest'
import type { DeptRegistryRow } from './dept-registry'
import { statementDepts, statementPath } from './dept-statements'

// 2026-10-09 — the user: 我要把每个 department 的 cash flow, P&L 放过来 —
// Dept Pool lists Venture, Marketing, Finance, HR, Director Office, IT and
// Revenue Department, and each has its own P&L and Cash Flow.

const row = (name: string, segmentKey: string | null, extra: Partial<DeptRegistryRow> = {}): DeptRegistryRow => ({
  id: name,
  name,
  segmentKey,
  poolGlCode: '1100',
  billingModeKey: segmentKey ? `${segmentKey}_attribution` : null,
  isInternal: false,
  ...extra,
})

// The registry as production holds it (created_at order).
const REGISTRY = [
  row('HR', 'hr'),
  row('Finance', 'finance'),
  row('Marketing', 'marketing'),
  row('Director', 'director'),
  row('Director Office', 'director_office'),
  row('Venture Office', null, { isInternal: true, billingModeKey: null, poolGlCode: null }),
  row('IT', 'it'),
  row('Revenue Department', 'revenue_department'),
]

describe('the departments Dept Pool lists', () => {
  it('is Venture, Marketing, Finance, HR and Director Office, then each department added since', () => {
    expect(statementDepts(REGISTRY).map((d) => d.label)).toEqual([
      'Venture', 'Marketing', 'Finance', 'HR', 'Director Office', 'IT', 'Revenue Department',
    ])
  })

  it('leaves the Director out, as the user listed them', () => {
    expect(statementDepts(REGISTRY).some((d) => d.segment === 'director')).toBe(false)
  })

  it('reads Venture as the corporate segment, the way the reports do', () => {
    expect(statementDepts(REGISTRY)[0]).toMatchObject({ slug: 'venture', segment: 'corporate' })
  })

  it('names an added department’s page after its segment', () => {
    expect(statementDepts(REGISTRY).find((d) => d.label === 'Revenue Department')).toMatchObject({
      slug: 'revenue-department',
      segment: 'revenue_department',
    })
  })

  it('still lists the five before the registry is read', () => {
    expect(statementDepts([]).map((d) => d.slug)).toEqual(['venture', 'marketing', 'finance', 'hr', 'director-office'])
  })

  it('knows the pool page a core department already had', () => {
    const bySlug = Object.fromEntries(statementDepts(REGISTRY).map((d) => [d.slug, d.poolPath ?? null]))
    expect(bySlug).toMatchObject({
      venture: null,
      marketing: '/dept-pool/marketing',
      finance: '/dept-pool/finance',
      hr: '/dept-pool/hr',
      'director-office': '/dept-pool/director-office',
      it: null,
    })
  })
})

// 2026-10-12 (user: department pool 可以 default 开 cash flow 先吗？): the page
// opens on the Cash Flow; the P&L is asked for.
describe('a department’s statements page', () => {
  it('opens on the Cash Flow', () => {
    expect(statementPath('marketing')).toBe('/dept-pool/statements/marketing')
    expect(statementPath('marketing', 'cash-flow')).toBe('/dept-pool/statements/marketing')
  })

  it('opens on the P&L when asked', () => {
    expect(statementPath('marketing', 'pnl')).toBe('/dept-pool/statements/marketing?view=pnl')
  })

  it('keeps the period it was given', () => {
    expect(statementPath('hr', 'pnl', { period: '2026-09', from: '2026-03' })).toBe('/dept-pool/statements/hr?view=pnl&period=2026-09&from=2026-03')
    expect(statementPath('hr', 'cash-flow', { period: '2026-09' })).toBe('/dept-pool/statements/hr?period=2026-09')
  })
})
