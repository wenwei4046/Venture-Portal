'use client'

import { Fragment, useMemo, useRef, useState, useTransition, type ClipboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { compareHeights, heightKey } from '@/lib/catalogue/keys'
import { TIERS } from '@/lib/catalogue/pricing'
import { saveComboPrices } from '../../catalogue-actions'
import type { ComboRow } from '../load'
import { useProductDraftGuard } from './ProductWorkspace'
import {
  buildComboPriceEdits, comboHeightColumns, comboKey, comboPriceAt, comboSets,
  comboSlotLabel, parsePastedGrid, slotGroups, type ComboDrafts,
} from './combo-pricing'

function tierLabel(tier: string) {
  return tier.replace('PRICE_', 'P')
}

/** ERP definitions stay read-only; the portal maintains the price of one set. */
export default function ComboPricingTab({ combos }: { combos: ComboRow[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [model, setModel] = useState('')
  const [tier, setTier] = useState('all')
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<ComboDrafts>(new Map())
  const [saving, startSaving] = useTransition()
  const saveLock = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  useProductDraftGuard(drafts.size > 0, saving)

  const models = useMemo(() => {
    const options = new Map<string, string>()
    for (const c of combos) options.set(c.baseModel, c.modelName && c.modelName !== c.baseModel
      ? `${c.baseModel} · ${c.modelName}` : c.baseModel)
    return [...options].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
  }, [combos])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return combos.filter(c => {
      if (model && c.baseModel !== model) return false
      if (tier !== 'all' && (c.tier ?? 'any') !== tier) return false
      return !q || [c.baseModel, c.modelName, c.label, comboSlotLabel(c.slots)]
        .some(v => (v ?? '').toLowerCase().includes(q))
    })
  }, [combos, model, query, tier])
  /** One row per set; its fabric tiers become column bands. */
  const sets = useMemo(() => comboSets(shown), [shown])
  const tierBands = useMemo(() => {
    const present = new Set(shown.map(c => c.tier))
    return [...TIERS, null].filter(t => present.has(t))
  }, [shown])
  const heights = useMemo(() => comboHeightColumns(shown).sort(compareHeights), [shown])
  const columns = useMemo(() => tierBands.flatMap(t => heights.map(h => ({ tier: t, height: h }))), [tierBands, heights])
  const rowsByModel = useMemo(() => {
    const byModel = new Map<string, typeof sets>()
    for (const set of sets) byModel.set(set.baseModel, [...(byModel.get(set.baseModel) ?? []), set])
    return [...byModel]
  }, [sets])

  /** The cell a sheet position edits, or null where the ERP does not offer that tier/size. */
  function cellAt(row: number, column: number): { combo: ComboRow; height: string } | null {
    const set = sets[row]
    const col = columns[column]
    const combo = set && col ? set.byTier.get(col.tier) : undefined
    if (!combo) return null
    const height = comboHeightColumns([combo]).find(h => heightKey(h) === heightKey(col.height))
    return height === undefined ? null : { combo, height }
  }

  /** Excel paste: rows go down the sheet, tabs go across; boxes the ERP does not offer are skipped. */
  function paste(e: ClipboardEvent<HTMLTableSectionElement>) {
    const target = e.target as HTMLElement
    const row = Number(target.dataset.row)
    const column = Number(target.dataset.column)
    if (!editing || saving || Number.isNaN(row) || Number.isNaN(column)) return
    const grid = parsePastedGrid(e.clipboardData.getData('text'))
    if (!grid) return
    e.preventDefault()
    grid.forEach((values, r) => values.forEach((value, c) => {
      const cell = cellAt(row + r, column + c)
      if (cell) touch(cell.combo, cell.height, value)
    }))
  }

  function touch(c: ComboRow, height: string, value: string) {
    const key = comboKey(c)
    const h = heightKey(height)!
    setDrafts(previous => {
      const next = new Map(previous)
      const cells = { ...next.get(key) }
      const current = comboPriceAt(c, height)
      if (value === (current === null ? '' : String(current))) delete cells[h]
      else cells[h] = { height, value }
      if (Object.keys(cells).length) next.set(key, cells)
      else next.delete(key)
      return next
    })
  }

  function cancel() {
    if (saveLock.current) return
    setDrafts(new Map())
    setEditing(false)
    setError(null)
  }

  function save() {
    if (saveLock.current || drafts.size === 0) return
    saveLock.current = true
    setError(null)
    setNotice(null)
    startSaving(async () => {
      try {
        const edits = buildComboPriceEdits(combos, drafts)
        const result = await saveComboPrices(edits)
        setDrafts(new Map())
        setEditing(false)
        setNotice(`${result.saved} combo${result.saved === 1 ? '' : 's'} saved. New sales lines use these prices. To update an existing month, recost its orders in Comm Cal.`)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the combo prices')
      } finally {
        saveLock.current = false
      }
    })
  }

  return (
    <section className="sku-master combo-workspace" aria-label="Combo Pricing">
      <div className="sku-filters">
        <div className="sku-filter-controls combo-filter-controls">
          <label className="sku-search">
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" />
            </svg>
            <input type="search" value={query} disabled={saving} onChange={e => setQuery(e.target.value)}
              placeholder="Search combo or module…" aria-label="Search combos" />
          </label>
          <label className="sku-model-filter">
            <span>Model</span>
            <select value={model} disabled={saving} onChange={e => setModel(e.target.value)}>
              <option value="">All models</option>
              {models.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <div className="sku-tier-filter" role="group" aria-label="Combo tier">
            <span>Tier</span>
            <div className="sku-tier-options">
              {[['all', 'All'], ...TIERS.map((t, i) => [t, `P${i + 1}`]), ['any', 'Any']].map(([value, label]) => (
                <button key={value} type="button" aria-pressed={tier === value} disabled={saving} onClick={() => setTier(value)}>{label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="sku-actions">
        <p className="sku-count" aria-live="polite"><strong>{sets.length.toLocaleString()}</strong> set{sets.length === 1 ? '' : 's'}{model ? ` · Model ${model}` : ''} · Price per set (RM)</p>
        <div className="sku-action-buttons">
          {editing ? <>
            <button type="button" onClick={cancel} disabled={saving} className="sku-secondary-button">Cancel</button>
            <button type="button" onClick={save} disabled={saving || drafts.size === 0} className="sku-primary-button">
              {saving ? 'Saving…' : drafts.size === 0 ? 'Save changes' : `Save ${drafts.size} combo${drafts.size === 1 ? '' : 's'}`}
            </button>
          </> : <button type="button" onClick={() => { setEditing(true); setNotice(null) }} className="sku-primary-button" disabled={combos.length === 0}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <path d="m12.5 3.5 4 4M3 17l1-5L13.5 2.5a1.4 1.4 0 0 1 2 0l2 2a1.4 1.4 0 0 1 0 2L8 16l-5 1Z" />
            </svg>
            Edit Prices
          </button>}
        </div>
      </div>
      {editing ? <p className="sku-edit-note">Blank clears a price. Zero is stored; only a positive combo price replaces module prices. Changes across models and tiers are saved together.</p> : null}
      {error ? <p className="sku-notice" data-tone="error" role="alert">{error}</p> : null}
      {notice ? <p className="sku-notice" data-tone="ok" role="status">{notice}</p> : null}

      <div className="sku-table-panel">
        <div className="sku-table-window table-scroll" tabIndex={0} role="region" aria-label="Combo prices table">
          <table className="ledger-table sku-table combo-sheet">
            <thead>
              <tr>
                <th scope="col" rowSpan={2} className="sku-code-column">Set</th>
                <th scope="col" rowSpan={2}>What is in it</th>
                {tierBands.map(t => <th scope="colgroup" key={t ?? 'any'} colSpan={heights.length} className="combo-band combo-band-start">{t ? `Fabric ${tierLabel(t)}` : 'Any fabric'}</th>)}
              </tr>
              <tr>
                {columns.map((col, i) => <th scope="col" key={`${col.tier}-${col.height}`} className={`num combo-size${i % heights.length === 0 ? ' combo-band-start' : ''}`}>{col.height}</th>)}
              </tr>
            </thead>
            <tbody onPaste={paste}>
              {sets.length === 0 ? <tr><td colSpan={2 + columns.length} className="sku-empty">No combos match these filters.</td></tr> : rowsByModel.map(([baseModel, modelSets]) => <Fragment key={baseModel}>
                <tr className="combo-model-row">
                  <td className="sku-code-column">Model {baseModel}{modelSets[0].modelName && modelSets[0].modelName !== baseModel ? ` · ${modelSets[0].modelName}` : ''}</td>
                  <td colSpan={1 + columns.length}>{modelSets.length} set{modelSets.length === 1 ? '' : 's'}</td>
                </tr>
                {modelSets.map(set => {
                  const row = sets.indexOf(set)
                  const name = set.label ?? 'Unnamed combo'
                  return <tr key={set.key}>
                    <th scope="row" className="sku-code-column combo-set-name">
                      <strong>{name}</strong>{set.isNew ? <span className="chip ml-2">New</span> : null}
                      <span className="sku-model-name">{set.slots.length} piece{set.slots.length === 1 ? '' : 's'}</span>
                    </th>
                    <td className="combo-modules">
                      <div className="combo-recipe" aria-label={`${set.slots.length} module${set.slots.length === 1 ? '' : 's'} in one set`} title={comboSlotLabel(set.slots)}>
                        {slotGroups(set.slots).map((g, i) => <Fragment key={i}>
                          {i > 0 ? <span className="combo-plus" aria-hidden="true">+</span> : null}
                          <span className="combo-tile">
                            <span className="combo-tile-code">{g.code}</span>
                            {g.alternatives ? <span className="combo-tile-alt">{g.alternatives}</span> : null}
                            {g.count > 1 ? <span className="combo-tile-count">×{g.count}</span> : null}
                          </span>
                        </Fragment>)}
                        {set.slots.length === 0 ? 'No modules defined' : null}
                      </div>
                    </td>
                    {columns.map((col, column) => {
                      const cell = cellAt(row, column)
                      const bandStart = column % heights.length === 0 ? ' combo-band-start' : ''
                      if (!cell) return <td key={column} className={`num combo-off${bandStart}`} title="The ERP does not offer this fabric and seat size for this set" />
                      const key = comboKey(cell.combo)
                      const current = comboPriceAt(cell.combo, cell.height)
                      const draft = drafts.get(key)?.[heightKey(cell.height)!]
                      const historical = !cell.combo.heights.some(h => heightKey(h) === heightKey(cell.height))
                      return <td key={column} className={`num${bandStart}`} data-edited={draft ? true : undefined}
                        title={historical ? 'Previously priced seat size; no longer listed by the ERP' : undefined}>
                        {editing ? <input
                          value={draft?.value ?? (current === null ? '' : String(current))}
                          onChange={e => touch(cell.combo, cell.height, e.target.value)}
                          data-row={row} data-column={column}
                          disabled={saving} inputMode="decimal" className="sku-price-input"
                          aria-label={`${set.baseModel} ${name} ${cell.combo.tier ?? 'any tier'} at ${cell.height}`}
                        /> : current === null ? <span className="combo-unpriced">—</span> : formatMoney(current)}
                      </td>
                    })}
                  </tr>
                })}
              </Fragment>)}
            </tbody>
          </table>
        </div>
        <div className="sku-table-footer">
          <span>{sets.length.toLocaleString()} set{sets.length === 1 ? '' : 's'} · {shown.length.toLocaleString()} of {combos.length.toLocaleString()} combos shown</span>
          <span className="combo-definition-note">Shaded boxes are sizes the ERP does not offer for that set. In Edit Prices, paste a block copied from Excel.</span>
        </div>
      </div>
    </section>
  )
}
