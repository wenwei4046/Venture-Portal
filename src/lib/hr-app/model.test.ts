import { describe, expect, it } from 'vitest'
import {
  budgetLabel, clashOf, daysToFill, hm, initials, missingFor, pipeline, positionLabel, requestTitle, reviewItems, shiftDay, slotAt,
  type HrBooking, type HrHire, type HrMemberRequest,
} from './model'

// The HR phone app's arithmetic (2026-10-11, HR revamp round 2 — the handoff's
// HR Mobile App.dc.html), on the handoff's own sample rows.

const hire = (h: Partial<HrHire>): HrHire => ({
  id: 'HR-1', status: 'submitted', position: 'Revenue Specialist', headcount: 1, dept: 'Revenue · Fair', budget: '2,800–3,200', start: 'Within 1 month',
  ownerName: null, requester: 'Chea Huan', when: '28 Sep 2026', candidates: [], events: [], ...h,
})
const req = (r: Partial<HrMemberRequest>): HrMemberRequest => ({ id: 'MR-1', code: 'RQ-2610-001', kind: 'waiting', status: 'submitted', sub: 'Fair', byName: 'Kar Jun', ...r })

describe('the HR app model', () => {
  it('lists pending hiring requests first, then member requests waiting for a decision', () => {
    const items = reviewItems({
      hires: [hire({ id: 'HR-205', position: 'Senior Revenue Specialist', dept: 'Revenue · IR', requester: 'Kar Jun', when: '9 Oct 2026' }), hire({ id: 'HR-203', status: 'acknowledged' })],
      requests: [
        req({ id: 'MR-0412', status: 'waiting', newPerson: 'Amelia Tan' }),
        req({ id: 'MR-0421', newPerson: 'Siti Aisyah' }),
        req({ id: 'MR-0405', kind: 'replacement', originalName: 'Marcus', newPerson: 'Ryan Tan' }),
        req({ id: 'MR-0420', kind: 'claim', status: 'needs_info', category: 'Outstation accommodation', amount: '480', byName: 'Adrian' }),
      ],
    })
    expect(items.map(i => [i.tag, i.title, i.meta])).toEqual([
      ['HIRE', 'Senior Revenue Specialist', 'Revenue · IR · Kar Jun'],
      ['WAIT', 'Siti Aisyah', 'Waiting list · Fair · Kar Jun'],
      ['REPL', 'Marcus → Ryan Tan', 'Replacement · Fair · Kar Jun'],
      ['CLAIM', 'Outstation accommodation · RM 480', 'Claim · Fair · Adrian'],
    ])
  })

  it('names a guest-link request by its subsidiary', () => {
    expect(reviewItems({ hires: [hire({ company: 'HOUZS Interior Sdn Bhd', requester: 'Wong Mei Yee' })], requests: [] })[0].meta).toBe('HOUZS Interior Sdn Bhd · Wong Mei Yee')
  })

  it('a replacement with nobody named releases the seat', () => {
    expect(requestTitle(req({ kind: 'replacement', originalName: 'Louis', newPerson: '' }))).toBe('Louis → seat released')
  })

  it('finds the compulsory letters a person has nothing on file for', () => {
    const d = {
      docTypes: [{ id: 'offer', name: 'Offer letter', compulsory: true }, { id: 'inc', name: 'Increment letter', compulsory: false }],
      letters: [{ id: 'L1', staffId: 'zack', typeId: 'inc', typeName: 'Increment letter', file: 'a.pdf' }, { id: 'L2', staffId: 'chea', typeId: 'offer', typeName: 'Offer letter', file: 'b.pdf' }],
    }
    expect(missingFor(d, 'zack')).toEqual(['Offer letter'])
    expect(missingFor(d, 'chea')).toEqual([])
  })

  it('writes a budget range, one end, or a dash', () => {
    expect(budgetLabel('3,200–3,800')).toBe('RM 3,200–3,800')
    expect(budgetLabel('3,000–3,000')).toBe('RM 3,000')
    expect(budgetLabel('–2,500')).toBe('RM 2,500')
    expect(budgetLabel('')).toBe('—')
  })

  it('counts a request card’s pipeline: candidates, at appointment or further, out', () => {
    expect(pipeline([
      { id: '1', name: 'A', stage: 'shortlisted' }, { id: '2', name: 'B', stage: 'appointment' }, { id: '3', name: 'C', stage: 'hired' }, { id: '4', name: 'D', stage: 'rejected' },
    ])).toEqual([{ v: 4, l: 'cand.' }, { v: 2, l: 'appt' }, { v: 1, l: 'out' }])
  })

  it('reads the days to fill off the trail', () => {
    const filled = hire({ status: 'filled', when: '2 Sep 2026', events: [{ what: 'Filled', when: '24 Sep 2026', who: 'Grace Lim' }] })
    expect(daysToFill([filled, hire({})]).map(x => x.days)).toEqual([22])
  })

  it('more than one place reads "× n"', () => {
    expect(positionLabel(hire({ headcount: 2 }))).toBe('Revenue Specialist × 2')
    expect(positionLabel(hire({}))).toBe('Revenue Specialist')
  })

  it('snaps a tap on the timeline to its half hour, never past 19:30', () => {
    expect(slotAt(0, 768)).toBe(480)
    // 64px an hour: 96px down is 09:30, 95px still 09:00.
    expect(slotAt(96, 768)).toBe(570)
    expect(slotAt(95, 768)).toBe(540)
    expect(slotAt(768, 768)).toBe(1170)
    expect(hm(slotAt(400, 768))).toBe('14:00')
  })

  it('refuses a booking that overlaps another in the same room that day', () => {
    const b: HrBooking = { id: 'BK-1', roomId: 'r1', date: '2026-10-10', from: 540, to: 600, title: 'Fair weekly sync', dept: 'Revenue', byName: 'Chea Huan', mine: false, guest: false, pax: 6 }
    expect(clashOf([b], 'r1', '2026-10-10', 570, 630)?.title).toBe('Fair weekly sync')
    expect(clashOf([b], 'r1', '2026-10-10', 600, 660)).toBeNull()
    expect(clashOf([b], 'r2', '2026-10-10', 570, 630)).toBeNull()
  })

  it('steps days on the calendar and spells initials', () => {
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(initials('Daniel Lee')).toBe('DL')
  })
})
