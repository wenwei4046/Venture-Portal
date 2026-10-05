import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UpdatePrompt from './UpdatePrompt'

const MIN = 60_000

// The page's visibility, driven by hand: the installed app going to the
// background and coming back.
let visibility: DocumentVisibilityState = 'visible'
let clock = 0
const now = () => clock

function goAway() {
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
}
async function comeBack(afterMs: number) {
  clock += afterMs
  visibility = 'visible'
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

beforeEach(() => {
  visibility = 'visible'
  clock = 1_000 * MIN
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  // The Revenue app unless a test says otherwise: the one place a long absence may reload.
  window.history.replaceState(null, '', '/member?page=today')
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

async function mount(props: { built?: string; live: string | null }) {
  const readLive = vi.fn().mockResolvedValue(props.live)
  const reload = vi.fn()
  await act(async () => {
    render(<UpdatePrompt built={props.built ?? 'dpl_old'} readLive={readLive} reload={reload} now={now} />)
  })
  return { readLive, reload }
}

describe('UpdatePrompt', () => {
  it('stays out of the way while the server runs the same build', async () => {
    const { readLive } = await mount({ live: 'dpl_old' })
    expect(readLive).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('never asks from a build that does not know its own name (local, CI)', async () => {
    const { readLive } = await mount({ built: '', live: 'dpl_new' })
    expect(readLive).not.toHaveBeenCalled()
  })

  it('offers a newer build at once, and Update loads it', async () => {
    const { reload } = await mount({ live: 'dpl_new' })
    expect(screen.getByRole('status')).toHaveTextContent('A new version is ready.')
    expect(reload).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('goes quiet on Not now, and asks again when the app comes back', async () => {
    const { reload } = await mount({ live: 'dpl_new' })
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('status')).toBeNull()
    goAway()
    await comeBack(5 * MIN)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })

  it('loads the new build by itself after half an hour away', async () => {
    // The server's answer on opening, then after a release lands while the phone is in a pocket.
    const readLive = vi.fn().mockResolvedValueOnce('dpl_old').mockResolvedValue('dpl_new')
    const reload = vi.fn()
    await act(async () => {
      render(<UpdatePrompt built="dpl_old" readLive={readLive} reload={reload} now={now} />)
    })
    expect(screen.queryByRole('status')).toBeNull()
    goAway()
    await comeBack(31 * MIN)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('never reloads a portal page, however long away: HR › Payroll may hold edits not yet saved', async () => {
    window.history.replaceState(null, '', '/hr-costing/payroll/2026-10')
    const readLive = vi.fn().mockResolvedValueOnce('dpl_old').mockResolvedValue('dpl_new')
    const reload = vi.fn()
    await act(async () => {
      render(<UpdatePrompt built="dpl_old" readLive={readLive} reload={reload} now={now} />)
    })
    goAway()
    await comeBack(8 * 60 * MIN)
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('A new version is ready.')
  })

  it('only offers it after a short time away', async () => {
    const readLive = vi.fn().mockResolvedValueOnce('dpl_old').mockResolvedValue('dpl_new')
    const reload = vi.fn()
    await act(async () => {
      render(<UpdatePrompt built="dpl_old" readLive={readLive} reload={reload} now={now} />)
    })
    goAway()
    await comeBack(10 * MIN)
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('only offers it after a long time away if something was being typed before leaving', async () => {
    const { reload } = await mount({ live: 'dpl_new' })
    const field = document.createElement('input')
    document.body.appendChild(field)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    clock += 3 * MIN
    goAway()
    await comeBack(45 * MIN)
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('only offers it while the focus is still in a field', async () => {
    const { reload } = await mount({ live: 'dpl_new' })
    const field = document.createElement('textarea')
    document.body.appendChild(field)
    field.focus()
    goAway()
    await comeBack(45 * MIN)
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('never reloads while the app is on screen: the five-minute look only offers', async () => {
    vi.useFakeTimers()
    try {
      const readLive = vi.fn().mockResolvedValueOnce('dpl_old').mockResolvedValue('dpl_new')
      const reload = vi.fn()
      await act(async () => {
        render(<UpdatePrompt built="dpl_old" readLive={readLive} reload={reload} now={now} />)
      })
      expect(screen.queryByRole('status')).toBeNull()
      clock += 5 * MIN
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5 * MIN)
      })
      expect(readLive).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(reload).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
