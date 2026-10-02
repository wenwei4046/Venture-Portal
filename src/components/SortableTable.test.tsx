import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

// The account's copy of a layout. `saved` is what the "database" answers with;
// `save` records what the table asks to store.
const store = vi.hoisted(() => ({
  saved: null as unknown,
  failing: false,
  save: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            store.failing ? { data: null, error: { message: 'offline' } } : { data: store.saved ? { layout: store.saved } : null, error: null },
        }),
      }),
      upsert: (row: { layout: unknown }) => {
        store.save('upsert', row.layout)
        return Promise.resolve({ error: null })
      },
      delete: () => ({
        eq: () => {
          store.save('delete')
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }),
}))

import SortableTable, { type SortableColumn } from './SortableTable'

interface Row {
  id: string
  no: string
  company: string
  amount: number
}
const rows: Row[] = [
  { id: '1', no: 'INV-1', company: 'Carres', amount: 100 },
  { id: '2', no: 'INV-2', company: 'The Cont', amount: 250 },
]
const columns: SortableColumn<Row>[] = [
  { key: '_select', label: '', sortable: false, pinned: 'start', resizable: false, render: () => '☐' },
  { key: 'no', label: 'Invoice #', render: (r) => r.no },
  { key: 'company', label: 'Company', render: (r) => r.company },
  { key: 'amount', label: 'Amount', align: 'right', render: (r) => r.amount, sortValue: (r) => r.amount },
  { key: 'action', label: 'Action', sortable: false, pinned: 'end', render: () => '⋯' },
]

function desktop(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia
}

function table(extra: Partial<Parameters<typeof SortableTable<Row>>[0]> = {}) {
  return render(
    <SortableTable<Row>
      rows={rows}
      columns={columns}
      defaultSort={{ key: 'no', dir: 'asc' }}
      getRowKey={(r) => r.id}
      layoutId="test.invoices"
      {...extra}
    />,
  )
}
const headers = () => Array.from(document.querySelectorAll('thead th[data-col]')).map((th) => (th as HTMLElement).dataset.col)
const th = (key: string) => document.querySelector(`thead th[data-col="${key}"]`) as HTMLElement
const firstRowCells = () => Array.from(document.querySelectorAll('tbody tr')[0].querySelectorAll('td:not(.lt-toggle)')).map((td) => td.textContent)
const settle = () => act(async () => { await Promise.resolve() })

// fireEvent.drag* builds a bare Event here (no clientX), so a drag is dispatched
// as a MouseEvent of that type — which is what a browser's DragEvent is.
function drag(type: 'dragstart' | 'dragover' | 'drop' | 'dragend', el: HTMLElement, clientX = 0) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX })
  Object.defineProperty(ev, 'dataTransfer', { value: { effectAllowed: '', setData: () => undefined } })
  act(() => {
    el.dispatchEvent(ev)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  store.saved = null
  store.failing = false
  window.localStorage.clear()
  desktop(true)
})

