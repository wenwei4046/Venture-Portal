import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { picPageFromRow, type PicPage as Page } from '@/lib/marketing/pic'

// 2026-10-23 — the PIC's link (⑤-1, `PIC Link.dc.html`) for the subsidiary's PIC, who has no login: they read the
// minutes, approve with their full name or ask for changes in their words, and see the receipt. Walked against the one
// call it makes (lib/marketing/pic-actions.ts; the database's side is tests/member-sql/validate-marketing-pic-link.mjs).

const answerPic = vi.hoisted(() => vi.fn())
const answerPicStage = vi.hoisted(() => vi.fn())
vi.mock('@/lib/marketing/pic-actions', () => ({ answerPic, answerPicStage }))

import PicPage from './PicPage'

const CODE = '0123456789abcdef0123456789abcdef'
function page(over: Record<string, unknown> = {}): Page {
  return picPageFromRow({
    today: '2026-10-24', sub: 'Carres', product: 'Social Media Package A', title: 'Carres · Social Media Package A · Oct 2026',
    track: 'MKT-CAR-2610-001', status: 'waiting_pic', owner: 'Rachel', startedAt: '2026-10-23T01:00:00Z', sentAt: '2026-10-24T02:00:00Z',
    reply: null, updated: null, asked: null,
    minutes: { title: 'Kickoff', fields: [
      { name: 'Meeting date', type: 'Date', value: '2026-11-05' },
      { name: 'Objective', type: 'Long text', value: 'Year-end walk-ins' },
      { name: 'Shots', type: 'Table', value: { cols: ['Shot', 'Due'], rows: [['Opening', '6 Nov']] } },
    ] },
    ...over,
  }) as Page
}

beforeEach(() => {
  answerPic.mockReset()
  answerPicStage.mockReset()
})

