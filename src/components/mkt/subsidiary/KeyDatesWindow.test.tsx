import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { MktSub } from '@/lib/marketing/board'
import type { MktKeyDate } from '@/lib/marketing/key-dates'
const actions = vi.hoisted(() => ({ saveMktKeyDate: vi.fn(), deleteMktKeyDate: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)
import KeyDatesWindow from './KeyDatesWindow'

// 2026-10-25 — a subsidiary's own key dates (the user: "Marketing 全员，可每年重复"): listed by the next day each falls on,
// added in full, changed by only what changed, deleted on a second word. The reckoning is lib/marketing/key-dates.test.ts's.

const CAR = '10000000-0000-0000-0000-000000000001'
const sub: MktSub = { id: CAR, code: 'CAR', name: 'Carres', dot: 'oklch(0.7 0.12 235)', emoji: '🛋️', client: false, pic: 'Mr Tan' }
const SALE: MktKeyDate = { id: 'k1', day: '2026-11-11', name: '11.11 sale day', short: '11.11', yearly: true }
const OLD: MktKeyDate = { id: 'k2', day: '2026-09-01', name: 'Old launch', short: null, yearly: false }
const PAYDAY: MktKeyDate = { id: 'k3', day: '2026-10-31', name: 'Payday', short: null, yearly: false }

const field = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const dayInput = () => screen.getByLabelText('Day') as HTMLInputElement

describe('a subsidiary’s key dates', () => {
  beforeEach(() => {
    actions.saveMktKeyDate.mockReset()
    actions.deleteMktKeyDate.mockReset()
  })

  it('lists them by the next day each falls on — a one-off passed last — and adds one in full', async () => {
    const saved = vi.fn()
    render(<KeyDatesWindow sub={sub} keys={[OLD, SALE, PAYDAY]} today="2026-10-25" open={null} onSaved={saved} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Key dates · Carres' })
    expect(within(dialog).getAllByRole('listitem').map(li => li.textContent?.replace(/(Change|Delete)/g, ''))).toEqual([
      '⚑ PaydayPaydaySat 31 Oct 2026',
      '⚑ 11.1111.11 sale dayWed 11 Nov 2026 · Every year',
      '⚑ Old launchOld launchTue 1 Sep 2026',
    ])
    // A new form is not wrong yet; the button waits for a name.
    expect(screen.queryByRole('alert')).toBeNull()
    const add = screen.getByRole('button', { name: 'Add key date' })
    expect((add as HTMLButtonElement).disabled).toBe(true)
    expect(dayInput().value).toBe('2026-10-25')
    type(field('On its flag'), 'Shop')
    expect(screen.getByRole('alert').textContent).toBe('Name the key date.')
    type(dayInput(), '2026-11-21')
    type(field('Name'), ' New Carres showroom opens (Puchong) ')
    type(field('On its flag'), 'Showroom')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Every year' }))
    const after = [PAYDAY, SALE, { id: 'k9', day: '2026-11-21', name: 'New Carres showroom opens (Puchong)', short: 'Showroom', yearly: true }, OLD]
    actions.saveMktKeyDate.mockResolvedValue({ ok: true, keys: after })
    await act(async () => { fireEvent.click(add) })
    expect(actions.saveMktKeyDate).toHaveBeenCalledWith(CAR, null, { day: '2026-11-21', name: 'New Carres showroom opens (Puchong)', short: 'Showroom', yearly: true })
    expect(saved).toHaveBeenCalledWith(after)
    // The form is new again, for the next one.
    expect(field('Name').value).toBe('')
  })

  it('opens on one to change it — only what changed is sent; Cancel change goes back to a new one', async () => {
    render(<KeyDatesWindow sub={sub} keys={[SALE, PAYDAY]} today="2026-10-25" open="k1" onSaved={() => {}} onClose={() => {}} />)
    expect(field('Name').value).toBe('11.11 sale day')
    expect(screen.getByText('Change key date')).toBeTruthy()
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    type(field('On its flag'), '11.11 Sale')
    actions.saveMktKeyDate.mockResolvedValue({ ok: false, reason: 'That key date is not there any more.' })
    await act(async () => { fireEvent.click(save) })
    expect(actions.saveMktKeyDate).toHaveBeenCalledWith(CAR, 'k1', { short: '11.11 Sale' })
    expect(screen.getByRole('alert').textContent).toBe('That key date is not there any more.')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel change' }))
    expect(field('Name').value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Change Payday' }))
    expect(field('Name').value).toBe('Payday')
  })

  it('deletes one on a second word — Keep leaves it', async () => {
    const saved = vi.fn()
    render(<KeyDatesWindow sub={sub} keys={[SALE, PAYDAY]} today="2026-10-25" open={null} onSaved={saved} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Payday' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(actions.deleteMktKeyDate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Payday' }))
    actions.deleteMktKeyDate.mockResolvedValue({ ok: true, keys: [SALE] })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete' })) })
    expect(actions.deleteMktKeyDate).toHaveBeenCalledWith(CAR, 'k3')
    expect(saved).toHaveBeenCalledWith([SALE])
  })

  it('says so when there are none; Done closes it', () => {
    const close = vi.fn()
    render(<KeyDatesWindow sub={sub} keys={[]} today="2026-10-25" open={null} onSaved={() => {}} onClose={close} />)
    expect(screen.getByText('No key dates yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(close).toHaveBeenCalled()
  })
})
