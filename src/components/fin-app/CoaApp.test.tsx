import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { CoaAccount } from '@/lib/coa-edit'

// Report › Chart of Account in the Finance phone app (2026-10-15, part E3b):
// an account's Edit sends only what changed (the user's rule), a new type or
// code is asked first, + New account sends its type, name, cash flow and
// parent — each the desktop's own action, answered in words.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), flash: vi.fn(), create: vi.fn(), update: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/page/coa',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/app/(portal)/settings/actions', () => ({ createAccount: mocks.create, updateAccount: mocks.update }))

import FinAppFrame from './FinAppFrame'
import CoaApp from './CoaApp'
import { resetNav } from './nav'

const acc = (code: string, name: string, type: CoaAccount['type'], parent: string | null = null, active = true): CoaAccount => ({
  code, name, type, cash_flow_category: 'financing', parent_code: parent, is_active: active, sort_order: 0,
})
const CHART = [acc('4000', 'Fund Sources Payable', 'liability'), acc('4100', 'Amount Due to - Company', 'liability', '4000'), acc('4300', 'Old payable', 'liability', null, false)]
const sent = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]))

const draw = (search = '', canManage = true) => {
  window.history.replaceState(null, '', `/fin-app/page/coa${search ? `?${search}` : ''}`)
  return render(
    <FinAppFrame platform="android" rows={[]}>
      <CoaApp accounts={CHART} search={search} canManage={canManage} />
    </FinAppFrame>,
  )
}

beforeEach(() => resetNav())
afterEach(() => vi.clearAllMocks())

describe('Chart of Account on the phone', () => {
  it('Edit sends only what changed', async () => {
    mocks.update.mockResolvedValue(undefined)
    draw('f=liability&a=4100')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit 4100' })
    fireEvent.change(within(sheet).getByLabelText('Account name'), { target: { value: 'Amount Due to - Companies' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    })
    expect(sent(mocks.update.mock.calls[0][0])).toEqual({ code: '4100', name: 'Amount Due to - Companies' })
    expect(mocks.flash).toHaveBeenCalledWith('Account saved')
  })

  it('a new code is asked first — every past transaction moves with it', async () => {
    mocks.update.mockResolvedValue({ message: 'Code 4100 → 4101.' })
    draw('f=liability&a=4100')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit 4100' })
    fireEvent.change(within(sheet).getByLabelText('Code'), { target: { value: '4101' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    const ask = await screen.findByRole('dialog', { name: 'Change code 4100 → 4101?' })
    expect(within(ask).getByText(/re-pointed to 4101\. This cannot be undone\./)).toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Change code' }))
    })
    expect(sent(mocks.update.mock.calls[0][0])).toEqual({ code: '4100', new_code: '4101' })
    expect(mocks.flash).toHaveBeenCalledWith('Code 4100 → 4101.')
  })

  it('a refusal stays in the sheet, in words; nothing changed sends nothing', async () => {
    mocks.update.mockResolvedValue({ error: 'Failed to update account: parent is posted to' })
    draw('f=liability&a=4100')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    let sheet = await screen.findByRole('dialog', { name: 'Edit 4100' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    expect(mocks.update).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    sheet = await screen.findByRole('dialog', { name: 'Edit 4100' })
    fireEvent.change(within(sheet).getByLabelText('Status'), { target: { value: 'off' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    })
    expect(sent(mocks.update.mock.calls[0][0])).toEqual({ code: '4100', is_active: 'false' })
    expect(within(sheet).getByText('Failed to update account: parent is posted to')).toBeInTheDocument()
  })

  it('+ New account sends its type, name, cash flow and parent', async () => {
    mocks.create.mockResolvedValue(undefined)
    draw('f=liability')
    fireEvent.click(screen.getByRole('button', { name: '+ New account' }))
    const sheet = await screen.findByRole('dialog', { name: 'New account' })
    expect(within(sheet).getByLabelText('Account type')).toHaveValue('liability')
    fireEvent.change(within(sheet).getByLabelText('Account name'), { target: { value: 'Amount Due to - Ohana' } })
    fireEvent.change(within(sheet).getByLabelText('Parent account'), { target: { value: '4100' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Create' }))
    })
    expect(sent(mocks.create.mock.calls[0][0])).toEqual({ type: 'liability', name: 'Amount Due to - Ohana', cash_flow_category: 'financing', parent_code: '4100' })
    expect(mocks.flash).toHaveBeenCalledWith('Account added')
  })

  it('inactive accounts stay hidden until Show inactive; without Settings · Manage there is no step', () => {
    draw('f=liability', false)
    expect(screen.queryByText('Old payable')).toBeNull()
    expect(screen.queryByRole('button', { name: '+ New account' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show inactive' }))
    expect(screen.getByText('Old payable')).toBeInTheDocument()
  })
})
