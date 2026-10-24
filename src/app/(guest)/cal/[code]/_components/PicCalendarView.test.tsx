import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { picCalendarFromRow, type PicCalendar } from '@/lib/marketing/pic-calendar'
import PicCalendarView from './PicCalendarView'

// 2026-10-24 — ⑤-2: the PIC's own calendar page (`PIC Calendar.dc.html`): closed for a code that is nobody's; the
// subsidiary, whom it is shared with, what waits for their approval; List (the phone's) and Month (the desktop's) — each
// item opening its tracking page, the PIC's own link — Key dates on and off, the months it holds. The reckoning is
// lib/marketing/pic-calendar.test.ts's.

const C1 = 'c'.repeat(32)
const C2 = 'd'.repeat(32)
const cal = picCalendarFromRow({
  today: '2026-11-10', from: '2026-10-01', to: '2027-02-28',
  sub: { name: 'Carres', dot: 'oklch(0.70 0.12 235)' }, pic: 'Kelvin Tan',
  dates: [
    { day: '2026-11-11', kind: 'post', field: 'Post day', title: 'Teaser 1/2', product: 'Year-End Video', code: C1, done: false, posted: null },
    { day: '2026-11-12', kind: 'post', field: 'Post day', title: 'Reel', product: 'Nov content', code: C2, done: true,
      posted: { at: '2026-11-12T02:00:00Z', link: 'https://instagram.com/p/x' } },
  ],
  approvals: [{ day: '2026-11-05', title: 'Cover', product: 'Nov content', stage: 'Approval', code: C2, waiting: true }],
  minutes: [],
  campaigns: [{ title: '11.11 Deal', from: '2026-11-09', until: '2026-11-12', code: C1 }],
  holidays: [{ day: '2026-11-11', name: 'Singles Day sale' }],
}) as PicCalendar

const realMatch = window.matchMedia
function desktop(matches: boolean) {
  window.matchMedia = ((query: string) => ({ matches, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia
}
const hrefs = (el: HTMLElement) => within(el).getAllByRole('link').map(a => [a.textContent, a.getAttribute('href')])

describe('the PIC’s calendar', () => {
  afterEach(() => { window.matchMedia = realMatch })

  it('a code that is nobody’s: closed, and nothing else', () => {
    render(<PicCalendarView cal={null} />)
    expect(screen.getByText('This link is closed')).toBeTruthy()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('on a phone, the list: what waits for them first, the campaigns running, each day coming up — each opening its tracking page', () => {
    desktop(false)
    const { container } = render(<PicCalendarView cal={cal} />)
    expect(container.firstElementChild?.getAttribute('data-view')).toBe('list')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Carres')
    expect(screen.getByText('Shared with Kelvin Tan · read-only')).toBeTruthy()
    const banner = within(screen.getByRole('status')).getByRole('link')
    expect([banner.textContent, banner.getAttribute('href')]).toEqual(['Waiting for your approvalCover · Approval · Nov content · Was due 5 NovReview →', `/t/${C2}`])
    expect(screen.getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('true')
    const list = screen.getByRole('region', { name: 'Coming up' })
    expect(hrefs(within(list).getByRole('region', { name: 'Campaigns running' }))).toEqual([['11.11 Deal9 – 12 Nov · running', `/t/${C1}`]])
    expect(hrefs(list).slice(1)).toEqual([
      ['!Waiting for your approvalCoverApproval · Nov content · Was due 5 Nov›', `/t/${C2}`],
      ['PPostTeaser 1/2Year-End Video›', `/t/${C1}`],
      ['PPostReelPosted · Nov content›', `/t/${C2}`],
      ['View post ↗', 'https://instagram.com/p/x'],
    ])
    expect(within(list).getByText('⚑ Singles Day sale')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Key dates' }))
    expect(within(list).queryByText('⚑ Singles Day sale')).toBeNull()
    expect(screen.getByRole('button', { name: 'Key dates' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('on a desktop, the month: chips on their days, the campaign across them — the months it holds, no further', () => {
    desktop(true)
    const { container } = render(<PicCalendarView cal={cal} />)
    expect(container.firstElementChild?.getAttribute('data-view')).toBe('month')
    expect(screen.getByRole('button', { name: 'Month' }).getAttribute('aria-pressed')).toBe('true')
    const month = screen.getByRole('region', { name: 'November 2026' })
    expect(hrefs(month)).toEqual([
      ['!Approve: Cover', `/t/${C2}`],
      ['PTeaser 1/2', `/t/${C1}`],
      ['PReel', `/t/${C2}`],
      ['11.11 Deal · 9 – 12 Nov', `/t/${C1}`],
    ])
    const prev = screen.getByRole('button', { name: 'Previous month' })
    fireEvent.click(prev)
    expect(screen.getByRole('region', { name: 'October 2026' })).toBeTruthy()
    expect(prev).toHaveProperty('disabled', true)
    const next = screen.getByRole('button', { name: 'Next month' })
    for (let i = 0; i < 4; i++) fireEvent.click(next)
    expect([screen.getByRole('region', { name: 'February 2027' }) !== null, (next as HTMLButtonElement).disabled]).toEqual([true, true])
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(container.firstElementChild?.getAttribute('data-view')).toBe('list')
  })

  it('nothing coming up says so; the legend names what is on it', () => {
    desktop(false)
    render(<PicCalendarView cal={{ ...cal, dates: [], approvals: [], campaigns: [], holidays: [] }} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('Nothing coming up')).toBeTruthy()
    expect(['Post', 'Go live', 'Shoot day', 'Your approval', 'Key date'].every(w => screen.getAllByText(w).length > 0)).toBe(true)
  })
})
