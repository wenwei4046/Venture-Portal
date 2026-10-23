import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { reviewLogFromRow } from '@/lib/marketing/chat-review'

// 2026-10-24 — ⑦-3b: Chat review (the user's answer 35, amended): the two people and the reason first, the chat opened read
// only — the first of the two on the left — older messages on asking, every opening a record listed under it. The
// database's side: tests/member-sql/validate-marketing-chat-review.mjs; the wording, lib/marketing/chat-review.test.ts.

const actions = vi.hoisted(() => ({ openMktChatReview: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)
const reads = vi.hoisted(() => ({ readChatReviewMore: vi.fn() }))
vi.mock('./review-read', () => reads)
const flash = vi.hoisted(() => vi.fn())
vi.mock('@/components/hrv/toast', () => ({ flash }))

import ChatReview from './ChatReview'

const MEI = '00000000-0000-4000-8000-000000000012', ALI = '00000000-0000-4000-8000-000000000013', SITI = '00000000-0000-4000-8000-000000000015'
const AT = '2026-10-24T01:12:00Z'
const PEOPLE = [
  { staff: ALI, name: 'ALI HASSAN', first: 'Ali', title: 'GRAPHIC DESIGNER' },
  { staff: MEI, name: 'MEI LING TAN', first: 'Mei', title: 'VIDEOGRAPHER' },
  { staff: SITI, name: 'SITI AMINAH', first: 'Siti', title: null },
]
const record = (id: number, by: string, reason: string) => ({
  id, at: AT, by, reason, a: { staff: MEI, name: 'MEI LING TAN' }, b: { staff: ALI, name: 'ALI HASSAN' },
})
const m = (id: number, from: string, first: string, body: string) => ({ id, from, first, body, project: null, at: AT })

beforeEach(() => vi.clearAllMocks())

describe('the reason first', () => {
  it('two people and a reason, or it says why not — in the database’s words', async () => {
    render(<ChatReview log={reviewLogFromRow({ people: PEOPLE, reviews: [] })} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Chat review')
    const first = screen.getByRole('combobox', { name: 'The first person' })
    expect(within(first).getAllByRole('option').map(o => o.textContent)).toEqual(['Pick a person', 'Ali · GRAPHIC DESIGNER', 'Mei · VIDEOGRAPHER', 'Siti'])
    expect(screen.getByText('No records yet')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Open chat' }))
    expect(flash).toHaveBeenLastCalledWith('Pick the two people whose chat it is.')
    fireEvent.change(first, { target: { value: MEI } })
    const second = screen.getByRole('combobox', { name: 'The second person' })
    expect((within(second).getByRole('option', { name: 'Mei · VIDEOGRAPHER' }) as HTMLOptionElement).disabled).toBe(true)
    fireEvent.change(second, { target: { value: ALI } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: ' Complaint ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open chat' }))
    expect(flash).toHaveBeenLastCalledWith('Say why you are opening it — 10 characters at least.')
    expect(actions.openMktChatReview).not.toHaveBeenCalled()

    actions.openMktChatReview.mockResolvedValueOnce({ ok: false, reason: 'Only a full-access title’s own login opens a direct message on a complaint.' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: '  Ali’s complaint,\n about late messages ' } })
    await act(async () => { fireEvent.keyDown(screen.getByRole('textbox', { name: 'Reason' }), { key: 'Enter' }) })
    expect(actions.openMktChatReview).toHaveBeenCalledWith(MEI, ALI, 'Ali’s complaint, about late messages')
    expect(flash).toHaveBeenLastCalledWith('Only a full-access title’s own login opens a direct message on a complaint.')
    expect(screen.queryByRole('log')).toBeNull()
  })
})

describe('the chat opened', () => {
  it('read only, the first of the two on the left; logged; older messages on asking; its record under it at once', async () => {
    render(<ChatReview log={reviewLogFromRow({ people: PEOPLE, reviews: [record(1, 'LOKE KAI YEE', 'An earlier look')] })} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'The first person' }), { target: { value: ALI } })
    fireEvent.change(screen.getByRole('combobox', { name: 'The second person' }), { target: { value: MEI } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Ali’s complaint about late messages' } })
    actions.openMktChatReview.mockResolvedValueOnce({
      ok: true,
      open: {
        review: record(2, 'LOO WEN WEI', 'Ali’s complaint about late messages'),
        messages: [m(57, MEI, 'Mei', 'Are you free tonight?'), m(58, ALI, 'Ali', 'Please stop messaging me after work')],
        more: true,
      },
    })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open chat' })) })

    const opened = screen.getByRole('region', { name: 'The chat opened' })
    expect(within(opened).getByText('Mei ↔ Ali')).toBeTruthy()
    expect(within(opened).getByText('Logged')).toBeTruthy()
    expect(within(opened).getByText('24 Oct 2026, 09:12 · LOO WEN WEI')).toBeTruthy()
    const log = screen.getByRole('log', { name: 'Their messages' })
    expect([...log.querySelectorAll('[data-side]')].map(e => [e.getAttribute('data-side'), e.textContent?.includes('tonight') ? 'Mei' : 'Ali']))
      .toEqual([['a', 'Mei'], ['b', 'Ali']])
    expect(screen.queryByRole('textbox')).toBeNull()

    // Its record at once, newest first — before the page's own read has it.
    const rows = within(screen.getByRole('region', { name: 'Records' })).getAllByRole('row').slice(1)
    expect(rows.map(r => within(r).getAllByRole('cell').map(c => c.textContent))).toEqual([
      ['24 Oct 2026, 09:12', 'LOO WEN WEI', 'MEI LING TAN ↔ ALI HASSAN', 'Ali’s complaint about late messages'],
      ['24 Oct 2026, 09:12', 'LOKE KAI YEE', 'MEI LING TAN ↔ ALI HASSAN', 'An earlier look'],
    ])

    reads.readChatReviewMore.mockResolvedValueOnce({ messages: [m(3, MEI, 'Mei', 'Hello')], more: false })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Earlier messages' })) })
    expect(reads.readChatReviewMore).toHaveBeenCalledWith(2, 57)
    expect(within(log).getAllByText(/^(Hello|Are you free tonight\?)$/).map(e => e.textContent)).toEqual(['Hello', 'Are you free tonight?'])
    expect(screen.queryByRole('button', { name: 'Earlier messages' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close the chat' }))
    expect(screen.getByRole('region', { name: 'Open a chat' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Reason' }) as HTMLInputElement).value).toBe('')
  })

  it('an hour on, older messages need it opened again — said in the database’s words', async () => {
    render(<ChatReview log={reviewLogFromRow({ people: PEOPLE, reviews: [] })} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'The first person' }), { target: { value: MEI } })
    fireEvent.change(screen.getByRole('combobox', { name: 'The second person' }), { target: { value: ALI } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Ali’s complaint about late messages' } })
    actions.openMktChatReview.mockResolvedValueOnce({ ok: true, open: { review: record(3, 'LOO WEN WEI', 'x'.repeat(12)), messages: [m(9, MEI, 'Mei', 'Hi')], more: true } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open chat' })) })
    reads.readChatReviewMore.mockResolvedValueOnce({ reason: 'Open the chat again, with its reason — one stays open for an hour.' })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Earlier messages' })) })
    expect(flash).toHaveBeenLastCalledWith('Open the chat again, with its reason — one stays open for an hour.')
    expect(screen.getByRole('button', { name: 'Earlier messages' })).toBeTruthy()
  })
})
