import Link from 'next/link'
import { formatMoney } from '@/lib/utils'
import LedgerRow from '@/components/LedgerRow'

export interface PersonSales {
  key: string
  staffId: string | null
  name: string
  orders: number
  total: number
  /** Sales value the deposit gate is holding back. */
  held: number
}

/**
 * Who sold the month, biggest first.
 *
 * Raw sales value from the same rows the rest of the page reads, so this and
 * Sales by venue can never disagree about what the month contains. It is not
 * the commission base and does not try to be — the base is on each bill, and
 * what it pays is on the statement.
 */
export default function PersonSection({
  rows,
  ordersPath,
}: {
  rows: PersonSales[]
  ordersPath: string
}) {
  return (
    <section>
      <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
        Raw sales value, not the commission base — transport and disposal come out, KPI items move
        to their own allowance, and the deposit gate holds anything under the threshold. A name
        opens every bill of theirs.
      </p>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Salesperson</th>
              <th className="right">Bills</th>
              <th className="right m-hide">Waiting on a deposit</th>
              <th className="right">Sales value</th>
              <th className="lt-toggle" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {rows.map(p => (
              <LedgerRow key={p.key}>
                <td>
                  <Link
                    href={`${ordersPath}?staff=${p.staffId ?? 'unmatched'}`}
                    className={p.staffId ? 'text-ink hover:text-accent' : 'text-danger hover:underline'}
                  >
                    {p.name}
                  </Link>
                </td>
                <td className="num">{p.orders}</td>
                <td className="num m-hide" data-label="Waiting on a deposit">
                  {p.held === 0 ? '—' : <span className="neg">{formatMoney(p.held)}</span>}
                </td>
                <td className="num">{formatMoney(p.total)}</td>
              </LedgerRow>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
