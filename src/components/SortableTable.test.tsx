import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// The account's copy of a layout and the table's default. `saved` / `defaults`
// are what the "database" answers with; `save` records what the table asks to
// store, and for which of the two tables ('-default' for the shared one).
const store = vi.hoisted(() => ({
  saved: null as unknown,
  defaults: null as unknown,
  failing: false,
  save: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const tag = table === 'table_layout_defaults' ? '-default' : ''
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (store.failing) return { data: null, error: { message: 'offline' } }
              const row = tag ? store.defaults : store.saved
              return { data: row ? { layout: row } : null, error: null }
            },
          }),
        }),
        upsert: (row: { layout: unknown }) => {
          store.save('upsert' + tag, row.layout)
          return Promise.resolve({ error: null })
        },
        delete: () => ({
          eq: () => {
            store.save('delete' + tag)
            return Promise.resolve({ error: null })
          },
        }),
      }
    },
  }),
}))

import SortableTable, { type SortableColumn } from './SortableTable'
import { FinViewProvider } from './layout/fin-view'

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

type TableProps = Parameters<typeof SortableTable<Row>>[0]
function tableElement(extra: Partial<TableProps> = {}) {
  return (
    <SortableTable<Row>
      rows={rows}
      columns={columns}
      defaultSort={{ key: 'no', dir: 'asc' }}
      getRowKey={(r) => r.id}
      layoutId="test.invoices"
      {...extra}
    />
  )
}
const table = (extra: Partial<TableProps> = {}) => render(tableElement(extra))
const headers = (root: ParentNode = document) =>
  Array.from(root.querySelectorAll('thead th[data-col]')).map((th) => (th as HTMLElement).dataset.col)
const th = (key: string) => document.querySelector(`thead th[data-col="${key}"]`) as HTMLElement
const bodyRows = () => Array.from(document.querySelectorAll('tbody tr')) as HTMLElement[]
const firstRowCells = () => Array.from(bodyRows()[0].querySelectorAll('td:not(.lt-toggle)')).map((td) => td.textContent)
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
  store.defaults = null
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
    expect(screen.queryByRole('button', { name: /Columns/ })).toBeNull()
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
    expect(store.save).toHaveBeenCalledWith('upsert', { order: ['amount', 'no', 'company'], widths: {}, hidden: [] })
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
    store.saved = { order: ['amount', 'no', 'company'], widths: { no: 220 }, hidden: ['company'] }
    table()
    await settle()
    expect(headers()).toEqual(['_select', 'no', 'company', 'amount', 'action'])
    expect(document.querySelector('colgroup')).toBeNull()
    expect(document.querySelector('.st-resize')).toBeNull()
    expect(screen.queryByRole('button', { name: /Columns/ })).toBeNull()
  })

  it('sorting still works on a column that can be dragged', async () => {
    table()
    await settle()
    fireEvent.click(screen.getByText('Amount'))
    expect(bodyRows()[0].textContent).toContain('INV-2') // 250 first, desc
  })

  // 2026-10-02: once a column was dragged wide, "Amount" sat at the left of its
  // own right-aligned figures. A utility class cannot move it — the ledger
  // table's header rule out-ranks one — so the heading carries `right`.
  it('a figures column is headed from the right, in the class the ledger rule answers to', async () => {
    table()
    await settle()
    expect(th('amount').classList.contains('right')).toBe(true)
    expect(th('amount').classList.contains('num')).toBe(false) // that would change the heading's typeface
    expect(th('company').classList.contains('right')).toBe(false)
  })
})

