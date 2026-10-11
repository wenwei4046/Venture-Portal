import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ChangePasswordForm from './ChangePasswordForm'

// Admin › Change password (2026-10-12): the current password, the new one, the new one again.

function fill(current: string, next: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } })
}

describe('ChangePasswordForm', () => {
  it('asks for the three boxes, hidden until Show passwords', () => {
    render(<ChangePasswordForm email="carrie@example.com" change={vi.fn()} />)
    for (const label of ['Current password', 'New password', 'Confirm new password']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password')
    }
    expect(screen.getByLabelText('Current password')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('autocomplete', 'new-password')
    fireEvent.click(screen.getByLabelText('Show passwords'))
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text')
  })

  it('says what is wrong before anything is sent', () => {
    const change = vi.fn()
    render(<ChangePasswordForm email="carrie@example.com" change={change} />)
    fill('old-pass', 'new-pass-1', 'new-pass-2')
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The two new passwords do not match.')
    expect(change).not.toHaveBeenCalled()
  })

  it('sends the three, then empties the boxes and says it is done', async () => {
    const change = vi.fn().mockResolvedValue({ ok: true })
    render(<ChangePasswordForm email="carrie@example.com" change={change} />)
    fill('old-pass', 'new-pass-1', 'new-pass-1')
    fireEvent.submit(screen.getByRole('form', { name: 'Change password' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Password changed.'))
    expect(change).toHaveBeenCalledWith({ current: 'old-pass', next: 'new-pass-1', confirm: 'new-pass-1' })
    expect(screen.getByLabelText('Current password')).toHaveValue('')
    expect(screen.getByLabelText('New password')).toHaveValue('')
  })

  it('shows the server’s refusal and keeps what was typed', async () => {
    const change = vi.fn().mockResolvedValue({ ok: false, reason: 'Your current password is not right.' })
    render(<ChangePasswordForm email="carrie@example.com" change={change} />)
    fill('wrong-one', 'new-pass-1', 'new-pass-1')
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Your current password is not right.'))
    expect(screen.getByLabelText('New password')).toHaveValue('new-pass-1')
    // Typing again clears what was said.
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-pass' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says it did not work when the server cannot be reached', async () => {
    const change = vi.fn().mockRejectedValue(new Error('fetch failed'))
    render(<ChangePasswordForm email="carrie@example.com" change={change} />)
    fill('old-pass', 'new-pass-1', 'new-pass-1')
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not be changed'))
  })
})
