import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEntryScroll } from './useEntryScroll'

function Ledger({ view }: { view: string }) {
  const root = useRef<HTMLElement>(null)
  useEntryScroll(root, view, '.pane')
  return <section ref={root}><div className="pane" data-testid="pane" /></section>
}

function page(view: string) {
  return render(<main data-testid="main" style={{ overflowY: 'auto' }}><Ledger view={view} /></main>)
}

beforeEach(() => {
  // An entry Next manages carries `__NA`.
  window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ['tree'] }, '', '/revenue/fair/2026-09-01?person=a')
})
afterEach(cleanup)

describe('useEntryScroll', () => {
  it('keeps the page and its panes in the entry, beside Next’s own keys, at the press before a link leaves', () => {
    page('ledger-a')
    screen.getByTestId('main').scrollTop = 472
    screen.getByTestId('pane').scrollTop = 94
    fireEvent.pointerDown(document.body)
    expect(window.history.state).toEqual({
      __NA: true,
      __PRIVATE_NEXTJS_INTERNALS_TREE: ['tree'],
      __vpScroll: { view: 'ledger-a', page: 472, panes: [[94, 0]] },
    })
  })

  it('puts the position back when the reader returns to that entry', () => {
    const first = page('ledger-a')
    screen.getByTestId('main').scrollTop = 472
    screen.getByTestId('pane').scrollTop = 94
    fireEvent.keyDown(document.body, { key: 'Enter' })
    first.unmount() // off to the bill…

    page('ledger-a') // …and Back
    expect(screen.getByTestId('main').scrollTop).toBe(472)
    expect(screen.getByTestId('pane').scrollTop).toBe(94)
  })

  it('never puts one view’s position onto another', () => {
    const first = page('ledger-a')
    screen.getByTestId('main').scrollTop = 472
    fireEvent.pointerDown(document.body)
    first.unmount()

    page('ledger-b')
    expect(screen.getByTestId('main').scrollTop).toBe(0)
  })

  it('leaves an entry Next does not manage alone', () => {
    window.history.replaceState({ someone: 'else' }, '')
    page('ledger-a')
    screen.getByTestId('main').scrollTop = 200
    fireEvent.pointerDown(document.body)
    expect(window.history.state).toEqual({ someone: 'else' })
  })
})