// 2026-10-02 (user: "我希望有 column categories. 有些我不用显示").
describe('SortableTable Columns panel', () => {
  const grouped: SortableColumn<Row>[] = [
    { key: '_select', label: '', sortable: false, pinned: 'start', resizable: false, render: () => '☐' },
    { key: 'no', label: 'Invoice #', group: '基本', render: (r) => r.no },
    { key: 'mode', label: 'Mode', group: '入账', render: () => 'hr' },
    { key: 'company', label: 'Company', group: '基本', filterable: true, render: (r) => r.company },
    { key: 'amount', label: 'Amount', group: '金额', align: 'right', render: (r) => r.amount, sortValue: (r) => r.amount },
    { key: 'action', label: 'Action', sortable: false, pinned: 'end', render: () => '⋯' },
  ]
  const columnsButton = () => screen.getByRole('button', { name: /Columns/ })
  const panel = () => screen.getByRole('dialog', { name: 'Columns' })
  const ticks = () =>
    within(panel())
      .getAllByRole('checkbox')
      .map((box) => [box.closest('label')!.textContent, (box as HTMLInputElement).checked])
  async function openPanel(extra: Partial<TableProps> = {}) {
    table({ columns: grouped, layoutTitle: 'Invoices', ...extra })
    await settle()
    fireEvent.click(columnsButton())
    return panel()
  }

  it('the button counts the columns on show, and opens them under their headings', async () => {
    table({ columns: grouped, layoutTitle: 'Invoices' })
    await settle()
    expect(columnsButton().textContent).toContain('· 4') // the tick box and the menu are not columns to choose
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(columnsButton())
    expect(within(panel()).getByText('Invoices')).toBeInTheDocument()
    // The headings in the order every table lists them, not the order of the columns.
    expect(Array.from(panel().querySelectorAll('[role="group"]')).map((g) => g.getAttribute('aria-label'))).toEqual(['基本', '金额', '入账'])
    expect(ticks()).toEqual([
      ['Invoice #', true],
      ['Company', true],
      ['Amount', true],
      ['Mode', true],
    ])
    expect(within(panel()).getByText('4 of 4 shown')).toBeInTheDocument()
  })

  it('unticking a column takes it out of the header and of every row, and remembers it', async () => {
    const dialog = await openPanel()
    fireEvent.click(within(dialog).getByLabelText('Company'))

    expect(headers()).toEqual(['_select', 'no', 'mode', 'amount', 'action'])
    expect(firstRowCells()).toEqual(['☐', 'INV-1', 'hr', '100', '⋯'])
    expect(store.save).toHaveBeenCalledWith('upsert', { order: [], widths: {}, hidden: ['company'] })
    expect(JSON.parse(window.localStorage.getItem('table-layout:test.invoices')!).hidden).toEqual(['company'])
    expect(within(dialog).getByText('3 of 4 shown')).toBeInTheDocument()
    expect(within(dialog).getByRole('group', { name: '基本' }).textContent).toContain('1/2')
    expect(columnsButton().textContent).toContain('· 3')

    // Ticked again it is back where it was, and there is nothing left to remember.
    fireEvent.click(within(dialog).getByLabelText('Company'))
    expect(headers()).toEqual(['_select', 'no', 'mode', 'company', 'amount', 'action'])
    expect(store.save).toHaveBeenLastCalledWith('delete')
    expect(window.localStorage.getItem('table-layout:test.invoices')).toBeNull()
  })

  it('opens with the columns the account says are off', async () => {
    store.saved = { order: [], widths: {}, hidden: ['mode', 'amount'] }
    table({ columns: grouped })
    await waitFor(() => expect(headers()).toEqual(['_select', 'no', 'company', 'action']))
    fireEvent.click(columnsButton())
    expect(ticks()).toEqual([
      ['Invoice #', true],
      ['Company', true],
      ['Amount', false],
      ['Mode', false],
    ])
  })

  it('will not untick the last column on show', async () => {
    const dialog = await openPanel()
    for (const label of ['Invoice #', 'Company', 'Amount']) fireEvent.click(within(dialog).getByLabelText(label))
    expect(headers()).toEqual(['_select', 'mode', 'action'])
    fireEvent.click(within(dialog).getByLabelText('Mode'))
    expect(headers()).toEqual(['_select', 'mode', 'action'])
    expect((within(dialog).getByLabelText('Mode') as HTMLInputElement).checked).toBe(true)
  })

  it('a column that is not on show stops filtering the rows', async () => {
    table({ columns: grouped })
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Filter Company' }))
    fireEvent.click(screen.getByLabelText('Carres'))
    expect(bodyRows().map((r) => r.textContent)).toEqual([expect.stringContaining('INV-2')])
    fireEvent.click(screen.getByText('Close'))

    fireEvent.click(columnsButton())
    fireEvent.click(within(panel()).getByLabelText('Company'))
    expect(bodyRows()).toHaveLength(2)
  })

  it('searches the list; Show all brings every column back; Reset forgets widths and order as well', async () => {
    store.saved = { order: ['amount', 'no', 'mode', 'company'], widths: { no: 220 }, hidden: ['company'] }
    table({ columns: grouped })
    await waitFor(() => expect(headers()).toEqual(['_select', 'amount', 'no', 'mode', 'action']))
    fireEvent.click(columnsButton())

    fireEvent.change(within(panel()).getByLabelText('Search columns'), { target: { value: 'amo' } })
    expect(ticks()).toEqual([['Amount', true]])
    fireEvent.change(within(panel()).getByLabelText('Search columns'), { target: { value: 'zzz' } })
    expect(within(panel()).queryAllByRole('checkbox')).toHaveLength(0)
    expect(within(panel()).getByText('没有叫这个名字的栏位。')).toBeInTheDocument()
    fireEvent.change(within(panel()).getByLabelText('Search columns'), { target: { value: '' } })

    fireEvent.click(within(panel()).getByText('Show all'))
    expect(headers()).toEqual(['_select', 'amount', 'no', 'mode', 'company', 'action']) // still in the person's order
    expect(store.save).toHaveBeenLastCalledWith('upsert', { order: ['amount', 'no', 'mode', 'company'], widths: { no: 220 }, hidden: [] })

    fireEvent.click(within(panel()).getByText('Reset'))
    expect(headers()).toEqual(['_select', 'no', 'mode', 'company', 'amount', 'action'])
    expect(document.querySelector('colgroup')).toBeNull()
    expect(store.save).toHaveBeenLastCalledWith('delete')
  })

  it('closes on Done, on ×, on Esc and on a click outside it — not on a click inside', async () => {
    const dialog = await openPanel()
    fireEvent.mouseDown(dialog)
    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog')).not.toBeNull()

    fireEvent.click(within(dialog).getByText('Done'))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(columnsButton())
    fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(columnsButton())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(columnsButton())
    const scrim = panel().parentElement as HTMLElement
    fireEvent.mouseDown(scrim)
    fireEvent.click(scrim)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists the columns under no heading when the table names none', async () => {
    table()
    await settle()
    fireEvent.click(columnsButton())
    expect(panel().querySelectorAll('[role="group"]')).toHaveLength(1)
    expect(ticks().map(([label]) => label)).toEqual(['Invoice #', 'Company', 'Amount'])
  })

  // Payments draws each payroll batch as a table of its own, under one id.
  it('two tables with the same id drop the column together', async () => {
    render(
      <>
        {tableElement({ columns: grouped })}
        {tableElement({ columns: grouped })}
      </>,
    )
    await settle()
    const [first, second] = Array.from(document.querySelectorAll('table'))
    fireEvent.click(screen.getAllByRole('button', { name: /Columns/ })[0])
    fireEvent.click(within(panel()).getByLabelText('Mode'))
    expect(headers(first)).toEqual(['_select', 'no', 'company', 'amount', 'action'])
    expect(headers(second)).toEqual(['_select', 'no', 'company', 'amount', 'action'])
    expect(store.save).toHaveBeenCalledTimes(1) // saved by the one that changed it
  })
})

