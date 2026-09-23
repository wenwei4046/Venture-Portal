'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Hint } from '@/components/RowForm'
import { formatMoney } from '@/lib/utils'
import { compareHeights, heightKey } from '@/lib/catalogue/keys'
import { TIERS, type PriceCell } from '@/lib/catalogue/pricing'
import { saveSkuPrices } from '../../catalogue-actions'
import type { CatalogueSku } from '../load'
import {
  FilterChip,
  MONEY_INPUT,
  MirrorFlags,
  Notice,
  Stat,
  Toolbar,
  categoryLabel,
  orderedCategories,
} from './ui'

/**
 * SKU Master — every SKU the ERP carries, and the price the portal measures
 * it against.
 *
 * The rows are the ERP's (code, description, model, category, size) and a
 * delivery keeps them in step, a new SKU included. The PRICE is the portal's
 * (user 2026-09-24: 价钱由我这边填): typed here with Edit prices, never
 * overwritten by the ERP. A mattress, bed frame or accessory has one figure; a
 * sofa module has a price per seat height and fabric tier, the shape the ERP
 * prices a module in — open the Sofa chip to edit that grid a tier at a time,
 * the way the ERP's own SKU Master does.
 *
 * Whether the Revenue calculator may OFFER a SKU is Modular's decision, shown
 * here but ticked there.
 */

const LIMIT_STEP = 300

type Draft = { price?: string; cells?: Record<string, string> }

function isPriced(s: CatalogueSku): boolean {
  return s.price !== null || (s.grid?.length ?? 0) > 0
}

function cellKey(height: string, tier: string): string {
  return `${heightKey(height)}|${tier}`
}

function cellPrice(grid: PriceCell[] | null, height: string, tier: string): number | null {
  const k = heightKey(height)
  return grid?.find(c => heightKey(c.height) === k && c.tier === tier)?.price ?? null
}

