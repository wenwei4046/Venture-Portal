import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PaysFromControl from './PaysFromControl'

const { setMonth, clearMonth, refresh } = vi.hoisted(() => ({ setMonth: vi.fn(), clearMonth: vi.fn(), refresh: vi.fn() }))
vi.mock('../cutover-actions', () => ({ setFirstPaidMonth: setMonth, clearFirstPaidMonth: clearMonth }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const SEPTEMBER = {
  firstPaidMonth: '2026-09-01',
  setAt: '2026-09-26T06:00:00Z',
  setByName: 'Principal',
  note: 'June–August paid from the claim forms',
}

beforeEach(() => {
  vi.clearAllMocks()
  setMonth.mockResolvedValue(undefined)
  clearMonth.mockResolvedValue(undefined)
  Object.defineProperty(window, 'confirm', { value: vi.fn(() => true), configurable: true, writable: true })
})
afterEach(cleanup)

describe('PaysFromControl', () => {
  it('without a first month, says every month is paid and sets one (VP 从九月开始付)', async () => {
    render(<PaysFromControl subDepartmentId="fair" cutover={null} />)
    expect(screen.getByText(/The portal pays every month/)).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Set the first month…' }))
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('First month the portal pays'), { target: { value: '2026-09' } })
    fireEvent.change(screen.getByPlaceholderText(/claim forms/), { target: { value: 'June–August paid from the claim forms' } })
    fireEvent.click(save)

    await waitFor(() => expect(setMonth).toHaveBeenCalledWith('fair', '2026-09-01', 'June–August paid from the claim forms'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('names the first month, who set it and why', () => {
    render(<PaysFromControl subDepartmentId="fair" cutover={SEPTEMBER} />)
    expect(screen.getByText('September 2026')).toBeVisible()
    expect(screen.getByText(/Earlier months were settled by hand/)).toBeVisible()
    expect(screen.getByText(/Principal · 26 Sept? 2026 · “June–August paid from the claim forms”/)).toBeVisible()
  })

  it('pays every month again only after asking', async () => {
    render(<PaysFromControl subDepartmentId="fair" cutover={SEPTEMBER} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByLabelText('First month the portal pays')).toHaveValue('2026-09')

    vi.mocked(window.confirm).mockReturnValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Pay every month' }))
    expect(clearMonth).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Pay every month' }))
    await waitFor(() => expect(clearMonth).toHaveBeenCalledWith('fair'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('says why when the database refuses', async () => {
    setMonth.mockRejectedValue(new Error('Could not save the month: A run before Oct 2026 has paid — the portal already pays from then'))
    render(<PaysFromControl subDepartmentId="fair" cutover={SEPTEMBER} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    fireEvent.change(screen.getByLabelText('First month the portal pays'), { target: { value: '2026-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A run before Oct 2026 has paid')
    expect(refresh).not.toHaveBeenCalled()
  })
})