describe('SortableTable row context menu', () => {
  it('hands the row to the caller on a right-click', () => {
    const onRowContextMenu = vi.fn()
    table({ onRowContextMenu })
    fireEvent.contextMenu(bodyRows()[1])
    expect(onRowContextMenu).toHaveBeenCalledTimes(1)
    expect(onRowContextMenu.mock.calls[0][0]).toMatchObject({ id: '2', no: 'INV-2' })
  })
})

// 2026-10-02 (user: "view … 可以 remove, 我希望双击点开").
describe('SortableTable opening a row', () => {
  // A row that holds a control, and a popup a cell has opened in place.
  const busy: SortableColumn<Row>[] = [
    { key: 'no', label: 'Invoice #', render: (r) => <button type="button">{r.no}</button> },
    {
      key: 'company',
      label: 'Company',
      render: (r) => (
        <>
          {r.company}
          <div className="fixed inset-0">
            <p>detail of {r.no}</p>
          </div>
        </>
      ),
    },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => r.amount, sortValue: (r) => r.amount },
  ]
  const cell = (row: number, col: number) => bodyRows()[row].querySelectorAll('td')[col] as HTMLElement

  it('a double-click anywhere on the row opens it', () => {
    const onRowOpen = vi.fn()
    table({ onRowOpen })
    fireEvent.doubleClick(cell(1, 2))
    expect(onRowOpen).toHaveBeenCalledTimes(1)
    expect(onRowOpen.mock.calls[0][0]).toMatchObject({ id: '2', no: 'INV-2' })
  })

  it('…but a control in the row keeps its own double-click', () => {
    const onRowOpen = vi.fn()
    table({ onRowOpen, columns: busy })
    fireEvent.doubleClick(screen.getByRole('button', { name: 'INV-1' }))
    expect(onRowOpen).not.toHaveBeenCalled()
    fireEvent.doubleClick(cell(0, 2))
    expect(onRowOpen).toHaveBeenCalledTimes(1)
  })

  // The invoice's detail popup is drawn inside its cell. Selecting a word in it,
  // or right-clicking there to copy, is not a press on the invoice's row.
  it('…and a popup a cell has opened is not the row: no opening, no row menu', () => {
    const onRowOpen = vi.fn()
    const onRowContextMenu = vi.fn()
    table({ onRowOpen, onRowContextMenu, columns: busy })
    const inPopup = screen.getByText('detail of INV-1')
    fireEvent.doubleClick(inPopup)
    fireEvent.contextMenu(inPopup)
    expect(onRowOpen).not.toHaveBeenCalled()
    expect(onRowContextMenu).not.toHaveBeenCalled()

    const second = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 2 })
    inPopup.dispatchEvent(second)
    expect(second.defaultPrevented).toBe(false) // the word under it may be selected
  })

  it('the second press of a double-click does not select the word under it', () => {
    table({ onRowOpen: vi.fn() })
    const first = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 })
    const second = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 2 })
    cell(0, 1).dispatchEvent(first)
    cell(0, 1).dispatchEvent(second)
    expect(first.defaultPrevented).toBe(false)
    expect(second.defaultPrevented).toBe(true)
  })

  it('without a mouse: Tab reaches the row and Enter opens it — Enter in a control inside does not', () => {
    const onRowOpen = vi.fn()
    table({ onRowOpen, columns: busy })
    expect(bodyRows()[0].getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(screen.getByRole('button', { name: 'INV-1' }), { key: 'Enter' })
    expect(onRowOpen).not.toHaveBeenCalled()
    fireEvent.keyDown(bodyRows()[0], { key: 'Enter' })
    expect(onRowOpen).toHaveBeenCalledTimes(1)
    expect(onRowOpen.mock.calls[0][0]).toMatchObject({ id: '1' })
  })

  // 2026-10-02: a total standing in for rows the viewer may not see.
  it('a row that opens nothing takes no double-click, no right-click and no Tab stop', () => {
    const onRowOpen = vi.fn()
    const onRowContextMenu = vi.fn()
    table({ onRowOpen, onRowContextMenu, rowOpens: (r) => r.id !== '1' })
    fireEvent.doubleClick(cell(0, 2))
    fireEvent.contextMenu(bodyRows()[0])
    fireEvent.keyDown(bodyRows()[0], { key: 'Enter' })
    expect(onRowOpen).not.toHaveBeenCalled()
    expect(onRowContextMenu).not.toHaveBeenCalled()
    expect(bodyRows()[0].getAttribute('tabindex')).toBeNull()
    // The row beside it is as it was.
    expect(bodyRows()[1].getAttribute('tabindex')).toBe('0')
    fireEvent.doubleClick(cell(1, 2))
    fireEvent.contextMenu(bodyRows()[1])
    expect(onRowOpen).toHaveBeenCalledTimes(1)
    expect(onRowContextMenu).toHaveBeenCalledTimes(1)
  })

  // 2026-10-12 (the user: the descriptions make the view too messy): the
  // toolbar no longer says how to open a row or that a right-click has more.
  it('says nothing in the toolbar of the double-click or the right-click', () => {
    const { unmount } = table({ onRowOpen: vi.fn(), layoutId: undefined })
    expect(screen.queryByText(/双击一行打开/)).toBeNull()
    unmount()
    table({ onRowOpen: vi.fn(), onRowContextMenu: vi.fn() })
    expect(screen.queryByText(/双击一行打开|右键更多/)).toBeNull()
    expect(screen.queryByText(/Double-click to open|right-click for more/)).toBeNull()
  })

  it('a table that opens nothing is as it was: rows are not focusable, nothing is said', () => {
    table()
    expect(bodyRows()[0].getAttribute('tabindex')).toBeNull()
    expect(screen.queryByText(/双击一行打开/)).toBeNull()
  })

  // No double-click and no right-click on a phone.
  it('on a phone, the opened row offers 打开, and 更多 where the row has no menu button of its own', () => {
    desktop(false)
    const onRowOpen = vi.fn()
    const onRowContextMenu = vi.fn()
    const { unmount } = table({ onRowOpen, onRowContextMenu, columns: busy })
    fireEvent.click(screen.getAllByRole('button', { name: '展开明细' })[0])
    fireEvent.click(screen.getByText('打开 →'))
    expect(onRowOpen).toHaveBeenCalledTimes(1)
    expect(onRowOpen.mock.calls[0][0]).toMatchObject({ id: '1' })
    fireEvent.click(screen.getByText('更多 ⋯'))
    expect(onRowContextMenu).toHaveBeenCalledTimes(1)
    unmount()

    // This table ends in a pinned menu column — its ⋯ is in the panel already.
    table({ onRowOpen, onRowContextMenu })
    fireEvent.click(screen.getAllByRole('button', { name: '展开明细' })[0])
    expect(screen.getByText('打开 →')).toBeInTheDocument()
    expect(screen.queryByText('更多 ⋯')).toBeNull()
  })
})

