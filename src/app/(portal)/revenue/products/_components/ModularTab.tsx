'use client'

import { Fragment, useMemo, useState } from 'react'
import { Hint } from '@/components/RowForm'
import { isRiderModel, RIDER } from '@/lib/catalogue/options'
import type { BrandRef, CatalogueModel, MaintenanceOption } from '../load'
import ModelEditor from './ModelEditor'
import { FilterChip, MirrorFlags, Stat, Toolbar, categoryLabel, orderedCategories } from './ui'

/**
 * Modular — the ERP's models, and what the Revenue calculator may offer of
 * each (user 2026-09-24).
 *
 * The models and their allowed options arrive from the ERP exactly as its own
 * Modular tab holds them, and stay in step. The ticks are the portal's own —
 * "Modular 是独立的" — and they are the calculator's allowlist: a model not
 * offered is not in the calculator at all; inside an offered one, only the
 * ticked SKUs and the ticked options reach a dropdown. Anything the ERP adds
 * later arrives unticked, marked NEW.
 */

type Show = 'all' | 'offered' | 'not-offered' | 'new'

export default function ModularTab({
  models,
  brands,
  options,
}: {
  models: CatalogueModel[]
  brands: BrandRef[]
  options: MaintenanceOption[]
}) {
  const [category, setCategory] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<Show>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [limit, setLimit] = useState(200)

  const live = useMemo(() => models.filter(m => !m.removed), [models])
  const categories = useMemo(() => orderedCategories(live.map(m => m.category)), [live])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return live.filter(m => {
      if (category !== null && (m.category ?? '').toUpperCase() !== category) return false
      if (show === 'offered' && !m.offered) return false
      if (show === 'not-offered' && m.offered) return false
      if (show === 'new' && !m.isNew && !m.skus.some(s => s.isNew)) return false
      if (!q) return true
      return [m.code, m.name, m.brand, m.branding, ...m.skus.map(s => s.code)].some(v => (v ?? '').toLowerCase().includes(q))
    })
  }, [live, category, query, show])

  const stats = useMemo(() => {
    const offered = live.filter(m => m.offered)
    return {
      models: live.length,
      offered: offered.length,
      skus: offered.reduce((a, m) => a + m.skus.filter(s => s.offered && !s.removed).length, 0),
      fresh: live.filter(m => m.isNew || m.skus.some(s => s.isNew)).length,
    }
  }, [live])

  const visible = shown.slice(0, limit)

  return (
    <section>
      <Hint>
        The ERP&apos;s models and the options its Modular tab allows each one, kept in step. The{' '}
        <strong>ticks are the portal&apos;s own</strong> and they decide the Revenue calculator&apos;s
        dropdowns: a model that is not offered is not in the calculator; inside one that is, only
        the ticked SKUs (a sofa&apos;s compartments, a bed frame&apos;s or mattress&apos;s sizes) and the
        ticked options (seat heights, leg heights, specials, divan and total heights) can be chosen.
        Whatever the ERP adds later arrives unticked.
      </Hint>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 mb-6">
        <Stat label="Models" value={stats.models.toLocaleString()} />
        <Stat label="Offered in the calculator" value={stats.offered.toLocaleString()} />
        <Stat label="SKUs offered" value={stats.skus.toLocaleString()} />
        <Stat label="New since first load" value={stats.fresh.toLocaleString()} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <FilterChip active={category === null} onClick={() => setCategory(null)}>
          All · {live.length}
        </FilterChip>
        {categories.map(c => {
          const inCat = live.filter(m => (m.category ?? '').toUpperCase() === c)
          return (
            <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
              {categoryLabel(c)} · {inCat.filter(m => m.offered).length}/{inCat.length}
            </FilterChip>
          )
        })}
      </div>

      <Toolbar>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search a model, a name, a brand or a SKU code"
          aria-label="Search the models"
          className="flex-1 min-w-[16rem] border border-hairline rounded-md px-3 py-2 text-sm bg-surface"
        />
        <span className="flex items-center gap-1" role="group" aria-label="Show">
          {(
            [
              ['all', 'All'],
              ['offered', 'Offered'],
              ['not-offered', 'Not offered'],
              ['new', 'New'],
            ] as Array<[Show, string]>
          ).map(([k, label]) => (
            <FilterChip key={k} active={show === k} onClick={() => setShow(k)}>
              {label}
            </FilterChip>
          ))}
        </span>
      </Toolbar>

      <div className="border border-hairline rounded-md bg-surface overflow-x-auto table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Name</th>
              <th>Category</th>
              <th>Ladder</th>
              <th className="num">SKUs</th>
              <th>Calculator</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map(m => {
              const liveSkus = m.skus.filter(s => !s.removed)
              const ticked = liveSkus.filter(s => s.offered).length
              const unpriced = liveSkus.filter(s => s.offered && s.price === null && !(s.grid && s.grid.length > 0)).length
              const isOpen = open === m.erpId
              return (
                <Fragment key={m.erpId}>
                  <tr className={!m.active ? 'opacity-60' : undefined}>
                    <td className="font-mono text-xs whitespace-nowrap">{m.code}</td>
                    <td className="text-sm">{m.name && m.name !== m.code ? m.name : <span className="text-graphite">—</span>}</td>
                    <td className="text-xs">{categoryLabel(m.category)}</td>
                    <td className="text-xs">
                      {m.brand && m.brand !== RIDER ? (
                        m.brand
                      ) : isRiderModel(m.category, m.brandOverride) ? (
                        <span className="text-graphite">rider</span>
                      ) : (
                        <span
                          className="text-danger"
                          title="A mattress or sofa sells under its brand's margin ladder, and this one's ERP branding matches none. It is not offered until a ladder is chosen on the model."
                        >
                          no brand
                        </span>
                      )}
                    </td>
                    <td className="num whitespace-nowrap">
                      {ticked}/{liveSkus.length}
                      {unpriced > 0 ? (
                        <div className="text-[10.5px] text-danger" title="Ticked for the calculator but no price yet — it will say the cost is pending">
                          {unpriced} unpriced
                        </div>
                      ) : null}
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {m.offered ? <span className="chip ledger">OFFERED</span> : <span className="text-graphite">—</span>}
                    </td>
                    <td className="whitespace-nowrap space-x-1">
                      <MirrorFlags isNew={m.isNew} active={m.active} removed={m.removed} />
                      {!m.isNew && m.skus.some(s => s.isNew) ? <span className="chip accent">NEW SKU</span> : null}
                    </td>
                    <td className="whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : m.erpId)}
                        aria-expanded={isOpen}
                        className="text-xs text-accent hover:underline"
                      >
                        {isOpen ? 'Close' : 'Edit'}
                      </button>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr>
                      <td colSpan={8} className="!bg-surface-2/40">
                        <ModelEditor model={m} brands={brands} options={options} onClose={() => setOpen(null)} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {shown.length > visible.length ? (
        <button type="button" onClick={() => setLimit(l => l + 200)} className="font-serif italic text-sm text-accent hover:underline mt-3">
          Showing {visible.length.toLocaleString()} of {shown.length.toLocaleString()} — show more
        </button>
      ) : (
        <p className="text-sm text-graphite mt-3 font-serif italic">
          {shown.length.toLocaleString()} of {live.length.toLocaleString()} models
        </p>
      )}
    </section>
  )
}
