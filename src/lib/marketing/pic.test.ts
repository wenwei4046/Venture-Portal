import { describe, expect, it } from 'vitest'
import {
  bothState, dateWords, isPicCode, nameOk, picAnswered, picBanner, picPageFromRow, picRefusal, picStatus, picTimeline, reasonOk, type PicPage,
  stageReasonOk, workLastLine, workState, workWaiting,
} from './pic'

// 2026-10-23 — the PIC's link (⑤-1, `PIC Link.dc.html`): what mkt_pic_page answers the stranger holding a product
// project's code, read; where it stands, why it waits again, the progress, the card after an answer, what an answer
// asks, and the refusals a stranger may read. The database's side is tests/member-sql/validate-marketing-pic-link.mjs.

function page(over: Record<string, unknown> = {}): PicPage {
  return picPageFromRow({
    today: '2026-10-24', sub: 'Carres', product: 'Social Media Package A', title: 'Carres · Social Media Package A · Oct 2026',
    track: 'MKT-CAR-2610-001', status: 'waiting_pic', owner: 'SIA', startedAt: '2026-10-23T01:00:00Z', sentAt: '2026-10-24T02:00:00Z',
    reply: null, updated: null, asked: null,
    minutes: { title: 'Kickoff', fields: [
      { name: 'Meeting date', type: 'Date', value: '2026-11-05' },
      { name: 'Attendees', type: 'People', value: ['SIA', 'Mei'] },
      { name: 'Objective', type: 'Long text', value: 'Year-end walk-ins' },
      { name: 'Posts', type: 'Number', value: null },
      { name: 'Shots', type: 'Table', value: { cols: ['Shot', 'Due'], rows: [['Opening', '2026-11-06'], ['', '']] } },
      { name: 'Ideas', type: 'Free space', value: { cols: ['Item'], rows: [['', '']] } },
      { name: 'Signatures', type: 'Signature', value: [] },
    ] },
    ...over,
  }) as PicPage
}

describe('the PIC’s page as it is read', () => {
  it('is closed for nothing, or a page without its project', () => {
    expect(picPageFromRow(null)).toBeNull()
    expect(picPageFromRow({ title: 'x' })).toBeNull()
  })

  it('reads the project and the minutes’ fields — an empty one as nothing, blank table rows dropped', () => {
    const p = page()
    expect([p.sub, p.product, p.track, p.status, p.owner]).toEqual(['Carres', 'Social Media Package A', 'MKT-CAR-2610-001', 'waiting_pic', 'SIA'])
    expect(p.minutes.fields.map(f => [f.name, f.value])).toEqual([
      ['Meeting date', '2026-11-05'],
      ['Attendees', ['SIA', 'Mei']],
      ['Objective', 'Year-end walk-ins'],
      ['Posts', null],
      ['Shots', { cols: ['Shot', 'Due'], rows: [['Opening', '2026-11-06']] }],
      ['Ideas', null],
      ['Signatures', null],
    ])
  })

  it('a link’s code is 32 hex, however it is typed', () => {
    expect([isPicCode('0123456789abcdef0123456789ABCDEF'), isPicCode('car-2610-014'), isPicCode('0123')]).toEqual([true, false, false])
  })

  it('a date as written, in words', () => {
    expect([dateWords('2026-11-05'), dateWords('next week')]).toEqual(['5 Nov 2026', 'next week'])
  })
})

