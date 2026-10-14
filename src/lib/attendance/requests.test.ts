import { describe, expect, it } from 'vitest'
import { amountLabel, atLabel, bucketOf, flowNodes, kindLabel, rangeLabel, sinceLabel, statusOf, whenLabel } from './requests'
import type { AttLeaveType, AttRequest, AttStep } from './types'

const step = (s: Partial<AttStep>): AttStep => ({
  id: 's', seq: 1, role: 'hr', approverId: null, approver: 'HR approvers', state: 'waiting', decidedBy: null, onBehalf: false, note: '',
  arrivedAt: '2026-10-14T00:52:00Z', decidedAt: null, ...s,
})
const req = (r: Partial<AttRequest>): AttRequest => ({
  id: 'r', ref: 'LV-2610-009', staffId: 'p', who: 'Rajesh Kumar', kind: 'leave', leaveCode: 'SL', from: '2026-10-12', to: '2026-10-12', days: 1,
  hours: null, detail: {}, reason: 'Gastritis', attachment: null, hasAttachment: false, route: 'hr_only', status: 'pending', onBehalf: false,
  by: 'Rajesh Kumar', sentAt: '2026-10-12T00:20:00Z', decidedAt: null, steps: [step({})], events: [], ...r,
})
const SL: AttLeaveType = { id: 't', code: 'SL', name: 'Sick leave', groups: [], rules: '', route: 'hr_only', counts: 'working', accrues: false, unpaid: false, drawsFrom: null }

describe('Attendance › Requests words', () => {
  it('buckets a request where it waits', () => {
    expect(bucketOf(req({}))).toBe('hr')
    expect(bucketOf(req({ steps: [step({ role: 'upline' }), step({ seq: 2, state: 'queued' })] }))).toBe('upline')
    expect(bucketOf(req({ status: 'approved', steps: [step({ state: 'approved' })] }))).toBe('decided')
  })

  it('says its status as the chip does', () => {
    expect(statusOf(req({}))).toEqual(['warning', 'Waiting · HR'])
    expect(statusOf(req({ status: 'rejected', steps: [step({ state: 'rejected' })] }))).toEqual(['danger', 'Rejected'])
    expect(statusOf(req({ status: 'approved', steps: [step({ state: 'approved' })] }))).toEqual(['success', 'Approved'])
  })

  it('reads kind, dates and amount like the prototype', () => {
    expect(kindLabel(req({}), [SL])).toBe('Sick leave')
    expect(whenLabel(req({}))).toBe('Mon 12 Oct')
    expect(rangeLabel('2026-10-22', '2026-10-23')).toBe('Thu 22 – Fri 23 Oct')
    expect(rangeLabel('2026-10-30', '2026-11-02')).toBe('Fri 30 Oct – Mon 2 Nov')
    expect(amountLabel(req({ days: 2 }))).toBe('2 days')
    expect(amountLabel(req({ kind: 'ot', hours: 6 }))).toBe('6 h')
    expect(whenLabel(req({ kind: 'ot', from: '2026-10-17', detail: { dayType: 'off' } }))).toBe('Sat 17 Oct · off day')
    expect(whenLabel(req({ kind: 'profile', detail: { changes: [{ field: 'Mobile' }, { field: 'Bank' }] } }))).toBe('Mobile · Bank')
  })

  it('counts the wait in minutes, hours, then days', () => {
    const r = req({ steps: [step({ arrivedAt: '2026-10-14T00:00:00Z' })] })
    expect(sinceLabel(r, new Date('2026-10-14T00:49:00Z'))).toBe('49 m')
    expect(sinceLabel(r, new Date('2026-10-14T20:10:00Z'))).toBe('20 h')
    expect(sinceLabel(r, new Date('2026-10-16T01:00:00Z'))).toBe('2 d')
    expect(sinceLabel(req({ status: 'approved', steps: [step({ state: 'approved' })] }), new Date())).toBe('')
  })

  it('writes the office clock', () => {
    expect(atLabel('2026-10-12T00:20:00Z')).toBe('12 Oct, 08:20')
  })

  it('draws the flow: Submitted, then each step', () => {
    const nodes = flowNodes(req({ route: 'upline_then_hr', steps: [step({ role: 'upline', approver: 'Daniel Lee', state: 'approved', decidedBy: 'Siti', onBehalf: true, decidedAt: '2026-10-13T09:02:00Z' }), step({ seq: 2 })] }))
    expect(nodes.map(n => [n.role, n.state, n.label])).toEqual([['Submitted', 'done', 'Sent'], ['Upline', 'done', 'Approved'], ['HR', 'current', 'Waiting']])
    expect(nodes[1].who).toBe('Daniel Lee · by Siti on behalf')
    expect(nodes[2].at).toBe('Arrived 14 Oct, 08:52')
  })
})