// 2026-10-07: once a width has been dragged the table is fixed-layout and a
// cell that does not fit is cut with an ellipsis — which put a "…" after the
// tick-box when the sheet's wider cell padding ate the column's slack (user:
// "这个三个点是什么？"). A column whose width cannot be dragged is never cut.
describe('a column that cannot be resized', () => {
  it('marks its header and cells st-nocut, so the fixed layout never cuts them', () => {
    render(
      <SortableTable rows={rows} columns={columns} defaultSort={{ key: 'no', dir: 'asc' }} getRowKey={(r) => r.id} />,
    )
    expect(document.querySelector('th[data-col="_select"]')).toHaveClass('st-nocut')
    expect(document.querySelector('th[data-col="no"]')).not.toHaveClass('st-nocut')
    const cells = document.querySelectorAll('tbody tr')[0].querySelectorAll('td')
    expect(cells[0]).toHaveClass('st-nocut')
    expect(cells[1]).not.toHaveClass('st-nocut')
  })
})

// 2026-10-07 (user: "我要能定这个 as default"): a table can carry a default
// arrangement for everyone. The account's own arrangement still wins; Reset
// goes back to the table's default rather than the code's.
describe("a table's default arrangement", () => {
  const panel = () => screen.getByRole('dialog', { name: 'Columns' })
  const openColumns = () => fireEvent.click(screen.getByRole('button', { name: /Columns/ }))

  it('opens in it when the account has none of its own, with nothing to reset', async () => {
    store.defaults = { order: ['amount', 'no', 'company'], widths: {}, hidden: ['company'] }
    table()
    await waitFor(() => expect(headers()).toEqual(['_select', 'amount', 'no', 'action']))
    expect(screen.queryByTitle(/Reset columns to default/)).toBeNull()
  })

  it("the account's own arrangement wins, and Reset goes back to the table's default", async () => {
    store.defaults = { order: ['amount', 'no', 'company'], widths: {}, hidden: [] }
    store.saved = { order: ['company', 'no', 'amount'], widths: {}, hidden: [] }
    table()
    await waitFor(() => expect(headers()).toEqual(['_select', 'company', 'no', 'amount', 'action']))
    openColumns()
    fireEvent.click(within(panel()).getByText('Reset'))
    expect(headers()).toEqual(['_select', 'amount', 'no', 'company', 'action'])
    expect(store.save).toHaveBeenLastCalledWith('delete')
  })

  it('Set as default keeps the arrangement on show for everyone, and the account follows it from then on', async () => {
    store.saved = { order: ['company', 'no', 'amount'], widths: { no: 220 }, hidden: [] }
    table({ canSetDefault: true })
    await waitFor(() => expect(headers()).toEqual(['_select', 'company', 'no', 'amount', 'action']))
    openColumns()
    fireEvent.click(within(panel()).getByRole('button', { name: /设为预设/ }))
    await waitFor(() => expect(store.save).toHaveBeenCalledWith('upsert-default', { order: ['company', 'no', 'amount'], widths: { no: 220 }, hidden: [] }))
    await waitFor(() => expect(store.save).toHaveBeenLastCalledWith('delete'))
    expect(headers()).toEqual(['_select', 'company', 'no', 'amount', 'action'])
    expect(within(panel()).getByText(/已设为预设/)).toBeInTheDocument()
  })

  it('offers Set as default only to an account that may', async () => {
    table()
    await settle()
    openColumns()
    expect(within(panel()).queryByRole('button', { name: /设为预设/ })).toBeNull()
  })
})

