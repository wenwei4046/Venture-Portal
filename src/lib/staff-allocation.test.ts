import { describe, it, expect } from 'vitest'
import {
  validateAllocationRows,
  hvRemainderPct,
  allocationPreview,
  periodShortLabel,
  buildAllocationInvoiceLines,
  buildConsolidatedInvoiceLines,
  PAYROLL_SEGMENT_LABEL,
  allocationRoster,
  planSplitCopy,
  splitCopyNote,
  splitLock,
  splitLockMessage,
  type AllocationRow,
  type DeptComponentGroup,
  type SplitLockInput,
  type SplitStanding,
} from './staff-allocation'

describe('validateAllocationRows', () => {
  it('accepts an empty list (fully HV-absorbed)', () => {
    expect(validateAllocationRows([])).toEqual({ ok: true })
  })

  it('accepts a split summing to exactly 100', () => {
    const rows: AllocationRow[] = [
      { companyId: 'a', pct: 21.83 },
      { companyId: 'b', pct: 32.73 },
      { companyId: 'c', pct: 45.44 },
    ]
    expect(validateAllocationRows(rows)).toEqual({ ok: true })
  })

  it('accepts a partial split (remainder = HV share)', () => {
    expect(
      validateAllocationRows([
        { companyId: 'a', pct: 21.83 },
        { companyId: 'b', pct: 32.73 },
        { companyId: 'c', pct: 32.73 },
      ]),
    ).toEqual({ ok: true })
  })

  it('rejects a missing company', () => {
    const r = validateAllocationRows([{ companyId: '', pct: 50 }])
    expect(r.ok).toBe(false)
  })

  it('rejects duplicate companies', () => {
    const r = validateAllocationRows([
      { companyId: 'a', pct: 30 },
      { companyId: 'a', pct: 20 },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Duplicate')
  })

  it('rejects zero / negative / non-finite pct', () => {
    expect(validateAllocationRows([{ companyId: 'a', pct: 0 }]).ok).toBe(false)
    expect(validateAllocationRows([{ companyId: 'a', pct: -5 }]).ok).toBe(false)
    expect(validateAllocationRows([{ companyId: 'a', pct: NaN }]).ok).toBe(false)
  })

  it('rejects a sum above 100', () => {
    const r = validateAllocationRows([
      { companyId: 'a', pct: 60 },
      { companyId: 'b', pct: 40.01 },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('100')
  })

  it('tolerates float noise at exactly 100', () => {
    // 3 × 33.33 + 0.01 = 100.00 with float representation noise
    const r = validateAllocationRows([
      { companyId: 'a', pct: 33.33 },
      { companyId: 'b', pct: 33.33 },
      { companyId: 'c', pct: 33.33 },
      { companyId: 'd', pct: 0.01 },
    ])
    expect(r).toEqual({ ok: true })
  })
})

describe('hvRemainderPct', () => {
  it('is 100 with no rows', () => {
    expect(hvRemainderPct([])).toBe(100)
  })

  it('computes the CHOW WAI MAN remainder (12.71%)', () => {
    expect(
      hvRemainderPct([
        { companyId: 'hc', pct: 21.83 },
        { companyId: 'carres', pct: 32.73 },
        { companyId: '2990', pct: 32.73 },
      ]),
    ).toBe(12.71)
  })

  it('clamps at 0 for a full split', () => {
    expect(hvRemainderPct([{ companyId: 'a', pct: 100 }])).toBe(0)
  })
})

describe('allocationPreview', () => {
  it('reproduces the CHOW WAI MAN example (gross 5700)', () => {
    const p = allocationPreview(5700, [
      { companyId: 'hc', pct: 21.83 },
      { companyId: 'carres', pct: 32.73 },
      { companyId: '2990', pct: 32.73 },
    ])
    expect(p.lines.map((l) => l.amount)).toEqual([1244.31, 1865.61, 1865.61])
    expect(p.billedTotal).toBe(4975.53)
    expect(p.hvAmount).toBe(724.47) // 12.71% Venture share
    expect(p.billedTotal + p.hvAmount).toBe(5700)
  })

  it('HV share absorbs rounding drift so totals always reconcile', () => {
    // 3 × 1/3 of RM100.01 → each line rounds to 33.34, billed 100.02 > cost
    // with a naive split; with a 99.99% split the remainder keeps books equal.
    const p = allocationPreview(100.01, [
      { companyId: 'a', pct: 33.33 },
      { companyId: 'b', pct: 33.33 },
      { companyId: 'c', pct: 33.33 },
    ])
    const sum = Math.round((p.billedTotal + p.hvAmount) * 100) / 100
    expect(sum).toBe(100.01)
  })

  it('zero rows → everything is HV share', () => {
    const p = allocationPreview(6265.25, [])
    expect(p.billedTotal).toBe(0)
    expect(p.hvAmount).toBe(6265.25)
  })

  it("periodShortLabel renders May'26 style for both YYYY-MM and full dates", () => {
    expect(periodShortLabel('2026-05-01')).toBe("May'26")
    expect(periodShortLabel('2026-06')).toBe("Jun'26")
  })

  it('buildAllocationInvoiceLines reproduces the sample invoice (HR × Carres May)', () => {
    const lines = buildAllocationInvoiceLines(
      { salary: 2580.0, allowance: 295.5, epf: 309.6, socso: 31.25, eis: 3.57 },
      "May'26",
      'HR',
    )
    expect(lines).toEqual([
      { kind: 'Salary', description: "Salary - May'26 (HR)", amount: 2580.0 },
      { kind: 'Allowance', description: "Allowance - May'26 (HR)", amount: 295.5 },
      { kind: 'EPF', description: "EPF - May'26 (HR)", amount: 309.6 },
      { kind: 'SOCSO', description: "SOCSO - May'26 (HR)", amount: 31.25 },
      { kind: 'EIS', description: "EIS - May'26 (HR)", amount: 3.57 },
    ])
    const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100
    expect(total).toBe(3219.92)
  })

  it('buildAllocationInvoiceLines skips zero components', () => {
    const lines = buildAllocationInvoiceLines(
      { salary: 2523.02, allowance: 0, epf: 100.55, socso: 12.65, eis: 0 },
      "Jun'26",
      'Finance',
    )
    expect(lines.map((l) => l.description)).toEqual([
      "Salary - Jun'26 (Finance)",
      "EPF - Jun'26 (Finance)",
      "SOCSO - Jun'26 (Finance)",
    ])
  })

  it('full 100% split: rounding overshoot comes off the last line, HV never negative', () => {
    // 50/35/15 of 12,436.05 rounds to 6,218.03 + 4,352.62 + 1,865.41 = 12,436.06
    // (1 sen over cost). The last line absorbs it; HV shows 0, not (0.01).
    const p = allocationPreview(12436.05, [
      { companyId: 'hc', pct: 50 },
      { companyId: 'conts', pct: 35 },
      { companyId: 'car', pct: 15 },
    ])
    expect(p.lines.map((l) => l.amount)).toEqual([6218.03, 4352.62, 1865.4])
    expect(p.billedTotal).toBe(12436.05)
    expect(p.hvAmount).toBe(0)
  })
})

describe('buildConsolidatedInvoiceLines', () => {
  const hr: DeptComponentGroup = {
    deptLabel: 'HR',
    segment: 'hr',
    components: { salary: 8850, allowance: 647.5, epf: 1062, socso: 104.15, eis: 11.9 },
  }
  const finance: DeptComponentGroup = {
    deptLabel: 'Finance',
    segment: 'finance',
    components: { salary: 8130, allowance: 288.23, epf: 1042.9, socso: 137.55, eis: 15.72 },
  }
  const directorOffice: DeptComponentGroup = {
    deptLabel: 'Director Office',
    segment: 'director_office',
    components: { salary: 1200.65, allowance: 43.66, epf: 144.08, socso: 20.81, eis: 2.38 },
  }

  it('emits 5 lines per department in order, each tagged with its segment', () => {
    const lines = buildConsolidatedInvoiceLines([hr, finance, directorOffice], "Jun'26")
    expect(lines).toHaveLength(15)
    expect(lines.slice(0, 5).every((l) => l.segment === 'hr')).toBe(true)
    expect(lines.slice(5, 10).every((l) => l.segment === 'finance')).toBe(true)
    expect(lines.slice(10, 15).every((l) => l.segment === 'director_office')).toBe(true)
    expect(lines[0].description).toBe("Salary - Jun'26")
    expect(lines[0].deptLabel).toBe('HR')
  })

  it('per-segment subtotals tie to the group sums and the grand total (HOUZS Century Jun 2026)', () => {
    const lines = buildConsolidatedInvoiceLines([hr, finance, directorOffice], "Jun'26")
    const sumSeg = (seg: string) =>
      Math.round(lines.filter((l) => l.segment === seg).reduce((s, l) => s + l.amount, 0) * 100) / 100
    expect(sumSeg('hr')).toBe(10675.55)
    expect(sumSeg('finance')).toBe(9614.4)
    expect(sumSeg('director_office')).toBe(1411.58)
    expect(Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100).toBe(21701.53)
  })

  it('drops zero components and skips all-zero groups', () => {
    const partial: DeptComponentGroup = {
      deptLabel: 'HR',
      segment: 'hr',
      components: { salary: 500, allowance: 0, epf: 60, socso: 0, eis: 0 },
    }
    const empty: DeptComponentGroup = {
      deptLabel: 'Finance',
      segment: 'finance',
      components: { salary: 0, allowance: 0, epf: 0, socso: 0, eis: 0 },
    }
    const lines = buildConsolidatedInvoiceLines([partial, empty], "Jun'26")
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.description)).toEqual(["Salary - Jun'26", "EPF - Jun'26"])
    expect(lines.every((l) => l.segment === 'hr')).toBe(true)
  })

  it('maps every payroll segment to a group-header label', () => {
    expect(PAYROLL_SEGMENT_LABEL.hr).toBe('HR')
    expect(PAYROLL_SEGMENT_LABEL.finance).toBe('Finance')
    expect(PAYROLL_SEGMENT_LABEL.director_office).toBe('Director Office')
  })
})

// ─── The split follows the payroll row (2026-09-30) ──────────────────────────
// User 2026-09-30: once somebody's payroll is Completed, their billing split
// must not be editable any more.

describe('splitLock', () => {
  const base: SplitLockInput = {
    status: 'draft',
    revenue: false,
    completedAt: null,
    topupOpenedAt: null,
    topupKind: null,
    monthClosed: false,
  }

  it('leaves a draft editable', () => {
    expect(splitLock(base)).toEqual({ locked: false, label: 'Draft', tone: 'muted', state: null, wayBack: null })
  })

  it('locks somebody Completed on Payroll, and says Unlock is the way back', () => {
    const lock = splitLock({ ...base, status: 'completed', completedAt: '2026-09-30T02:00:00Z' })
    expect(lock).toMatchObject({ locked: true, label: 'Completed 30 Sep', tone: 'ledger', wayBack: 'Unlock them on HR › Payroll' })
  })

  it('sends a salesperson back to Comm Cal, where their close is their Complete', () => {
    const lock = splitLock({ ...base, status: 'completed', revenue: true, completedAt: '2026-09-30T02:00:00Z' })
    expect(lock).toMatchObject({ locked: true, wayBack: 'Reopen them on Comm Cal' })
  })

  it('locks somebody with Finance or paid, and says Resubmit is the way back', () => {
    expect(splitLock({ ...base, status: 'submitted' })).toMatchObject({
      locked: true, label: 'With Finance', tone: 'alert', wayBack: 'Resubmit them on HR › Payroll',
    })
    expect(splitLock({ ...base, status: 'paid' })).toMatchObject({
      locked: true, label: 'Paid', tone: 'ledger', wayBack: 'Resubmit them on HR › Payroll',
    })
  })

  it('opens again while a Resubmit or Second payroll has the row back in draft', () => {
    const at = '2026-10-02T02:00:00Z'
    expect(splitLock({ ...base, topupOpenedAt: at, topupKind: 'resubmit' })).toMatchObject({
      locked: false, label: 'Resubmit · editing', tone: 'accent',
    })
    expect(splitLock({ ...base, topupOpenedAt: at, topupKind: 'second_payroll' })).toMatchObject({
      locked: false, label: 'Second payroll · editing',
    })
    // …and locks again once that is Completed.
    expect(splitLock({ ...base, status: 'completed', topupOpenedAt: at, topupKind: 'resubmit' })).toMatchObject({
      locked: true, label: 'Resubmit ready', tone: 'accent', wayBack: 'Unlock them on HR › Payroll',
    })
  })

  it('locks everybody in a month Closed for good, drafts included', () => {
    expect(splitLock({ ...base, monthClosed: true })).toMatchObject({ locked: true, label: 'Closed for good', wayBack: null })
  })
})

describe('splitLockMessage', () => {
  // Word for word what guard_staff_allocation_follows_payroll raised in the
  // 2026-09-30 dry run against the live schema.
  const month = 'September 2026'
  const lockOf = (input: Partial<SplitLockInput>) =>
    splitLock({ status: 'draft', revenue: false, completedAt: null, topupOpenedAt: null, topupKind: null, monthClosed: false, ...input })

  it('names the person, the month, the state and the way back', () => {
    expect(splitLockMessage('TAN YONG HONG', month, lockOf({ status: 'completed' }))).toBe(
      "TAN YONG HONG's September 2026 pay is Completed — its billing split is locked with it. Unlock them on HR › Payroll to change it",
    )
    expect(splitLockMessage('TAN YONG HONG', month, lockOf({ status: 'submitted' }))).toBe(
      "TAN YONG HONG's September 2026 pay is with Finance — its billing split is locked with it. Resubmit them on HR › Payroll to change it",
    )
    expect(splitLockMessage('TAN YONG HONG', month, lockOf({ status: 'paid' }))).toBe(
      "TAN YONG HONG's September 2026 pay is paid — its billing split is locked with it. Resubmit them on HR › Payroll to change it",
    )
    expect(splitLockMessage('STANLEY', month, lockOf({ status: 'completed', revenue: true }))).toBe(
      "STANLEY's September 2026 pay is Completed — its billing split is locked with it. Reopen them on Comm Cal to change it",
    )
  })

  it('says a closed month cannot change at all', () => {
    expect(splitLockMessage('TAN YONG HONG', month, lockOf({ monthClosed: true }))).toBe(
      'Payroll for September 2026 is closed for good — its billing splits cannot change',
    )
  })
})

describe('planSplitCopy', () => {
  const last = [
    { staff_id: 'tyh', company_id: 'hc', allocation_pct: 0.5 },
    { staff_id: 'tyh', company_id: 'car', allocation_pct: 0.25 },
    { staff_id: 'cwh', company_id: 'hc', allocation_pct: 1 },
    { staff_id: 'gone', company_id: 'hc', allocation_pct: 0.4 },
    { staff_id: 'set', company_id: 'car', allocation_pct: 0.3 },
    { staff_id: 'mkt', company_id: 'hc', allocation_pct: 0.2 },
  ]

  it('copies only people on this month’s payroll, still open, not split yet', () => {
    const payroll = new Map<string, SplitStanding>([
      ['tyh', 'open'],
      ['cwh', 'locked'],
      ['set', 'open'],
      ['mkt', 'centralized'],
    ])
    const plan = planSplitCopy(last, payroll, new Set(['set']))
    expect(plan.rows.map((r) => `${r.staff_id}:${r.company_id}`)).toEqual(['tyh:hc', 'tyh:car'])
    expect(plan).toMatchObject({ copied: 1, locked: 1, centralized: 1, notOnPayroll: 1 })
  })

  it('copies nothing when last month had no splits', () => {
    expect(planSplitCopy([], new Map<string, SplitStanding>([['tyh', 'open']]), new Set())).toEqual({
      rows: [],
      copied: 0,
      locked: 0,
      centralized: 0,
      notOnPayroll: 0,
    })
  })
})

describe('allocationRoster', () => {
  // User 2026-09-30: a centralized department bills by invoice, so it is not
  // on Billing Allocation's name list.
  const row = (name: string, dept: string, centralized: boolean, hasSplit = false) => ({ name, dept, centralized, hasSplit })

  it('lists cost-center people and names the centralized departments it leaves out', () => {
    const { listed, notListed } = allocationRoster([
      row('TAN YONG HONG', 'IT', false),
      row('STANLEY', 'Revenue Department', true),
      row('WONG JOEY', 'Marketing', true),
      row('CHEW WEE HO', 'Finance', false),
      row('ANTHONY', 'Revenue Department', true),
    ])
    expect(listed.map((r) => r.name)).toEqual(['TAN YONG HONG', 'CHEW WEE HO'])
    expect(notListed).toEqual([
      { dept: 'Marketing', people: 1 },
      { dept: 'Revenue Department', people: 2 },
    ])
  })

  it('never hides somebody who still has a split, whatever their department is now', () => {
    const { listed, notListed } = allocationRoster([row('LI SEAN', 'HR', true, true), row('NURAZIRA', 'HR', true)])
    expect(listed.map((r) => r.name)).toEqual(['LI SEAN'])
    expect(notListed).toEqual([{ dept: 'HR', people: 1 }])
  })
})

describe('splitCopyNote', () => {
  it('says what was copied and who was left alone', () => {
    expect(splitCopyNote({ copied: 5, locked: 2, notOnPayroll: 1 })).toBe(
      "Copied splits for 5 staff. 2 locked with their payroll were left alone. 1 not on this month's payroll was skipped.",
    )
    expect(splitCopyNote({ copied: 0, locked: 1, notOnPayroll: 0 })).toBe('1 locked with their payroll was left alone.')
  })

  it('says who a centralized department kept out', () => {
    expect(splitCopyNote({ copied: 2, locked: 0, centralized: 3, notOnPayroll: 0 })).toBe(
      'Copied splits for 2 staff. 3 in a centralized department were skipped.',
    )
  })

  it('keeps the old line when there was nothing to do', () => {
    expect(splitCopyNote({ copied: 0, locked: 0, notOnPayroll: 0 })).toBe(
      'Nothing to copy — no last-month splits, or everyone already set.',
    )
  })
})
