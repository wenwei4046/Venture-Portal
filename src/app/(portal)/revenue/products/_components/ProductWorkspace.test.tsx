import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProductWorkspace, { productTabScroll, useProductDraftGuard, useProductDraftState } from './ProductWorkspace'
import ProductListTabs, { type ProductTab } from './ProductListTabs'

const { push, query } = vi.hoisted(() => ({ push: vi.fn(), query: { current: '' } }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/revenue/products',
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(query.current),
}))

function Draft({ dirty = false, saving = false }: { dirty?: boolean; saving?: boolean }) {
  useProductDraftGuard(dirty, saving)
  return null
}
function State() {
  const { dirty, saving } = useProductDraftState()
  return <output aria-label="Draft state">{dirty ? 'dirty' : 'clean'} / {saving ? 'saving' : 'idle'}</output>
}
function Workspace({ dirty = false, saving = false, active = 'sku', editor = true }: { dirty?: boolean; saving?: boolean; active?: ProductTab; editor?: boolean }) {
  return <ProductWorkspace><ProductListTabs active={active} />{editor ? <Draft dirty={dirty} saving={saving} /> : null}<State /></ProductWorkspace>
}

beforeEach(() => { push.mockReset(); query.current = ''; vi.stubGlobal('confirm', vi.fn()); window.history.replaceState({}, '', '/revenue/products') })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Product List scrolling', () => {
  it('lets the page scroll the lists and keeps the wide sheets in a fixed window', () => {
    expect(productTabScroll('modular')).toBe('page')
    expect(productTabScroll('maintenance')).toBe('page')
    expect(productTabScroll('sku')).toBe('window')
    expect(productTabScroll('combos')).toBe('window')
    expect(productTabScroll('gaps')).toBe('window')
    expect(productTabScroll('costing')).toBe('page')
    expect(productTabScroll('kpi')).toBe('page')
  })

  it("marks the workspace with its tab's mode, the fixed window when no tab is named", () => {
    const view = render(<ProductWorkspace tab="maintenance"><p>Rows</p></ProductWorkspace>)
    expect(view.container.firstElementChild).toHaveAttribute('data-scroll', 'page')
    view.rerender(<ProductWorkspace tab="combos"><p>Rows</p></ProductWorkspace>)
    expect(view.container.firstElementChild).toHaveAttribute('data-scroll', 'window')
    view.rerender(<ProductWorkspace><p>Rows</p></ProductWorkspace>)
    expect(view.container.firstElementChild).toHaveAttribute('data-scroll', 'window')
  })
})

describe('Product List draft navigation', () => {
  it('navigates clean tabs with the correct URL without resetting page scroll', () => {
    const view = render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: 'SKU Master' }))
    expect(push).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Combo Pricing' }))
    expect(push).toHaveBeenLastCalledWith('/revenue/products?tab=combos', { scroll: false })
    view.rerender(<Workspace active="combos" />)
    fireEvent.click(screen.getByRole('button', { name: 'SKU Master' }))
    expect(push).toHaveBeenLastCalledWith('/revenue/products', { scroll: false })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('carries the sub-department between the two settings tabs, and nowhere else', () => {
    query.current = 'tab=costing&sub=ir'
    render(<Workspace active="costing" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add-on / KPI Items' }))
    expect(push).toHaveBeenLastCalledWith('/revenue/products?tab=kpi&sub=ir', { scroll: false })
    fireEvent.click(screen.getByRole('button', { name: 'Combo Pricing' }))
    expect(push).toHaveBeenLastCalledWith('/revenue/products?tab=combos', { scroll: false })
  })

  it('keeps the dirty tab until the user explicitly discards or stays', () => {
    render(<Workspace dirty />)
    fireEvent.click(screen.getByRole('button', { name: 'Maintenance' }))
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Discard them and open Maintenance?')
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Draft state' })).toHaveTextContent('dirty / idle')
    fireEvent.click(screen.getByRole('button', { name: 'Modular' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard and switch' }))
    expect(push).toHaveBeenCalledExactlyOnceWith('/revenue/products?tab=modular', { scroll: false })
  })

  it('blocks every tab and a pending discard while a save is in flight', () => {
    const view = render(<Workspace dirty />)
    fireEvent.click(screen.getByRole('button', { name: 'Costing gaps' }))
    view.rerender(<Workspace dirty saving />)
    for (const button of within(screen.getByRole('navigation', { name: 'Product list views' })).getAllByRole('button')) expect(button).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Discard and switch' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Discard and switch' }))
    expect(push).not.toHaveBeenCalled()
    view.rerender(<Workspace dirty />)
    expect(screen.getByRole('button', { name: 'Discard and switch' })).toBeEnabled()
  })

  it('clears guards after a draft is saved or its editor unmounts', () => {
    const view = render(<Workspace dirty />)
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    view.rerender(<Workspace />)
    const cleanUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanUnload)
    expect(cleanUnload.defaultPrevented).toBe(false)
    view.rerender(<Workspace dirty />)
    view.rerender(<Workspace editor={false} />)
    expect(screen.getByRole('status', { name: 'Draft state' })).toHaveTextContent('clean / idle')
    fireEvent.click(screen.getByRole('button', { name: 'Maintenance' }))
    expect(push).toHaveBeenCalledExactlyOnceWith('/revenue/products?tab=maintenance', { scroll: false })
  })

  it('prompts on ordinary links, honours cancellation and permits confirmed navigation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const clicked = vi.fn((event: React.MouseEvent) => event.preventDefault())
    render(<ProductWorkspace><Draft dirty /><a href="/dashboard" onClick={clicked}><span>Dashboard</span></a></ProductWorkspace>)
    fireEvent.click(screen.getByText('Dashboard'))
    expect(confirm).toHaveBeenCalledOnce()
    expect(clicked).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByText('Dashboard'))
    expect(clicked).toHaveBeenCalledOnce()
  })

  it('locks navigation during a save without offering to discard the in-flight write', () => {
    const confirm = vi.spyOn(window, 'confirm')
    const clicked = vi.fn((event: React.MouseEvent) => event.preventDefault())
    render(<ProductWorkspace><Draft saving /><a href="/dashboard" onClick={clicked}>Dashboard</a></ProductWorkspace>)
    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }))
    expect(clicked).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
  })

  it('allows anchors, downloads, new tabs and modified clicks that leave the draft mounted', () => {
    const confirm = vi.spyOn(window, 'confirm')
    const clicked = vi.fn((event: React.MouseEvent) => event.preventDefault())
    render(<ProductWorkspace><Draft dirty />
      <a href="#details" onClick={clicked}>Details</a>
      <a href="/export.csv" download onClick={clicked}>Download</a>
      <a href="/dashboard" target="_blank" onClick={clicked}>New tab</a>
      <a href="/dashboard" onClick={clicked}>Dashboard</a>
    </ProductWorkspace>)
    for (const name of ['Details', 'Download', 'New tab']) fireEvent.click(screen.getByRole('link', { name }))
    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }), { ctrlKey: true })
    expect(clicked).toHaveBeenCalledTimes(4)
    expect(confirm).not.toHaveBeenCalled()
  })
})
