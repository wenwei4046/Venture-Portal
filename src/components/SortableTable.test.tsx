import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

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

  it('says how, in the toolbar — and that a right-click has more when it does', () => {
    const { unmount } = table({ onRowOpen: vi.fn() })
    expect(screen.getByText('双击一行打开')).toBeInTheDocument()
    unmount()
    table({ onRowOpen: vi.fn(), onRowContextMenu: vi.fn() })
    expect(screen.getByText('双击一行打开 · 右键更多')).toBeInTheDocument()
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
