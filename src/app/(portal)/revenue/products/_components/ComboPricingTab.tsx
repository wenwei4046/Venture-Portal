'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Hint } from '@/components/RowForm'
import { formatMoney } from '@/lib/utils'
import { compareHeights, heightKey } from '@/lib/catalogue/keys'
import { saveComboPrices } from '../../catalogue-actions'
import type { ComboRow } from '../load'
import { MONEY_INPUT, Notice, Stat, Toolbar } from './ui'

/**
 * Combo Pricing — the ERP's sofa combos, kept in step, at the portal's own
 * price per seat height (user 2026-09-24: 这边加了新的 Sofa Combo，Venture Portal
 * 那边就会新增，但价格一样是由我们在 Venture Portal 这边自己调).
 *
 * A priced combo replaces its modules' prices whenever a build covers it — in
 * the calculator and in the run alike — by the ERP's own rules: same base
 * model, one seat height and one fabric tier across the set, extras at their
 * own price, the combo always wins. A combo with no price here does nothing;
 * the modules are added up instead.
 *
 * One line per combo: the ERP keeps every edit as a new dated row, and the
 * newest is the one shown. The price is keyed on the combo itself (model,
 * slot-set, tier), so an edit over there never loses a price typed here.
 */

function slotsLabel(slots: string[][]): string {
  return slots.map(s => s.join(' / ')).join(' + ')
}

function comboKey(c: ComboRow): string {
  return `${c.baseModel}\u0000${c.slotsKey}\u0000${c.tier ?? ''}`
}

