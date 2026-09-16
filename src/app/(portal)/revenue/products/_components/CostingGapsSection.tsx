import { SectionHead, Hint } from '@/components/RowForm'
import { formatMoney } from '@/lib/utils'
import type { CostingGap } from '../load'

/**
 * The work list: what was sold and could not be costed, worth-first.
 *
 * WHY IT IS THE HEADLINE AND NOT A FOOTNOTE. A bill with one uncosted line has
 * no margin the engine will stand behind, so a handful of codes can take a
 * month's worth of bills out of the margin ladder. Sorting by the revenue
 * those codes carried turns "230 codes" into the ten that matter.
 *
 * `in SKU master` / `in Overrides` say WHERE to fix each one. A code that is in
 * the SKU master and still uncosted is the ERP's own gap — its cost field is
 * empty over there — and no amount of typing in the portal is the right
 * answer to it.
 */
export default function CostingGapsSection({
  gaps,
  from,
  to,
}: {
  gaps: CostingGap[]
  from: string
  to: string
}) {
  if (gaps.length === 0) {
    return (
      <section>
        <SectionHead title="Costing gaps" count="NONE" />
        <Hint>Every line sold since {from} has a cost. Every bill can be given a margin.</Hint>
      </section>
    )
  }

  const revenue = gaps.reduce((s, g) => s + g.revenue, 0)
  const lines = gaps.reduce((s, g) => s + g.lines, 0)

  return (
    <section>
      <SectionHead title="Costing gaps" count={`${gaps.length} CODES`} />
      <Hint>
        Sold between {from} and {to} with nothing able to cost it — not the ERP&apos;s own stamp on
        the sale, not the SKU master, not an override. <strong>{lines.toLocaleString()} lines</strong>{' '}
        carrying <strong>{formatMoney(revenue)}</strong>. Every bill touching one of these has no
        margin the run will stand behind, so the below-margin penalty and the monthly incentive are
        both skipped for it. A code marked <em>in SKU master</em> is the ERP&apos;s gap: its cost
        field is empty over there, and filling it there fixes it everywhere.
      </Hint>

      <table className="ledger-table mt-4">
        <thead>
          <tr>
            <th>Item code</th>
            <th>Group</th>
            <th>Brand</th>
            <th className="num">Lines</th>
            <th className="num">Bills</th>
            <th className="num">Revenue</th>
            <th>Where to fix it</th>
          </tr>
        </thead>
        <tbody>
          {gaps.slice(0, 80).map(g => (
            <tr key={g.item_code}>
              <td className="font-mono text-xs">{g.item_code}</td>
              <td className="text-xs text-graphite">{g.item_group ?? '—'}</td>
              <td className="text-xs">{g.brand_code ?? '—'}</td>
              <td className="num">{g.lines}</td>
              <td className="num">{g.bills}</td>
              <td className="num whitespace-nowrap">
                {g.revenue > 0 ? formatMoney(g.revenue) : <span className="text-graphite">—</span>}
              </td>
              <td className="text-xs">
                {g.in_sku_master ? (
                  <span className="text-alert">the ERP — its cost field is empty</span>
                ) : g.in_product_list ? (
                  <span className="text-alert">Overrides — the row is there with no cost</span>
                ) : (
                  <span className="text-graphite">not in either list</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {gaps.length > 80 ? (
        <p className="text-sm text-graphite mt-3 font-serif italic">
          The 80 worth the most are shown; {gaps.length - 80} smaller codes follow them.
        </p>
      ) : null}
    </section>
  )
}
