import { describe, expect, it } from 'vitest'
import type { MemberRequest } from '@/lib/member/types'
import {
  filterRequests,
  isOpen,
  memoLine,
  memoReadsFromRow,
  memoRefusal,
  nextWeekBrand,
  requestCaption,
  requestFacts,
  requestFactsFromRow,
  requestHistory,
  requestMeta,
  requestStatus,
  requestStep,
  requestTitle,
  weekBrand,
  weeksChangedText,
} from './member-services'

const FAIR = '71709f7e-9f7c-4e28-80cf-ce21be336995'
const departments = [{ id: FAIR, name: 'Fair', capacity: 28, occupied: 28, reserved: 0 }]
const req = (over: Partial<MemberRequest>): MemberRequest => ({
  id: 'r1', kind: 'waiting', title: 't', status: 'submitted', createdAt: '2026-10-01T00:00:00Z', requestNo: 'RQ-2610-004',
  detail: { subDepartmentId: FAIR, department: 'Fair' }, ...over,
})

describe('Request reviews · words and facts', () => {
  it('reads member_admin_request_facts()', () => {
    const facts = requestFactsFromRow({
      r1: { submittedBy: 'CHEA HUAN', original: null, successor: null, target: null, acceptedAt: '2026-10-10T13:16:34Z',
        events: [{ to: 'submitted', at: '2026-10-09T01:00:00Z', by: 'CHEA HUAN' }, { to: 'waiting', at: '2026-10-10T13:16:34Z', note: 'Accepted onto the waiting list.', by: 'HR' }, { bad: true }] },
    })
    expect(facts.r1.submittedBy).toBe('CHEA HUAN')
    expect(facts.r1.events).toHaveLength(2)
    expect(requestHistory(facts.r1).map(e => [e.what, e.by])).toEqual([['Submitted', 'CHEA HUAN'], ['Accepted onto the waiting list', 'HR']])
    expect(requestFactsFromRow(null)).toEqual({})
  })

  it('titles each kind as the handoff does', () => {
    expect(requestTitle(req({ detail: { newPerson: 'Amelia Tan' } }), undefined)).toBe('Amelia Tan · Waiting List')
    expect(requestTitle(req({ kind: 'replacement' }), { submittedBy: null, original: 'MARCUS', successor: null, target: null, acceptedAt: null, events: [] })).toBe('MARCUS · Replacement')
    expect(requestTitle(req({ kind: 'claim', title: 'Outstation claim · Penang' }), undefined)).toBe('Outstation claim · Penang')
    expect(requestMeta(req({}))).toBe('Waiting list · RQ-2610-004')
  })

  it('lists a waiting-list applicant’s facts, blank ones left out', () => {
    const rows = requestFacts(req({ detail: { subDepartmentId: FAIR, newPerson: 'Amelia Tan', contact: '012-345 6789', start: '2026-10-20', signature: 'Amelia Tan' } }),
      { submittedBy: 'CHEA HUAN', original: null, successor: null, target: null, acceptedAt: null, events: [] }, { departments })
    expect(rows.map(r => `${r.l}: ${r.v}`)).toEqual([
      'Applicant: Amelia Tan', 'Mobile number: 012-345 6789', 'Joining date: 20 Oct 2026', 'Signed by: Amelia Tan',
      'Request department: Revenue · Fair', 'Submitted by: CHEA HUAN', 'Signed form: Paper form on file',
    ])
  })

  it('words a replacement’s arrangement and a claim’s money', () => {
    const repl = requestFacts(req({ kind: 'replacement', detail: { subDepartmentId: FAIR, destination: 'member_exit', replacementSource: 'vacancy', effective: '2026-10-31', reason: 'Leaving' } }),
      { submittedBy: 'KAR JUN', original: 'LOUIS', successor: null, target: null, acceptedAt: null, events: [] }, { departments })
    expect(repl.map(r => r.l)).toEqual(['Original member', 'Original member arrangement', 'Proposed replacement', 'Planned effective date', 'Reason and notes', 'Request department', 'Submitted by'])
    expect(repl[1].v).toBe('Leave this department only')
    expect(repl[2].v).toBe('Release the position without a replacement')
    const claim = requestFacts(req({ kind: 'claim', detail: { category: 'Outstation 住宿', amount: 480, location: 'Kuantan', start: '2026-10-02', end: '2026-10-05' } }), undefined, { departments })
    expect(claim.map(r => `${r.l}: ${r.v}`)).toEqual(['Claim category: Outstation accommodation', 'Claim amount: RM 480.00', 'Location: Kuantan', 'Stay: 2 Oct 2026 — 5 Oct 2026'])
  })

  it('says what HR does next', () => {
    expect(isOpen(req({}))).toBe(true)
    expect(isOpen(req({ status: 'expired' }))).toBe(true)
    expect(isOpen(req({ kind: 'claim', status: 'expired' }))).toBe(false)
    expect(requestStep(req({}))).toBe('Accept onto the waiting list')
    expect(requestStep(req({ status: 'waiting' }))).toBe('On the waiting list')
    expect(requestStep(req({ kind: 'claim' }))).toBe('Decide the claim')
    expect(requestStep(req({ kind: 'replacement', status: 'approved' }))).toBe('Complete the arrangement')
    expect(requestCaption(req({}), 'Fair')).toBe("Accepting puts the applicant at the end of Fair's waiting list. The department was chosen when the request was submitted.")
    expect(requestStatus('paid')).toEqual({ name: 'Paid', tone: 'info' })
    expect(requestStatus('failed').name).toBe('Failed · removed')
  })

  it('filters by kind', () => {
    const all = [req({ id: 'a' }), req({ id: 'b', kind: 'claim' }), req({ id: 'c', kind: 'replacement' })]
    expect(filterRequests(all, 'all').map(r => r.id)).toEqual(['a', 'b', 'c'])
    expect(filterRequests(all, 'claim').map(r => r.id)).toEqual(['b'])
  })
})

describe('Publish memo', () => {
  it('says who it went to and how many read it', () => {
    const reads = memoReadsFromRow({ m1: { read: 18, acknowledged: 12 } })
    expect(memoLine({ id: 'm1', departments: ['Fair', 'IR'] }, reads)).toBe('Fair, IR · read by 18')
    expect(memoLine({ id: 'm2', departments: ['Fair'] }, reads)).toBe('Fair · read by 0')
    expect(memoLine({ id: 'm2', departments: ['Fair'] }, null)).toBe('Fair')
  })

  it('needs a title, a body and a department', () => {
    expect(memoRefusal('Hi', 'Body', ['fair'])).toBeNull()
    expect(memoRefusal(' ', 'Body', ['fair'])).toBe('Add a title, a body and at least one department.')
    expect(memoRefusal('Hi', 'Body', [])).toBe('Add a title, a body and at least one department.')
  })
})

describe('Brand weeks', () => {
  it('cycles Akemi → Dunlopillo → Zanotti → Ergotex → not picked', () => {
    expect(nextWeekBrand(null)).toBe('AKEMI')
    expect(nextWeekBrand('AKEMI')).toBe('DUNLOP')
    expect(nextWeekBrand('ZANOTTI')).toBe('ERGOTEX')
    expect(nextWeekBrand('ERGOTEX')).toBeNull()
    expect(weekBrand('DUNLOP')?.name).toBe('Dunlopillo')
    expect(weeksChangedText(1)).toBe('1 week changed')
    expect(weeksChangedText(3)).toBe('3 weeks changed')
  })
})