describe('where it stands, for the PIC', () => {
  it('in the chip’s words', () => {
    expect((['waiting_pic', 'changes', 'approved', 'active'] as const).map(s => picStatus(s).label))
      .toEqual(['Waiting for your approval', 'Changes requested', 'Approved', 'In progress'])
  })

  it('the banner says why it waits for them — or that nothing does', () => {
    expect(picBanner(page())?.title).toBe('Waiting for your approval')
    expect(picBanner(page({ updated: { fields: 'Posts, Objective', at: 'x' } }))).toEqual({ tone: 'waiting',
      title: 'Updated after your approval — please review again', text: 'The team changed Posts, Objective.' })
    // The approval the edit took back was only the other PIC's (②b-2d-2b): never "after your approval".
    expect(picBanner(page({ you: 2, updated: { fields: 'Objective', at: 'x', mine: false, by: 'Kelvin Tan' } }))).toEqual({ tone: 'waiting',
      title: 'Updated — please review', text: 'The team changed Objective after Kelvin Tan approved.' })
    expect(picBanner(page({ asked: { reason: 'Add Penang', at: 'x' } }))?.text).toBe('You asked: “Add Penang”')
    expect(picBanner(page({ status: 'approved' }))?.title).toBe('Approved')
    expect(picBanner(page({ status: 'changes' }))).toBeNull()
    // Unanswered 4 working hours, it says so in red (2026-10-24 — the user's answer 2); an answer given never is.
    expect(picBanner(page(), true)).toEqual({ tone: 'red', title: 'Overdue — please review', text: 'The meeting minutes are ready. Please review them below.' })
    expect(picBanner(page({ asked: { reason: 'Add Penang', at: 'x' } }), true)).toMatchObject({ tone: 'red', title: 'Overdue — please review' })
    expect(picBanner(page({ status: 'approved' }), true)?.tone).toBe('done')
  })

  it('the progress: the meeting, the minutes sent, their approval, the work', () => {
    const states = (p: PicPage) => picTimeline(p).map(t => `${t.label}:${t.state}${t.date ? `:${t.date}` : ''}`)
    expect(states(page())).toEqual(['Kick-off meeting:done:23 Oct', 'Minutes sent to you:done:24 Oct', 'Your approval:cur', 'Work starts:next'])
    expect(states(page({ status: 'changes', reply: { decision: 'changes', name: 'Kelvin', reason: 'x', at: '2026-10-24T03:00:00Z' } }))[2])
      .toBe('The team is making your changes:cur')
    expect(states(page({ status: 'approved', reply: { decision: 'approved', name: 'Kelvin Tan', reason: '', at: '2026-10-25T02:00:00Z' } })).slice(2))
      .toEqual(['You approved the minutes:done:25 Oct', 'Work starts:cur'])
  })

  it('minutes that asked no sign-off never went to the PIC: the team completed them — never “sent to you”, never “you approved” (2026-10-24, the preview walk)', () => {
    const states = (p: PicPage) => picTimeline(p).map(t => `${t.label}:${t.state}${t.date ? `:${t.date}` : ''}`)
    const work = [{ id: 'd1', title: 'Banner', status: 'active', stages: 1, done: 0, stage: { idx: 0, name: 'Design', status: 'review', ver: 1, waiting: true, fields: [], links: [] } }]
    expect(states(page({ status: 'active', sentAt: null, work })))
      .toEqual(['Kick-off meeting:done:23 Oct', 'Minutes completed by the team:done', 'The work:cur'])
    // Sent once and answered: as before.
    expect(states(page({ status: 'active', reply: { decision: 'approved', name: 'Kelvin Tan', reason: '', at: '2026-10-25T02:00:00Z' }, work }))[2])
      .toBe('You approved the minutes:done:25 Oct')
  })

  it('after an answer, the card with its receipt — never for a reply that no longer stands', () => {
    expect(picAnswered(page({ status: 'approved', reply: { decision: 'approved', name: 'Kelvin Tan', reason: '', at: '2026-10-25T02:12:00Z' } })))
      .toEqual({ approved: true, title: 'Approved', text: 'You approved the meeting minutes. The team has been told.', quote: '',
        receipt: 'Signed by Kelvin Tan · 25 Oct 2026, 10:12' })
    const changes = picAnswered(page({ status: 'changes', reply: { decision: 'changes', name: 'Kelvin', reason: 'Add Penang', at: '2026-10-25T02:12:00Z' } }))
    expect([changes?.title, changes?.quote, changes?.receipt]).toEqual(['Changes sent', 'Add Penang', 'Sent 25 Oct 2026, 10:12'])
    expect(picAnswered(page({ reply: { decision: 'changes', name: 'Kelvin', reason: 'Add Penang', at: 'x' } }))).toBeNull()
    expect(picAnswered(page())).toBeNull()
  })
})

describe('an answer', () => {
  it('approving asks a full name; changes ask 5 to 500 characters', () => {
    expect([nameOk('Ke'), nameOk(' Kelvin '), nameOk('x'.repeat(81))]).toEqual([false, true, false])
    expect([reasonOk('abcd'), reasonOk('  Add Penang  '), reasonOk('x'.repeat(501))]).toEqual([false, true, false])
  })

  it('a stranger reads only the refusals written for them', () => {
    expect(picRefusal({ code: '22023', message: 'Nothing is waiting for your approval now.' }, 'fallback')).toBe('Nothing is waiting for your approval now.')
    expect(picRefusal({ code: '42501', message: 'permission denied for function mkt_pic_answer' }, 'fallback')).toBe('fallback')
    expect(picRefusal({ code: '23514', message: 'new row violates check constraint "mkt_minutes_check"' }, 'fallback')).toBe('fallback')
    expect(picRefusal(null, 'fallback')).toBe('fallback')
  })
})