describe('SortableTable column layout', () => {
  it('is untouched without a layoutId: no handles, nothing draggable, nothing fetched', async () => {
    table({ layoutId: undefined })
    await settle()
    expect(document.querySelector('.st-resize')).toBeNull()
    expect(document.querySelector('th[draggable="true"]')).toBeNull()
    expect(headers()).toEqual(['_select', 'no', 'company', 'amount', 'action'])
  })

  it('offers a handle on every column but the ones that opt out, and drags only the unpinned', async () => {
    table()
    await settle()
    expect(th('no').querySelector('.st-resize')).not.toBeNull()
    expect(th('_select').querySelector('.st-resize')).toBeNull() // resizable: false
    expect(th('no').getAttribute('draggable')).toBe('true')
    expect(th('_select').getAttribute('draggable')).toBeNull()
    expect(th('action').getAttribute('draggable')).toBeNull()
  })

  it('moves a column where it is dropped, in the header and in every row, and saves it', async () => {
    table()
    await settle()
    // Every header reports the same box: x 100 → 300, so its middle is 200.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 200 } as DOMRect)
    drag('dragstart', th('amount'))
    // Dropped on the left half of "Invoice #" → before it.
    drag('dragover', th('no'), 120)
    expect(th('no').className).toContain('st-drop-before')
    drag('drop', th('no'), 120)

    expect(headers()).toEqual(['_select', 'amount', 'no', 'company', 'action'])
    expect(firstRowCells()).toEqual(['☐', '100', 'INV-1', 'Carres', '⋯'])
    expect(store.save).toHaveBeenCalledWith('upsert', { order: ['amount', 'no', 'company'], widths: {} })
    expect(JSON.parse(window.localStorage.getItem('table-layout:test.invoices')!).order).toEqual(['amount', 'no', 'company'])

    // …and on the right half of "Company" → after it.
    drag('dragstart', th('amount'))
    drag('dragover', th('company'), 260)
    expect(th('company').className).toContain('st-drop-after')
    drag('drop', th('company'), 260)
    expect(headers()).toEqual(['_select', 'no', 'company', 'amount', 'action'])
    vi.restoreAllMocks()
  })

  it('opens already arranged from the browser copy, then takes the account copy when they differ', async () => {
    window.localStorage.setItem('table-layout:test.invoices', JSON.stringify({ order: ['company', 'no', 'amount'], widths: {} }))
    store.saved = { order: ['amount', 'company', 'no'], widths: { no: 220 } }
    table()
    expect(headers()).toEqual(['_select', 'company', 'no', 'amount', 'action']) // before the network answers
    await waitFor(() => expect(headers()).toEqual(['_select', 'amount', 'company', 'no', 'action']))
    // A width from the account switches the table to a fixed layout.
    const col = document.querySelector('col[data-col="no"]') as HTMLElement
    expect(col.style.width).toBe('220px')
    expect(document.querySelector('table')!.className).toContain('st-fixed')
  })

  it('keeps the browser copy when the account cannot be read', async () => {
    window.localStorage.setItem('table-layout:test.invoices', JSON.stringify({ order: ['company', 'no', 'amount'], widths: {} }))
    store.failing = true
    table()
    await settle()
    expect(headers()).toEqual(['_select', 'company', 'no', 'amount', 'action'])
  })

  it('goes back to the default when the account has none — it was reset somewhere else', async () => {
    window.localStorage.setItem('table-layout:test.invoices', JSON.stringify({ order: ['company', 'no', 'amount'], widths: {} }))
    table()
    await waitFor(() => expect(headers()).toEqual(['_select', 'no', 'company', 'amount', 'action']))
    expect(window.localStorage.getItem('table-layout:test.invoices')).toBeNull()
  })

  it('还原栏位 appears only once something was arranged, and forgets it everywhere', async () => {
    store.saved = { order: ['amount', 'no', 'company'], widths: {} }
    table()
    expect(screen.queryByText('还原栏位')).toBeNull()
    const reset = await screen.findByText('还原栏位')
    fireEvent.click(reset)
    expect(headers()).toEqual(['_select', 'no', 'company', 'amount', 'action'])
    expect(store.save).toHaveBeenCalledWith('delete')
    expect(window.localStorage.getItem('table-layout:test.invoices')).toBeNull()
    expect(screen.queryByText('还原栏位')).toBeNull()
  })

  it('leaves the phone grid alone', async () => {
    desktop(false)
    store.saved = { order: ['amount', 'no', 'company'], widths: { no: 220 } }
    table()
    await settle()
    expect(headers()).toEqual(['_select', 'no', 'company', 'amount', 'action'])
    expect(document.querySelector('colgroup')).toBeNull()
    expect(document.querySelector('.st-resize')).toBeNull()
  })

  it('sorting still works on a column that can be dragged', async () => {
    table()
    await settle()
    fireEvent.click(screen.getByText('Amount'))
    expect(document.querySelectorAll('tbody tr')[0].textContent).toContain('INV-2') // 250 first, desc
  })
})

describe('SortableTable row context menu', () => {
  it('hands the row to the caller on a right-click', () => {
    const onRowContextMenu = vi.fn()
    table({ onRowContextMenu })
    fireEvent.contextMenu(document.querySelectorAll('tbody tr')[1])
    expect(onRowContextMenu).toHaveBeenCalledTimes(1)
    expect(onRowContextMenu.mock.calls[0][0]).toMatchObject({ id: '2', no: 'INV-2' })
  })
})
