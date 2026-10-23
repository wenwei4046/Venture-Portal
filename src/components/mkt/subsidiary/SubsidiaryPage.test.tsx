import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { boardFromRow, type MktSub } from '@/lib/marketing/board'
import { subFeedFromRow } from '@/lib/marketing/subsidiary'
import SubsidiaryPage from './SubsidiaryPage'

// 2026-10-23 — ④-2: a subsidiary's page (`Subsidiary Page.dc.html`) — its PIC, its five cards, its dates by Month,
// Week and Timeline with the handoff's filter and key dates, its recent activity and its projects, each opening its
// project. The reckoning is lib/marketing/subsidiary.test.ts's.

const MEI = '00000000-0000-0000-0000-00000000000a'
const CAR = '10000000-0000-0000-0000-000000000001'
const P1 = '20000000-0000-0000-0000-000000000001'
const S1 = '20000000-0000-0000-0000-000000000002'
const R1 = '20000000-0000-0000-0000-000000000003'

const board = boardFromRow({
  today: '2026-10-22',
  me: MEI,
  team: [{ id: MEI, full: 'Mei Ling', first: 'Mei' }],
  subs: [{ id: CAR, code: 'CAR', name: 'Carres' }],
  projects: [
    { id: P1, trackId: 'MKT-CAR-2610-007', kind: 'product', sub: CAR, title: 'Year-End Video', status: 'active', cur: 1, owner: MEI,
      startsOn: '2026-10-01', dueOn: '2026-10-28', createdAt: '2026-09-30T02:00:00Z', updatedAt: '2026-10-21T02:00:00Z' },
    { id: S1, trackId: 'RCR-CAR-2610-001', kind: 'recurring', sub: CAR, title: 'Weekly reel', status: 'active', cur: 0,
      recur: { runs: ['2026-10-19', '2026-10-26', '2026-11-02'], status: 'active' } },
    { id: R1, trackId: 'RCR-CAR-2610-001-R01', kind: 'recurring', sub: CAR, title: 'Weekly reel', status: 'active', cur: 0, series: S1, run: 1,
      owner: MEI, createdAt: '2026-10-19T01:00:00Z', updatedAt: '2026-10-19T01:00:00Z' },
  ],
  stages: [
    { project: P1, idx: 0, name: 'Script', dept: 'VIDEOGRAPHER', owner: MEI, status: 'done', dueOn: '2026-10-14' },
    { project: P1, idx: 1, name: 'Edit', dept: 'GRAPHIC DESIGNER', owner: MEI, status: 'accepted', dueOn: '2026-10-21' },
    { project: P1, idx: 2, name: 'Final', dept: 'GRAPHIC DESIGNER', owner: MEI, status: 'planned', dueOn: '2026-10-28' },
    { project: S1, idx: 0, name: 'Plan', dept: 'SOCIAL MEDIA SPECIALIST', owner: MEI, status: 'planned', dueOn: '2026-10-20' },
    { project: R1, idx: 0, name: 'Plan', dept: 'SOCIAL MEDIA SPECIALIST', owner: MEI, status: 'accepted', dueOn: '2026-10-23' },
  ],
  holidays: [{ day: '2026-10-20', name: 'Deepavali' }],
})
const sub: MktSub = { id: CAR, code: 'CAR', name: 'Carres', dot: 'oklch(0.7 0.12 235)', emoji: '🛋️', client: false, pic: 'Mr Tan' }
const feed = subFeedFromRow([
  { id: 2, at: '2026-10-22T09:48:00Z', actor: 'Mei', action: 'accepted', stage: 0, stageName: 'Plan',
    project: { id: R1, track: 'RCR-CAR-2610-001-R01', title: 'Weekly reel', kind: 'recurring' } },
])

const links = (name: RegExp) => screen.getAllByRole('link', { name }).map(a => a.getAttribute('href'))

describe('a subsidiary’s page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-22T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('names it and its PIC, opens on its five cards, and draws its month — each item opening its project', () => {
    render(<SubsidiaryPage board={board} sub={sub} feed={feed} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Carres')
    expect(screen.queryByText('Client')).toBeNull()
    expect(screen.getByText('Mr Tan')).toBeTruthy()
    expect(screen.getByText('Overdue').parentElement?.textContent).toContain('1needs action')
    expect(screen.getByText('October 2026')).toBeTruthy()
    // The 21st's stage is late; the 26th is a run to come. Every item, and the project's row, opens the project.
    expect(links(/Year-End Video/).every(h => h === '/marketing/projects/MKT-CAR-2610-007')).toBe(true)
    expect(links(/Weekly reel/)).toContain('/marketing/projects/RCR-CAR-2610-001')
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('November 2026')).toBeTruthy()
  })

  it('filters by status and shows HR’s holidays only when Key dates is on', () => {
    render(<SubsidiaryPage board={board} sub={sub} feed={feed} />)
    const month = () => document.querySelector('[class*="grid"]') as HTMLElement
    expect(within(month()).getAllByRole('link').length).toBe(5)
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Filter' })).getByRole('button', { name: /Overdue/ }))
    expect(within(month()).getAllByRole('link').map(a => a.getAttribute('title'))).toEqual(['Year-End Video · Stage 2 · Edit · Overdue · Mei'])
    expect(screen.getByRole('button', { name: /Filter/ }).textContent).toBe('Filter1')

    expect(screen.queryByText(/⚑ Deepavali/)).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: /Key dates/ }))
    expect(screen.getByText(/⚑ Deepavali/)).toBeTruthy()
  })

  it('draws a week and a ten-week timeline', () => {
    render(<SubsidiaryPage board={board} sub={sub} feed={feed} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Week' }))
    expect(screen.getAllByText('Stage due').length).toBe(2) // the 21st (late) and the run's 23rd
    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }))
    expect(screen.getByText('Oct – Dec 2026')).toBeTruthy()
    expect(screen.getByRole('link', { name: '1 Oct – 28 Oct' }).getAttribute('href')).toBe('/marketing/projects/MKT-CAR-2610-007')
  })

  it('lists its recent activity and its projects, how far each has come', () => {
    render(<SubsidiaryPage board={board} sub={sub} feed={feed} />)
    const activity = screen.getByRole('complementary', { name: 'Recent activity' })
    expect(within(activity).getByRole('link').textContent).toBe('👍Mei accepted Stage 1 · Plan12 min ago · Weekly reel')
    const table = screen.getByRole('table', { name: 'Projects' })
    expect(within(table).getAllByRole('row').slice(1).map(r => [r.getAttribute('href'), r.textContent])).toEqual([
      // The group is the current stage's People title (2026-10-24).
      ['/marketing/projects/MKT-CAR-2610-007', '📦Year-End VideoGRAPHIC DESIGNEROverdue · In progress1/3MMei21 Oct'],
      ['/marketing/projects/RCR-CAR-2610-001-R01', '🔁Weekly reelSOCIAL MEDIA SPECIALISTIn progress0/1MMei23 Oct'],
    ])
  })

  it('marks Marketing’s own client', () => {
    render(<SubsidiaryPage board={board} sub={{ ...sub, client: true, pic: null }} feed={[]} />)
    expect(screen.getByText('Client')).toBeTruthy()
    expect(screen.getByText('Nothing yet')).toBeTruthy()
  })
})
