import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Documentation, PersonLetter } from '@/lib/documentation/model'

const actions = vi.hoisted(() => ({ fileLetter: vi.fn(), withdrawLetter: vi.fn(), openDocumentationFile: vi.fn() }))
const { flash } = vi.hoisted(() => ({ flash: vi.fn() }))
vi.mock('@/lib/documentation/actions', () => actions)
vi.mock('@/lib/documentation/upload', () => ({ uploadDocumentationFile: vi.fn() }))
vi.mock('@/components/hrv/toast', () => ({ flash }))

import DataCenterTab from './DataCenterTab'
import PreviewDrawer from './PreviewDrawer'

// Data center's Withdraw (2026-10-11, the user's answer E): a letter filed to the
// wrong person is withdrawn from their record — asked twice, as Delete is — and
// waits greyed under "Show withdrawn", its trail a View away, its file never
// opened again.

const letter = (over: Partial<PersonLetter>): PersonLetter => ({
  id: 'L1', ref: 'D-101', staffId: 'zack', staffName: 'Zack', typeId: 'offer', typeName: 'Offer letter', fileName: 'Offer_zack.pdf',
  contentType: 'application/pdf', size: 1, filedAt: '2026-10-01T02:00:00Z', filedBy: 'HR Manager', source: 'upload',
  readAt: null, acknowledgedAt: null, withdrawnAt: null, events: [], ...over,
})

const DATA: Documentation = {
  departments: [{ id: 'rev', name: 'Revenue Department', people: 1 }],
  people: [{ id: 'zack', name: 'Zack', code: 'HV010', title: 'Senior Revenue Specialist', departmentId: 'rev' }],
  documents: [],
  letterTypes: [
    { id: 'offer', name: 'Offer letter', compulsory: true, count: 0 },
    { id: 'warn', name: 'Warning letter', compulsory: false, count: 1 },
  ],
  letters: [
    letter({ id: 'L2', typeId: 'warn', typeName: 'Warning letter', fileName: 'Warning_zack.pdf' }),
    letter({
      withdrawnAt: '2026-10-11T03:00:00Z',
      events: [
        { what: 'Uploaded', at: '2026-10-01T02:00:00Z', who: 'HR Manager', note: '' },
        { what: 'Withdrawn', at: '2026-10-11T03:00:00Z', who: 'HR Manager', note: "No longer on Zack's record or in the Revenue app" },
      ],
    }),
  ],
  publishTypes: [],
  published: [],
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset()
  actions.withdrawLetter.mockResolvedValue({ ok: true, person: 'Zack', type: 'Warning letter' })
  actions.openDocumentationFile.mockResolvedValue({ ok: false, reason: 'not in this test' })
  flash.mockReset()
})
afterEach(cleanup)

const record = () => within(screen.getByRole('region', { name: 'Zack' }))
const view = (can = { create: true, edit: true }, onView = vi.fn()) =>
  render(<DataCenterTab data={DATA} can={can} person="zack" onPerson={vi.fn()} onView={onView} />)

describe('Documentation › Data center › Withdraw', () => {
  it('shows the letters still on file; the withdrawn one counts for nothing — its compulsory type is missing again', () => {
    view()
    expect(record().getByText('Offer letter missing')).toBeInTheDocument()
    expect(record().getByText(/1 letter on file/)).toBeInTheDocument()
    expect(record().getAllByText('Warning letter')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Show withdrawn (1)' })).toBeInTheDocument()
  })

  it('asks once more, then withdraws and says who no longer sees it', async () => {
    view()
    fireEvent.click(record().getByRole('button', { name: 'Withdraw Warning letter' }))
    expect(actions.withdrawLetter).not.toHaveBeenCalled()
    const armed = record().getByRole('button', { name: 'Confirm withdrawing Warning letter' })
    expect(armed).toHaveAttribute('data-armed', 'true')
    expect(armed).toHaveTextContent('Confirm withdraw')
    fireEvent.click(armed)
    await waitFor(() => expect(actions.withdrawLetter).toHaveBeenCalledWith('L2'))
    expect(flash).toHaveBeenCalledWith('Warning letter withdrawn · Zack no longer sees it')
  })

  it('says the refusal in words when it cannot', async () => {
    actions.withdrawLetter.mockResolvedValue({ ok: false, reason: 'That letter is already withdrawn.' })
    view()
    fireEvent.click(record().getByRole('button', { name: 'Withdraw Warning letter' }))
    fireEvent.click(record().getByRole('button', { name: 'Confirm withdrawing Warning letter' }))
    await waitFor(() => expect(flash).toHaveBeenCalledWith('That letter is already withdrawn.'))
  })

  it('without Documentation · Edit there is nothing to withdraw', () => {
    view({ create: true, edit: false })
    expect(record().queryByRole('button', { name: /Withdraw/ })).toBeNull()
  })

  it('a withdrawn letter waits greyed under “Show withdrawn”, View only', () => {
    const onView = vi.fn()
    view(undefined, onView)
    fireEvent.click(screen.getByRole('button', { name: 'Show withdrawn (1)' }))
    const row = record().getByText('Withdrawn · 11 Oct').closest('div')!
    expect(row).toHaveAttribute('data-gone', 'true')
    expect(within(row).queryByRole('button', { name: /Download|Withdraw/ })).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: 'View' }))
    expect(onView).toHaveBeenCalledWith('L1')
    expect(screen.getByRole('button', { name: 'Hide withdrawn (1)' })).toBeInTheDocument()
  })
})

describe('the preview of a withdrawn letter', () => {
  it('opens on its trail, never its file', () => {
    render(<PreviewDrawer data={DATA} target={{ kind: 'letter', id: 'L1' }} onClose={vi.fn()} />)
    expect(actions.openDocumentationFile).not.toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: /Audit trail/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Status').nextElementSibling).toHaveTextContent('Withdrawn')
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(screen.getByText(/No longer on Zack's record or in the Revenue app; its trail stays\./)).toBeInTheDocument()
  })

  it('a letter still on file opens its file as before', async () => {
    render(<PreviewDrawer data={DATA} target={{ kind: 'letter', id: 'L2' }} onClose={vi.fn()} />)
    await waitFor(() => expect(actions.openDocumentationFile).toHaveBeenCalledWith('letter', 'L2', 'view'))
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
  })
})
