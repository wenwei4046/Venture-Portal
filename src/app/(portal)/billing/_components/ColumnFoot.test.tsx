import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import ColumnFoot from './ColumnFoot'

// 2026-10-10 — the handoff's foot row ("Total", "All companies"): each figure
// under its own column, whichever order the reader has dragged the columns
// into and whichever they have hidden. The row reads the table's header.

function Table({ order, phoneHidden = [] }: { order: string[]; phoneHidden?: string[] }) {
  return (
    <table>
      <thead>
        <tr>
          {order.map((k) => (
            <th key={k} data-col={k} className={[k === 'amount' ? 'text-right right' : '', phoneHidden.includes(k) ? 'm-hide' : ''].join(' ')}>
              {k}
            </th>
          ))}
          <th className="lt-toggle" aria-hidden />
        </tr>
      </thead>
      <tfoot>
        <ColumnFoot label="Total" labelSkip={['tick']} cells={{ amount: 'RM 1,250.00', note: 'n' }} />
      </tfoot>
    </table>
  )
}

const foot = () => Array.from(document.querySelectorAll('tfoot td')) as HTMLElement[]

describe('ColumnFoot', () => {
  it('puts the label in the first column it may and each figure under its own column', () => {
    render(<Table order={['tick', 'no', 'party', 'amount', 'note']} />)
    expect(foot().map((td) => td.textContent)).toEqual(['', 'Total', '', 'RM 1,250.00', 'n', ''])
    expect(foot()[3]).toHaveClass('text-right', 'num')
    expect(foot()[5]).toHaveClass('lt-toggle')
  })

  it('repeats the label, for a phone only, in the first column a phone keeps when its own column is phone-hidden', () => {
    render(<Table order={['tick', 'date', 'no', 'amount']} phoneHidden={['date']} />)
    expect(foot()[1]).toHaveClass('m-hide')
    expect(foot()[1]).toHaveTextContent('Total')
    const phone = foot()[2].querySelector('.md\\:hidden') as HTMLElement
    expect(phone).toHaveTextContent('Total')
  })

  it('follows the header when the columns are reordered or hidden, and keeps a phone-hidden column hidden', () => {
    const { rerender } = render(<Table order={['tick', 'no', 'party', 'amount', 'note']} />)
    rerender(<Table order={['tick', 'amount', 'no']} phoneHidden={['no']} />)
    expect(foot().map((td) => td.textContent)).toEqual(['', 'RM 1,250.00', 'Total', ''])
    expect(foot()[2]).toHaveClass('m-hide')
  })
})
