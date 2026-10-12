import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FoodClaimAdmin } from '@/lib/member/food-claim-admin'

// Member services › Food claim (2026-10-13): Fair's rate a day and the titles that may claim it — one Save
// at the top, lit while something differs from what is stored, as Claim rates.

const save = vi.hoisted(() => vi.fn())
vi.mock('../food-claim-actions', () => ({ saveFoodClaimAdmin: save }))
const flash = vi.fn()
vi.mock('@/components/hrv/toast', () => ({ flash: (m: string) => flash(m) }))

import FoodClaimPanel from './FoodClaimPanel'

const TL = 'd52f82a8-3f11-4182-8b20-994124574b03'
const RS = '36ebf27d-cdaf-4587-afcd-8f0c19898579'
const stored: FoodClaimAdmin = {
  subDepartmentId: 'fair', subName: 'Fair', perDay: null, titleIds: [], updatedAt: null, updatedBy: null,
  titles: [
    { id: TL, name: 'Team Leader', level: 'Senior Manager', people: 5, active: true },
    { id: RS, name: 'Revenue Specialist', level: 'Executive', people: 1, active: true },
  ],
}
const box = (name: string) => screen.getByRole('checkbox', { name: `${name} may claim food` })

beforeEach(() => {
  save.mockReset().mockImplementation(async (input: { perDay: number | null; titleIds: string[] }) =>
    ({ ok: true, data: { ...stored, perDay: input.perDay, titleIds: input.titleIds, updatedAt: '2026-10-13T02:00:00Z', updatedBy: 'HR' } }))
  flash.mockReset()
})
afterEach(cleanup)

describe('FoodClaimPanel', () => {
  it("shows Fair's titles with how many hold each, nothing ticked, Saved", () => {
    render(<FoodClaimPanel initial={stored} />)
    expect(screen.getByRole('heading', { name: 'Food claim' })).toBeInTheDocument()
    expect(screen.getByText('Fair only')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Rate a day' })).toHaveValue('')
    expect(box('Team Leader').closest('[role="row"]')).toHaveTextContent('Team LeaderSenior Manager5 peopleCan claim')
    expect(box('Revenue Specialist').closest('[role="row"]')).toHaveTextContent('1 person')
    expect(box('Team Leader')).toHaveAttribute('aria-checked', 'false')
  })

  it('asks for the rate before a title, then saves both', async () => {
    render(<FoodClaimPanel initial={stored} />)
    fireEvent.click(box('Team Leader'))
    expect(box('Team Leader')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Set the rate a day before ticking who may claim it.')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(save).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: 'Rate a day' }), { target: { value: '20' } })
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(save).toHaveBeenCalledWith({ perDay: 20, titleIds: [TL] })
    expect(flash).toHaveBeenCalledWith('Food claim saved — new claims use it')
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled()
    expect(screen.getByText('Last saved 13 Oct 2026 by HR.')).toBeInTheDocument()
  })

  it("says the database's refusal and keeps what was typed", async () => {
    save.mockResolvedValueOnce({ ok: false, error: 'HR request management access is required' })
    render(<FoodClaimPanel initial={{ ...stored, perDay: 20 }} />)
    fireEvent.click(box('Revenue Specialist'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('HR request management access is required')
    expect(box('Revenue Specialist')).toHaveAttribute('aria-checked', 'true')
  })

  it('says so when it could not be read', () => {
    render(<FoodClaimPanel initial={null} />)
    expect(screen.getByRole('alert')).toHaveTextContent('The food claim could not be read.')
  })
})
