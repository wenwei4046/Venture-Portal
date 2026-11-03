import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaimRatesAdmin } from '@/lib/member/claim-rates-admin'
import type { TransportClaimAdmin } from '@/lib/member/transport-claim-admin'

// Member services › Transport claim (Claim rates until 2026-10-20; the HR revamp's panel since 2026-10-10): one Save
// at the top, lit while something differs from what is stored; the regions and the venues' regions under the two rate
// cards; right of Save, ⋯ — who may claim it, in a window with its own Save.

const save = vi.hoisted(() => vi.fn())
vi.mock('../claim-rates-actions', () => ({ saveClaimRatesAdmin: save }))
const saveTitles = vi.hoisted(() => vi.fn())
vi.mock('../transport-claim-actions', () => ({ saveTransportClaimAdmin: saveTitles }))
const flash = vi.fn()
vi.mock('@/components/hrv/toast', () => ({ flash: (m: string) => flash(m) }))

import ClaimRatesPanel from './ClaimRatesPanel'

const regionRow = (n: number) => screen.getByRole('textbox', { name: 'Region ' + n + ' name' }).closest('[role="row"]') as HTMLElement

const rates: ClaimRatesAdmin = {
  base: 'KL', perSpot: 25, perPaxNight: 65, groupMaxPax: 3, groupCapPerNight: 220, updatedAt: null, updatedBy: null,
  regions: [
    { id: 'kl', name: 'KL', spots: 0, active: true, planeTicket: false },
    { id: 'pg', name: 'Penang', spots: 4, active: true, planeTicket: false },
    { id: 'kch', name: 'Kuching', spots: 0, active: true, planeTicket: true },
  ],
  venues: [{ key: 'SPICE ARENA', name: 'SPICE ARENA', fairs: 3, lastFair: '2026-09-26', regionId: 'pg' }],
}

beforeEach(() => {
  save.mockReset().mockImplementation(async (input: unknown) => ({ ok: true, data: { ...rates, perSpot: (input as { perSpot: number }).perSpot } }))
  flash.mockReset()
})
afterEach(cleanup)