export default function ComboPricingTab({ combos }: { combos: ComboRow[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [onlyUnpriced, setOnlyUnpriced] = useState(false)
  const [editing, setEditing] = useState(false)
  const drafts = useRef<Map<string, Record<string, string>>>(new Map())
  const [dirty, setDirty] = useState(0)
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return combos.filter(c => {
      if (onlyUnpriced && Object.keys(c.prices).length > 0) return false
      if (!q) return true
      return [c.baseModel, c.modelName, c.label, slotsLabel(c.slots)].some(v => (v ?? '').toLowerCase().includes(q))
    })
  }, [combos, query, onlyUnpriced])

  const groups = useMemo(() => {
    const m = new Map<string, ComboRow[]>()
    for (const c of shown) {
      const list = m.get(c.baseModel) ?? []
      list.push(c)
      m.set(c.baseModel, list)
    }
    return [...m.entries()]
  }, [shown])

  const priced = combos.filter(c => Object.keys(c.prices).length > 0).length

  /** The ERP's heights for the combo, then any height the portal priced that the ERP dropped. */
  function heightsOf(c: ComboRow): string[] {
    const out = [...c.heights]
    const have = new Set(out.map(h => heightKey(h)))
    for (const h of Object.keys(c.prices)) if (!have.has(heightKey(h))) out.push(h)
    return out.sort(compareHeights)
  }

  function save() {
    const byKey = new Map(combos.map(c => [comboKey(c), c]))
    const edits = [...drafts.current.entries()].map(([k, cells]) => {
      const c = byKey.get(k)!
      const prices: Record<string, string | null> = {}
      for (const h of heightsOf(c)) {
        const typed = cells[h]
        prices[h] = typed !== undefined ? typed : c.prices[h] !== undefined ? String(c.prices[h]) : null
      }
      return { baseModel: c.baseModel, slotsKey: c.slotsKey, tier: c.tier, prices }
    })
    setError(null)
    startSaving(async () => {
      try {
        const r = await saveComboPrices(edits)
        drafts.current = new Map()
        setDirty(0)
        setEditing(false)
        setNotice(`${r.saved} combo${r.saved === 1 ? '' : 's'} saved.`)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the combo prices')
      }
    })
  }

  return (
    <section>
      <Hint>
        The ERP&apos;s sofa combos, one line each, kept in step — a combo the ERP adds appears here
        by itself. The <strong>price per seat height is the portal&apos;s</strong>: when a sofa build
        covers a priced combo, the combo&apos;s price replaces its modules&apos; prices — in the
        calculator and in the run, spread across the matched modules the way the ERP spreads its
        own. A combo with no price here changes nothing.
      </Hint>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 mb-6">
        <Stat label="Combos" value={combos.length.toLocaleString()} />
        <Stat label="Priced here" value={priced.toLocaleString()} />
        <Stat label="Sofa models with combos" value={new Set(combos.map(c => c.baseModel)).size.toLocaleString()} />
      </div>

      <Toolbar>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search a model or a combo"
          aria-label="Search combos"
          className="flex-1 min-w-[16rem] border border-hairline rounded-md px-3 py-2 text-sm bg-surface"
        />
        <label className="flex items-center gap-2 text-sm text-graphite whitespace-nowrap">
          <input type="checkbox" checked={onlyUnpriced} onChange={e => setOnlyUnpriced(e.target.checked)} />
          Only without a price
        </label>
        {editing ? (
          <>
            <button
              type="button"
              onClick={save}
              disabled={saving || dirty === 0}
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-40"
            >
              {saving ? 'Saving…' : dirty === 0 ? 'No changes yet' : `Save ${dirty} combo${dirty === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={() => { drafts.current = new Map(); setDirty(0); setEditing(false) }}
              className="font-serif italic text-sm text-graphite hover:text-ink"
            >
              Cancel
            </button>
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
      </Toolbar>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}

      {groups.length === 0 ? (
        <p className="font-serif italic text-sm text-muted">No combo matches.</p>
      ) : (
        <div className="space-y-6">
          {groups.map(([model, list]) => (
            <div key={model}>
              <div className="sect-head">
                <h2>
                  {model}
                  {list[0].modelName && list[0].modelName !== model ? (
                    <span className="text-graphite font-normal"> · {list[0].modelName}</span>
                  ) : null}
                </h2>
                <span className="rule" aria-hidden />
                <span className="count">{list.length} COMBOS</span>
              </div>
              <div className="border border-hairline rounded-md bg-surface overflow-x-auto table-scroll">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Combo</th>
                      <th>Modules</th>
                      <th>Tier</th>
                      <th>Price per seat height</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(c => {
                      const k = comboKey(c)
                      return (
                        <tr key={k}>
                          <td className="text-sm whitespace-nowrap">
                            {c.label ?? '—'}
                            {c.isNew ? <span className="chip accent ml-2">NEW</span> : null}
                          </td>
                          <td className="font-mono text-[11px] text-graphite">{slotsLabel(c.slots)}</td>
                          <td className="font-mono text-xs whitespace-nowrap">
                            {c.tier ? `Tier ${c.tier.slice(-1)}` : 'any'}
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-3">
                              {heightsOf(c).map(h => {
                                const current = c.prices[h]
                                return (
                                  <label key={h} className="inline-flex items-center gap-1 text-xs text-graphite whitespace-nowrap">
                                    <span className="font-mono">{h}</span>
                                    {editing ? (
                                      <input
                                        defaultValue={drafts.current.get(k)?.[h] ?? (current === undefined ? '' : String(current))}
                                        onChange={e => {
                                          const d = drafts.current.get(k) ?? {}
                                          d[h] = e.target.value
                                          drafts.current.set(k, d)
                                          setDirty(drafts.current.size)
                                        }}
                                        inputMode="decimal"
                                        aria-label={`${c.baseModel} ${c.label ?? ''} at ${h}`}
                                        className={`${MONEY_INPUT} w-24`}
                                      />
                                    ) : current === undefined ? (
                                      <span className="text-graphite">—</span>
                                    ) : (
                                      <span className="num text-num-ink">{formatMoney(current)}</span>
                                    )}
                                  </label>
                                )
                              })}
                              {heightsOf(c).length === 0 ? <span className="text-graphite text-xs">no height offered</span> : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
