import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ColumnTable, { type TableColumn } from './ColumnTable'

type Row = { id: string; code: string; name: string; price: number }
const rows: Row[] = [
  { id: '1', code: 'A-1', name: 'Alpha', price: 10 },
  { id: '2', code: 'B-2', name: 'Beta', price: 20 },
]
const columns: TableColumn<Row>[] = [
  { key: 'code', label: 'Code', defaultWidth: 180, cell: r => r.code },
  { key: 'name', label: 'Name', defaultWidth: 300, cell: r => r.name },
  { key: 'price', label: 'Price', className: 'num', defaultWidth: 120, cell: r => String(r.price) },
  { key: 'size:24', label: '24', movable: false, className: 'num', defaultWidth: 100, cell: () => '—' },
]

function Table({ id = 'test', list = rows }: { id?: string; list?: Row[] }) {
  return (
    <ColumnTable id={id} label="Test table" columns={columns} rows={list} rowKey={r => r.id}
      empty="Nothing here" footer={reset => <div><span>{list.length} rows</span>{reset}</div>} />
  )
}

const headers = () => screen.getAllByRole('columnheader').map(h => h.textContent)
const firstCells = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
  .map(row => within(row).getAllByRole('cell')[0].textContent)
const th = (name: string) => screen.getByRole('columnheader', { name })
const edge = (name: string) => screen.getByRole('separator', { name: `Resize the ${name} column` })
const colWidths = () => Array.from(screen.getByRole('table').querySelectorAll('col')).map(c => c.style.width)
function stored(id = 'test') {
  const part = document.cookie.split(/;\s*/).find(p => p.startsWith(`vp-cols.${id}=`))
  return part ? JSON.parse(decodeURIComponent(part.slice(`vp-cols.${id}=`.length))) : null
}
function setStored(value: string, id = 'test') {
  document.cookie = `vp-cols.${id}=${encodeURIComponent(value)}; Path=/member/products`
}
/** The Product List's layout cookies are scoped to its path (in the Revenue app since 2026-10-08). */
function onProductList() {
  window.history.replaceState(null, '', '/member/products')
  for (const name of document.cookie.split(/;\s*/).map(part => part.split('=')[0])) {
    if (name.startsWith('vp-cols.')) document.cookie = `${name}=; Path=/member/products; Max-Age=0`
  }
}

function drag(from: string, to: string) {
  fireEvent.dragStart(th(from))
  fireEvent.dragOver(th(to))
  fireEvent.drop(th(to))
  fireEvent.dragEnd(th(from))
}

