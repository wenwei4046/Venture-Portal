import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
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

  it('stays shut while disabled', () => {
    render(
      <Select aria-label="Type" disabled defaultValue="">
        <option value="">Choose…</option>
      </Select>,
    )
    open()
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
