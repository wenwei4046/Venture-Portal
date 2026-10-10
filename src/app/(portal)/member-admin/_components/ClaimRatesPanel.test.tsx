import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaimRatesAdmin } from '@/lib/member/claim-rates-admin'

// Member services › Claim rates (2026-10-10, the HR revamp): one Save at the
// top, lit while something differs from what is stored; the regions and the
// venues' regions under the two rate cards.

const save = vi.hoisted(() => vi.fn())
vi.mock('../claim-rates-actions', () => ({ saveClaimRatesAdmin: save }))
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
    expect(flash).toHaveBeenCalledWith('Claim rates saved — new claims use them')
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
    fireEvent.change(screen.getByRole('textbox', { name: 'Per person a night' }), { target: { value: '70' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Check the rates')
    expect(screen.getByRole('textbox', { name: 'Per person a night' })).toHaveValue('70')
  })

  it('says when the rates could not be read', () => {
    render(<ClaimRatesPanel initial={null} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Claim rates could not be read.')
  })
})
