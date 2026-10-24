import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { boardFromRow, type MktSub } from '@/lib/marketing/board'
import { subFeedFromRow } from '@/lib/marketing/subsidiary'
const actions = vi.hoisted(() => ({ editMktClient: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)
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

describe('its details, the manager’s to edit (②b-2d-2a, the user’s answer 29)', () => {
  it('no Edit for the staff; the manager’s dialog sends only what changed — never a group company’s name — and the page shows it', async () => {
    const staff = render(<SubsidiaryPage board={board} sub={sub} feed={feed} />)
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    staff.unmount()
    render(<SubsidiaryPage board={board} sub={sub} feed={feed} manage />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Carres' })
    expect(within(dialog).queryByRole('textbox', { name: 'Name' })).toBeNull()
    // A group company is billed as Finance keeps it (②b-2b): no billing details of Marketing's.
    expect(within(dialog).queryByRole('textbox', { name: 'Billing name' })).toBeNull()
    const save = within(dialog).getByRole('button', { name: 'Save' })
    expect(save).toHaveProperty('disabled', true)
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Second PIC' }), { target: { value: 'mr tan' } })
    expect(within(dialog).getByRole('alert').textContent).toBe('The second PIC is somebody else')
    expect(save).toHaveProperty('disabled', true)
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Second PIC' }), { target: { value: 'Hana Lee' } })
    actions.editMktClient.mockResolvedValue({ ok: true, sub: { ...sub, whatsapp: null, pic2: 'Hana Lee', whatsapp2: null } })
    await act(async () => {
      fireEvent.click(save)
    })
    expect(actions.editMktClient).toHaveBeenCalledWith(CAR, { pic2: 'Hana Lee' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('PICs')).toBeTruthy()
    expect(screen.getByText('Hana Lee')).toBeTruthy()
    expect(screen.getByText('· either approves via 🔗 link')).toBeTruthy()
  })

  it('renames Marketing’s own client; a refusal says why and keeps the dialog', async () => {
    render(<SubsidiaryPage board={board} sub={{ ...sub, client: true, name: 'Acme' }} feed={[]} manage />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Acme' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), { target: { value: 'Carres' } })
    actions.editMktClient.mockResolvedValue({ ok: false, reason: 'Carres is on the list already.' })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    })
    expect(actions.editMktClient).toHaveBeenCalledWith(CAR, { name: 'Carres' })
    expect(within(dialog).getByRole('alert').textContent).toBe('Carres is on the list already.')
  })

  // ②b-2b — the user's answer 50: an outside client's billing details, Marketing's to keep.
  it('an outside client’s billing details: on file, only what changed sent; opened at once from Billing', async () => {
    const bill = { name: 'Acme Sdn Bhd', address: null, phone: '03-1234 5678', email: null }
    render(<SubsidiaryPage board={board} sub={{ ...sub, client: true, name: 'Acme' }} feed={[]} manage bill={bill} openEdit />)
    const dialog = screen.getByRole('dialog', { name: 'Edit Acme' })
    expect((within(dialog).getByRole('textbox', { name: 'Billing name' }) as HTMLInputElement).value).toBe('Acme Sdn Bhd')
    expect(within(dialog).getByRole('textbox', { name: 'Address line 1' })).toBeTruthy()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Billing email' }), { target: { value: 'acc@acme' } })
    expect(within(dialog).getByRole('alert').textContent).toBe('An email address, like name@company.com')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Billing email' }), { target: { value: 'acc@acme.my' } })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Billing phone' }), { target: { value: '' } })
    actions.editMktClient.mockResolvedValue({ ok: true, sub: { ...sub, client: true, name: 'Acme' }, bill: { ...bill, phone: null, email: 'acc@acme.my' } })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    })
    expect(actions.editMktClient).toHaveBeenCalledWith(CAR, { billPhone: null, billEmail: 'acc@acme.my' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect((within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Billing email' }) as HTMLInputElement).value).toBe('acc@acme.my')
  })
})

// 2026-10-24 — ④-2b: its campaigns (the user's answer 13 — a product project with a run period; the timeline shows which
// runs when): the card, the days they run in Month and Week, the timeline's rows with their overlap, the filter.
describe('its campaigns', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T02:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())
  const C1 = '30000000-0000-0000-0000-000000000001'
  const C2 = '30000000-0000-0000-0000-000000000002'
  const cboard = boardFromRow({
    today: '2026-11-10',
    me: MEI,
    team: [{ id: MEI, full: 'Mei Ling', first: 'Mei' }],
    subs: [{ id: CAR, code: 'CAR', name: 'Carres' }],
    projects: [
      { id: C1, trackId: 'MKT-CAR-2611-001', kind: 'product', sub: CAR, title: 'Carres · 11.11 Rental Deal · Nov 2026', status: 'active', cur: 0,
        campaign: { from: '2026-11-09', until: '2026-11-12' }, createdAt: '2026-10-20T01:00:00Z', updatedAt: '2026-11-01T01:00:00Z' },
      { id: C2, trackId: 'MKT-CAR-2611-002', kind: 'product', sub: CAR, title: 'Carres · Showroom Weekends · Nov 2026', status: 'active', cur: 0,
        campaign: { from: '2026-11-07', until: '2026-11-29' }, createdAt: '2026-10-21T01:00:00Z', updatedAt: '2026-11-02T01:00:00Z' },
    ],
  })

  it('counts those running, draws them on the days they run, Live in the projects', () => {
    render(<SubsidiaryPage board={cboard} sub={sub} feed={[]} />)
    expect(screen.getByText('Campaigns running').parentElement?.parentElement?.textContent).toContain('2')
    const month = document.querySelector('[class*="grid"]') as HTMLElement
    const deal = within(month).getAllByRole('link', { name: /11\.11 Rental Deal/ })
    expect(deal.length).toBe(4)
    expect(deal.every(a => a.getAttribute('href') === '/marketing/projects/MKT-CAR-2611-001')).toBe(true)
    expect(within(month).getAllByRole('link', { name: /Showroom Weekends/ }).length).toBe(23)
    expect(within(screen.getByRole('table', { name: 'Projects' })).getAllByText('Live').length).toBe(2)
    fireEvent.click(screen.getByRole('tab', { name: 'Week' }))
    const week = document.querySelector('[class*="week"]') as HTMLElement
    expect(within(week).getAllByText('Campaign').length).toBe(11) // the deal 9–12, the weekends every day of the week
  })

  it('the timeline: their own rows, where they share days, the note under it — and the filter hides them', () => {
    render(<SubsidiaryPage board={cboard} sub={sub} feed={[]} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }))
    expect(screen.getByText('Campaign / project')).toBeTruthy()
    for (const head of ['Campaigns', 'Overlaps', 'Projects']) expect(screen.getAllByText(head).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '11.11 Rental Deal · Nov 2026 · 9 – 12 Nov' }).getAttribute('href')).toBe('/marketing/projects/MKT-CAR-2611-001')
    expect(screen.getByLabelText('Overlaps').querySelectorAll('span').length).toBe(1)
    expect(screen.getByText('1 overlap: Showroom Weekends · Nov 2026 overlaps 11.11 Rental Deal · Nov 2026 (9 – 12 Nov)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Filter' })).getByRole('button', { name: /Stage due date/ }))
    expect(screen.queryByText('Campaign / project')).toBeNull()
    expect(screen.queryByText(/overlap/)).toBeNull()
  })
})
