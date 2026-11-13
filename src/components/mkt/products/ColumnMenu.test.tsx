import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ColumnMenu from './ColumnMenu'
import type { ItemColumn } from '@/lib/marketing/catalog'

// 2026-11-13 — a Product List column's right-click menu (the user: "多一个删除和可拖动调整位置"): Delete asks first,
// with how many values go with it; the moves stop at either end.
const COL = { id: 'c1', name: 'Tick box', kind: 'tick' } as unknown as ItemColumn

describe('a column’s right-click menu', () => {
  it('asks before deleting, and says how many values go', () => {
    const onDelete = vi.fn()
    render(<ColumnMenu column={COL} used={3} x={10} y={10} first last={false} onSettings={vi.fn()} onMove={vi.fn()} onDelete={onDelete} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete column' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText(/Delete “Tick box” and its 3 values\?/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })
  it('moves either way but past neither end; Esc closes it', () => {
    const onMove = vi.fn()
    const onClose = vi.fn()
    render(<ColumnMenu column={COL} used={0} x={10} y={10} first last={false} onSettings={vi.fn()} onMove={onMove} onDelete={vi.fn()} onClose={onClose} />)
    expect((screen.getByRole('menuitem', { name: '← Move left' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move right →' }))
    expect(onMove).toHaveBeenCalledWith(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
