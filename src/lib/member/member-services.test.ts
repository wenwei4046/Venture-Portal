import { describe, expect, it } from 'vitest'
import type { MemberRequest } from '@/lib/member/types'
import {
  RELEASE_SEAT,
  approveLabel,
  approvedText,
  arrangementOf,
  choosesReplacement,
  defaultEffective,
  defaultSeat,
  effectiveWhen,
  filterRequests,
  hasSignedForm,
  isOpen,
  memoLine,
  memoReadsFromRow,
  memoRefusal,
  replacementRefusal,
  requestCaption,
  requestFacts,
  requestFactsFromRow,
  requestHistory,
  requestMeta,
  requestStatus,
  requestStep,
  requestTitle,
  runFailure,
  scheduledNotice,
  seatOptions,
  weekBrand,
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

  // HR revamp 7a (2026-10-10): the answers to HR's own questions, the signed form and the form's version.
  it('lists what the waiting-list form asked, the signed form it came with and its version', () => {
    const hash = 'b'.repeat(64)
    const r = req({ detail: { subDepartmentId: FAIR, newPerson: 'Amelia Tan', contact: '012', start: '2026-10-20', signature: 'Jia En', formVersion: 3,
      answers: [{ id: 'ic', label: 'IC number', value: '900101-14-5678' }, { id: 'heard', label: 'How did they hear about us', value: '' }, { id: 'x' }],
      signedFormName: 'amelia-form.jpg', signedFormHash: hash } })
    expect(requestFacts(r, undefined, { departments }).map(f => `${f.l}: ${f.v}`).slice(-4)).toEqual([
      'Request department: Revenue · Fair', 'IC number: 900101-14-5678', 'Signed form: amelia-form.jpg · black & white record', 'Form version: v3',
    ])
    expect(hasSignedForm(r)).toBe(true)
    expect(hasSignedForm(req({ detail: { signedFormName: 'x.jpg', signedFormHash: 'nope' } }))).toBe(false)
    expect(hasSignedForm(req({ kind: 'claim', detail: { signedFormName: 'x.jpg', signedFormHash: hash } }))).toBe(false)
    const facts = requestFactsFromRow({ r1: { submittedBy: 'KAR JUN', events: [
      { to: 'submitted', at: '2026-10-09T01:00:00Z', by: 'KAR JUN' }, { to: 'needs_info', at: '2026-10-09T02:00:00Z', note: 'Which IC?', by: 'HR' },
      { to: 'submitted', at: '2026-10-09T03:00:00Z', by: 'KAR JUN' }] } }).r1
    expect(requestHistory(facts, 'waiting', r.detail).map(e => e.note)).toEqual([null, 'Which IC?', 'Signed form attached: amelia-form.jpg'])
    expect(requestHistory(facts, 'waiting', { signedFormName: '' }).map(e => e.note)).toEqual([null, 'Which IC?', null])
  })

  // Round 2's README 18.5 (2026-10-11): a replacement sent on the Replacement list's own form.
  it('lists what the replacement form asked, the signed form it came with and its version — and opens it', () => {
    const hash = 'e'.repeat(64)
    const r = req({ kind: 'replacement', detail: { subDepartmentId: FAIR, destination: 'member_exit', replacementSource: 'new', newPerson: 'Ryan Tan',
      effective: '2026-10-31', reason: 'Moving to Penang', formVersion: 2, answers: [{ id: 'q_handover', label: 'Handover done?', value: 'Yes' }],
      signedFormName: 'handover.pdf', signedFormHash: hash } })
    expect(requestFacts(r, undefined, { departments }).map(f => `${f.l}: ${f.v}`).slice(-3)).toEqual([
      'Handover done?: Yes', 'Signed form: handover.pdf · black & white record', 'Form version: v2',
    ])
    expect(hasSignedForm(r)).toBe(true)
    const facts = requestFactsFromRow({ r1: { submittedBy: 'KAR JUN', events: [{ to: 'submitted', at: '2026-10-09T01:00:00Z', by: 'KAR JUN' }] } }).r1
    expect(requestHistory(facts, 'replacement', r.detail).map(e => e.note)).toEqual(['Signed form attached: handover.pdf'])
    // One sent before the form, or with no file: no form rows, nothing to open.
    const before = req({ kind: 'replacement', detail: { subDepartmentId: FAIR, destination: 'member_exit', replacementSource: 'vacancy', effective: '2026-10-31', reason: 'Leaving' } })
    expect(requestFacts(before, undefined, { departments }).map(f => f.l)).not.toContain('Signed form')
    expect(hasSignedForm(before)).toBe(false)
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
    expect(requestStep(req({ kind: 'replacement' }))).toBe('Approve and choose the replacement')
    expect(requestStep(req({ kind: 'replacement', status: 'approved' }))).toBe('Approve and choose the replacement')
    expect(requestStep(req({ kind: 'replacement', status: 'scheduled' }))).toBe('Scheduled')
    expect(requestStep(req({ kind: 'replacement', status: 'executed' }))).toBe('Completed')
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

describe('A replacement: who takes the seat, and when (HR revamp 4b)', () => {
  const REV = 'dep-revenue'
  const KAR = '727f336a-e761-4cec-8ef0-390e7626348d'
  const ADRIAN = '61b4c495-6b7d-442d-a391-31fe4cbe2d6a'
  const data = {
    candidates: [
      { id: 'z', name: 'ZACK', departmentId: REV, titleId: 't-rs' },
      { id: KAR, name: 'KAR JUN', departmentId: REV, titleId: 't-ta' },
      { id: ADRIAN, name: 'ADRIAN', departmentId: REV, titleId: 't-srs' },
      { id: 'm', name: 'MARKETING ONE', departmentId: 'dep-marketing', titleId: null },
      { id: 'y', name: 'YUNY', departmentId: REV, titleId: 't-tl' },
      { id: 'b', name: 'BOBBY', departmentId: REV, titleId: 't-tl' },
    ],
    titles: [
      { id: 't-rs', name: 'Revenue Specialist', departmentId: REV, subDepartmentIds: [] },
      { id: 't-ta', name: 'Team Assistant', departmentId: REV, subDepartmentIds: [] },
      { id: 't-srs', name: 'Senior Revenue Specialist', departmentId: REV, subDepartmentIds: [] },
      { id: 't-tl', name: 'Team Leader', departmentId: REV, subDepartmentIds: [] },
    ],
    // Who leads where: YUNY in Fair (first), BOBBY only in IR (with the rest).
    uplines: [
      { id: 'y', name: 'YUNY', subDepartmentId: FAIR, titleId: 't-tl' },
      { id: 'b', name: 'BOBBY', subDepartmentId: 'ir', titleId: 't-tl' },
    ],
  }
  const repl = (detail: Record<string, unknown>, status = 'submitted') =>
    req({ kind: 'replacement', status, detail: { subDepartmentId: FAIR, originalStaffId: KAR, destination: 'resignation', replacementSource: 'new', ...detail } })
  const facts = (over: Record<string, unknown> = {}) => ({ submittedBy: 'STANLEY', original: 'KAR JUN', successor: null, target: null, acceptedAt: null, events: [], ...over })

  it('offers releasing the seat, then everybody in the original member’s department but them — this sub-department’s leaders first — with their title', () => {
    const options = seatOptions(repl({}), data)
    expect(options.map(o => [o.label, o.meta])).toEqual([
      ['No replacement · release the seat', ''],
      ['YUNY', 'Team Leader'],
      ['ADRIAN', 'Senior Revenue Specialist'],
      ['BOBBY', 'Team Leader'],
      ['ZACK', 'Revenue Specialist'],
    ])
    expect(options[0]).toBe(RELEASE_SEAT)
  })

  it('starts on the person the member named, else the seat released', () => {
    const options = seatOptions(repl({}), data)
    expect(defaultSeat(repl({ newPerson: ' adrian ' }), options)).toBe(ADRIAN)
    expect(defaultSeat(repl({ newPerson: 'Somebody New' }), options)).toBe('')
    expect(defaultSeat(repl({ newPerson: 'ADRIAN', replacementSource: 'vacancy' }), options)).toBe('')
  })

  it('starts on the planned date, and says when the change happens', () => {
    expect(defaultEffective(repl({ effective: '2026-10-31' }), '2026-10-10')).toBe('2026-10-31')
    expect(defaultEffective(repl({ effective: '' }), '2026-10-10')).toBe('2026-10-10')
    expect(effectiveWhen('2026-10-10', '2026-10-10')).toBe('That date has come, so the change happens as soon as you approve.')
    expect(effectiveWhen('2026-10-31', '2026-10-10')).toBe('Scheduled — the system replaces them on 31 Oct 2026.')
    expect(approveLabel('2026-10-31')).toBe('Approve · replace on 31 Oct 2026')
  })

  it('folds the older arrangement words into the three the system runs', () => {
    expect(arrangementOf(repl({ destination: 'resignation' }))).toBe('resignation')
    expect(arrangementOf(repl({ destination: 'company_exit' }))).toBe('resignation')
    expect(arrangementOf(repl({ destination: 'department_exit' }))).toBe('member_exit')
    expect(arrangementOf(repl({ destination: 'transfer' }))).toBe('transfer')
    expect(choosesReplacement(repl({}))).toBe(true)
    expect(choosesReplacement(repl({}, 'approved'))).toBe(true)
    expect(choosesReplacement(repl({}, 'scheduled'))).toBe(false)
  })

  it('says what the system will do, in each arrangement', () => {
    expect(requestCaption(repl({}), 'Fair', facts())).toBe(
      'Pick who takes the seat from People Management (Revenue · Fair), and the date. On that date the system replaces them: KAR JUN is deactivated and the new person is added.')
    expect(requestCaption(repl({ destination: 'member_exit' }), 'Fair', facts())).toContain('KAR JUN leaves Fair and the new person is added.')
    expect(requestCaption(repl({ destination: 'transfer' }), 'Fair', facts({ target: 'IR' }))).toContain('KAR JUN moves to IR and the new person is added.')
    expect(scheduledNotice(repl({}, 'scheduled'), facts({ successor: 'ADRIAN', effectiveOn: '2026-10-31' }), 'Fair'))
      .toBe('On 31 Oct 2026 the system deactivates KAR JUN and adds ADRIAN to Fair.')
    expect(scheduledNotice(repl({ destination: 'member_exit' }, 'scheduled'), facts({ effectiveOn: '2026-10-31' }), 'Fair'))
      .toBe('On 31 Oct 2026 the system takes KAR JUN off Fair and releases the seat.')
    expect(scheduledNotice(repl({ destination: 'transfer' }, 'scheduled'), facts({ target: 'IR', successor: 'ZACK', effectiveOn: '2026-11-01' }), 'Fair'))
      .toBe('On 1 Nov 2026 the system moves KAR JUN to IR and adds ZACK to Fair.')
  })

  it('says what an approval did', () => {
    expect(approvedText(repl({}), facts(), 'ADRIAN', 'Fair', '2026-10-10', true)).toBe('Replaced — KAR JUN deactivated, ADRIAN added to Fair')
    expect(approvedText(repl({}), facts(), null, 'Fair', '2026-10-10', true)).toBe('Replaced — KAR JUN deactivated')
    expect(approvedText(repl({ destination: 'member_exit' }), facts(), 'ZACK', 'Fair', '2026-10-10', true)).toBe('Replaced — KAR JUN left Fair, ZACK added to Fair')
    expect(approvedText(repl({}), facts(), 'ADRIAN', 'Fair', '2026-10-31', false)).toBe('Scheduled for 31 Oct 2026 — the system replaces them then')
  })

  it('shows the hourly run’s refusal, and nothing else, as a failure', () => {
    expect(runFailure('Could not run on 11 Oct 2026: Fair is full: 28 places, and this replacement would make 29.')).toMatch(/^Could not run on 11 Oct 2026: Fair is full/)
    expect(runFailure('Approved to run on 31 Oct 2026.')).toBeNull()
    expect(runFailure(undefined)).toBeNull()
  })

  it('refuses to send a bad request, successor or date', () => {
    const ok = { requestId: KAR, successorId: ADRIAN, effective: '2026-10-31' }
    expect(replacementRefusal(ok)).toBeNull()
    expect(replacementRefusal({ ...ok, successorId: null })).toBeNull()
    expect(replacementRefusal({ ...ok, requestId: 'nope' })).toBe('This request could not be found. Reload the page.')
    expect(replacementRefusal({ ...ok, successorId: 'nope' })).toBe('Choose who takes the seat again.')
    expect(replacementRefusal({ ...ok, effective: '' })).toBe('Choose the effective date.')
    expect(replacementRefusal({ ...ok, effective: '31/10/2026' })).toBe('Choose the effective date.')
  })

  it('tells a replacement’s history in the handoff’s words, the same-instant moves in order', () => {
    const at = '2026-10-10T08:00:00.000000+00:00'
    const steps = requestHistory(facts({
      successor: 'ADRIAN', effectiveOn: '2026-10-10',
      events: [
        { to: 'submitted', at: '2026-10-09T01:00:00Z', note: null, by: 'STANLEY' },
        { to: 'scheduled', at: '2026-10-09T05:00:00Z', note: 'Approved to run on 31 Oct 2026.', by: 'HR' },
        { to: 'submitted', at: '2026-10-09T06:00:00Z', note: 'Taken off the schedule.', by: 'HR' },
        // Approved for a date that has come: both moves at one instant, read back in either order.
        { to: 'executed', at, note: 'Replaced on 10 Oct 2026: KAR JUN left the company, ADRIAN took the seat.', by: null },
        { to: 'scheduled', at, note: 'Seat agreed with Stanley.', by: 'HR' },
      ],
    }), 'replacement')
    expect(steps.map(e => [e.what, e.by, e.note])).toEqual([
      ['Submitted', 'STANLEY', null],
      ['Approved · scheduled', 'HR', null],
      ['Taken off the schedule', 'HR', null],
      ['Approved · replaced by ADRIAN on 10 Oct 2026', 'HR', 'Seat agreed with Stanley.'],
      ['Replaced automatically', 'System', 'Replaced on 10 Oct 2026: KAR JUN left the company, ADRIAN took the seat.'],
    ])
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
  it('names each brand and gives it its chip colours', () => {
    expect(weekBrand('DUNLOP')?.name).toBe('Dunlopillo')
    expect(weekBrand('AKEMI')).toMatchObject({ fg: '189 74 25', bg: '255 240 228' })
    expect(weekBrand('AKEMI FRAGRANCE')).toBeNull()
  })
})
