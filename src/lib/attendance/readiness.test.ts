import { describe, expect, it } from 'vitest'
import { readinessCount, readinessRows } from './readiness'
import type { AttAssignment, AttConfig, AttLedger, AttPerson } from './types'

const person = (id: string, name: string, over: Partial<AttPerson> = {}): AttPerson => ({
  id, name, code: null, titleId: 't-exec', title: 'Executive', level: 3, levelName: null, departmentId: 'd', department: 'Marketing',
  hireDate: null, hasLogin: true, uplineId: null, upline: null, uplineHasLogin: null, templateId: 'tpl', ...over,
})
const assignment = (over: Partial<AttAssignment>): AttAssignment => ({
  id: 'a', level: 'company', titleId: null, staffId: null, label: 'HOUZS Venture', mode: 'clock', scheduleId: 'sch', locationId: null, anywhere: false,
  ot: 'by_wage', from: '2026-11-01', ...over,
})
const config = (over: Partial<AttConfig>): AttConfig => ({
  today: '2026-11-03', now: '09:41', canCreate: true, canEdit: true, canApprove: true, me: 'Siti', people: [], titles: [], levels: [], departments: [],
  schedules: [], locations: [], holidays: [], assignments: [], leaveTypes: [], otRates: [], policies: [], routes: [], ...over,
})
const ledger: AttLedger = { year: 2026, entries: [], leave: [], marks: [] }

describe('Readiness (the Attendance handoff)', () => {
  it('says nobody clocks while there is no company default', () => {
    const rows = readinessRows(config({ people: [person('p1', 'Ann')] }), ledger, '2026-11-03')
    expect(rows[0]).toMatchObject({ key: 'default', tone: 'danger', fix: { label: 'Assign', href: '/attendance/settings' } })
    expect(rows.at(-1)).toMatchObject({ key: 'approve', tone: 'success', fix: null })
  })

  it('names who clocks without a login, uplines without one, and missing schedules', () => {
    const dan = person('up', 'Daniel Lee', { hasLogin: false, title: 'Marketing Manager' })
    const rows = readinessRows(
      config({
        people: [
          person('p1', 'Hafiz Rahim', { hasLogin: false, uplineId: 'up', upline: 'Daniel Lee' }),
          person('p2', 'Jason Tan', { hasLogin: false, uplineId: 'up', upline: 'Daniel Lee' }),
          dan,
        ],
        assignments: [assignment({}), assignment({ id: 'b', level: 'person', staffId: 'p2', scheduleId: null })],
      }),
      ledger,
      '2026-11-03',
    )
    const by = Object.fromEntries(rows.map(r => [r.key, r]))
    expect(by.login.title).toBe('3 people who clock have no login')
    expect(by.login.sub).toBe('Hafiz Rahim · Jason Tan · Daniel Lee — invite them in People')
    expect(by.upline.title).toBe('1 upline has no personal login')
    expect(by.upline.sub).toBe('Daniel Lee (Marketing Manager) — 2 reports fall back to HR')
    expect(by.schedule.title).toBe('1 person with no schedule')
    expect(by.default).toBeUndefined()
  })

  it('asks for opening balances, templates and next year’s chosen holidays', () => {
    const rows = readinessRows(
      config({
        people: [person('p1', 'Ann', { titleId: 'store' }), person('p2', 'Bob')],
        titles: [{ id: 'store', name: 'Storekeeper', level: 2, departmentId: null, hasTemplate: false }],
        assignments: [assignment({})],
        leaveTypes: [{ id: 'al', code: 'AL', name: 'Annual leave', groups: [], rules: '', route: 'upline_only', counts: 'working', accrues: true, unpaid: false, drawsFrom: null }],
        holidays: [{ id: 'h', day: '2027-12-25', name: 'Christmas', kind: 'chosen', states: 'All' }, { id: 'h2', day: '2027-01-02', name: 'X', kind: 'chosen', states: 'All' }],
      }),
      { ...ledger, entries: [{ id: 'e', ref: 'OB-1', staffId: 'p2', code: 'AL', kind: 'opening', days: 2, date: '2026-01-01', note: 'Carried', detail: {}, by: 'HR', at: '', events: [] }] },
      '2026-11-03',
    )
    const by = Object.fromEntries(rows.map(r => [r.key, r]))
    expect(by.opening.title).toBe('Opening balances missing for 1 person')
    expect(by.template.title).toBe('1 title has no template')
    expect(by.template.sub).toBe('Storekeeper — cannot punch or ask')
    expect(by.holidays.title).toBe('2027 holidays: 2 of 6 chosen picked')
    expect(by.holidays.sub).toBe('Publish before 1 Jan 2027')
    expect(readinessCount(rows)).toBe(3)
  })
})
