import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({
  PUSH_WORDS: { on: 'On — this phone shows new notifications', off: 'Off — tap to get them on this phone', install: 'Add the app to your Home Screen first', denied: 'Blocked in this phone’s settings', unsupported: 'This browser cannot show them' },
  pushState: vi.fn(),
  turnPushOn: vi.fn(),
  turnPushOff: vi.fn(),
  popUpNeedsTurningOn: vi.fn(() => false),
}))
vi.mock('@/components/pwa/push-client', () => client)
const actions = vi.hoisted(() => ({ reportPushTrouble: vi.fn() }))
vi.mock('@/lib/push/actions', () => actions)
const portal = vi.hoisted(() => ({ PORTAL_PUSH_APP: 'hr', savePushFromBrowser: vi.fn(), removePushFromBrowser: vi.fn() }))
vi.mock('@/components/pwa/portal-push', () => portal)
vi.mock('@/components/pwa/PopUpGuide', () => ({ default: () => null }))

import PushRow from './PushRow'

// Profile › This phone in the Finance app (2026-10-17): the Principal's own view lands here on a phone now, not on
// the portal's phone face where #514 gave the user's iPhone its switch — so the app carries the same one.

beforeEach(() => {
  client.pushState.mockResolvedValue('off')
  client.popUpNeedsTurningOn.mockReturnValue(false)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Phone notifications in the Finance app’s Profile', () => {
  it('turns them on from the press itself, the portal’s own way (the HR app’s places, from the browser)', async () => {
    let answer: (v: { state: 'on' }) => void = () => {}
    client.turnPushOn.mockReturnValue(new Promise((r) => { answer = r }))
    render(<PushRow roman="III." />)
    expect(await screen.findByText('This phone')).toBeInTheDocument()
    const row = screen.getByRole('button', { name: /Phone notifications/ })
    expect(row).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(row)
    expect(client.turnPushOn).toHaveBeenCalledWith('hr', portal.savePushFromBrowser, actions.reportPushTrouble)
    await act(async () => answer({ state: 'on' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Phone notifications/ })).toHaveAttribute('aria-pressed', 'true'))
  })

  it('turns them off for this phone, and says why when the phone could not', async () => {
    client.pushState.mockResolvedValue('on')
    client.turnPushOff.mockResolvedValue({ state: 'off', reason: 'Notifications could not be turned off. Please try again.' })
    render(<PushRow roman="III." />)
    fireEvent.click(await screen.findByRole('button', { name: /Phone notifications/ }))
    await waitFor(() => expect(client.turnPushOff).toHaveBeenCalledWith(portal.removePushFromBrowser))
    expect(await screen.findByRole('alert')).toHaveTextContent('Notifications could not be turned off.')
  })

  it('draws nothing — no head, no empty card — where the phone cannot show them', async () => {
    client.pushState.mockResolvedValue('unsupported')
    const { container } = render(<PushRow roman="III." />)
    await waitFor(() => expect(client.pushState).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('cannot be pressed on an iPhone outside the Home Screen app, saying so', async () => {
    client.pushState.mockResolvedValue('install')
    render(<PushRow roman="III." />)
    const row = await screen.findByRole('button', { name: /Phone notifications/ })
    expect(row).toBeDisabled()
    expect(row).toHaveTextContent('Add the app to your Home Screen first')
  })
})
