import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FinViewProvider } from './layout/fin-view'
import { useRowLinks } from './row-links'

// 2026-10-09 — on the Finance view a row's menu reads in English (the user's
// Claude Design handoff): Open, Open in new tab; elsewhere as it was.

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

function List() {
  const links = useRowLinks<{ id: string; name: string }>({ href: (r) => `/fund-out/${r.id}`, title: (r) => r.name })
  const row = { id: 'l1', name: 'Carres' }
  return (
    <>
      <div onContextMenu={(e) => links.onRowContextMenu(row, e)}>row</div>
      {links.menu}
    </>
  )
}

describe('useRowLinks on the Finance view', () => {
  it('offers Open and Open in new tab, in English, on a Finance menu', () => {
    render(
      <FinViewProvider value={true}>
        <List />
      </FinViewProvider>,
    )
    fireEvent.contextMenu(screen.getByText('row'))
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Openor double-click', 'Open in new tab'])
    expect(screen.getByRole('menu')).toHaveAttribute('data-fin', 'true')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open or double-click' }))
    expect(push).toHaveBeenCalledWith('/fund-out/l1')
  })

  it('keeps its Chinese elsewhere', () => {
    render(<List />)
    fireEvent.contextMenu(screen.getByText('row'))
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['打开双击也可以', '在新分页打开'])
    expect(screen.getByRole('menu')).not.toHaveAttribute('data-fin')
  })
})
