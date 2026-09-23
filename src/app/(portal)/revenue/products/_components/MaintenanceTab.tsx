'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Hint } from '@/components/RowForm'
import { formatMoney } from '@/lib/utils'
import { MAINTENANCE_SECTIONS } from '@/lib/catalogue/options'
import { saveOptionPrices } from '../../catalogue-actions'
import type { FabricRow, MaintenanceOption } from '../load'
import { MONEY_INPUT, MirrorFlags, Notice } from './ui'

/**
 * Maintenance — the ERP's Bedframe and Sofa option pools, and the fabrics.
 *
 * What the user asked for (2026-09-24): Fabric, Bed Frame and Sofa, kept in
 * step; NOT the "Products Maintenance" pools below them (bedframe and mattress
 * sizes, compartments, brandings, supplier categories). The rail is the ERP's
 * own, minus those.
 *
 * The values arrive from the ERP; the RM beside a priced option is the
 * portal's. In the ERP that figure is a COST surcharge ("这些价钱都是
 * costing") and it is what choosing the option adds to a line — so here it is
 * what choosing it adds to the cost a margin is measured against, in the
 * calculator and in the run. An option nobody has priced adds nothing, and
 * says so.
 */

const FABRICS = 'fabrics'

export default function MaintenanceTab({
  options,
  fabrics,
}: {
  options: MaintenanceOption[]
  fabrics: FabricRow[]
}) {
  const router = useRouter()
  const [pool, setPool] = useState<string>('bedframe_divan_heights')
  const [editing, setEditing] = useState(false)
  const drafts = useRef<Map<string, string>>(new Map())
  const [dirty, setDirty] = useState(0)
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [fabricQuery, setFabricQuery] = useState('')
  const [showRetired, setShowRetired] = useState(false)

  const byPool = useMemo(() => {
    const m = new Map<string, MaintenanceOption[]>()
    for (const o of options) {
      if (o.removed && !showRetired) continue
      const list = m.get(o.pool) ?? []
      list.push(o)
      m.set(o.pool, list)
    }
    for (const list of m.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value))
    return m
  }, [options, showRetired])

  const liveFabrics = useMemo(() => fabrics.filter(f => showRetired || !f.removed), [fabrics, showRetired])
  const meta = MAINTENANCE_SECTIONS.flatMap(s => s.pools).find(p => p.pool === pool)
  const rows = byPool.get(pool) ?? []

  function pick(next: string) {
    if (editing && dirty > 0 && !window.confirm('Leave without saving these surcharges?')) return
    drafts.current = new Map()
    setDirty(0)
    setEditing(false)
    setError(null)
    setNotice(null)
    setPool(next)
  }

  function save() {
    const edits = [...drafts.current.entries()].map(([value, price]) => ({ value, price }))
    setError(null)
    startSaving(async () => {
      try {
        const r = await saveOptionPrices(pool, edits)
        drafts.current = new Map()
        setDirty(0)
        setEditing(false)
        setNotice(`${r.saved} surcharge${r.saved === 1 ? '' : 's'} saved.`)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the surcharges')
      }
    })
  }

  const shownFabrics = useMemo(() => {
    const q = fabricQuery.trim().toLowerCase()
    if (!q) return liveFabrics
    return liveFabrics.filter(f =>
      [f.code, f.description, f.series, f.category].some(v => (v ?? '').toLowerCase().includes(q)),
    )
  }, [liveFabrics, fabricQuery])

  return (
    <section>
      <Hint>
        The ERP&apos;s Bedframe and Sofa option pools and its fabric list, kept in step (its{' '}
        <em>Products Maintenance</em> pools are not mirrored). The values are the ERP&apos;s; the{' '}
        <strong>RM beside a priced option is the portal&apos;s</strong> — what choosing it adds to the
        cost a margin is measured against, in the calculator and in the run. An option with no RM
        adds nothing until one is keyed. Which options each model offers is set on <em>Modular</em>.
      </Hint>

      <div className="grid grid-cols-1 md:grid-cols-[14rem_1fr] gap-6 mt-6">
        <nav aria-label="Maintenance pools" className="border border-hairline rounded-md bg-surface p-3 self-start">
          {MAINTENANCE_SECTIONS.map(s => (
            <div key={s.section} className="mb-3">
              <div className="font-mono text-[10.5px] text-muted tracking-wider mb-1">{s.section.toUpperCase()}</div>
              {s.pools.map(p => {
                const list = byPool.get(p.pool) ?? []
                const unpriced = p.priced ? list.filter(o => o.price === null && !o.removed).length : 0
                return (
                  <button
                    key={p.pool}
                    type="button"
                    onClick={() => pick(p.pool)}
                    aria-current={pool === p.pool}
                    className={`w-full flex items-center justify-between text-left text-sm px-2 py-1.5 rounded-control ${
                      pool === p.pool ? 'bg-accent text-paper' : 'text-ink hover:bg-surface-2'
                    }`}
                  >
                    <span>{p.label}</span>
                    <span className="font-mono text-[10.5px] opacity-80">
                      {p.priced ? 'RM · ' : ''}
                      {list.length}
                      {unpriced > 0 ? ` · ${unpriced} ?` : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
          <div>
            <div className="font-mono text-[10.5px] text-muted tracking-wider mb-1">COMMON</div>
            <button
              type="button"
              onClick={() => pick(FABRICS)}
              aria-current={pool === FABRICS}
              className={`w-full flex items-center justify-between text-left text-sm px-2 py-1.5 rounded-control ${
                pool === FABRICS ? 'bg-accent text-paper' : 'text-ink hover:bg-surface-2'
              }`}
            >
              <span>Fabrics</span>
              <span className="font-mono text-[10.5px] opacity-80">{liveFabrics.filter(f => f.active).length}</span>
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-graphite mt-3">
            <input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} />
            Include gone from the ERP
          </label>
        </nav>

        <div>
          {pool === FABRICS ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
                <h2 className="font-sans text-lg font-medium text-ink">Fabrics</h2>
                <span className="font-mono text-[10.5px] text-muted">
                  THE TIER A FABRIC COSTS A SOFA MODULE OR A BED FRAME AT
                </span>
              </div>
              <input
                value={fabricQuery}
                onChange={e => setFabricQuery(e.target.value)}
                placeholder="Search a fabric code, a series or a description"
                aria-label="Search fabrics"
                className="w-full border border-hairline rounded-md px-3 py-2 text-sm bg-surface mb-3"
              />
              <div className="border border-hairline rounded-md bg-surface overflow-x-auto table-scroll">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Description</th>
                      <th>Series</th>
                      <th>Sofa tier</th>
                      <th>Bedframe tier</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {shownFabrics.slice(0, 400).map(f => (
                      <tr key={f.erpId} className={!f.active || f.removed ? 'opacity-60' : undefined}>
                        <td className="font-mono text-xs whitespace-nowrap">{f.code}</td>
                        <td className="text-sm">{f.description ?? '—'}</td>
                        <td className="text-xs">{f.series ?? '—'}</td>
                        <td className="font-mono text-xs">{tierLabel(f.sofaTier)}</td>
                        <td className="font-mono text-xs">{tierLabel(f.bedframeTier)}</td>
                        <td className="whitespace-nowrap">
                          <MirrorFlags isNew={false} active={f.active} removed={f.removed} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-graphite mt-3 font-serif italic">
                {Math.min(400, shownFabrics.length).toLocaleString()} of {shownFabrics.length.toLocaleString()} shown. A
                fabric with no tier costs at Tier 2, the ERP&apos;s own default.
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
                <h2 className="font-sans text-lg font-medium text-ink">{meta?.label ?? pool}</h2>
                {meta?.priced ? (
                  editing ? (
                    <span className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={save}
                        disabled={saving || dirty === 0}
                        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-40"
                      >
                        {saving ? 'Saving…' : dirty === 0 ? 'No changes yet' : `Save ${dirty}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => { drafts.current = new Map(); setDirty(0); setEditing(false) }}
                        className="font-serif italic text-sm text-graphite hover:text-ink"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setEditing(true); setNotice(null) }}
                      className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
                    >
                      Edit surcharges
                    </button>
                  )
                ) : (
                  <span className="font-mono text-[10.5px] text-muted">NO PRICE — A CHOICE, NOT A SURCHARGE</span>
                )}
              </div>
              {error ? <Notice tone="error">{error}</Notice> : null}
              {notice ? <Notice tone="ok">{notice}</Notice> : null}
              {rows.length === 0 ? (
                <p className="font-serif italic text-sm text-muted">The ERP has sent no options for this list yet.</p>
              ) : (
                <div className="border border-hairline rounded-md bg-surface overflow-x-auto">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th className="w-12">#</th>
                        <th>Option</th>
                        {meta?.priced ? <th className="num">Surcharge</th> : null}
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((o, i) => (
                        <tr key={o.value} className={!o.active || o.removed ? 'opacity-60' : undefined}>
                          <td className="font-mono text-xs text-muted">{i + 1}</td>
                          <td className="text-sm">{o.label}</td>
                          {meta?.priced ? (
                            <td className="num">
                              {editing ? (
                                <input
                                  defaultValue={drafts.current.get(o.value) ?? (o.price === null ? '' : String(o.price))}
                                  onChange={e => {
                                    drafts.current.set(o.value, e.target.value)
                                    setDirty(drafts.current.size)
                                  }}
                                  inputMode="decimal"
                                  aria-label={`${o.label} surcharge`}
                                  className={`${MONEY_INPUT} w-24`}
                                />
                              ) : o.price === null ? (
                                <span className="text-graphite" title="No surcharge keyed — adds nothing">—</span>
                              ) : o.price < 0 ? (
                                <span className="neg">({formatMoney(Math.abs(o.price))})</span>
                              ) : (
                                formatMoney(o.price)
                              )}
                            </td>
                          ) : null}
                          <td className="whitespace-nowrap space-x-1">
                            <MirrorFlags isNew={o.isNew} active={o.active} removed={o.removed} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function tierLabel(t: string | null): string {
  if (!t) return '—'
  const m = /^PRICE_(\d)$/.exec(t)
  return m ? `Tier ${m[1]}` : t
}
