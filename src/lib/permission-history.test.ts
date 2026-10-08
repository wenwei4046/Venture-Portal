import { describe, expect, it } from 'vitest'
import { describeHistory, type AuditRow, type HistoryLookups } from './permission-history'

const look: HistoryLookups = {
  templates: new Map([['t-staff', 'Staff · Basic'], ['t-hr', 'HR · Payroll']]),
  functions: new Map([['dept_reports', 'Department reports'], ['hr_costing', 'HR Costing']]),
  titles: new Map([['ti-mm', 'MARKETING MANAGER']]),
  people: new Map([['u-siti', 'SITI RAHMAH']]),
}

let id = 0
const row = (txid: number, table: string, op: AuditRow['op'], old_row: AuditRow['old_row'], new_row: AuditRow['new_row'], changed: string[] | null = null): AuditRow => ({
  id: ++id, occurred_at: `2026-10-08T0${txid}:00:00Z`, actor_name: txid === 1 ? 'System' : 'Principal',
  table_name: table, row_key: null, op, old_row, new_row, changed, txid,
})

describe('the permission history', () => {
  it('reads one save as one entry, a line per change, in the order made', () => {
    const rows = [
      row(2, 'user_permission_cells', 'DELETE', { user_id: 'u-siti', function_key: 'hr_costing', action: 'export', scope: null }, null),
      row(2, 'permission_template_grants', 'INSERT', null, { template_id: 't-staff', function_key: 'dept_reports', action: 'view', scope: 'dept' }),
    ]
    const entries = describeHistory(rows, look)
    expect(entries).toHaveLength(1)
    expect(entries[0].actor).toBe('Principal')
    expect(entries[0].lines).toEqual([
      'SITI RAHMAH: HR Costing · Export back to their template',
      'Staff · Basic: Department reports · View → Dept',
    ])
  })

  it('keeps saves apart and newest first', () => {
    const entries = describeHistory([
      row(3, 'permission_template_grants', 'UPDATE',
        { template_id: 't-hr', function_key: 'hr_costing', action: 'view', scope: 'all' },
        { template_id: 't-hr', function_key: 'hr_costing', action: 'view', scope: 'dept' }, ['scope']),
      row(1, 'titles', 'UPDATE', { name: 'MARKETING MANAGER', template_id: null }, { name: 'MARKETING MANAGER', template_id: 't-staff' }, ['template_id']),
    ], look)
    expect(entries.map(e => e.lines)).toEqual([
      ['HR · Payroll: HR Costing · View All → Dept'],
      ['MARKETING MANAGER: template no template → Staff · Basic'],
    ])
    expect(entries[1].actor).toBe('System')
  })

  it('says what happened to a cell taken away, a person held back and a field hidden', () => {
    const [entry] = describeHistory([
      row(4, 'permission_template_grants', 'DELETE', { template_id: 't-staff', function_key: 'dept_reports', action: 'view', scope: 'dept' }, null),
      row(4, 'user_permission_cells', 'INSERT', null, { user_id: 'u-siti', function_key: 'hr_costing', action: 'export', scope: null }),
      row(4, 'permission_template_sensitive', 'DELETE', { template_id: 't-hr', field: 'nric' }, null),
      row(4, 'users', 'UPDATE', { name: 'SITI RAHMAH', role: 'finance' }, { name: 'SITI RAHMAH', role: 'hr' }, ['role']),
    ], look)
    expect(entry.lines).toEqual([
      'Staff · Basic: Department reports · View Dept → ·',
      'SITI RAHMAH: HR Costing · Export → ✕ for them alone',
      'HR · Payroll: NRIC / IC hidden again',
      'SITI RAHMAH: account kind finance → hr',
    ])
  })

  it('names what is gone by what the row still remembers', () => {
    const [entry] = describeHistory([
      row(5, 'permission_templates', 'DELETE', { name: 'Old bundle' }, null),
      row(5, 'permission_template_grants', 'DELETE', { template_id: 't-gone', function_key: 'reports', action: 'view', scope: 'all' }, null),
    ], look)
    expect(entry.lines).toEqual(['Template “Old bundle” removed', 'A removed template: reports · View All → ·'])
  })
})