// 2026-10-07: the Approvals queue is a table with a tick-box column headed by a
// select-all box, facts that only a phone's detail panel carries (the voucher's
// pool and category, which the desktop table does not show), a highlighted row
// for what is ticked, and the panel's open button in the page's own words.
describe('a queue table', () => {
  const queue: SortableColumn<Row>[] = [
    { key: '_select', label: 'Select', header: <input type="checkbox" aria-label="Select all" />, sortable: false, pinned: 'start', resizable: false, mobile: 'keep', render: () => '☐' },
    { key: 'no', label: 'Invoice #', mobile: 'keep', render: (r) => r.no },
    { key: 'company', label: 'Company', render: (r) => r.company },
    { key: 'pool', label: 'Pool', mobile: 'detail-only', render: () => 'Venture Pool' },
    { key: 'amount', label: 'Amount', align: 'right', mobile: 'keep', render: (r) => r.amount, sortValue: (r) => r.amount },
  ]

  it('heads a column with what it is given instead of its label', () => {
    table({ columns: queue })
    expect(within(th('_select')).getByRole('checkbox', { name: 'Select all' })).toBeInTheDocument()
    expect(th('_select')).not.toHaveTextContent('Select')
  })

  it('a detail-only column is nowhere in the grid, but in the phone panel', async () => {
    desktop(false)
    table({ columns: queue })
    await settle()
    expect(headers()).toEqual(['_select', 'no', 'company', 'amount'])
    expect(firstRowCells()).toEqual(['☐', 'INV-1', 'Carres', '100'])
    fireEvent.click(screen.getAllByRole('button', { name: '展开明细' })[0])
    const panel = document.querySelector('tr.lt-detail') as HTMLElement
    expect(within(panel).getByText('Pool')).toBeInTheDocument()
    expect(within(panel).getByText('Venture Pool')).toBeInTheDocument()
    expect(within(panel).getByText('Company')).toBeInTheDocument()
  })

  it('…and the Columns panel does not offer it', async () => {
    desktop(true)
    table({ columns: queue })
    await settle()
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }))
    const panel = screen.getByRole('dialog', { name: 'Columns' })
    expect(within(panel).queryByText('Pool')).toBeNull()
    expect(within(panel).getByText('Company')).toBeInTheDocument()
  })

  it('marks the rows the caller names', () => {
    table({ columns: queue, rowClassName: (r) => (r.id === '2' ? 'st-selected' : undefined) })
    expect(bodyRows()[0]).not.toHaveClass('st-selected')
    expect(bodyRows()[1]).toHaveClass('st-selected')
  })

  it("opens a row on the phone in the page's own words", () => {
    desktop(false)
    table({ columns: queue, onRowOpen: vi.fn(), openLabel: 'Open the voucher →' })
    fireEvent.click(screen.getAllByRole('button', { name: '展开明细' })[0])
    expect(screen.getByText('Open the voucher →')).toBeInTheDocument()
    expect(screen.queryByText('打开 →')).toBeNull()
  })
})

