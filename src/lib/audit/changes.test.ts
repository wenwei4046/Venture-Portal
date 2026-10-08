import { describe, expect, it } from 'vitest'
import {
  describeChange,
  fieldLabel,
  filtersHref,
  formatValue,
  groupSaves,
  officeDayRange,
  parseChangeFilters,
  rowLabel,
  whoOf,
  type AuditChange,
  type AuditTableLine,
} from './changes'
import { refKey } from './refs'

const STAFF = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const refs = new Map([
  [refKey('staff', STAFF), 'HV010 · TAN AH KOW'],
  [refKey('user', USER), 'Principal'],
])
const noRefs = new Map<string, string>()

const PAYROLL: AuditTableLine = {
  table_name: 'hr_monthly_payroll', label: 'Payroll', area: 'Payroll', mode: 'all',
  label_columns: ['staff_id', 'period_month'], reason: null,
}
const STAFF_LINE: AuditTableLine = {
  table_name: 'hr_staff_costs', label: 'Staff', area: 'People', mode: 'all',
  label_columns: ['employee_code', 'employee_name'], reason: null,
}

function change(over: Partial<AuditChange>): AuditChange {
  return {
    id: 1, occurred_at: '2026-10-08T06:30:00+00:00', actor_id: USER, actor_name: 'Principal', actor_source: 'portal',
    table_name: 'hr_monthly_payroll', row_key: 'r1', op: 'UPDATE', old_row: null, new_row: null, changed: null,
    masked: [], txid: 10, ...over,
  }
}

describe('fieldLabel', () => {
  it('reads a column as words', () => {
    expect(fieldLabel('basic_salary')).toBe('Basic salary')
    expect(fieldLabel('epf_er')).toBe('EPF ER')
    expect(fieldLabel('company_id')).toBe('Company')
    expect(fieldLabel('is_active')).toBe('Active')
    expect(fieldLabel('erp_model_id')).toBe('ERP model')
    expect(fieldLabel('voucher_no')).toBe('Voucher no.')
    expect(fieldLabel('no_pay_amount')).toBe('No pay amount')
    expect(fieldLabel('split_pct')).toBe('Split %')
    expect(fieldLabel('id')).toBe('ID')
  })
})

describe('formatValue', () => {
  it('money as money, a rate with every decimal, a count as a count', () => {
    expect(formatValue('t', 'basic_salary', 3200, noRefs)).toBe('3,200.00')
    expect(formatValue('t', 'epf_er', 352.5, noRefs)).toBe('352.50')
    expect(formatValue('t', 'limit_amount', 500000, noRefs)).toBe('500,000.00')
    expect(formatValue('t', 'base_rate', 0.0525, noRefs)).toBe('0.0525')
    expect(formatValue('t', 'split_pct', 0.333333, noRefs)).toBe('0.333333')
    expect(formatValue('t', 'commission_multiplier', 1.25, noRefs)).toBe('1.25')
    expect(formatValue('t', 'director_heads', 2, noRefs)).toBe('2')
    expect(formatValue('t', 'kpi_qty', 3, noRefs)).toBe('3')
    expect(formatValue('t', 'config_value', 0.02, noRefs)).toBe('0.02')
  })

  it('a negative amount in brackets', () => {
    expect(formatValue('t', 'amount', -1500, noRefs)).toBe('(1,500.00)')
  })

  it('nothing, yes / no, dates, months and moments', () => {
    expect(formatValue('t', 'notes', null, noRefs)).toBe('—')
    expect(formatValue('t', 'notes', '', noRefs)).toBe('—')
    expect(formatValue('t', 'is_active', false, noRefs)).toBe('No')
    expect(formatValue('t', 'payment_date', '2026-09-15', noRefs)).toBe('15 Sep 2026')
    expect(formatValue('t', 'period_month', '2026-09-01', noRefs)).toBe('Sep 2026')
    // A moment in the office's day (UTC+8).
    expect(formatValue('t', 'approved_at', '2026-10-08T04:47:00+00:00', noRefs)).toBe('8 Oct 2026 12:47')
  })

  it('an id by the name behind it, else a short id', () => {
    expect(formatValue('hr_monthly_payroll', 'staff_id', STAFF, refs)).toBe('HV010 · TAN AH KOW')
    expect(formatValue('t', 'created_by', USER, refs)).toBe('Principal')
    expect(formatValue('t', 'created_by', STAFF, noRefs)).toBe('#11111111')
  })

  it('lists and objects, clipped', () => {
    expect(formatValue('t', 'heights', ['16', '18'], noRefs)).toBe('16, 18')
    expect(formatValue('t', 'heights', [], noRefs)).toBe('—')
    expect(formatValue('t', 'layout', { a: 1 }, noRefs)).toBe('{"a":1}')
    expect(formatValue('t', 'notes', 'x'.repeat(200), noRefs)).toHaveLength(120)
  })
})

describe('rowLabel', () => {
  it('names the row by its label columns, ids by name', () => {
    expect(rowLabel(change({ new_row: { staff_id: STAFF, period_month: '2026-09-01' } }), PAYROLL, refs))
      .toBe('HV010 · TAN AH KOW · Sep 2026')
  })
  it('falls back to the key', () => {
    expect(rowLabel(change({ row_key: STAFF, new_row: {} }), undefined, noRefs)).toBe('#11111111')
    expect(rowLabel(change({ row_key: 'op_margin', new_row: {} }), undefined, noRefs)).toBe('op_margin')
  })
})

