import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({
  healPush: vi.fn(),
  turnPushOn: vi.fn(),
  askedBefore: vi.fn(),
  rememberAsked: vi.fn(),
  popUpNeedsTurningOn: vi.fn(() => false),
  sendTestNotice: vi.fn(async () => true),
}))
vi.mock('./push-client', () => client)

import PushAsk from './PushAsk'

// The first open's question (2026-10-11 — the user: "当我第一次点进去这个 app … 它就会跳上来一个窗口，问我可不可以
// allow notification"): once per phone, while notifications are off and the browser has not been asked.

const save = vi.fn(async () => ({ ok: true as const }))

beforeEach(() => {
  vi.stubGlobal('Notification', { permission: 'default' })
  client.healPush.mockResolvedValue('off')
  client.askedBefore.mockReturnValue(false)
  client.popUpNeedsTurningOn.mockReturnValue(false)
  client.sendTestNotice.mockResolvedValue(true)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('the first open’s question', () => {
  it('asks a phone whose notifications are off and that was never asked', async () => {
    render(<PushAsk app="hr" save={save} />)
    expect(await screen.findByRole('dialog', { name: 'Turn on notifications?' })).toBeInTheDocument()
    expect(screen.getByText(/New requests, hiring updates and meeting bookings/)).toBeInTheDocument()
  })

  it('Allow notifications turns them on, and the question is answered', async () => {
    client.turnPushOn.mockResolvedValue({ state: 'on' })
    const onState = vi.fn()
    const trouble = vi.fn()
    render(<PushAsk app="revenue" save={save} trouble={trouble} onState={onState} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Allow notifications' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(client.turnPushOn).toHaveBeenCalledWith('revenue', save, trouble)
    expect(client.rememberAsked).toHaveBeenCalled()
    expect(onState).toHaveBeenLastCalledWith('on')
  })

  it('a phone that could not sign up says why and keeps the question open', async () => {
    client.turnPushOn.mockResolvedValue({ state: 'off', reason: 'This phone could not sign up for notifications (AbortError: x).' })
    render(<PushAsk app="hr" save={save} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Allow notifications' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('AbortError: x')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(client.rememberAsked).not.toHaveBeenCalled()
  })

  it('Not now is not asked again', async () => {
    render(<PushAsk app="hr" save={save} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(client.rememberAsked).toHaveBeenCalled()
    expect(client.turnPushOn).not.toHaveBeenCalled()
  })

  it('is not asked twice on one phone', async () => {
    client.askedBefore.mockReturnValue(true)
    render(<PushAsk app="hr" save={save} />)
    await act(async () => {})
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is not asked where they are on already — the open signed the phone up again', async () => {
    client.healPush.mockResolvedValue('on')
    const onState = vi.fn()
    render(<PushAsk app="hr" save={save} onState={onState} />)
    await waitFor(() => expect(onState).toHaveBeenCalledWith('on'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the portal’s (2026-10-16): its own words, and an open that tells the server nothing on its own', async () => {
    const trouble = vi.fn()
    render(<PushAsk app="hr" save={save} trouble={trouble} body="Meetings and memos reach this phone." reportOpen={false} />)
    expect(await screen.findByText('Meetings and memos reach this phone.')).toBeInTheDocument()
    expect(client.healPush).toHaveBeenCalledWith('hr', save, undefined)
    client.turnPushOn.mockResolvedValue({ state: 'on' })
    fireEvent.click(screen.getByRole('button', { name: 'Allow notifications' }))
    // A press still tells the server what went wrong.
    await waitFor(() => expect(client.turnPushOn).toHaveBeenCalledWith('hr', save, trouble))
  })

  it('is not asked where the phone blocked them or cannot show them', async () => {
    for (const state of ['denied', 'unsupported', 'install'] as const) {
      client.healPush.mockResolvedValue(state)
      render(<PushAsk app="hr" save={save} />)
      await act(async () => {})
      expect(screen.queryByRole('dialog')).toBeNull()
      cleanup()
    }
  })
})

// Make them pop up (2026-10-14 — the user: "make sure jump up"): Android shows an installed web app's notices in the
// shade until the person turns on Pop on screen for it — so, turned on, an Android phone is told how next.
describe('after Allow, on an Android phone', () => {
  it('shows how to make them pop up, sends a test, and Done closes it', async () => {
    client.turnPushOn.mockResolvedValue({ state: 'on' })
    client.popUpNeedsTurningOn.mockReturnValue(true)
    render(<PushAsk app="revenue" save={save} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Allow notifications' }))
    expect(await screen.findByRole('dialog', { name: 'Make them pop up' })).toBeInTheDocument()
    expect(screen.getByText(/Pop on screen/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send a test' }))
    await waitFor(() => expect(client.sendTestNotice).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: 'Send another' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a test the phone could not show says so', async () => {
    client.turnPushOn.mockResolvedValue({ state: 'on' })
    client.popUpNeedsTurningOn.mockReturnValue(true)
    client.sendTestNotice.mockResolvedValueOnce(false)
    render(<PushAsk app="hr" save={save} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Allow notifications' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Send a test' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not show it')
  })

  it('an iPhone or a computer is not told — they show them already', async () => {
    client.turnPushOn.mockResolvedValue({ state: 'on' })
    client.popUpNeedsTurningOn.mockReturnValue(false)
    render(<PushAsk app="revenue" save={save} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Allow notifications' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
