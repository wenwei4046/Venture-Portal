import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AttConfig, AttLocation } from '@/lib/attendance/types'

// Settings › Locations › a location (2026-10-20): its address in six parts — two lines typed, then State → City →
// Postcode from the list, then Country — and its *Public holidays* following the address's state.

const actions = vi.hoisted(() => ({ saveSetting: vi.fn(), deleteSetting: vi.fn() }))
vi.mock('@/lib/attendance/actions', () => actions)

import { SettingsWindow } from './SettingsWindows'

const config = (locations: AttLocation[] = []) =>
  ({
    today: '2026-10-20', now: '09:00', canCreate: true, canEdit: true, canApprove: true, me: '',
    people: [], titles: [], levels: [], departments: [], schedules: [], locations, holidays: [], assignments: [],
    leaveTypes: [], otRates: [], policies: [], routes: [],
  }) as unknown as AttConfig

const flash = vi.fn()
const close = vi.fn()
const open = (sm: { kind: 'location'; id: string | null }, locations: AttLocation[] = []) =>
  render(<SettingsWindow sm={sm} config={config(locations)} close={close} flash={flash} canEdit onSchedule={vi.fn()} />)
const select = (name: string) => screen.getByLabelText(name) as HTMLSelectElement
const pick = (name: string, value: string) => fireEvent.change(select(name), { target: { value } })
const listed = () => waitFor(() => expect(select('State')).not.toBeDisabled())
const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^(Add|Save)/ }))
  })
}

beforeEach(() => {
  actions.saveSetting.mockReset().mockResolvedValue({ ok: true, data: { id: 'loc-1', label: 'Penang branch' } })
  flash.mockReset()
  close.mockReset()
})
afterEach(cleanup)

describe('Settings › a location’s address', () => {
  it('saves the six parts by the keys att_save_setting reads — and the public holidays the state brings', async () => {
    open({ kind: 'location', id: null })
    await listed()
    fireEvent.change(screen.getByPlaceholderText('e.g. Penang branch'), { target: { value: 'Penang branch' } })
    fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: 'No 83, Jalan Jambu 3' } })
    expect(select('Public holidays').value).toBe('Selangor')
    pick('State', 'Pulau Pinang')
    expect(select('Public holidays').value).toBe('Penang')
    pick('City', 'Bukit Mertajam')
    pick('Postcode', '14020')
    await save()
    await waitFor(() => expect(actions.saveSetting).toHaveBeenCalledTimes(1))
    expect(actions.saveSetting).toHaveBeenCalledWith('location', null, {
      name: 'Penang branch', addressLine1: 'No 83, Jalan Jambu 3', addressLine2: null, addressPostcode: '14020', addressCity: 'Bukit Mertajam',
      addressState: 'Pulau Pinang', addressCountry: 'Malaysia', state: 'Penang', radius: 150, lat: null, lng: null,
    })
  })

  it('a federal territory brings Federal Territory’s holidays; HR may still pick another', async () => {
    open({ kind: 'location', id: null })
    await listed()
    pick('State', 'W.P. Kuala Lumpur')
    expect(select('Public holidays').value).toBe('Federal Territory')
    pick('Public holidays', 'Selangor')
    expect(select('Public holidays').value).toBe('Selangor')
  })

  it('refuses, in words and before sending, an address that is not one place on the list', async () => {
    open({ kind: 'location', id: null })
    await listed()
    fireEvent.change(screen.getByPlaceholderText('e.g. Penang branch'), { target: { value: 'Penang branch' } })
    fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: 'No 83' } })
    pick('State', 'Pulau Pinang')
    await save()
    await waitFor(() => expect(flash).toHaveBeenCalledWith('Pick the city, postcode.'))
    expect(actions.saveSetting).not.toHaveBeenCalled()
  })

  it('opens a location saved before the parts with its old text on file, the holiday state it had', async () => {
    open({ kind: 'location', id: 'hq' }, [{ id: 'hq', name: 'HQ', address: 'Lot 5, Jalan Puchong', state: 'Selangor', radius: 150, lat: null, lng: null }])
    await listed()
    expect(screen.getByText('On file')).toBeInTheDocument()
    expect(screen.getByText('Lot 5, Jalan Puchong')).toBeInTheDocument()
    expect((screen.getByLabelText('Address line 1') as HTMLInputElement).value).toBe('')
    expect(select('Public holidays').value).toBe('Selangor')
  })

  it('opens a location in parts on them', async () => {
    open({ kind: 'location', id: 'pg' }, [{
      id: 'pg', name: 'Penang branch', address: 'No 83, Jalan Jambu 3, 14000 Bukit Mertajam, Pulau Pinang, Malaysia', state: 'Penang', radius: 150,
      lat: null, lng: null, addressLine1: 'No 83, Jalan Jambu 3', addressLine2: null, addressPostcode: '14000', addressCity: 'Bukit Mertajam',
      addressState: 'Pulau Pinang', addressCountry: 'Malaysia',
    }])
    await listed()
    expect(screen.queryByText('On file')).toBeNull()
    expect([select('State').value, select('City').value, select('Postcode').value]).toEqual(['Pulau Pinang', 'Bukit Mertajam', '14000'])
    expect(select('Public holidays').value).toBe('Penang')
  })
})