// 2026-10-09 — the Finance revamp (the user's Claude Design handoff): an
// amount or date column's filter has a Range mode beside Pick values, a long
// list sits in a box that scrolls under a sticky header, a column is resized
// against its neighbour so the table's edge stays put, and the table speaks
// English on the Finance view.
describe('the Finance revamp', () => {
  const rangeColumns: SortableColumn<Row>[] = columns.map((c) => (c.key === 'amount' ? { ...c, filterable: true, range: 'number' } : c))
  const fin = (extra: Partial<TableProps> = {}) => render(<FinViewProvider value={true}>{tableElement(extra)}</FinViewProvider>)
  const popover = () => screen.getByRole('dialog', { name: /Filter/ })

  it('narrows an amount column to a range instead of picking values', () => {
    table({ columns: rangeColumns })
    fireEvent.click(screen.getByRole('button', { name: 'Filter Amount' }))
    fireEvent.click(within(popover()).getByRole('button', { name: 'Range' }))
    fireEvent.change(within(popover()).getByLabelText('Min'), { target: { value: '150' } })
    expect(bodyRows().map((r) => r.textContent)).toEqual([expect.stringContaining('INV-2')])
    expect(popover()).toHaveTextContent('1 row in range')
    expect(screen.getByRole('button', { name: 'Filter Amount' })).toHaveAttribute('data-active', 'true')
    fireEvent.click(within(popover()).getByRole('button', { name: '> 100k' }))
    expect(bodyRows()[0]).toHaveTextContent('No rows')
    fireEvent.click(within(popover()).getByRole('button', { name: /clear filter/i }))
    expect(bodyRows()).toHaveLength(2)
  })

  it('a date column takes From and To, with presets from today', () => {
    const today = new Date()
    const dated = [
      { ...rows[0], date: new Date(today.getFullYear(), today.getMonth(), 1, 9) },
      { ...rows[1], date: new Date(2020, 0, 15) },
    ] as Array<Row & { date: Date }>
    const cols: SortableColumn<Row & { date: Date }>[] = [
      { key: 'no', label: 'Invoice #', render: (r) => r.no },
      { key: 'date', label: 'Date', filterable: true, range: 'date', render: (r) => r.date.toISOString().slice(0, 10), sortValue: (r) => r.date },
    ]
    render(<SortableTable rows={dated} columns={cols} defaultSort={{ key: 'no', dir: 'asc' }} getRowKey={(r) => r.id} />)
    fireEvent.click(screen.getByRole('button', { name: 'Filter Date' }))
    fireEvent.click(within(popover()).getByRole('button', { name: 'Range' }))
    expect(within(popover()).getByLabelText('From')).toBeInTheDocument()
    fireEvent.click(within(popover()).getByRole('button', { name: 'This month' }))
    expect(bodyRows().map((r) => r.textContent)).toEqual([expect.stringContaining('INV-1')])
  })

  it('picking values and a range are one or the other', () => {
    table({ columns: rangeColumns })
    fireEvent.click(screen.getByRole('button', { name: 'Filter Amount' }))
    fireEvent.click(within(popover()).getByRole('button', { name: 'Range' }))
    fireEvent.change(within(popover()).getByLabelText('Min'), { target: { value: '150' } })
    expect(bodyRows()).toHaveLength(1)
    fireEvent.click(within(popover()).getByRole('button', { name: 'Pick values' }))
    expect(bodyRows()).toHaveLength(2)
    expect(within(popover()).getByLabelText('250')).toBeInTheDocument()
  })

  it('puts a long list in a box that scrolls', () => {
    table({ scrollBox: true })
    expect(document.querySelector('.st-box table')).not.toBeNull()
  })

  it('resizing against a neighbour leaves the last column without a handle', async () => {
    table({ resizeMode: 'neighbour' })
    await settle()
    expect(th('amount').querySelector('.st-resize')).not.toBeNull()
    expect(th('action').querySelector('.st-resize')).toBeNull()
  })

  it('speaks English on the Finance view', () => {
    fin({ onRowOpen: vi.fn(), onRowContextMenu: vi.fn(), columns: rangeColumns })
    fireEvent.click(screen.getByRole('button', { name: 'Filter Amount' }))
    expect(within(popover()).getByPlaceholderText('Search…')).toBeInTheDocument()
    expect(within(popover()).getByRole('button', { name: 'Clear filter' })).toBeInTheDocument()
    expect(popover()).toHaveAttribute('data-fin', 'true')
  })

  it('…and opens a row on the phone with Open →', () => {
    desktop(false)
    fin({ onRowOpen: vi.fn(), layoutId: undefined })
    // The phone's row toggle reads in English on the Finance view (2026-10-10).
    fireEvent.click(screen.getAllByRole('button', { name: 'Show details' })[0])
    expect(screen.getByText('Open →')).toBeInTheDocument()
  })
})

// 2026-10-10 — a search typed outside the table (the handoff's page toolbar on
// the Venture Pool, over the charts): it narrows the rows by the search keys as
// the table's own box would, and the table then draws no box of its own.
describe('a search typed outside the table', () => {
  it('narrows the rows by the search keys, and the table draws no box', () => {
    table({ searchKeys: ['company'], searchPlaceholder: 'Search company…', query: 'cont' })
    expect(screen.queryByPlaceholderText('Search company…')).toBeNull()
    expect(bodyRows()).toHaveLength(1)
    expect(bodyRows()[0]).toHaveTextContent('The Cont')
  })

  it('shows every row while the outside search is empty', () => {
    table({ searchKeys: ['company'], searchPlaceholder: 'Search company…', query: '' })
    expect(screen.queryByPlaceholderText('Search company…')).toBeNull()
    expect(bodyRows()).toHaveLength(2)
  })
})
