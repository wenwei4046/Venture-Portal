import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { Select } from './select'

// The soft dropdown (2026-10-11, HR revamp round 2 — README 18.1): the real
// <select> keeps its value and onChange; a pointer press opens our menu.

function Picker({ onPick, options = ['Memo', 'Letter', 'Notice'] }: { onPick?: (v: string) => void; options?: string[] }) {
  const [value, setValue] = useState('')
  return (
    <Select
      aria-label="Type"
      value={value}
      onChange={e => {
        setValue(e.target.value)
        onPick?.(e.target.value)
      }}
    >
      <option value="">Choose…</option>
      {options.map(o => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </Select>
  )
}

const open = () => fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Type' }), { button: 0 })

describe('Select', () => {
  it('opens its own menu on a press, the blank option grey and nothing picked yet', () => {
    render(<Picker />)
    expect(screen.queryByRole('listbox')).toBeNull()
    open()
    const rows = screen.getAllByRole('option').filter(o => o.tagName === 'DIV')
    expect(rows.map(r => r.textContent?.replace('✓', ''))).toEqual(['Choose…', 'Memo', 'Letter', 'Notice'])
    expect(rows[0]).toHaveAttribute('data-placeholder', 'true')
    expect(rows.filter(r => r.getAttribute('aria-selected') === 'true')).toHaveLength(0)
  })

  it('a pick sets the value through onChange and closes the menu', () => {
    const onPick = vi.fn()
    render(<Picker onPick={onPick} />)
    open()
    const letter = screen.getAllByRole('option').find(o => o.tagName === 'DIV' && o.textContent?.startsWith('Letter'))!
    fireEvent.mouseDown(letter)
    expect(onPick).toHaveBeenCalledWith('Letter')
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveValue('Letter')
    expect(screen.queryByRole('listbox')).toBeNull()
    open()
    const picked = screen.getAllByRole('option').filter(o => o.tagName === 'DIV' && o.getAttribute('aria-selected') === 'true')
    expect(picked.map(p => p.textContent?.replace('✓', ''))).toEqual(['Letter'])
  })

  it('Esc closes the menu only, and a press outside closes it', () => {
    const onKey = vi.fn()
    window.addEventListener('keydown', onKey)
    render(<Picker />)
    open()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onKey).not.toHaveBeenCalled()
    window.removeEventListener('keydown', onKey)
    open()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('a second press on the field closes it', () => {
    render(<Picker />)
    open()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    open()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('searches once there are more than eight options', () => {
    const many = ['Revenue', 'HR', 'Finance', 'Marketing', 'IT', 'Director', 'Director Office', 'Venture Office', 'Logistics']
    render(<Picker options={many} />)
    open()
    const search = screen.getByRole('textbox', { name: 'Search the options' })
    act(() => {
      fireEvent.change(search, { target: { value: 'dir' } })
    })
    const rows = screen.getAllByRole('option').filter(o => o.tagName === 'DIV')
    expect(rows.map(r => r.textContent?.replace('✓', ''))).toEqual(['Director', 'Director Office'])
  })

  it('opens above when the whole menu does not fit below and there is more room above', () => {
    // A phone (844px tall), the field low on the screen, a menu 330px tall: dropdown.js opened it below
    // (more than 200px were free) and it ran off the screen's bottom (the phone audit, 2026-10-11).
    const tall = Object.getOwnPropertyDescriptor(window, 'innerHeight')
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    const rect = (top: number, height: number, width = 358) =>
      ({ top, bottom: top + height, left: 16, right: 16 + width, width, height, x: 16, y: top, toJSON: () => ({}) }) as DOMRect
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.tagName === 'SELECT') return rect(579, 46)
      if (this.hasAttribute('data-soft-menu')) return rect(0, 330)
      return rect(0, 0, 0)
    })
    try {
      render(<Picker />)
      open()
      const menu = document.querySelector<HTMLElement>('[data-soft-menu]')!
      // Above the field: 579 − 330 − 6.
      expect(menu.style.top).toBe('243px')
      // Its list sized to the room above (567px, capped at 320, less its padding).
      expect(screen.getByRole('listbox').style.maxHeight).toBe('308px')
    } finally {
      spy.mockRestore()
      if (tall) Object.defineProperty(window, 'innerHeight', tall)
    }
  })

  it('still opens below when it fits there', () => {
    const rect = (top: number, height: number, width = 358) =>
      ({ top, bottom: top + height, left: 16, right: 16 + width, width, height, x: 16, y: top, toJSON: () => ({}) }) as DOMRect
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.tagName === 'SELECT') return rect(100, 46)
      if (this.hasAttribute('data-soft-menu')) return rect(0, 180)
      return rect(0, 0, 0)
    })
    try {
      render(<Picker />)
      open()
      expect(document.querySelector<HTMLElement>('[data-soft-menu]')!.style.top).toBe('152px')
    } finally {
      spy.mockRestore()
    }
  })

  it('stays shut while disabled', () => {
    render(
      <Select aria-label="Type" disabled defaultValue="">
        <option value="">Choose…</option>
      </Select>,
    )
    open()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  // Part 1 (2026-10-11): round 1's selects move over.
  it('plain keeps the caller’s field as drawn and still opens our menu', () => {
    render(
      <Select aria-label="Type" plain className="mine" defaultValue="a">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    )
    expect(screen.getByRole('combobox', { name: 'Type' }).className).toBe('mine')
    open()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('an option group’s label heads its options, and a search drops a group with none left', () => {
    render(
      <Select aria-label="Type" defaultValue="">
        <option value="">Pick somebody</option>
        <optgroup label="Revenue">
          {['Amelia', 'Ben', 'Chong', 'Dina', 'Elle'].map(n => <option key={n} value={n}>{n}</option>)}
        </optgroup>
        <optgroup label="Finance">
          {['Farah', 'Grace', 'Hui'].map(n => <option key={n} value={n}>{n}</option>)}
        </optgroup>
      </Select>,
    )
    open()
    const list = screen.getByRole('listbox')
    expect([...list.children].map(c => c.textContent)).toEqual([
      'Pick somebody✓', 'Revenue', 'Amelia✓', 'Ben✓', 'Chong✓', 'Dina✓', 'Elle✓', 'Finance', 'Farah✓', 'Grace✓', 'Hui✓',
    ])
    fireEvent.change(screen.getByRole('textbox', { name: 'Search the options' }), { target: { value: 'gr' } })
    expect([...list.children].map(c => c.textContent)).toEqual(['Finance', 'Grace✓'])
    fireEvent.mouseDown(within(list).getByRole('option', { name: /Grace/ }))
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveValue('Grace')
  })
})
