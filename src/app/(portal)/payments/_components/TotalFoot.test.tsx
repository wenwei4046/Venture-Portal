import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import TotalFoot from './TotalFoot'

// 2026-10-10 — the handoff's Total row: "Total" in the first column and each
// figure under its own column. SortableTable hands its footer only the rows,
// and a reader may drag or hide the columns, so the row reads the header.

const COLUMNS = [{ key: 'voucher_no', phone: true }, { key: 'payee_name' }, { key: 'amount', phone: true }, { key: 'date' }]

function Table({ head, toggle = false }: { head: Array<[key: string, cls?: string]>; toggle?: boolean }) {
  return (
    <table>
      <thead>
        <tr>
          {head.map(([key, cls]) => <th key={key} data-col={key} className={cls} />)}
          {toggle ? <th className="lt-toggle" aria-hidden /> : null}
        </tr>
      </thead>
      <tbody />
      <tfoot>
        <TotalFoot label="Total" values={{ amount: '1,500.00' }} columns={COLUMNS} />
      </tfoot>
    </table>
  )
}

const footCells = (root: ParentNode = document) => Array.from(root.querySelectorAll('tfoot td'))

describe('TotalFoot', () => {
  it('puts the label first and the figure under its own column', () => {
    render(<Table head={[['voucher_no'], ['payee_name'], ['amount'], ['date']]} />)
    expect(footCells().map((td) => td.textContent)).toEqual(['Total', '', '1,500.00', ''])
    expect(footCells()[2]).toHaveClass('num', 'text-right')
  })

  it('follows the header when the columns have been moved or hidden', () => {
    render(<Table head={[['date'], ['amount'], ['voucher_no']]} />)
    expect(footCells().map((td) => td.textContent)).toEqual(['Total', '1,500.00', ''])
  })

  it('…and never writes the label over a figure', () => {
    render(<Table head={[['amount'], ['voucher_no'], ['date']]} />)
    expect(footCells().map((td) => td.textContent)).toEqual(['1,500.00', 'Total', ''])
  })

  it('folds on a phone as the header does, chevron cell included', () => {
    render(<Table head={[['voucher_no'], ['payee_name', 'm-hide'], ['amount'], ['date', 'm-hide']]} toggle />)
    expect(footCells().map((td) => td.className.includes('m-hide'))).toEqual([false, true, false, true, false])
    expect(footCells()[4]).toHaveClass('lt-toggle')
  })

  it('before the header can be read — the server’s render — lays out the columns as the code declares them', () => {
    const html = renderToString(<Table head={[['voucher_no'], ['payee_name', 'm-hide'], ['amount'], ['date', 'm-hide']]} toggle />)
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    const cells = footCells(doc)
    expect(cells.map((td) => td.textContent)).toEqual(['Total', '', '1,500.00', '', ''])
    expect(cells.map((td) => td.className.includes('m-hide'))).toEqual([false, true, false, true, false])
  })
})
