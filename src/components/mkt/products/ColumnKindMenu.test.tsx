import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ColumnKindMenu from './ColumnKindMenu'

// The Product List's + asks what the new column holds first (the user, 2026-11-13: 勾选，价格，下拉式，文字).
describe('the + of the Product List', () => {
  it('offers Text, Price, Number, Dropdown, Tick box — the pick is passed on', () => {
    const onPick = vi.fn()
    const anchor = document.createElement('button')
    render(<ColumnKindMenu at={{ left: 0, top: 0 }} anchor={anchor} onPick={onPick} onClose={() => {}} />)
    expect(screen.getAllByRole('menuitem').map(b => b.textContent)).toEqual([
      'AaTextWords — a size, a note', 'RMPrice (RM)An amount in ringgit', '#NumberA count — slides, minutes', '≡DropdownPick one of your options', '✓Tick boxYes or no',
    ])
    fireEvent.click(screen.getByRole('menuitem', { name: /Dropdown/ }))
    expect(onPick).toHaveBeenCalledWith('choice')
  })
  it('closes on Esc and on a click outside, not on its own +', () => {
    const onClose = vi.fn()
    const anchor = document.createElement('button')
    document.body.append(anchor)
    render(<ColumnKindMenu at={{ left: 0, top: 0 }} anchor={anchor} onPick={() => {}} onClose={onClose} />)
    fireEvent.mouseDown(anchor)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