describe('the work on the PIC’s link (②b-2d)', () => {
  const w = (over: Record<string, unknown>) => page({ status: 'active', work: [{ id: 'd1', title: 'Poster 1/2', status: 'active', stages: 2, done: 0,
    stage: { idx: 0, name: 'Design', status: 'accepted', ver: 0, waiting: false, fields: [{ name: 'Due', type: 'Date', value: '2026-11-05' }, { name: 'OK', type: 'Checkbox', value: false }], links: [] }, last: null, ...over }] }).work[0]
  it('says where each deliverable stands, in the PIC’s words', () => {
    expect(workState(w({}), '2026-10-24')).toEqual({ label: 'In progress · Design', tone: 'draft' })
    expect(workState(w({ startsOn: '2026-11-02' }), '2026-10-24')).toEqual({ label: 'Starts 2 Nov', tone: 'draft' })
    expect(workState(w({ stage: { name: 'Design', status: 'review', ver: 1, waiting: true } }), '2026-10-24')).toEqual({ label: 'Waiting for your approval', tone: 'waiting' })
    expect(workState(w({ status: 'done' }), '2026-10-24')).toEqual({ label: 'Done', tone: 'done' })
    expect(workState(w({ stage: { name: 'Design', status: 'changes', ver: 1, waiting: false }, last: { action: 'pic changes', name: 'Kelvin (PIC)', reason: 'Bigger', stage: 'Design', version: 'v1', at: 'x' } }), '2026-10-24'))
      .toEqual({ label: 'The team is making your changes', tone: 'draft' })
    expect(w({}).stage?.fields.map(f => f.value)).toEqual(['5 Nov 2026', null]) // a date in words; a box not ticked is nothing yet
  })
  it('counts what waits for them, and the progress says so', () => {
    const p = page({ status: 'active', reply: { decision: 'approved', name: 'Kelvin', reason: '', at: '2026-10-24T03:00:00Z' }, work: [
      { id: 'a', title: 'A', status: 'done', stages: 1, done: 1 }, { id: 'b', title: 'B', status: 'active', stages: 2, done: 1, stage: { name: 'X', status: 'review', ver: 1, waiting: true } },
    ] })
    expect(workWaiting(p.work)).toBe(1)
    expect(picTimeline(p).at(-1)).toEqual({ label: 'The work', state: 'cur', date: '', sub: '1 of 2 done · 1 waiting for you' })
    expect([stageReasonOk('meh'), stageReasonOk('Bigger logo'), stageReasonOk('x'.repeat(1001))]).toEqual([false, true, false])
  })
})

describe('two PICs, each their own link — either one’s answer counts (②b-2d-2a, the user’s answer 29)', () => {
  const kelvin = { decision: 'approved', name: 'Kelvin Tan', reason: '', at: '2026-10-25T02:12:00Z', pic: 1 }
  const asHana = (over: Record<string, unknown>) => page({ you: 2, pic: 'Hana Lee', other: 'Kelvin Tan', ...over })

  it('reads whose link it is, and the other PIC; an answer from before two PICs is the first’s', () => {
    const p = asHana({})
    expect([p.you, p.pic, p.other]).toEqual([2, 'Hana Lee', 'Kelvin Tan'])
    expect(page({ reply: { decision: 'approved', name: 'Kelvin', reason: '', at: null } }).reply?.pic).toBe(1)
    expect([page().you, page().other]).toEqual([1, null])
  })

  it('the minutes approved by the other PIC: said in their name, never “You approved”', () => {
    expect(picAnswered(asHana({ status: 'approved', reply: kelvin }))?.text).toBe('Kelvin Tan approved the meeting minutes. The team has been told.')
    expect(picAnswered(page({ status: 'approved', reply: kelvin }))?.text).toBe('You approved the meeting minutes. The team has been told.')
    expect(picTimeline(asHana({ status: 'approved', reply: kelvin }))[2].label).toBe('Kelvin Tan approved the minutes')
  })

  it('the other PIC’s changes: whose notes the team has; resent, whose words the banner quotes', () => {
    const changes = { decision: 'changes', name: 'Kelvin', reason: 'Add Penang', at: '2026-10-25T02:12:00Z', pic: 1 }
    expect(picAnswered(asHana({ status: 'changes', reply: changes }))?.text).toMatch(/^The team has Kelvin’s notes/)
    expect(picTimeline(asHana({ status: 'changes', reply: changes }))[2].label).toBe('The team is making Kelvin’s changes')
    expect(picBanner(asHana({ status: 'waiting_pic', reply: changes, asked: { reason: 'Add Penang', at: null } }))?.text).toBe('Kelvin asked: “Add Penang”')
    expect(picBanner(page({ status: 'waiting_pic', reply: changes, asked: { reason: 'Add Penang', at: null } }))?.text).toBe('You asked: “Add Penang”')
  })

  it('a stage answered by the other PIC: the line and the state name them', () => {
    const last = { action: 'pic changes', name: 'Kelvin Tan (PIC)', reason: 'Bigger', stage: 'Design', version: 'v1', at: '2026-10-25T02:12:00Z', pic: 1 }
    const p = asHana({ status: 'active', work: [{ id: 'd1', title: 'Poster', status: 'active', stages: 1, done: 0, stage: { name: 'Design', status: 'changes', ver: 1, waiting: false }, last }] })
    expect(workState(p.work[0], '2026-10-24', p.you)).toEqual({ label: 'The team is making Kelvin Tan’s changes', tone: 'draft' })
    expect(workLastLine(p.work[0].last!, p.you)).toBe('Kelvin Tan asked for changes on Design: “Bigger” · 25 Oct 2026, 10:12')
    expect(workLastLine({ ...p.work[0].last!, action: 'pic approved', name: 'Hana Lee (PIC)', pic: 2 }, p.you)).toBe('You approved Design v1 · signed by Hana Lee · 25 Oct 2026, 10:12')
  })
})

