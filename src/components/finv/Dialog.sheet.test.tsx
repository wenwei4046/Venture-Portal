import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DialogMenu, FinDialog } from './Dialog'
import { FinSurface, type FinPlatform } from './surface'

// One window, two places (2026-10-15): on a computer the kit's dialog; inside
// the Finance phone app the design's bottom sheet — the grab bar, iOS's round ×
// (Android has none), a form's sheet 92% tall, iOS's Cancel under a menu.

const menu = (onClose = vi.fn()) => (
  <FinDialog open onClose={onClose} title="Dept Requests" tall>
    <DialogMenu items={[{ key: 'a', label: 'Marketing · FB ads top-up', onClick: () => {} }]} />
  </FinDialog>
)
const onPhone = (platform: FinPlatform, child: React.ReactNode) => <FinSurface.Provider value={{ platform }}>{child}</FinSurface.Provider>

describe('the kit’s window', () => {
  it('on a computer: the centred dialog, its × always, no sheet', () => {
    render(menu())
    const root = document.querySelector('[data-fin-dialog]') as HTMLElement
    expect(root).not.toHaveAttribute('data-sheet')
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-tall')
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('in the app on an Android phone: a sheet with no × — the scrim and Back close it', () => {
    render(onPhone('android', menu()))
    const root = document.querySelector('[data-fin-dialog]') as HTMLElement
    expect(root).toHaveAttribute('data-sheet')
    expect(root).toHaveAttribute('data-platform', 'android')
    expect(screen.getByRole('dialog')).toHaveAttribute('data-tall')
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('in the app on an iPhone: the round ×, and Cancel under a menu', () => {
    const onClose = vi.fn()
    render(onPhone('ios', menu(onClose)))
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