beforeEach(onProductList)
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ColumnTable', () => {
  it('opens in the table order with the first column frozen and the seat sizes fixed', () => {
    render(<Table />)
    expect(headers()).toEqual(['Code', 'Name', 'Price', '24'])
    expect(th('Code')).toHaveAttribute('data-first')
    expect(th('Name')).toHaveAttribute('draggable', 'true')
    expect(th('24')).toHaveAttribute('draggable', 'false')
    expect(screen.getByText('2 rows')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset columns' })).not.toBeInTheDocument()
  })

  it('swaps two columns when a header is dropped on another, and remembers it', () => {
    const { unmount } = render(<Table />)
    fireEvent.dragStart(th('Name'))
    fireEvent.dragOver(th('Code'))
    expect(th('Code').querySelector('[data-side]')).toHaveAttribute('data-side', 'before')
    fireEvent.drop(th('Code'))
    expect(headers()).toEqual(['Name', 'Code', 'Price', '24'])
    expect(firstCells()).toEqual(['Alpha', 'Beta'])
    expect(th('Name')).toHaveAttribute('data-first')
    expect(th('Code')).not.toHaveAttribute('data-first')
    expect(stored()).toEqual({ order: ['name', 'code', 'price'], widths: {} })

    drag('Name', 'Price')
    expect(headers()).toEqual(['Code', 'Price', 'Name', '24'])

    unmount()
    render(<Table />)
    expect(headers()).toEqual(['Code', 'Price', 'Name', '24'])
  })

  it('never moves a fixed column, nor lets one take a drop', () => {
    render(<Table />)
    const refused = createEvent.dragStart(th('24'))
    fireEvent(th('24'), refused)
    expect(refused.defaultPrevented).toBe(true)
    fireEvent.dragStart(th('Code'))
    const over = createEvent.dragOver(th('24'))
    fireEvent(th('24'), over)
    expect(over.defaultPrevented).toBe(false)
    fireEvent.drop(th('24'))
    expect(headers()).toEqual(['Code', 'Name', 'Price', '24'])
    expect(stored()).toBeNull()
  })

  it('resizes by dragging the edge, sizing the column live and storing it on release', () => {
    render(<Table />)
    const handle = edge('Price')
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 100 })
    expect(screen.getByRole('table')).toHaveAttribute('data-layout', 'fixed')
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 160 })
    expect(colWidths()).toEqual(['180px', '300px', '180px', '100px', ''])
    expect(screen.getByRole('table').style.minWidth).toBe('760px')
    expect(stored()).toBeNull()
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 160 })
    expect(stored()).toEqual({ order: [], widths: { price: 180 } })
    expect(handle).toHaveAttribute('aria-valuenow', '180')
    // Only that column moved.
    expect(colWidths()).toEqual(['180px', '300px', '180px', '100px', ''])
  })

  it('puts the column back when the drag is cancelled, and never below the minimum', () => {
    render(<Table />)
    const handle = edge('Price')
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 0 })
    expect(colWidths()[2]).toBe('64px')
    fireEvent.pointerCancel(handle, { pointerId: 1 })
    expect(colWidths()[2]).toBe('120px')
    expect(stored()).toBeNull()
  })

  it('resizes with ←/→ and moves with Alt+←/→ from the keyboard', () => {
    render(<Table />)
    edge('Code').focus()
    fireEvent.keyDown(edge('Code'), { key: 'ArrowRight', altKey: true })
    expect(headers()).toEqual(['Name', 'Code', 'Price', '24'])
    expect(edge('Code')).toHaveFocus()
    fireEvent.keyDown(edge('Code'), { key: 'ArrowLeft', altKey: true })
    expect(headers()).toEqual(['Code', 'Name', 'Price', '24'])
    fireEvent.keyDown(edge('24'), { key: 'ArrowLeft', altKey: true })
    expect(headers()).toEqual(['Code', 'Name', 'Price', '24'])

    fireEvent.keyDown(edge('Name'), { key: 'ArrowRight' })
    expect(edge('Name')).toHaveAttribute('aria-valuenow', '316')
    fireEvent.keyDown(edge('Name'), { key: 'ArrowLeft', shiftKey: true })
    expect(edge('Name')).toHaveAttribute('aria-valuenow', '252')
    expect(stored().widths).toEqual({ name: 252 })
  })

  it('opens at the widths the browser painted, then holds them', () => {
    // Layout units are 1/64 px: widths the browser paints come in those steps.
    const painted: Record<string, number> = { Code: 201.75, Name: 410.25, Price: 130.5, '24': 99.5 }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.tagName === 'TH' ? painted[this.getAttribute('aria-label') ?? ''] ?? 0 : 0
      return { width, height: 40, top: 0, left: 0, right: width, bottom: 40, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
    })
    render(<Table />)
    expect(screen.getByRole('table')).toHaveAttribute('data-layout', 'fixed')
    // Not rounded: a column the auto layout just fitted keeps every fraction.
    expect(colWidths()).toEqual(['201.75px', '410.25px', '130.5px', '99.5px', ''])
    expect(screen.getByRole('table').style.minWidth).toBe('842px')
    expect(edge('Name')).toHaveAttribute('aria-valuenow', '410')
  })

  it('resets the order and the widths in one go', () => {
    render(<Table />)
    drag('Price', 'Code')
    fireEvent.keyDown(edge('Name'), { key: 'ArrowRight' })
    expect(headers()).toEqual(['Price', 'Code', 'Name', '24'])
    fireEvent.click(screen.getByRole('button', { name: 'Reset columns' }))
    expect(headers()).toEqual(['Code', 'Name', 'Price', '24'])
    expect(stored()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset columns' })).not.toBeInTheDocument()
  })

  it('keeps each table apart and ignores a layout it cannot read', () => {
    const { unmount } = render(<Table id="first" />)
    drag('Name', 'Code')
    unmount()
    render(<Table id="second" />)
    expect(headers()).toEqual(['Code', 'Name', 'Price', '24'])
    cleanup()

    setStored('{not json')
    render(<Table />)
    expect(headers()).toEqual(['Code', 'Name', 'Price', '24'])
    cleanup()

    setStored(JSON.stringify({ order: ['price', 'gone', 'name'], widths: { name: 'wide' } }))
    render(<Table />)
    expect(headers()).toEqual(['Price', 'Name', 'Code', '24'])
  })

  it('renders the layout the request carried on the server, so the first paint is already the reader\'s', () => {
    const html = renderToString(
      <ColumnTable id="test" label="Test table" columns={columns} rows={rows} rowKey={r => r.id} empty="" footer={reset => reset}
        initialLayout={JSON.stringify({ order: ['price', 'name'], widths: { name: 222 } })} />,
    )
    expect([...html.matchAll(/<th[^>]*data-col-key="([^"]+)"/g)].map(m => m[1])).toEqual(['price', 'name', 'code', 'size:24'])
    expect(html).toContain('width:222px')
    expect(html).toContain('Reset columns')
  })

  it('says so when there are no rows, across every column', () => {
    render(<Table list={[]} />)
    expect(screen.getByText('Nothing here').closest('td')).toHaveAttribute('colspan', '5')
  })
})