describe('an approval that asks both PICs (②b-2d-2b, the user’s answer 29)', () => {
  const ok1 = { '1': { name: 'Kelvin Tan', at: '2026-10-25T02:00:00Z' } }
  it('says whose approval is in for the link’s PIC — theirs (it waits for the other) or the other’s (it waits for them)', () => {
    expect(bothState(true, ok1, 1, 'Hana Lee')).toEqual({ mine: true, other: 'Hana Lee' })
    expect(bothState(true, ok1, 2, 'Kelvin')).toEqual({ mine: false, theirs: 'Kelvin Tan' })
    expect([bothState(false, ok1, 1, 'Hana Lee'), bothState(true, null, 1, 'Hana Lee')]).toEqual([null, null])
  })
  it('the minutes: the banner, the progress and the chip-less wait for the PIC whose approval is in', () => {
    const mine = page({ you: 1, pic: 'Kelvin', other: 'Hana Lee', both: true, ok: ok1 })
    expect(picBanner(mine)).toEqual({ tone: 'waiting', title: 'Waiting for Hana Lee', text: 'You approved the minutes. They go ahead once Hana Lee approves too.' })
    expect(picTimeline(mine)[2]).toEqual({ label: 'Waiting for Hana Lee', state: 'cur', date: '', sub: 'You approved the minutes' })
    const theirs = page({ you: 2, pic: 'Hana Lee', other: 'Kelvin', both: true, ok: ok1 })
    expect(picBanner(theirs)?.text).toBe('Kelvin Tan approved the minutes. They go ahead once you approve too.')
    expect(picTimeline(theirs)[2].sub).toBe('Kelvin Tan approved — waiting for you')
  })
  it('the minutes both approved: each reads “You and <the other>”, never the last one alone (found on the preview walk)', () => {
    const both = { both: true, ok: { ...ok1, '2': { name: 'Hana Lee', at: '2026-10-25T02:10:00Z' } }, status: 'approved',
      reply: { decision: 'approved', name: 'Kelvin Tan', reason: '', at: '2026-10-25T02:12:00Z', pic: 1 } }
    const hana = page({ you: 2, pic: 'Hana Lee', other: 'Kelvin', ...both })
    expect(picAnswered(hana)).toMatchObject({ text: 'You and Kelvin Tan approved the meeting minutes. The team has been told.',
      receipt: expect.stringMatching(/^Signed by Kelvin Tan and Hana Lee · /) })
    expect(picTimeline(hana)[2].label).toBe('You and Kelvin Tan approved the minutes')
    expect(picAnswered(page({ you: 1, pic: 'Kelvin', other: 'Hana Lee', ...both }))?.text).toBe('You and Hana Lee approved the meeting minutes. The team has been told.')
    // Either PIC's counted (one approval kept): as before.
    expect(picAnswered(page({ you: 2, other: 'Kelvin', ...both, both: false }))?.text).toBe('Kelvin Tan approved the meeting minutes. The team has been told.')
  })
  it('a stage: waiting no longer for the PIC whose approval is in — for the other', () => {
    const p = page({ you: 1, other: 'Hana Lee', status: 'active', work: [{ id: 'd1', title: 'Poster', status: 'active', stages: 1, done: 0,
      stage: { name: 'Design', status: 'review', ver: 2, waiting: false, both: true, ok: ok1 } }] })
    expect([p.work[0].stage?.both, Object.keys(p.work[0].stage?.ok ?? {})]).toEqual([true, ['1']])
    expect(workState(p.work[0], '2026-10-24', p.you, p.other)).toEqual({ label: 'Waiting for Hana Lee', tone: 'waiting' })
  })
})
