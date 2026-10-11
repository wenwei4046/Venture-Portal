import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ list: vi.fn(), view: vi.fn(), stop: vi.fn(), setViewAs: vi.fn() }))
vi.mock('./view-as-actions', () => ({
  listViewablePeople: mocks.list,
  setViewAsPerson: mocks.view,
  stopViewingAsPerson: mocks.stop,
  setViewAs: mocks.setViewAs,
}))

import ViewAsPersonPicker from './ViewAsPersonPicker'
import PortalViewSwitcher from './PortalViewSwitcher'
import ViewingAsBanner from './ViewingAsBanner'

const PEOPLE = [
  { id: '3bff3ae3-d0a8-418c-b2b1-a2aa5fdd5419', name: 'ONG MEI SHUANG', email: 'carrie@example.com', title: 'ACCOUNTS EXECUTIVE', department: 'Finance' },
  { id: '11111111-1111-4111-8111-111111111111', name: 'HR Manager', email: 'hr@venture.my', title: null, department: null },
]

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.list.mockResolvedValue({ ok: true, people: PEOPLE })
  mocks.view.mockResolvedValue(undefined)
})

describe('View as a person (2026-10-11)', () => {
  it('lists everybody by department, finds by name, and views the one picked', async () => {
    render(<ViewAsPersonPicker open onClose={() => {}} />)
    expect(await screen.findByText('ONG MEI SHUANG')).toBeInTheDocument()
    expect(screen.getByText('Finance')).toBeInTheDocument()
    expect(screen.getByText('No department')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'accounts' } })
    expect(screen.queryByText('HR Manager')).toBeNull()
    await act(async () => fireEvent.click(screen.getByText('ONG MEI SHUANG')))
    const fd = mocks.view.mock.calls[0][0] as FormData
    expect(fd.get('person')).toBe(PEOPLE[0].id)
  })

  it('says why when the database refuses', async () => {
    mocks.view.mockResolvedValue({ ok: false, reason: 'Only whoever may switch views can view as somebody else' })
    render(<ViewAsPersonPicker open onClose={() => {}} />)
    const row = await screen.findByText('HR Manager')
    await act(async () => fireEvent.click(row))
    expect(screen.getByRole('alert')).toHaveTextContent('Only whoever may switch views')
  })

  it('opens from the view switcher, which keeps showing the view drawn', async () => {
    render(<PortalViewSwitcher value="principal" />)
    const select = screen.getByLabelText('View portal as role') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'person' } })
    expect(await screen.findByRole('dialog', { name: 'View as a person' })).toBeInTheDocument()
    expect(select.value).toBe('principal')
    expect(mocks.setViewAs).not.toHaveBeenCalled()
  })

  it('names whose portal is drawn while viewing, and ends it with Stop viewing', async () => {
    render(<PortalViewSwitcher value="finance" viewingAs="ONG MEI SHUANG" />)
    expect((screen.getByLabelText('View portal as role') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Viewing as ONG MEI SHUANG')
    render(<ViewingAsBanner name="ONG MEI SHUANG" />)
    expect(screen.getByRole('status')).toHaveTextContent('Viewing as ONG MEI SHUANG — their pages, menus and buttons. Read-only: nothing you press is saved.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop viewing' })).toBeEnabled())
  })
})
