import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { adsPageFromRow } from '@/lib/marketing/ads'
const actions = vi.hoisted(() => ({ readMktAdsChoices: vi.fn(), saveMktAds: vi.fn(), readMktAdsFigures: vi.fn(), publishMktAds: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)
import AdsReport from './AdsReport'

// 2026-10-25 — a project's Ads report (the user's answer 57): set up by the Ads person — the CRM's ads it reads, how often,
// the figures, the targets — then each period published to the PIC's link, its figures worked out from the CRM and Meta
// or typed. The reckoning is lib/marketing/ads.test.ts's; what the database keeps is validate-marketing-ads-reports.mjs's.

const PID = '20000000-0000-0000-0000-000000000001'
const A1 = '120210000000000001'
const SETUP = { ads: [A1], every: '2w', startsOn: '2026-10-06', figures: ['spendToDate', 'cpl', 'appt', 'roas'], targets: { budget: 6000, cpl: 20, roas: 3, apptRate: 25 } }
const R1 = { no: 1, from: '2026-10-06', until: '2026-10-19', values: { spendToDate: 1410, cpl: 22.1, appt: 17, roas: 2.7 }, targets: { cpl: 20, roas: 3, apptRate: 25 },
  note: 'Slow start', by: 'Wei Lun', at: '2026-10-20T02:00:00Z', updatedAt: null }
const page = (over: Record<string, unknown> = {}) => adsPageFromRow({ today: '2026-11-03', link: true, setup: SETUP, reports: [R1], ...over })
const say = vi.fn()

describe('a project’s Ads report', () => {
  beforeEach(() => {
    for (const f of Object.values(actions)) f.mockReset()
    say.mockReset()
  })

  it('not set up: Set up for Marketing · Edit — nothing for anybody else', async () => {
    const { container, unmount } = render(<AdsReport project={PID} title="Raya ads" initial={page({ setup: null, reports: [] })} edit={false} say={say} />)
    expect(container.textContent).toBe('')
    unmount()
    actions.readMktAdsChoices.mockResolvedValue({ ok: true, choices: [
      { id: A1, name: 'Raya rental', page: 'The Conts', status: 'ACTIVE', leads: 34, hidden: false },
      { id: '120210000000000002', name: 'Showroom walk-in', page: 'The Conts', status: 'PAUSED', leads: 3, hidden: false },
      { id: '120210000000000003', name: 'Old promo', page: null, status: null, leads: 1, hidden: true },
    ] })
    render(<AdsReport project={PID} title="Raya ads" initial={page({ setup: null, reports: [] })} edit say={say} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Set up' })) })
    const dialog = screen.getByRole('dialog', { name: 'Ads report' })
    // A hidden ad shows only when picked.
    expect(within(dialog).getByRole('group', { name: 'CRM ads' }).textContent).toBe('Raya rentalThe Conts · active · 34 leadsShowroom walk-inThe Conts · paused · 3 leads')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Search ads' }), { target: { value: 'raya' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Raya rental/ }))
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Cost per lead (RM)' }), { target: { value: '20' } })
    actions.saveMktAds.mockResolvedValue({ ok: true, ads: page({ reports: [] }) })
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Set up' })) })
    expect(actions.saveMktAds).toHaveBeenCalledWith(PID, { ads: [A1], every: '2w', startsOn: '2026-11-03', figures: ['spendToDate', 'cpl', 'appt', 'roas'],
      targets: { budget: null, cpl: 20, roas: null, apptRate: null } })
    expect(say).toHaveBeenCalledWith('Ads report set up')
    expect(screen.getByText('Every 2 weeks')).toBeTruthy()
  })

  it('lists its periods, the newest first — the one running, those due, those published with their figures', () => {
    render(<AdsReport project={PID} title="Raya ads" initial={page({ link: false })} edit say={say} />)
    const card = screen.getByLabelText('Ads report')
    expect(within(card).getByText('1 CRM ad · Spend so far · Cost per lead · Appointments · ROAS')).toBeTruthy()
    expect(within(card).getByText('Budget RM 6,000 · Cost per lead RM 20.00 · ROAS 3.0 · Appointment rate 25%')).toBeTruthy()
    expect(within(card).getByText('No PIC link yet')).toBeTruthy()
    const rows = [...card.querySelectorAll('[class*="rowHead"]')].map(r => r.textContent)
    expect(rows).toEqual(['Report #3' + '3 – 16 Nov' + 'Ends 16 Nov', 'Report #2' + '20 Oct – 2 Nov' + 'Due' + 'Publish…', 'Report #1' + '6 – 19 Oct' + 'Published' + 'Show' + 'Publish again…'])
    expect(within(card).queryByText('Target RM 20 · above')).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Show' }))
    expect(within(card).getByRole('button', { name: 'Hide' }).getAttribute('aria-expanded')).toBe('true')
    expect(within(card).getByText('RM 1,410')).toBeTruthy()
    expect(within(card).getByText('Target RM 20 · above')).toBeTruthy()
    expect(within(card).getByText('Min 3.0 · below')).toBeTruthy()
    expect(within(card).getByText('Slow start')).toBeTruthy()
  })

  it('a viewer reads them — nothing to publish or change', () => {
    render(<AdsReport project={PID} title="Raya ads" initial={page()} edit={false} say={say} />)
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change the Ads report' })).toBeNull()
    expect(screen.getByText('Due')).toBeTruthy()
  })

  it('publishes a period: its figures read from the CRM and Meta, typed over, read as the PIC will — then published', async () => {
    actions.readMktAdsFigures.mockResolvedValue({ ok: true, period: { no: 2, from: '2026-10-20', until: '2026-11-02' },
      crm: { leads: 176, appt: 46, showup: 30, won: 9, wonAmount: 10368 }, meta: { spend: 1830, impr: 1, reach: 1, clicks: 1, msgconv: 1 },
      toDate: 3240, metaRead: 1, metaOf: 1, metaOff: false })
    render(<AdsReport project={PID} title="Raya ads" initial={page()} edit say={say} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Publish…' })) })
    const dialog = screen.getByRole('dialog', { name: 'Report #2' })
    expect(actions.readMktAdsFigures).toHaveBeenCalledWith(PID, 2)
    expect(within(dialog).getByText('Meta: 1 of 1 ad read')).toBeTruthy()
    const input = (name: string) => within(dialog).getByRole('textbox', { name }) as HTMLInputElement
    expect(['Spend so far', 'Cost per lead', 'Appointments', 'ROAS'].map(n => input(n).value)).toEqual(['3240', '10.4', '46', '5.7'])
    fireEvent.change(input('Spend so far'), { target: { value: '3,300' } })
    expect(within(dialog).getByText('RM 3,300')).toBeTruthy()
    expect(within(dialog).getByText('Target RM 20 · on target')).toBeTruthy()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Note for the PIC' }), { target: { value: 'Google ads added by hand' } })
    actions.publishMktAds.mockResolvedValue({ ok: true, ads: page({ reports: [{ ...R1, no: 2, from: '2026-10-20', until: '2026-11-02' }, R1] }) })
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' })) })
    expect(actions.publishMktAds).toHaveBeenCalledWith(PID, 2, { spendToDate: 3300, cpl: 10.4, appt: 46, roas: 5.7 }, 'Google ads added by hand')
    expect(say).toHaveBeenCalledWith('Report #2 published')
    expect(screen.queryByRole('dialog', { name: 'Report #2' })).toBeNull()
  })

  // Found on the walk (2026-10-25): a development build runs the opening read twice; the first answered, the figures were
  // typed, then the second's answer wrote over them and the report went out without them.
  it('only the newest read fills the figures — what is typed after it is never written over', async () => {
    const answers: ((v: unknown) => void)[] = []
    actions.readMktAdsFigures.mockImplementation(() => new Promise(res => answers.push(res)))
    const figs = (spend: number) => ({ ok: true, period: { no: 2, from: '2026-10-20', until: '2026-11-02' },
      crm: { leads: 10, appt: 2, showup: 1, won: 0, wonAmount: 0 }, meta: null, toDate: spend, metaRead: 0, metaOf: 1, metaOff: true })
    render(<StrictMode><AdsReport project={PID} title="Raya ads" initial={page()} edit say={say} /></StrictMode>)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Publish…' })) })
    const dialog = screen.getByRole('dialog', { name: 'Report #2' })
    const spend = () => within(dialog).getByRole('textbox', { name: 'Spend so far' }) as HTMLInputElement
    expect(answers.length).toBe(2)
    await act(async () => { answers[0](figs(111)) })
    // The first read overtaken: still reading, nothing filled from it.
    expect([spend().disabled, spend().value]).toEqual([true, ''])
    await act(async () => { answers[1](figs(222)) })
    expect([spend().disabled, spend().value]).toEqual([false, '222'])
    fireEvent.change(spend(), { target: { value: '1,250' } })
    actions.publishMktAds.mockResolvedValue({ ok: true, ads: page() })
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' })) })
    expect(actions.publishMktAds.mock.calls[0][2]).toMatchObject({ spendToDate: 1250 })
  })

  it('a value that is not a number stops it; Meta not connected says so', async () => {
    actions.readMktAdsFigures.mockResolvedValue({ ok: true, period: { no: 2, from: '2026-10-20', until: '2026-11-02' },
      crm: { leads: 0, appt: 0, showup: 0, won: 0, wonAmount: 0 }, meta: null, toDate: null, metaRead: 0, metaOf: 1, metaOff: true })
    render(<AdsReport project={PID} title="Raya ads" initial={page()} edit say={say} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Publish…' })) })
    const dialog = screen.getByRole('dialog', { name: 'Report #2' })
    expect(within(dialog).getByText('Meta is not connected here — type its figures')).toBeTruthy()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Cost per lead' }), { target: { value: 'twenty' } })
    expect(within(dialog).getByRole('alert').textContent).toBe('Each figure is a number from 0 — or left empty.')
    expect((within(dialog).getByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