describe('describeChange', () => {
  it('a change: each changed field before → after, a hidden one named but not shown', () => {
    const d = describeChange(change({
      table_name: 'hr_staff_costs', op: 'UPDATE', changed: ['contact_number', 'nric'], masked: ['nric'],
      old_row: { id: 's1', employee_code: 'HV010', employee_name: 'TAN', contact_number: null },
      new_row: { id: 's1', employee_code: 'HV010', employee_name: 'TAN', contact_number: '012-345' },
    }), STAFF_LINE, noRefs)
    expect(d.action).toBe('Changed')
    expect(d.table).toBe('Staff')
    expect(d.rowLabel).toBe('HV010 · TAN')
    expect(d.fields).toEqual([
      { key: 'contact_number', label: 'Contact number', before: '—', after: '012-345' },
      { key: 'nric', label: 'NRIC', hidden: true },
    ])
  })

  it('an addition: what it holds, its name first, the quiet columns left out, hidden values counted', () => {
    const d = describeChange(change({
      op: 'INSERT', masked: ['basic_salary', 'net'],
      new_row: { id: 'p1', staff_id: STAFF, period_month: '2026-09-01', status: 'draft', created_at: '2026-10-08T00:00:00Z', notes: null },
    }), PAYROLL, refs)
    expect(d.action).toBe('Added')
    expect(d.fields.map(f => [f.label, f.after])).toEqual([
      ['Staff', 'HV010 · TAN AH KOW'], ['Period month', 'Sep 2026'], ['Status', 'draft'],
    ])
    expect(d.hiddenValues).toBe(2)
  })

  it('a removal: what it held', () => {
    const d = describeChange(change({ op: 'DELETE', old_row: { id: 'p1', staff_id: STAFF, status: 'draft' } }), PAYROLL, refs)
    expect(d.action).toBe('Removed')
    expect(d.fields.map(f => [f.label, f.before])).toEqual([['Staff', 'HV010 · TAN AH KOW'], ['Status', 'draft']])
  })
})

describe('whoOf', () => {
  it('a person; the server writing for a person; the feed; a migration; the old log', () => {
    expect(whoOf({ actor_id: USER, actor_name: 'Principal', actor_source: 'portal' })).toEqual({ who: 'Principal', via: null })
    expect(whoOf({ actor_id: USER, actor_name: 'LIM', actor_source: 'server' })).toEqual({ who: 'LIM', via: 'through the server' })
    expect(whoOf({ actor_id: null, actor_name: null, actor_source: 'server' })).toEqual({ who: 'System', via: 'ERP feed or server job' })
    expect(whoOf({ actor_id: null, actor_name: null, actor_source: 'database' })).toEqual({ who: 'System', via: 'database (a migration)' })
    expect(whoOf({ actor_id: null, actor_name: null, actor_source: null })).toEqual({ who: 'System', via: null })
    expect(whoOf({ actor_id: USER, actor_name: null, actor_source: 'portal' }).who).toBe('Removed account')
  })
})

describe('groupSaves', () => {
  it('one save per transaction, newest first, its records in the order written', () => {
    const lines = new Map([[PAYROLL.table_name, PAYROLL]])
    const rows = [
      change({ id: 5, txid: 20, occurred_at: '2026-10-08T07:00:00Z', op: 'UPDATE', changed: ['status'], old_row: { status: 'draft' }, new_row: { status: 'completed' } }),
      change({ id: 4, txid: 20, occurred_at: '2026-10-08T07:00:00Z', op: 'UPDATE', changed: ['status'], old_row: { status: 'draft' }, new_row: { status: 'completed' } }),
      change({ id: 3, txid: 10, occurred_at: '2026-10-08T06:00:00Z', actor_id: null, actor_name: null, actor_source: 'database', op: 'INSERT', new_row: { status: 'draft' } }),
    ]
    const saves = groupSaves(rows, lines, noRefs)
    expect(saves.map(s => [s.txid, s.who, s.changes.map(c => c.id)])).toEqual([
      [20, 'Principal', [4, 5]],
      [10, 'System', [3]],
    ])
    expect(saves[1].via).toBe('database (a migration)')
  })
})

describe('parseChangeFilters', () => {
  it('keeps what is well formed and drops the rest', () => {
    expect(parseChangeFilters({
      area: 'Payroll', table: 'hr_monthly_payroll', who: 'system', from: '2026-10-01', to: '2026-10-08', row: 'r1', before: '120',
    })).toEqual({ area: 'Payroll', table: 'hr_monthly_payroll', who: 'system', from: '2026-10-01', to: '2026-10-08', row: 'r1', before: 120 })
    expect(parseChangeFilters({ area: 'Nope', table: 'x; drop', who: 'bob', from: '1 Oct', before: '-1' })).toEqual({
      area: null, table: null, who: null, from: null, to: null, row: null, before: null,
    })
    expect(parseChangeFilters({ who: USER }).who).toBe(USER)
    expect(parseChangeFilters({ area: ['Treasury', 'Payroll'] }).area).toBe('Treasury')
  })
})

describe('officeDayRange', () => {
  it('the office days from their first instant to the next day', () => {
    expect(officeDayRange('2026-10-01', '2026-10-08')).toEqual({ from: '2026-10-01T00:00:00+08:00', to: '2026-10-09T00:00:00+08:00' })
    expect(officeDayRange(null, null)).toEqual({ from: null, to: null })
  })
})

describe('filtersHref', () => {
  it('the same filters with one changed; nothing left is the bare page', () => {
    const f = parseChangeFilters({ area: 'Payroll', who: 'system', before: '50' })
    expect(filtersHref(f, { before: null })).toBe('/audit-log?area=Payroll&who=system')
    expect(filtersHref(f, { area: null, who: null, before: null })).toBe('/audit-log')
    expect(filtersHref(f, { table: 'hr_staff_costs', row: 'a:b' })).toBe('/audit-log?area=Payroll&table=hr_staff_costs&who=system&row=a%3Ab&before=50')
  })
})
