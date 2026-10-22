import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({
  pushState: vi.fn(),
  turnPushOn: vi.fn(),
  turnPushOff: vi.fn(),
  popUpNeedsTurningOn: vi.fn(() => false),
  sendTestNotice: vi.fn(async () => true),
}))
vi.mock('./push-client', () => client)
const actions = vi.hoisted(() => ({ reportPushTrouble: vi.fn() }))
vi.mock('@/lib/push/actions', () => actions)
const portal = vi.hoisted(() => ({ PORTAL_PUSH_APP: 'hr', savePushFromBrowser: vi.fn(), removePushFromBrowser: vi.fn() }))
vi.mock('./portal-push', () => portal)

import PortalPushRow from './PortalPushRow'

// More › Phone notifications on the portal's phone face (2026-10-16 — the user's iPhone opened the Principal's own
// view, the portal, which had no way to turn them on: the phone was never asked, and the app never showed in
// Settings › Notifications).

beforeEach(() => {
  client.pushState.mockResolvedValue('off')
  client.popUpNeedsTurningOn.mockReturnValue(false)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Phone notifications in the portal’s More', () => {
  it('turns them on from the press itself, signing the phone up from the browser', async () => {
    let answer: (v: { state: 'on' }) => void = () => {}
    client.turnPushOn.mockReturnValue(new Promise(r => { answer = r }))
    render(<PortalPushRow open />)
    const row = await screen.findByRole('button', { name: /Phone notifications/ })
    expect(row).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(row)
    // Called inside the click — an iPhone asks only within the tap's own moment.
    expect(client.turnPushOn).toHaveBeenCalledWith('hr', portal.savePushFromBrowser, actions.reportPushTrouble)
    await act(async () => answer({ state: 'on' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Phone notifications/ })).toHaveAttribute('aria-pressed', 'true'))
  })

  it('turns them off for this phone', async () => {
    client.pushState.mockResolvedValue('on')
    client.turnPushOff.mockResolvedValue({ state: 'off' })
    render(<PortalPushRow open />)
    fireEvent.click(await screen.findByRole('button', { name: /Phone notifications/ }))
    await waitFor(() => expect(client.turnPushOff).toHaveBeenCalledWith(portal.removePushFromBrowser))
    expect(client.turnPushOn).not.toHaveBeenCalled()
  })

  it('says why when the phone could not', async () => {
    client.turnPushOn.mockResolvedValue({ state: 'off', reason: 'This phone did not ask. Tap once more.' })
    render(<PortalPushRow open />)
    fireEvent.click(await screen.findByRole('button', { name: /Phone notifications/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This phone did not ask. Tap once more.')
  })

  it('an iPhone outside the Home Screen app, and a phone that blocked them, show their state as a chip', async () => {
    client.pushState.mockResolvedValue('install')
    render(<PortalPushRow open />)
    expect(await screen.findByText('Add to Home Screen')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Phone notifications/ })).toBeDisabled()
    cleanup()
    client.pushState.mockResolvedValue('denied')
    render(<PortalPushRow open />)
    expect(await screen.findByText('Blocked')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Phone notifications/ })).toBeDisabled()
  })

  it('nothing where the browser cannot show them', async () => {
    client.pushState.mockResolvedValue('unsupported')
    render(<PortalPushRow open />)
    await act(async () => {})
    expect(screen.queryByText('Phone notifications')).toBeNull()
  })

  it('reads the phone again each time the sheet opens — the first open’s question may have turned them on', async () => {
    const { rerender } = render(<PortalPushRow open={false} />)
    await screen.findByRole('button', { name: /Phone notifications/ })
    client.pushState.mockResolvedValue('on')
    rerender(<PortalPushRow open />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Phone notifications/ })).toHaveAttribute('aria-pressed', 'true'))
  })

  it('on an Android phone with them on: Make them pop up, over the whole screen', async () => {
    client.pushState.mockResolvedValue('on')
    client.popUpNeedsTurningOn.mockReturnValue(true)
    const { container } = render(<PortalPushRow open />)
    fireEvent.click(await screen.findByRole('button', { name: 'Make them pop up' }))
    const guide = screen.getByRole('dialog', { name: 'Make them pop up' })
    expect(container.contains(guide)).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
