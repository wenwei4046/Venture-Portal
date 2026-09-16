'use client'

import { useMemo, useState } from 'react'
import { SectionHead, Hint } from '@/components/RowForm'
import { formatMoney } from '@/lib/utils'
import { categoryCounts, filterSkus, resolveCost, type CostField, type SkuLike } from '@/lib/commission/sku-master'
import type { SkuRow, MirrorState } from '../load'

/**
 * The ERP's SKU master, as the portal holds it.
 *
 * READ-ONLY BY CONSTRUCTION. Every column here belongs to the ERP and is
 * overwritten by the next delivery, so there is nothing to edit and no Save
 * button to imply there is. A code the ERP genuinely cannot cost gets a row in
 * the Overrides table below instead.
 */

const FIELD_LABEL: Record<Exclude<CostField, null>, string> = {
  cost_price: 'Cost',
  seat_height: 'Seat height',
  base_price: 'Price 2',
  price_1: 'Price 1',
}

function Num({ value }: { value: number | null }) {
  if (value === null) return <span className="text-graphite">—</span>
  return <>{formatMoney(value)}</>
}

export default function SkuMasterSection({ skus, state }: { skus: SkuRow[]; state: MirrorState }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [onlyUncosted, setOnlyUncosted] = useState(false)
  const [includeInactive, setIncludeInactive] = useState(false)

  const categories = useMemo(() => categoryCounts(skus as SkuLike[]), [skus])
  const shown = useMemo(
    () => filterSkus(skus as SkuLike[], { query, category, onlyUncosted, includeInactive }),
    [skus, query, category, onlyUncosted, includeInactive],
  )

  if (skus.length === 0) {
    return (
      <section>
        <SectionHead title="SKU master" count="NOT YET DELIVERED" />
        <Hint>
          The ERP has not pushed its catalogue yet. Until it does, a line&apos;s cost comes from
          whatever the ERP stamped on the sale, and then from the Overrides below — which is the
          arrangement this page replaces. The ERP side is{' '}
          <code className="font-mono text-xs">POST /api/erp/v1/products</code>, on the same key as
          the sales-order feed; <code className="font-mono text-xs">docs/erp-sync/contract.md</code>{' '}
          §9 is the shape it expects.
        </Hint>
      </section>
    )
  }

  const uncosted = state.products - state.costed

  return (
    <section>
      <SectionHead
        title="SKU master"
        count={`${state.products.toLocaleString()} SKUS · ${state.combos.toLocaleString()} COMBOS`}
      />
      <Hint>
        A mirror of the ERP&apos;s SKU master. The ERP owns every figure here and the next delivery
        overwrites it, so nothing on this page is editable — a code the ERP cannot cost is corrected
        in <em>Overrides</em> below. Cost is read in the ERP&apos;s own order: its cost field, then a
        sofa&apos;s seat-height grid, then Price&nbsp;2, then Price&nbsp;1.{' '}
        <em>The selling price is never used as a cost.</em>
      </Hint>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 mb-6">
        <Stat label="SKUs" value={state.products.toLocaleString()} />
        <Stat label="With a cost" value={state.costed.toLocaleString()} />
        <Stat label="Without one" value={uncosted.toLocaleString()} alert={uncosted > 0} />
        <Stat
          label="Combo models"
          value={state.comboModels.toLocaleString()}
          note={state.combos > 0 ? `${state.combos} rows` : undefined}
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Chip active={category === null} onClick={() => setCategory(null)}>
          All · {skus.length}
        </Chip>
        {categories.map(c => (
          <Chip key={c.category} active={category === c.category} onClick={() => setCategory(c.category)}>
            {c.category} · {c.costed}/{c.total}
          </Chip>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search a code, a description, a brand or a base model"
          className="flex-1 border border-hairline rounded-md px-3 py-2 text-sm bg-surface"
        />
        <label className="flex items-center gap-2 text-sm text-graphite whitespace-nowrap">
          <input type="checkbox" checked={onlyUncosted} onChange={e => setOnlyUncosted(e.target.checked)} />
          Only without a cost
        </label>
        <label className="flex items-center gap-2 text-sm text-graphite whitespace-nowrap">
          <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} />
          Include retired
        </label>
      </div>

      <table className="ledger-table">
        <thead>
          <tr>
            <th>Item code</th>
            <th>Description</th>
            <th>Category</th>
            <th>Size</th>
            <th>Brand</th>
            <th className="num">Cost used</th>
            <th>From</th>
            <th className="num">Price 2</th>
            <th className="num">Price 1</th>
            <th className="num">Selling</th>
          </tr>
        </thead>
        <tbody>
          {shown.slice(0, 500).map(sku => {
            const r = resolveCost(sku)
            return (
              <tr key={sku.item_code} className={sku.active ? undefined : 'opacity-50'}>
                <td className="font-mono text-xs">{sku.item_code}</td>
                <td>{sku.description ?? <span className="text-graphite">—</span>}</td>
                <td className="text-xs text-graphite">{sku.category ?? '—'}</td>
                <td className="text-xs">{sku.size_display ?? '—'}</td>
                <td className="text-xs">{sku.brand_code ?? '—'}</td>
                <td className="num">
                  {r.cost === null ? <span className="text-danger">—</span> : formatMoney(r.cost)}
                </td>
                <td className="text-xs text-graphite">
                  {r.field === null ? (
                    <span className="text-danger">nothing costs it</span>
                  ) : (
                    <>
                      {FIELD_LABEL[r.field]}
                      {r.seatHeights > 1 ? ` · ${r.seatHeights} heights` : ''}
                    </>
                  )}
                </td>
                <td className="num"><Num value={sku.base_price} /></td>
                <td className="num"><Num value={sku.price_1} /></td>
                <td className="num"><Num value={sku.sell_price} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {shown.length > 500 ? (
        <p className="text-sm text-graphite mt-3 font-serif italic">
          Showing the first 500 of {shown.length.toLocaleString()} — narrow the search to see the rest.
        </p>
      ) : (
        <p className="text-sm text-graphite mt-3 font-serif italic">
          {shown.length.toLocaleString()} of {skus.length.toLocaleString()}
        </p>
      )}
    </section>
  )
}

function Stat({ label, value, note, alert }: { label: string; value: string; note?: string; alert?: boolean }) {
  return (
    <div className="border border-hairline rounded-md bg-surface px-4 py-3">
      <div className="text-[0.65rem] uppercase tracking-wider text-graphite">{label}</div>
      <div className={`text-2xl tabular tracking-[-0.01em] ${alert ? 'text-danger' : 'text-num-ink'}`}>
        {value}
      </div>
      {note ? <div className="text-xs text-graphite mt-1">{note}</div> : null}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? 'bg-accent text-paper border-accent'
          : 'bg-surface text-graphite border-hairline hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