describe('ClaimRatesPanel', () => {
  it('shows what is stored, Saved until something changes', () => {
    render(<ClaimRatesPanel initial={rates} />)
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Base' })).toHaveValue('KL')
    expect(regionRow(2)).toHaveTextContent('RM 100.00')
    expect(regionRow(3)).toHaveTextContent('ticket + invoice')
    // "Air ticket", as the window's column (the user, 2026-11-01: "go with the same name Air ticket claim").
    expect(within(screen.getByRole('table', { name: 'Regions' })).getAllByRole('columnheader').map(h => h.textContent))
      .toEqual(['Region', 'Spots from KL', 'Air ticket', 'Outstation pays', ''])
    expect(screen.getByRole('combobox', { name: 'Region of SPICE ARENA' })).toHaveDisplayValue('Penang')
    expect(screen.getByText('3 fairs · last 26 Sep 2026')).toBeInTheDocument()
  })

  it('lights Save on a change and saves the whole form', async () => {
    render(<ClaimRatesPanel initial={rates} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Rate per spot' }), { target: { value: '30' } })
    expect(regionRow(2)).toHaveTextContent('RM 120.00')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ base: 'KL', perSpot: 30, perPaxNight: 65, groupMaxPax: 3, groupCapPerNight: 220 }))
    expect(flash).toHaveBeenCalledWith('Transport claim saved — new claims use it')
  })

  it('flies a region, adds and removes one', () => {
    render(<ClaimRatesPanel initial={rates} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Penang is flown to' }))
    expect(regionRow(2)).toHaveTextContent('ticket + invoice')
    fireEvent.click(screen.getByRole('button', { name: '+ Add region' }))
    expect(screen.getByRole('textbox', { name: 'Region 4 name' })).toHaveValue('New region')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('shows the refusal and keeps what was typed', async () => {
    save.mockResolvedValue({ ok: false, error: 'Check the rates, every region’s name and spots, and the venues’ regions.' })
    render(<ClaimRatesPanel initial={rates} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Limit per person a night' }), { target: { value: '70' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Check the rates')
    expect(screen.getByRole('textbox', { name: 'Limit per person a night' })).toHaveValue('70')
  })

  it('says when the rates could not be read', () => {
    render(<ClaimRatesPanel initial={null} />)
    expect(screen.getByRole('alert')).toHaveTextContent('The transport claim could not be read.')
  })
})

// The user, 2026-10-20: "这个 claim rate 我要换成 transport claim … 在 save button 旁边…做一个三个点。它是要能够选择
// 什么 title 的人可以 claim 这个 transport。它跟 food claim 一样".
describe('Transport claim — who may claim it', () => {
  const transport: TransportClaimAdmin = {
    titleIds: ['t-leader', 't-spec'],
    airTicketTitleIds: ['t-spec'],
    titles: [
      { id: 't-dir', name: 'Revenue Director', level: 'Management', people: 0, active: true },
      { id: 't-leader', name: 'Team Leader', level: 'Senior Manager', people: 5, active: true },
      { id: 't-asst', name: 'Team Assistant', level: 'Assistant Manager', people: 9, active: true },
      { id: 't-spec', name: 'Revenue Specialist', level: 'Executive', people: 1, active: true },
    ],
    updatedAt: null,
    updatedBy: null,
  }
  type Change = { titleId: string; transport?: boolean; airTicket?: boolean }
  /** The database's answer: the boxes sent, over the lists as they stood. */
  const applied = (changes: Change[]): TransportClaimAdmin => {
    const road = new Set(transport.titleIds)
    const plane = new Set(transport.airTicketTitleIds)
    for (const c of changes) {
      if (c.transport !== undefined) (c.transport ? road.add(c.titleId) : road.delete(c.titleId))
      if (c.airTicket !== undefined) (c.airTicket ? plane.add(c.titleId) : plane.delete(c.titleId))
    }
    return { ...transport, titleIds: [...road], airTicketTitleIds: [...plane] }
  }
  beforeEach(() => {
    saveTitles.mockReset().mockImplementation(async (changes: Change[]) => ({ ok: true, data: applied(changes) }))
  })
  const more = () => screen.getByRole('button', { name: 'Who can claim transport' })
  const win = () => screen.getByRole('dialog', { name: 'Who can claim transport' })

  it('is called Transport claim, and its ⋯ stands right of Save', () => {
    render(<ClaimRatesPanel initial={rates} transport={transport} />)
    expect(screen.getByRole('heading', { name: 'Transport claim' })).toBeInTheDocument()
    const saveButton = screen.getByRole('button', { name: 'Saved' })
    expect(saveButton.compareDocumentPosition(more()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(more()).toHaveTextContent('⋯')
    expect(more()).toHaveAttribute('title', 'Who can claim · 4 titles · 2 transport · 1 air ticket')
  })

  it('opens every Revenue title with its two boxes — Transport claim and Air ticket claim — as stored', () => {
    render(<ClaimRatesPanel initial={rates} transport={transport} />)
    fireEvent.click(more())
    const w = win()
    expect(within(w).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Title', 'Level', 'People', 'Transport claim', 'Air ticket claim'])
    expect(within(w).getAllByRole('row').slice(1).map(r => r.textContent)).toEqual([
      'Revenue DirectorManagement0 peopleCan claimCan claim',
      'Team LeaderSenior Manager5 people✓Can claimCan claim',
      'Team AssistantAssistant Manager9 peopleCan claimCan claim',
      'Revenue SpecialistExecutive1 person✓Can claim✓Can claim',
    ])
    expect(within(w).getAllByRole('checkbox', { name: /may claim transport$/ }).map(c => c.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'true'])
    expect(within(w).getAllByRole('checkbox', { name: /may claim an air ticket$/ }).map(c => c.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'true'])
    expect(within(w).getByText('4 titles · 2 transport · 1 air ticket')).toBeInTheDocument()
    expect(within(w).getByRole('button', { name: 'Saved' })).toBeDisabled()
  })

  // The user, 2026-10-31: "有一些人如果不可以 claim 普通 transport claim，但他可以 claim Air ticket claim".
  it('ticks a title for the air ticket alone, and saves only the boxes changed', async () => {
    render(<ClaimRatesPanel initial={rates} transport={transport} />)
    fireEvent.click(more())
    fireEvent.click(within(win()).getByRole('checkbox', { name: 'Team Assistant may claim an air ticket' }))
    fireEvent.click(within(win()).getByRole('checkbox', { name: 'Team Leader may claim transport' }))
    fireEvent.click(within(win()).getByRole('checkbox', { name: 'Team Leader may claim an air ticket' }))
    expect(within(win()).getByText('4 titles · 1 transport · 3 air ticket')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(win()).getByRole('button', { name: 'Save' }))
    })
    expect(saveTitles).toHaveBeenCalledWith([
      { titleId: 't-asst', airTicket: true },
      { titleId: 't-leader', transport: false, airTicket: true },
    ])
    expect(save).not.toHaveBeenCalled()
    expect(flash).toHaveBeenCalledWith('Who can claim saved · 4 titles · 1 transport · 3 air ticket')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled()
    fireEvent.click(more())
    expect(within(win()).getAllByRole('checkbox', { name: /may claim transport$/ }).map(c => c.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'true'])
    expect(within(win()).getAllByRole('checkbox', { name: /may claim an air ticket$/ }).map(c => c.getAttribute('aria-checked'))).toEqual(['false', 'true', 'true', 'true'])
  })

  it('a box ticked and unticked again is no change', () => {
    render(<ClaimRatesPanel initial={rates} transport={transport} />)
    fireEvent.click(more())
    const box = within(win()).getByRole('checkbox', { name: 'Revenue Director may claim an air ticket' })
    fireEvent.click(box)
    expect(within(win()).getByRole('button', { name: 'Save' })).toBeEnabled()
    fireEvent.click(box)
    expect(within(win()).getByRole('button', { name: 'Saved' })).toBeDisabled()
  })

  it('shows a refusal in the window and keeps the ticks; Cancel drops them', async () => {
    saveTitles.mockResolvedValue({ ok: false, error: 'HR request management access is required' })
    render(<ClaimRatesPanel initial={rates} transport={transport} />)
    fireEvent.click(more())
    fireEvent.click(within(win()).getByRole('checkbox', { name: 'Revenue Director may claim transport' }))
    await act(async () => {
      fireEvent.click(within(win()).getByRole('button', { name: 'Save' }))
    })
    expect(within(win()).getByRole('alert')).toHaveTextContent('HR request management access is required')
    expect(within(win()).getByRole('checkbox', { name: 'Revenue Director may claim transport' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(win()).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(more())
    expect(within(win()).getByRole('checkbox', { name: 'Revenue Director may claim transport' })).toHaveAttribute('aria-checked', 'false')
  })

  it('has no ⋯ when the list could not be read', () => {
    render(<ClaimRatesPanel initial={rates} transport={null} />)
    expect(screen.queryByRole('button', { name: 'Who can claim transport' })).toBeNull()
  })
})
