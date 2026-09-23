import { Hint } from '@/components/RowForm'
import { formatMoney } from '@/lib/utils'
import type { CostingGap } from '../load'

/**
 * The work list: what was sold and nothing could price, worth-first.
 *
 * WHY IT IS A TAB AND NOT A FOOTNOTE. A bill with one unpriced line has no
 * margin the engine will stand behind, so a handful of codes can take a
 * month's worth of bills out of the margin ladder. Sorting by the revenue
 * those codes carried turns "200 codes" into the ten that matter.
 *
 * Since 2026-09-24 every price is the portal's own (the Product List is the
 * only place a cost is typed), so each row says which of three things is
 * wrong — and all three are fixed HERE, not in the ERP:
 *
 *   not in the SKU master   the ERP sold a code its own catalogue does not
 *                           carry (a service charge, an old AutoCount code)
 *   no price                the SKU is mirrored; nobody has priced it yet
 *   no seat height          a sofa module priced per height, sold on a line
 *                           that names no height its grid knows
 */

const REASON: Record<string, { label: string; tone: string }> = {
  not_in_sku_master: { label: 'not in the SKU master', tone: 'text-danger' },
  unpriced: { label: 'no price on SKU Master', tone: 'text-alert' },
  no_height: { label: 'no seat height the grid knows', tone: 'text-alert' },
  error: { label: 'could not be priced', tone: 'text-danger' },
}

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
        <Hint>Every line sold since {from} has a price. Every bill can be given a margin.</Hint>
      </section>
    )
  }

  const revenue = gaps.reduce((s, g) => s + g.revenue, 0)
  const lines = gaps.reduce((s, g) => s + g.lines, 0)
  const unpriced = gaps.filter(g => g.reason === 'unpriced').length

  return (
    <section>
      <Hint>
        Sold between {from} and {to} with nothing on this Product List able to price it —{' '}
        <strong>{lines.toLocaleString()} lines</strong> carrying <strong>{formatMoney(revenue)}</strong>.
        Every bill touching one of these has no margin the run will stand behind, so the below-margin
        penalty and the monthly incentive are both skipped for it. {unpriced} of the codes only need a
        price on <em>SKU Master</em>; a price keyed there reaches a month already landed when that month
        is recosted.
      </Hint>

      <div className="border border-hairline rounded-md bg-surface overflow-x-auto table-scroll mt-4">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Item code</th>
              <th className="m-hide">Product</th>
              <th>Group</th>
              <th className="num">Lines</th>
              <th className="num">Bills</th>
              <th className="num">Revenue</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {gaps.map(g => {
              const reason = REASON[g.reason] ?? { label: g.reason, tone: 'text-graphite' }
              return (
                <tr key={g.item_code}>
                  <td className="font-mono text-xs whitespace-nowrap">{g.item_code}</td>
                  <td className="m-hide text-sm text-graphite">{g.product_name ?? '—'}</td>
                  <td className="text-xs text-graphite">{g.item_group ?? '—'}</td>
                  <td className="num">{g.lines}</td>
                  <td className="num">{g.bills}</td>
                  <td className="num">{formatMoney(g.revenue)}</td>
                  <td className={`text-xs font-serif italic ${reason.tone}`}>{reason.label}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
