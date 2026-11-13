import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import Tip from './Tip'

// 2026-11-13 — the user: a helper line shows only while its option is pointed at ("改成鼠标指向选项才出现"), and the
// keyboard reaches it too. One tip for the Marketing view, drawn on the body so no overflow clips it.

describe('the tooltip', () => {
  it('is not on the page until its option is pointed at; it goes when the mouse leaves', () => {
    render(<Tip text="What picking it means"><button type="button">Option</button></Tip>)
    expect(screen.queryByText('What picking it means')).toBeNull()
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Option' }))
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toBe('What picking it means')
    expect(tip.parentElement).toBe(document.body)
    expect(screen.getByRole('button', { name: 'Option' }).getAttribute('aria-describedby')).toBe(tip.id)
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Option' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(screen.getByRole('button', { name: 'Option' }).getAttribute('aria-describedby')).toBeNull()
  })
  it('shows on keyboard focus, and Escape or blur closes it', () => {
    render(<Tip text="Help"><button type="button">Option</button></Tip>)
    const b = screen.getByRole('button', { name: 'Option' })
    act(() => b.focus())
    expect(screen.getByRole('tooltip').textContent).toBe('Help')
    fireEvent.keyDown(b, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => b.blur())
    act(() => b.focus())
    expect(screen.getByRole('tooltip')).toBeTruthy()
    act(() => b.blur())
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
  it('no text: no tip, the option drawn as it is', () => {
    render(<Tip text={null}><button type="button">Option</button></Tip>)
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Option' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
