import { describe, expect, it } from 'vitest'
import {
  dateWords, isPicCode, nameOk, picAnswered, picBanner, picPageFromRow, picRefusal, picStatus, picTimeline, reasonOk, type PicPage,
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
    expect(picBanner(page({ asked: { reason: 'Add Penang', at: 'x' } }))?.text).toBe('You asked: “Add Penang”')
    expect(picBanner(page({ status: 'approved' }))?.title).toBe('Approved')
    expect(picBanner(page({ status: 'changes' }))).toBeNull()
  })

  it('the progress: the meeting, the minutes sent, their approval, the work', () => {
    const states = (p: PicPage) => picTimeline(p).map(t => `${t.label}:${t.state}${t.date ? `:${t.date}` : ''}`)
    expect(states(page())).toEqual(['Kick-off meeting:done:23 Oct', 'Minutes sent to you:done:24 Oct', 'Your approval:cur', 'Work starts:next'])
    expect(states(page({ status: 'changes', reply: { decision: 'changes', name: 'Kelvin', reason: 'x', at: '2026-10-24T03:00:00Z' } }))[2])
      .toBe('The team is making your changes:cur')
    expect(states(page({ status: 'approved', reply: { decision: 'approved', name: 'Kelvin Tan', reason: '', at: '2026-10-25T02:00:00Z' } })).slice(2))
      .toEqual(['You approved the minutes:done:25 Oct', 'Work starts:cur'])
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
