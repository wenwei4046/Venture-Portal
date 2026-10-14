import { describe, expect, it } from 'vitest'
import { closeLabel, closeMonthOf, closeNodes, dayLine, dueLine, registerCsv, touches, waitingAt, waitingIn, whenLabel } from './close'
import type { AttRequest } from './types'

const req = (over: Partial<AttRequest>): AttRequest => ({
  id: 'r', ref: 'LV-2610-001', staffId: 's', who: 'Ann', kind: 'leave', leaveCode: 'AL', from: '2026-10-12', to: '2026-10-12', days: 1, hours: null,
  detail: {}, reason: '', attachment: null, hasAttachment: false, route: 'upline_only', status: 'pending', onBehalf: false, by: 'Ann',
  sentAt: '2026-10-10T01:00:00Z', decidedAt: null, steps: [], events: [], ...over,
})

describe('Month close (the Attendance handoff)', () => {
  it('closes the office month, or the one ?m= names', () => {
    expect(closeMonthOf('2026-10-14')).toBe('2026-10-01')
    expect(closeMonthOf('2026-10-14', '2026-09')).toBe('2026-09-01')
    expect(closeMonthOf('2026-10-14', '2026-13')).toBe('2026-10-01')
  })

  it('is due by the 3rd of the next month, before payroll on the 7th', () => {
    expect(dueLine('2026-10-01')).toBe('Due by 3 Nov · before payroll on the 7th · Employment Regulations 1957 reg 5')
    expect(dueLine('2026-12-01')).toBe('Due by 3 Jan · before payroll on the 7th · Employment Regulations 1957 reg 5')
  })

  it('counts only requests still waiting that touch the month', () => {
    const list = [
      req({ id: 'a' }),
      req({ id: 'b', from: '2026-11-02', to: '2026-11-03' }),
      req({ id: 'c', status: 'approved' }),
      req({ id: 'd', kind: 'profile', leaveCode: null, from: null, to: null, sentAt: '2026-10-14T00:52:00Z' }),
      req({ id: 'e', from: '2026-09-30', to: '2026-10-01' }),
    ]
    expect(waitingIn(list, '2026-10-01').map(r => r.id)).toEqual(['a', 'd', 'e'])
    expect(touches(list[1], '2026-11-01')).toBe(true)
  })

  it('says where a request waits and when it is for', () => {
    expect(waitingAt(req({ steps: [{ id: '1', seq: 1, role: 'upline', approverId: null, approver: 'Dan', state: 'waiting', decidedBy: null, onBehalf: false, note: '', arrivedAt: null, decidedAt: null }] }))).toBe('At upline')
    expect(waitingAt(req({}))).toBe('At HR')
    expect(whenLabel(req({}))).toBe('Mon 12 Oct')
    expect(whenLabel(req({ from: '2026-11-02', to: '2026-11-03' }))).toBe('Mon 2 – Tue 3 Nov')
  })

  it('walks the four steps and names the button', () => {
    expect(closeNodes(6, 3, false, null).map(n => [n.done, n.note])).toEqual([[false, '6 waiting'], [false, '3 to decide'], [false, 'On close'], [false, 'After freeze']])
    expect(closeNodes(0, 0, true, '14 Oct · 09:41').map(n => n.note)).toEqual(['Done', 'Done', '14 Oct · 09:41', 'Ready'])
    expect(closeLabel('2026-10-01', false, 9)).toBe('Close October 2026 · 9 to clear')
    expect(closeLabel('2026-10-01', false, 0)).toBe('Close October 2026')
    expect(closeLabel('2026-10-01', true, 0)).toBe('October closed')
  })

  it('words a day to decide', () => {
    expect(dayLine('2026-10-09', 'A', null)).toBe('Fri 9 Oct · absent · no punch, no leave')
    expect(dayLine('2026-10-12', 'I', '08:55')).toBe('Mon 12 Oct · incomplete · IN 08:55, no OUT')
  })

  it('writes the register as CSV, quoting what needs it', () => {
    expect(registerCsv([{ code: 'HV001', name: 'Lee, Daniel', days: 20, late: 1, leave: 0, absent: 0, unpaid: 0, hours: 160 }])).toBe(
      'Employee code,Name,Days in,Late,Leave,Absent,Unpaid days,Hours worked\nHV001,"Lee, Daniel",20,1,0,0,0,160\n')
  })
})
