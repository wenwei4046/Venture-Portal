import { describe, expect, it } from 'vitest'
import { journalHubModel, journalRecordModel, jvCheck, jvState, segmentChoices, type JvLineDraft } from './journal-model'

// The Finance phone app's Journal Entries (2026-10-15, part 5c): the desktop
// list's vouchers as a hub, a voucher as its page, the voucher form's rule.

const row = (over: Partial<Parameters<typeof journalHubModel>[0][number]> & { id: string }) => ({
  entry_no: `JE-202610-${over.id}`,
  transaction_date: '2026-10-05',
  description: 'Interest accrual',
  segment: 'corporate',
  total_amount: 100,
  lineCount: 2,
  auto: false,
  ...over,
})

describe('journalHubModel', () => {
  const m = journalHubModel(
    [
      row({ id: '0001' }),
      row({ id: '0002', transaction_date: '2026-09-30', total_amount: 250, segment: 'revenue_department' }),
      row({ id: '0003', auto: true, total_amount: 900, description: '', segment: null }),
    ],
    '2026-10',
    [{ value: 'revenue_department', label: 'Revenue Department' }],
  )
  it('what was posted this month over this month, the manual vouchers and the payroll accruals', () => {
    expect(m.hero).toEqual({ value: 'RM 1,000.00', label: 'Posted · October 2026' })
    expect(m.cards.map((c) => [c.label, c.sub, c.value])).toEqual([
      ['This month', '2 vouchers', 'RM 1,000.00'],
      ['Manual vouchers', '2 vouchers', 'RM 350.00'],
      ['Payroll accruals', '1 voucher · auto', 'RM 900.00'],
    ])
  })
  it('a row is the voucher’s words, its day, lines and segment — its number only when it has no words', () => {
    expect(m.lists.manual.map((r) => [r.title, r.desc])).toEqual([
      ['Interest accrual', '5 Oct 2026 · 2 lines · Venture (Office)'],
      ['Interest accrual', '30 Sep 2026 · 2 lines · Revenue Department'],
    ])
    expect(m.lists.auto[0]).toMatchObject({ title: 'JE-202610-0003', desc: '5 Oct 2026 · 2 lines · Unallocated · Auto · payroll' })
  })
})

describe('journalRecordModel', () => {
  const read = {
    entry: { id: 'jv-1', entry_no: 'JE-202609-0876', transaction_date: '2026-09-15', description: 'Reverse accrual', segment: 'revenue_department', reference_type: 'manual_jv', total_amount: 300 },
    lines: [
      { account_code: '4070', debit: 300, credit: null, description: 'Payable' },
      { account_code: '9093', debit: null, credit: 300, description: null },
    ],
    nameOf: new Map([['4070', 'Accrual - Salary']]),
  }
  it('its lines and totals, and what this reader may do — a manual voucher Edit, Copy, Delete', () => {
    const r = journalRecordModel(read, { create: true, edit: true })
    expect(r).toMatchObject({ no: 'JE-202609-0876', debit: 300, credit: 300, balanced: true, segmentWords: 'Revenue department', can: { edit: true, copy: true, delete: true } })
    expect(r.lines[0]).toEqual({ account: '4070', name: 'Accrual - Salary', debit: 300, credit: 0, note: 'Payable' })
  })
  it('a payroll accrual: only its Fix mistakes (the edit)', () => {
    const r = journalRecordModel({ ...read, entry: { ...read.entry, reference_type: 'payroll_accrual' } }, { create: true, edit: true }, [{ value: 'revenue_department', label: 'Revenue Department' }])
    expect(r).toMatchObject({ auto: true, segmentWords: 'Revenue Department', can: { edit: true, copy: false, delete: false } })
  })
})

describe('the voucher’s rule', () => {
  const line = (account: string, debit: string, credit: string, note = ''): JvLineDraft => ({ key: account + debit + credit, account, debit, credit, note })
  it('posts two or more lines, each an account and one side, debits equal to credits; a blank line is left out', () => {
    const c = jvCheck('Accrual', [line('1300', '100', ''), line('5027', '', '100'), line('', '', '')])
    expect(c).toMatchObject({ ok: true, debit: 100, credit: 100 })
    expect(c.filled).toHaveLength(2)
  })
  it('says what holds it back', () => {
    expect(jvState(jvCheck('', [line('1300', '100', ''), line('5027', '', '100')]), '')).toBe('A description is needed')
    expect(jvState(jvCheck('x', [line('1300', '100', '')]), 'x')).toBe('At least two lines')
    expect(jvState(jvCheck('x', [line('1300', '100', ''), line('5027', '', '90')]), 'x')).toBe('Out of balance · 10.00')
    expect(jvState(jvCheck('x', [line('1300', '100', ''), line('', '', '100')]), 'x')).toBe('Each line: an account and a debit or a credit')
  })
  it('a segment no list knows stays a choice — the voucher keeps it', () => {
    expect(segmentChoices([], 'old_dept').at(-1)).toEqual({ value: 'old_dept', label: 'Old dept' })
    expect(segmentChoices([{ value: 'it', label: 'IT' }], 'it').filter((x) => x.value === 'it')).toEqual([{ value: 'it', label: 'IT' }])
  })
})
