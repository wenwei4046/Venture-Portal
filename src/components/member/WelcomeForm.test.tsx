import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import WelcomeForm from './WelcomeForm'

// An invite link's two boxes (2026-10-16): the new password and the same
// again, each behind the sign-in page's eye, and Activate.

afterEach(cleanup)

const fill = (password: string, confirm = password) => {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirm } })
}
const activate = async () => act(async () => fireEvent.submit(screen.getByRole('form', { name: 'Set your password' })))

describe('WelcomeForm', () => {
  it('hides both boxes until their own eye is pressed', () => {
    render(<WelcomeForm action={vi.fn()} token="tok-123" />)
    const box = screen.getByLabelText('New password') as HTMLInputElement
    const again = screen.getByLabelText('Confirm password') as HTMLInputElement
    expect([box.type, again.type]).toEqual(['password', 'password'])
    fireEvent.click(screen.getByRole('button', { name: 'Show new password' }))
    expect([box.type, again.type]).toEqual(['text', 'password'])
    fireEvent.click(screen.getByRole('button', { name: 'Show confirm password' }))
    expect(again.type).toBe('text')
  })

  it('says a short or different password before it asks the server', async () => {
    const action = vi.fn()
    render(<WelcomeForm action={action} token="tok-123" />)
    fill('12345')
    await activate()
    expect(screen.getByRole('alert')).toHaveTextContent('at least 6 characters')
    fill('123456', '654321')
    await activate()
    expect(screen.getByRole('alert')).toHaveTextContent('not the same')
    expect(action).not.toHaveBeenCalled()
  })

  it('sends the link’s token with the two boxes, then says what the page answers — and remembers the link was used', async () => {
    const action = vi.fn(async () => ({ error: 'Your password was not saved. Try again.', verified: true }))
    render(<WelcomeForm action={action} token="tok-123" />)
    fill('Hv-new-pass')
    await activate()
    const sent = (action.mock.calls[0] as unknown as [FormData])[0]
    expect([sent.get('token_hash'), sent.get('password'), sent.get('confirm'), sent.get('verified')]).toEqual(['tok-123', 'Hv-new-pass', 'Hv-new-pass', ''])
    expect(screen.getByRole('alert')).toHaveTextContent('Your password was not saved')
    fill('Hv-new-pass')
    await activate()
    expect((action.mock.calls[1] as unknown as [FormData])[0].get('verified')).toBe('1')
  })
})