describe('the PIC’s link', () => {
  it('a code that is nobody’s: closed, and nothing more', () => {
    render(<PicPage code="nope" initial={null} />)
    expect(screen.getByText('This link is closed')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the minutes they are asked to approve, and who to ask', () => {
    render(<PicPage code={CODE} initial={page()} />)
    expect(screen.getByRole('heading', { name: 'Carres · Social Media Package A · Oct 2026' })).toBeTruthy()
    expect(screen.getAllByText('Waiting for your approval')).toHaveLength(2)
    expect(screen.getByText('Needs your approval')).toBeTruthy()
    expect(screen.getByText('5 Nov 2026')).toBeTruthy()
    expect(screen.getByText('Year-end walk-ins')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Shot' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'Opening' })).toBeTruthy()
    expect(screen.getByText(/Reply to Rachel on WhatsApp\. This link is private to Carres/)).toBeTruthy()
  })

  it('approves with their full name, then shows the receipt', async () => {
    render(<PicPage code={CODE} initial={page()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    const confirm = screen.getByRole('button', { name: 'Confirm approval' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Full name' }), { target: { value: 'Ke' } })
    expect(confirm).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Full name' }), { target: { value: 'Kelvin Tan' } })
    answerPic.mockResolvedValue({ ok: true, page: page({ status: 'approved', reply: { decision: 'approved', name: 'Kelvin Tan', reason: '', at: '2026-10-25T02:12:00Z' } }) })
    await act(async () => {
      fireEvent.click(confirm)
    })
    await waitFor(() => expect(answerPic).toHaveBeenCalledWith(CODE, 'approve', 'Kelvin Tan', ''))
    expect(await screen.findByText('Signed by Kelvin Tan · 25 Oct 2026, 10:12')).toBeTruthy()
    expect(screen.getByText('Requirements')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('asks for changes in their words — 5 characters at least', async () => {
    render(<PicPage code={CODE} initial={page()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }))
    const send = screen.getByRole('button', { name: 'Send to the team' })
    fireEvent.change(screen.getByRole('textbox', { name: 'What should change' }), { target: { value: 'Add' } })
    expect(send).toHaveProperty('disabled', true)
    expect(screen.getByText('Required')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'What should change' }), { target: { value: 'Add Penang, start 5 Nov' } })
    expect(screen.getByText('Ready to send')).toBeTruthy()
    answerPic.mockResolvedValue({ ok: true, page: page({ status: 'changes', reply: { decision: 'changes', name: 'Kelvin', reason: 'Add Penang, start 5 Nov', at: '2026-10-25T02:12:00Z' } }) })
    await act(async () => {
      fireEvent.click(send)
    })
    await waitFor(() => expect(answerPic).toHaveBeenCalledWith(CODE, 'changes', '', 'Add Penang, start 5 Nov'))
    expect(await screen.findByText('Changes sent')).toBeTruthy()
    expect(screen.getByText('“Add Penang, start 5 Nov”')).toBeTruthy()
    expect(screen.getByText('The team is making your changes')).toBeTruthy()
  })

  it('says why when the answer is refused', async () => {
    render(<PicPage code={CODE} initial={page()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Full name' }), { target: { value: 'Kelvin Tan' } })
    answerPic.mockResolvedValue({ ok: false, reason: 'Nothing is waiting for your approval now.' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }))
    })
    expect((await screen.findByRole('alert')).textContent).toBe('Nothing is waiting for your approval now.')
  })

  it('waiting again: says what the team changed after they approved, or what they asked', () => {
    const { unmount } = render(<PicPage code={CODE} initial={page({ updated: { fields: 'Objective', at: 'x' } })} />)
    expect(screen.getByText('Updated after your approval — please review again')).toBeTruthy()
    expect(screen.getByText('The team changed Objective.')).toBeTruthy()
    unmount()
    render(<PicPage code={CODE} initial={page({ asked: { reason: 'Add Penang', at: 'x' }, reply: { decision: 'changes', name: 'Kelvin', reason: 'Add Penang', at: 'x' } })} />)
    expect(screen.getByText('You asked: “Add Penang”')).toBeTruthy()
    expect(screen.queryByText('Changes sent')).toBeNull()
  })
})

describe('the work on the PIC’s link (②b-2d)', () => {
  const work = (over: Record<string, unknown> = {}) => ({
    id: 'd1', title: 'Image post 1/2', status: 'active', startsOn: '2026-10-24', stages: 2, done: 0,
    stage: { idx: 0, name: 'Design', status: 'review', ver: 2, waiting: true, note: 'Check the logo size',
      fields: [{ name: 'Final image', type: 'File', value: 'https://canva.com/final' }, { name: 'Post day', type: 'Date', value: '2026-11-07' },
        { name: 'Approved by legal', type: 'Checkbox', value: true }, { name: 'Caption', type: 'Text', value: null }],
      links: [{ url: 'https://canva.com/draft', label: 'Draft' }, { url: 'javascript:alert(1)', label: 'x' }] },
    last: null, ...over,
  })
  const running = (items: object[]) => page({ status: 'active', reply: { decision: 'approved', name: 'Kelvin Tan', reason: '', at: '2026-10-24T03:00:00Z' }, work: items })

  it('lists the work, the one waiting first and opened — only what they may see of it', () => {
    render(<PicPage code={CODE} initial={running([
      work({ id: 'd2', title: 'Image post 2/2', stage: { idx: 0, name: 'Design', status: 'accepted', ver: 0, waiting: false, fields: [], links: [] } }),
      work(),
    ])} />)
    const card = screen.getByRole('region', { name: 'The work' })
    expect(card.textContent).toContain('Needs your approval')
    expect(card.textContent).toContain('0/2 done')
    const items = [...card.querySelectorAll('[aria-label]')].map(x => x.getAttribute('aria-label'))
    expect(items).toEqual(['Image post 1/2', 'Image post 2/2'])
    expect(screen.getByText('Design · version 2')).toBeTruthy()
    expect(screen.getByText('Check the logo size')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'https://canva.com/final' }).getAttribute('href')).toBe('https://canva.com/final')
    expect(screen.getByText('7 Nov 2026')).toBeTruthy()
    expect(screen.getByText('Yes')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Draft' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'x' })).toBeNull() // only a web link
    expect(screen.getByText('In progress · Design')).toBeTruthy()
    expect(screen.getByText('0 of 2 done · 1 waiting for you')).toBeTruthy()
  })

  it('a stage’s files they see (②b-2e): under their field, or with its links — each opened on its own route of the link', () => {
    const files = [
      { key: '30000000-0000-4000-8000-000000000001', name: 'final.png', size: 2048, mime: 'image/png', field: 'Caption' },
      { key: '30000000-0000-4000-8000-000000000003', name: 'Moodboard.pdf', size: 51200, mime: 'application/pdf', field: null },
    ]
    const base = work()
    render(<PicPage code={CODE} initial={running([work({ stage: { ...base.stage, files } })])} />)
    const final = screen.getByRole('link', { name: '📎 final.png' })
    expect(final.getAttribute('href')).toBe(`/t/${CODE}/f/30000000-0000-4000-8000-000000000001`)
    expect(final.closest('div')?.textContent).toContain('Caption')
    expect(screen.getByText('2 KB')).toBeTruthy()
    expect(screen.getByRole('link', { name: '📎 Moodboard.pdf · 50 KB' }).getAttribute('href')).toBe(`/t/${CODE}/f/30000000-0000-4000-8000-000000000003`)
  })

  it('approves a stage with their full name, on the version they read', async () => {
    render(<PicPage code={CODE} initial={running([work()])} />)
    const item = screen.getByLabelText('Image post 1/2')
    fireEvent.click(within(item).getByRole('button', { name: 'Approve' }))
    fireEvent.change(within(item).getByRole('textbox', { name: 'Full name' }), { target: { value: 'Kelvin Tan' } })
    answerPicStage.mockResolvedValue({ ok: true, page: running([work({ done: 1, stage: { idx: 1, name: 'Caption', status: 'todo', ver: 0, waiting: false, fields: [], links: [] },
      last: { action: 'pic approved', name: 'Kelvin Tan (PIC)', reason: null, stage: 'Design', version: 'v2', at: '2026-10-24T05:00:00Z' } })]) })
    await act(async () => {
      fireEvent.click(within(item).getByRole('button', { name: 'Confirm approval' }))
    })
    await waitFor(() => expect(answerPicStage).toHaveBeenCalledWith(CODE, 'd1', 2, 'approve', 'Kelvin Tan', ''))
    expect(await screen.findByText('You approved Design v2 · signed by Kelvin Tan · 24 Oct 2026, 13:00')).toBeTruthy()
    expect(screen.getByText('In progress · Caption')).toBeTruthy()
  })

  it('asks for changes in their words — and a refusal says why', async () => {
    render(<PicPage code={CODE} initial={running([work()])} />)
    const item = screen.getByLabelText('Image post 1/2')
    fireEvent.click(within(item).getByRole('button', { name: 'Request changes' }))
    const sendBtn = within(item).getByRole('button', { name: 'Send to the team' })
    fireEvent.change(within(item).getByRole('textbox', { name: 'What should change' }), { target: { value: 'big' } })
    expect(sendBtn).toHaveProperty('disabled', true)
    fireEvent.change(within(item).getByRole('textbox', { name: 'What should change' }), { target: { value: 'Make the logo bigger' } })
    answerPicStage.mockResolvedValue({ ok: false, reason: 'The team sent a newer version since you opened this page — reload it to see.' })
    await act(async () => {
      fireEvent.click(sendBtn)
    })
    expect(await within(item).findByRole('alert')).toBeTruthy()
    expect(answerPicStage).toHaveBeenCalledWith(CODE, 'd1', 2, 'changes', '', 'Make the logo bigger')
  })
})

describe('two PICs — the second one’s link (②b-2d-2a, the user’s answer 29)', () => {
  it('the minutes and a stage answered by the first PIC: said in their name, never “You”', () => {
    render(<PicPage code={CODE} initial={page({
      you: 2, pic: 'Hana Lee', other: 'Kelvin Tan', status: 'active',
      reply: { decision: 'approved', name: 'Kelvin Tan', reason: '', at: '2026-10-24T03:00:00Z', pic: 1 },
      work: [{ id: 'd1', title: 'Image post 1/2', status: 'active', stages: 2, done: 1,
        stage: { idx: 1, name: 'Caption', status: 'todo', ver: 0, waiting: false, fields: [], links: [] },
        last: { action: 'pic approved', name: 'Kelvin Tan (PIC)', reason: null, stage: 'Design', version: 'v2', at: '2026-10-24T05:00:00Z', pic: 1 } }],
    })} />)
    expect(screen.getByText('Kelvin Tan approved the meeting minutes. The team has been told.')).toBeTruthy()
    expect(screen.getByText('Kelvin Tan approved the minutes')).toBeTruthy()
    expect(screen.getByText('Kelvin Tan approved Design v2 · signed by Kelvin Tan · 24 Oct 2026, 13:00')).toBeTruthy()
    expect(screen.queryByText(/^You approved/)).toBeNull()
  })
})

describe('an approval asking both PICs (②b-2d-2b, the user’s answer 29)', () => {
  const ok1 = { '1': { name: 'Kelvin Tan', at: '2026-10-24T03:00:00Z' } }
  it('the minutes, the first PIC’s approval in: they read whom it waits for, and have nothing more to answer', () => {
    render(<PicPage code={CODE} initial={page({ you: 1, pic: 'Kelvin', other: 'Hana Lee', both: true, ok: ok1 })} />)
    expect(screen.getAllByText('Waiting for Hana Lee').length).toBeGreaterThan(0)
    expect(screen.getByText('You approved the minutes. They go ahead once Hana Lee approves too.')).toBeTruthy()
    expect(screen.getByText('You approved · waiting for Hana Lee')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })
  it('…the second PIC reads the first’s approval in, and answers', () => {
    render(<PicPage code={CODE} initial={page({ you: 2, pic: 'Hana Lee', other: 'Kelvin', both: true, ok: ok1 })} />)
    expect(screen.getByText('Kelvin Tan approved the minutes. They go ahead once you approve too.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
  })
  it('a stage: the other PIC’s approval of this version shown above the answer', () => {
    render(<PicPage code={CODE} initial={page({ you: 2, pic: 'Hana Lee', other: 'Kelvin', status: 'active',
      reply: { decision: 'approved', name: 'Kelvin Tan', reason: '', at: '2026-10-24T03:00:00Z', pic: 1 },
      work: [{ id: 'd1', title: 'Image post 1/2', status: 'active', stages: 1, done: 0,
        stage: { idx: 0, name: 'Design', status: 'review', ver: 2, waiting: true, both: true, ok: ok1, fields: [], links: [] }, last: null }] })} />)
    expect(screen.getByText('Kelvin Tan approved this version — waiting for you')).toBeTruthy()
    expect(within(screen.getByLabelText('Image post 1/2')).getByRole('button', { name: 'Approve' })).toBeTruthy()
  })
})

// 2026-10-25 — ②a-5: a task whose stages the PIC approves on its link, its minutes not theirs (the user's answer 52).
describe('a task’s link for its stages alone', () => {
  const task = () => page({ kind: 'quick', product: '', title: 'Raya visual', track: 'TSK-CAR-2610-007', status: 'active', sentAt: null, minutes: null,
    work: [{ id: 't1', title: 'Raya visual', status: 'active', stages: 2, done: 0,
      stage: { idx: 0, name: 'Design', status: 'review', ver: 1, waiting: true, note: 'Check the logo size', fields: [], links: [] }, last: null }] })

  it('no minutes card: the stage waiting for them, its answer — the task started, its work', () => {
    render(<PicPage code={CODE} initial={task()} />)
    expect(screen.getByText('Carres · Quick task')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Meeting minutes' })).toBeNull()
    const item = screen.getByLabelText('Raya visual', { selector: 'div' })
    expect(within(item).getByText('Design · version 1')).toBeTruthy()
    expect(within(item).getByRole('button', { name: 'Approve' })).toBeTruthy()
    const progress = screen.getByRole('region', { name: 'Progress' })
    expect(progress.textContent).toContain('Started')
    expect(progress.textContent).toContain('0 of 1 done · 1 waiting for you')
    expect(progress.textContent).not.toContain('Minutes')
  })
})

// 2026-10-25 — ⑤-3b: the Ads reports the Ads person published (the user's answer 57), on the PIC's link — the handoff's
// *Reports · Every 2 weeks*, each its period and its figures against the targets it was published with.
describe('its Ads reports', () => {
  const ads = {
    every: '2w', figures: ['spendToDate', 'cpl', 'appt', 'roas'],
    reports: [
      { no: 2, from: '2026-10-20', until: '2026-11-02', values: { roas: 3.2, spendToDate: 3240, cpl: 18.4, appt: 46, apptRate: 26 },
        targets: { budget: 6000, cpl: 20, roas: 3, apptRate: 25 }, note: 'Google ads added by hand', at: '2026-11-03T02:00:00Z' },
      { no: 1, from: '2026-10-06', until: '2026-10-19', values: { spendToDate: 1410, cpl: 22.1, appt: 17, roas: 2.7 },
        targets: { budget: 6000, cpl: 20, roas: 3, apptRate: 25 }, note: null, at: '2026-10-20T02:00:00Z' },
    ],
  }

  it('reads each, the newest first — its figures in the setup’s order, each against its target', () => {
    render(<PicPage code={CODE} initial={page({ status: 'active', ads })} />)
    const card = screen.getByRole('region', { name: 'Reports' })
    expect(within(card).getByText('Every 2 weeks')).toBeTruthy()
    const reports = [...card.querySelectorAll('[class*="repHead"]')].map(h => h.textContent)
    expect(reports).toEqual(['Report #220 Oct – 2 NovPDF', 'Report #16 – 19 OctPDF'])
    // Its PDF at each head's right (⑤-3e — the handoff's), read from the link itself.
    expect(within(card).getByRole('link', { name: 'Report #2 as a PDF' }).getAttribute('href')).toBe(`/t/${CODE}/r/2`)
    expect(within(card).getByRole('link', { name: 'Report #1 as a PDF' }).getAttribute('href')).toBe(`/t/${CODE}/r/1`)
    const first = card.querySelectorAll('[class*="repFigs"]')[0] as HTMLElement
    expect([...first.querySelectorAll('[class*="repLabel"]')].map(l => l.textContent)).toEqual(['Spend so far', 'Cost per lead', 'Appointments', 'ROAS', 'Appointment rate'])
    expect(within(first).getByText('RM 3,240')).toBeTruthy()
    expect(within(first).getByText('of RM 6,000 budget')).toBeTruthy()
    expect(within(first).getByText('Target RM 20 · on target').className).toMatch(/repGood/)
    expect(within(card).getByText('Min 3.0 · below').className).toMatch(/repBad/)
    expect(within(card).getByText('Google ads added by hand')).toBeTruthy()
  })

  it('none published, or no Ads report: no Reports card', () => {
    const { unmount } = render(<PicPage code={CODE} initial={page({ status: 'active', ads: { ...ads, reports: [] } })} />)
    expect(screen.queryByRole('region', { name: 'Reports' })).toBeNull()
    unmount()
    render(<PicPage code={CODE} initial={page({ status: 'active' })} />)
    expect(screen.queryByRole('region', { name: 'Reports' })).toBeNull()
  })
})
