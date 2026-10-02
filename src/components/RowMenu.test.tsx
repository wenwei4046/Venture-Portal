import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import RowMenu, { type RowMenuItem } from './RowMenu'

function menu(onClose = vi.fn(), extra: RowMenuItem[] = []) {
  const onPdf = vi.fn()
  const onVoid = vi.fn()
  render(
    <RowMenu
      title="HV-INV-202610-0008 · issued"
      anchor={{ x: 100, y: 80 }}
      onClose={onClose}
      items={[
        { key: 'pdf', label: 'PDF', hint: '看发票', onSelect: onPdf },
        { key: 'off', label: 'Refund', disabled: true, onSelect: vi.fn() },
        'sep',
        { key: 'void', label: '作废', danger: true, onSelect: onVoid },
        ...extra,
      ]}
    />,
  )
  return { onClose, onPdf, onVoid }
}

describe('RowMenu', () => {
  it('lists the items under the row it is for', () => {
    menu()
    expect(screen.getByRole('menu', { name: 'Actions for HV-INV-202610-0008 · issued' })).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['PDF看发票', 'Refund', '作废'])
    expect(screen.getByRole('separator')).toBeInTheDocument()
  })

  it('runs the chosen action and closes', () => {
    const { onClose, onPdf } = menu()
    fireEvent.click(screen.getByRole('menuitem', { name: /PDF/ }))
    expect(onPdf).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a disabled item does nothing', () => {
    const { onClose } = menu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Refund' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape and on a press outside, but not on a press inside', () => {
    const { onClose } = menu()
    fireEvent.pointerDown(screen.getByRole('menu'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('arrow keys walk the enabled items', () => {
    menu()
    const [pdf, , voided] = screen.getAllByRole('menuitem')
    expect(document.activeElement).toBe(pdf) // focused on open
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(voided) // the disabled one is skipped
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(pdf) // and round again
  })
})