export default function SkuMasterTab({ skus, sofaSizes }: { skus: CatalogueSku[]; sofaSizes: string[] }) {
  const router = useRouter()
  const [category, setCategory] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [onlyUnpriced, setOnlyUnpriced] = useState(false)
  const [onlyOffered, setOnlyOffered] = useState(false)
  const [showGone, setShowGone] = useState(false)
  const [limit, setLimit] = useState(LIMIT_STEP)
  const [editing, setEditing] = useState(false)
  const [tier, setTier] = useState<string>('PRICE_2')
  const drafts = useRef<Map<string, Draft>>(new Map())
  const [dirty, setDirty] = useState(0)
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const live = useMemo(() => skus.filter(s => showGone || !s.removed), [skus, showGone])
  const categories = useMemo(() => orderedCategories(live.map(s => s.category)), [live])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return live.filter(s => {
      if (category !== null && (s.category ?? '').toUpperCase() !== category) return false
      if (onlyUnpriced && isPriced(s)) return false
      if (onlyOffered && !(s.offered && s.modelOffered)) return false
      if (!q) return true
      return [s.code, s.description, s.modelCode, s.modelName, s.brand, s.optionLabel]
        .some(v => (v ?? '').toLowerCase().includes(q))
    })
  }, [live, category, query, onlyUnpriced, onlyOffered])

  const sofaView = category === 'SOFA'

  // The grid's columns: the ERP's own seat sizes in the ERP's order, then any
  // height the portal has priced that the ERP no longer lists (a supplier set
  // still priced in cm, say), so no priced cell is ever out of sight.
  const heights = useMemo(() => {
    if (!sofaView) return []
    const cols = [...sofaSizes]
    const have = new Set(cols.map(h => heightKey(h)))
    const extra = new Map<string, string>()
    for (const s of shown) {
      for (const c of s.grid ?? []) {
        const k = heightKey(c.height)
        if (k !== null && !have.has(k) && !extra.has(k)) extra.set(k, c.height)
      }
    }
    return [...cols, ...[...extra.values()].sort(compareHeights)]
  }, [sofaView, sofaSizes, shown])

  const stats = useMemo(() => {
    const priced = live.filter(isPriced).length
    return {
      total: live.length,
      priced,
      unpriced: live.length - priced,
      offered: live.filter(s => s.offered && s.modelOffered).length,
      fresh: live.filter(s => s.isNew).length,
    }
  }, [live])

  function touch(erpId: string, update: (d: Draft) => void) {
    const d = drafts.current.get(erpId) ?? {}
    update(d)
    drafts.current.set(erpId, d)
    setDirty(drafts.current.size)
  }

  function cancel() {
    drafts.current = new Map()
    setDirty(0)
    setEditing(false)
    setError(null)
  }

  function save() {
    const byId = new Map(skus.map(s => [s.erpId, s]))
    const edits = [...drafts.current.entries()].map(([erpId, d]) => {
      const s = byId.get(erpId)!
      const price = d.price !== undefined ? d.price : s.price === null ? null : String(s.price)
      let grid: Array<{ height: string; tier: string; price: string | null }> | undefined
      if (d.cells) {
        const merged = new Map<string, { height: string; tier: string; price: string | null }>()
        for (const c of s.grid ?? []) merged.set(cellKey(c.height, c.tier), { height: c.height, tier: c.tier, price: String(c.price) })
        for (const [k, v] of Object.entries(d.cells)) {
          const [, t] = k.split('|')
          const height = heights.find(h => heightKey(h) === k.split('|')[0]) ?? k.split('|')[0]
          merged.set(k, { height: merged.get(k)?.height ?? height, tier: t, price: v })
        }
        grid = [...merged.values()]
      } else if (s.grid) {
        grid = s.grid.map(c => ({ height: c.height, tier: c.tier, price: String(c.price) }))
      }
      return { erpId, price, grid: grid ?? null }
    })
    setError(null)
    setNotice(null)
    startSaving(async () => {
      try {
        const r = await saveSkuPrices(edits)
        drafts.current = new Map()
        setDirty(0)
        setEditing(false)
        setNotice(
          `${r.saved} SKU${r.saved === 1 ? '' : 's'} saved. New sales lines are priced this way from now; ` +
            `a month already landed moves when it is recosted (Comm Cal → the month's orders).`,
        )
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the prices')
      }
    })
  }

  const visible = shown.slice(0, limit)

  return (
    <section>
      <Hint>
        Every SKU in the ERP&apos;s SKU master, kept in step — a SKU the ERP adds appears here by
        itself, marked <span className="chip accent">NEW</span>. The ERP sends items only: the{' '}
        <strong>price</strong> column is the portal&apos;s own, and it is what every margin here is
        measured against — the Revenue calculator&apos;s, the monthly run&apos;s. A SKU with no price
        leaves its bills with no margin. Sofa modules are priced per seat height and fabric tier: open{' '}
        <em>Sofa</em> to edit that grid. Which SKUs the calculator offers is set on <em>Modular</em>.
      </Hint>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6 mb-6">
        <Stat label="SKUs" value={stats.total.toLocaleString()} />
        <Stat label="With a price" value={stats.priced.toLocaleString()} />
        <Stat label="Without one" value={stats.unpriced.toLocaleString()} alert={stats.unpriced > 0} />
        <Stat label="In the calculator" value={stats.offered.toLocaleString()} />
        <Stat label="New since first load" value={stats.fresh.toLocaleString()} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <FilterChip active={category === null} onClick={() => setCategory(null)}>
          All · {live.length}
        </FilterChip>
        {categories.map(c => {
          const inCat = live.filter(s => (s.category ?? '').toUpperCase() === c)
          return (
            <FilterChip key={c} active={category === c} onClick={() => { setCategory(c); setLimit(LIMIT_STEP) }}>
              {categoryLabel(c)} · {inCat.filter(isPriced).length}/{inCat.length}
            </FilterChip>
          )
        })}
      </div>

      <Toolbar>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setLimit(LIMIT_STEP) }}
          placeholder="Search a code, a description, a model or a brand"
          aria-label="Search the SKU master"
          className="flex-1 min-w-[16rem] border border-hairline rounded-md px-3 py-2 text-sm bg-surface"
        />
        <label className="flex items-center gap-2 text-sm text-graphite whitespace-nowrap">
          <input type="checkbox" checked={onlyUnpriced} onChange={e => setOnlyUnpriced(e.target.checked)} />
          Only without a price
        </label>
        <label className="flex items-center gap-2 text-sm text-graphite whitespace-nowrap">
          <input type="checkbox" checked={onlyOffered} onChange={e => setOnlyOffered(e.target.checked)} />
          Only in the calculator
        </label>
        <label className="flex items-center gap-2 text-sm text-graphite whitespace-nowrap">
          <input type="checkbox" checked={showGone} onChange={e => setShowGone(e.target.checked)} />
          Include gone from the ERP
        </label>
      </Toolbar>

      <Toolbar>
        {editing ? (
          <>
            <button
              type="button"
              onClick={save}
              disabled={saving || dirty === 0}
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-40"
            >
              {saving ? 'Saving…' : dirty === 0 ? 'No changes yet' : `Save ${dirty} SKU${dirty === 1 ? '' : 's'}`}
            </button>
            <button type="button" onClick={cancel} disabled={saving} className="font-serif italic text-sm text-graphite hover:text-ink">
              Cancel
            </button>
            <span className="font-serif italic text-xs text-muted">
              Blank clears a price — the SKU goes back to having none. It is never read as zero.
            </span>
          </>
        ) : (
          <button
            type="button"
            onClick={() => { setEditing(true); setNotice(null) }}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
          >
            Edit prices
          </button>
        )}
        {sofaView ? (
          <span className="flex items-center gap-1 ml-auto" role="group" aria-label="Fabric tier">
            <span className="font-mono text-[10.5px] text-muted mr-2">TIER</span>
            {TIERS.map((t, i) => (
              <FilterChip key={t} active={tier === t} onClick={() => setTier(t)}>
                P{i + 1}
              </FilterChip>
            ))}
          </span>
        ) : null}
      </Toolbar>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}

      <div className="border border-hairline rounded-md bg-surface overflow-x-auto table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th>Model</th>
              {sofaView ? null : <th>Size</th>}
              {sofaView ? null : <th>Brand</th>}
              {sofaView
                ? heights.map(h => (
                    <th key={h} className="num whitespace-nowrap">{h}</th>
                  ))
                : null}
              <th className="num">{sofaView ? 'Flat' : 'Price'}</th>
              <th>Calculator</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map(s => (
              <tr key={s.erpId} className={s.removed || !s.active ? 'opacity-60' : undefined}>
                <td className="font-mono text-xs whitespace-nowrap">{s.code}</td>
                <td className="text-sm">{s.description ?? <span className="text-graphite">—</span>}</td>
                <td className="text-xs">
                  {s.modelCode ?? <span className="text-graphite">—</span>}
                  {s.modelName && s.modelName !== s.modelCode ? (
                    <div className="text-graphite">{s.modelName}</div>
                  ) : null}
                </td>
                {sofaView ? null : (
                  <td className="text-xs whitespace-nowrap">
                    {s.optionLabel !== s.code ? s.optionLabel : <span className="text-graphite">{categoryLabel(s.category)}</span>}
                  </td>
                )}
                {sofaView ? null : (
                  <td className="text-xs">{s.brand ?? <span className="text-graphite" title="Rides any cart; the mattress or sofa decides the ladder">rider</span>}</td>
                )}
                {sofaView
                  ? heights.map(h => {
                      const current = cellPrice(s.grid, h, tier)
                      return (
                        <td key={h} className="num">
                          {editing ? (
                            <input
                              key={`${s.erpId}|${h}|${tier}`}
                              defaultValue={
                                drafts.current.get(s.erpId)?.cells?.[cellKey(h, tier)] ?? (current === null ? '' : String(current))
                              }
                              onChange={e =>
                                touch(s.erpId, d => {
                                  d.cells = { ...(d.cells ?? {}), [cellKey(h, tier)]: e.target.value }
                                })
                              }
                              inputMode="decimal"
                              aria-label={`${s.code} at ${h} ${tier}`}
                              className={`${MONEY_INPUT} w-20`}
                            />
                          ) : current === null ? (
                            <span className="text-graphite">—</span>
                          ) : (
                            formatMoney(current)
                          )}
                        </td>
                      )
                    })
                  : null}
                <td className="num">
                  {editing && (sofaView || !(s.grid && s.grid.length > 0)) ? (
                    <input
                      defaultValue={drafts.current.get(s.erpId)?.price ?? (s.price === null ? '' : String(s.price))}
                      onChange={e => touch(s.erpId, d => { d.price = e.target.value })}
                      inputMode="decimal"
                      aria-label={`${s.code} price`}
                      className={`${MONEY_INPUT} w-24`}
                    />
                  ) : s.price !== null ? (
                    formatMoney(s.price)
                  ) : s.grid && s.grid.length > 0 ? (
                    <span className="text-xs text-graphite whitespace-nowrap" title="Priced per seat height and fabric tier — open Sofa to see the grid">
                      grid · {s.grid.length}
                    </span>
                  ) : (
                    <span className="text-danger">—</span>
                  )}
                </td>
                <td className="text-xs whitespace-nowrap">
                  {s.offered && s.modelOffered ? (
                    <span className="chip ledger">OFFERED</span>
                  ) : s.offered ? (
                    <span className="text-graphite" title="Ticked, but its model is not offered">model off</span>
                  ) : (
                    <span className="text-graphite">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap space-x-1">
                  <MirrorFlags isNew={s.isNew} active={s.active} removed={s.removed} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shown.length > visible.length ? (
        <button
          type="button"
          onClick={() => setLimit(l => l + LIMIT_STEP)}
          className="font-serif italic text-sm text-accent hover:underline mt-3"
        >
          Showing {visible.length.toLocaleString()} of {shown.length.toLocaleString()} — show {Math.min(LIMIT_STEP, shown.length - visible.length)} more
        </button>
      ) : (
        <p className="text-sm text-graphite mt-3 font-serif italic">
          {shown.length.toLocaleString()} of {live.length.toLocaleString()}
        </p>
      )}
    </section>
  )
}
