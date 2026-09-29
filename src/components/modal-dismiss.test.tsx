import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { backdropDismiss } from './modal-dismiss'

function Modal({ close }: { close: () => void }) {
  return (
    <div data-testid="backdrop" {...backdropDismiss(close)}>
      <div data-testid="panel">
        <input defaultValue="Claude Ai Claim - Sep'26" />
      </div>
    </div>
  )
}

describe('backdropDismiss', () => {
  it('closes when the click both starts and ends on the backdrop', () => {
    const close = vi.fn()
    render(<Modal close={close} />)
    const backdrop = screen.getByTestId('backdrop')
    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
    expect(close).toHaveBeenCalledTimes(1)
  })

  // The bug this exists for: selecting text inside the modal and releasing over
  // the scrim fires `click` on their common ancestor, the backdrop.
  it('does not close when a drag started inside the modal', () => {
    const close = vi.fn()
    render(<Modal close={close} />)
    fireEvent.mouseDown(screen.getByRole('textbox'))
    fireEvent.click(screen.getByTestId('backdrop'))
    expect(close).not.toHaveBeenCalled()
  })

  it('does not close on a click inside the modal', () => {
    const close = vi.fn()
    render(<Modal close={close} />)
    fireEvent.mouseDown(screen.getByTestId('panel'))
    fireEvent.click(screen.getByTestId('panel'))
    expect(close).not.toHaveBeenCalled()
  })

  it('a drag that ended on the backdrop does not arm the NEXT click', () => {
    const close = vi.fn()
    render(<Modal close={close} />)
    fireEvent.mouseDown(screen.getByRole('textbox'))
    fireEvent.click(screen.getByTestId('backdrop'))
    fireEvent.click(screen.getByTestId('backdrop')) // no mousedown of its own
    expect(close).not.toHaveBeenCalled()
  })

  it('closes on Escape while mounted, and stops listening once unmounted', () => {
    const close = vi.fn()
    const view = render(<Modal close={close} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(1)
    view.unmount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('ignores other keys', () => {
    const close = vi.fn()
    render(<Modal close={close} />)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(close).not.toHaveBeenCalled()
  })
})
