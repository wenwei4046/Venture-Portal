'use client'

import { Fragment, useMemo, useRef, useState, useTransition, type ClipboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { compareHeights, heightKey } from '@/lib/catalogue/keys'
import { TIERS } from '@/lib/catalogue/pricing'
import { removeCombos, saveComboPrices } from '../actions'
import type { CatalogueSku, ComboRow } from '../load'
import AddComboWindow from './AddComboWindow'
import { useProductDraftGuard } from './ProductWorkspace'
import {
  buildComboPriceEdits, comboHeightColumns, comboKey, comboPriceAt, comboSetKey, comboSets,
  comboSlotLabel, parsePastedGrid, slotGroups, type ComboDrafts,
} from './combo-pricing'
import {
  ActionRow, CellChip, CellInput, Controls, EditButton, EditingButtons, FilterPanel, money, Note, Notice, plural,
  SearchField, SelectField, TableFoot, tierLabel, TierControl,
} from './ui'
import c from './products.module.css'

const NBSP = String.fromCharCode(160)

/**
 * Every combo is the portal's own (2026-10-08): its price per fabric tier and
 * seat height is kept here, a set may be added (+ Add combo) and, in Edit
 * prices, removed — every tier of it, with its prices.
 */
export default function ComboPricingTab({ combos, sofaSkus = [], sofaSizes = [] }: {
  combos: ComboRow[]
  /** The sofa SKUs, for a new combo's compartments and module totals. */
  sofaSkus?: CatalogueSku[]
  /** The seat heights a new combo is priced at. */
  sofaSizes?: string[]
}) {
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
  const [adding, setAdding] = useState(false)
  const [addDirty, setAddDirty] = useState(false)
  /** Sets marked Remove in Edit prices (comboSetKey); Save takes them away. */
  const [removing, setRemoving] = useState<Set<string>>(new Set())
  const setOfCombo = useMemo(() => new Map(combos.map(k => [comboKey(k), comboSetKey(k)])), [combos])
  /** A price typed on a set marked Remove goes with it. */
  const priceDrafts = useMemo(
    () => new Map([...drafts].filter(([key]) => !removing.has(setOfCombo.get(key) ?? ''))),
    [drafts, removing, setOfCombo],
  )
  const changes = priceDrafts.size + removing.size
  // A set changed or removed is one change; a new combo half-typed is one more (the prototype's dirty()).
  useProductDraftGuard(changes + (adding && addDirty ? 1 : 0), saving)

  const models = useMemo(() => {
    const options = new Map<string, string>()
    for (const k of combos) options.set(k.baseModel, k.modelName && k.modelName !== k.baseModel
      ? `${k.baseModel} · ${k.modelName}` : k.baseModel)
    return [...options].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
  }, [combos])
  const hasAnyTier = combos.some(k => k.tier === null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return combos.filter(k => {
      if (model && k.baseModel !== model) return false
      if (tier !== 'all' && (k.tier ?? 'any') !== tier) return false
      return !q || [k.baseModel, k.modelName, k.label, comboSlotLabel(k.slots)]
        .some(v => (v ?? '').toLowerCase().includes(q))
    })
  }, [combos, model, query, tier])
  /** One row per set; its fabric tiers become column bands. */
  const sets = useMemo(() => comboSets(shown), [shown])
  const tierBands = useMemo(() => {
    const present = new Set(shown.map(k => k.tier))
    return [...TIERS, null].filter(t => present.has(t))
  }, [shown])
  const heights = useMemo(() => comboHeightColumns(shown).sort(compareHeights), [shown])
  const columns = useMemo(() => tierBands.flatMap(t => heights.map(h => ({ tier: t, height: h }))), [tierBands, heights])
  const rowsByModel = useMemo(() => {
    const byModel = new Map<string, typeof sets>()
    for (const set of sets) byModel.set(set.baseModel, [...(byModel.get(set.baseModel) ?? []), set])
    return [...byModel]
  }, [sets])

  /** The cell a sheet position edits, or null where the set is not sold at that tier/size. */
  function cellAt(row: number, column: number): { combo: ComboRow; height: string } | null {
    const set = sets[row]
    const col = columns[column]
    const combo = set && col ? set.byTier.get(col.tier) : undefined
    if (!combo) return null
    const height = comboHeightColumns([combo]).find(h => heightKey(h) === heightKey(col.height))
    return height === undefined ? null : { combo, height }
  }

  /** Excel paste: rows go down the sheet, tabs go across; shaded boxes and sets marked Remove are skipped. */
  function paste(e: ClipboardEvent<HTMLTableSectionElement>) {
    const target = e.target as HTMLElement
    const row = Number(target.dataset.row)
    const column = Number(target.dataset.column)
    if (!editing || saving || Number.isNaN(row) || Number.isNaN(column)) return
    const grid = parsePastedGrid(e.clipboardData.getData('text'))
    if (!grid) return
    e.preventDefault()
    grid.forEach((values, r) => values.forEach((value, k) => {
      const cell = cellAt(row + r, column + k)
      if (cell && !removing.has(comboSetKey(cell.combo))) touch(cell.combo, cell.height, value)
    }))
  }

  function touch(k: ComboRow, height: string, value: string) {
    const key = comboKey(k)
    const h = heightKey(height)!
    setDrafts(previous => {
      const next = new Map(previous)
      const cells = { ...next.get(key) }
      const current = comboPriceAt(k, height)
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
    setRemoving(new Set())
    setEditing(false)
    setError(null)
  }

  function toggleRemove(key: string) {
    setRemoving(previous => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** Removals first (all or nothing, refused in words), then the prices typed on the sets that stay. */
  function save() {
    if (saveLock.current || changes === 0) return
    saveLock.current = true
    setError(null)
    setNotice(null)
    const refs = [...removing].flatMap(key => {
      const k = combos.find(row => comboSetKey(row) === key)
      return k ? [{ baseModel: k.baseModel, slotsKey: k.slotsKey }] : []
    })
    const prices = priceDrafts
    startSaving(async () => {
      let removed = 0
      try {
        if (refs.length > 0) {
          const result = await removeCombos(refs)
          if (!result.ok) {
            setError(result.reason)
            return
          }
          removed = result.removed
          setRemoving(new Set())
        }
        const saved = prices.size > 0 ? (await saveComboPrices(buildComboPriceEdits(combos, prices))).saved : 0
        setDrafts(new Map())
        setEditing(false)
        setNotice([
          removed > 0 ? `${plural(removed, 'combo')} removed.` : '',
          saved > 0 ? `${plural(saved, 'combo')} saved. New sales lines use these prices.` : `New sales lines no longer use ${removed === 1 ? 'it' : 'them'}.`,
          'To update an existing month, recost its orders in Comm Cal.',
        ].filter(Boolean).join(' '))
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the combo prices')
        // The sets already removed are gone; the sheet must stop showing them.
        if (removed > 0) router.refresh()
      } finally {
        saveLock.current = false
      }
    })
  }

  const tierOptions: Array<readonly [string, string]> = [['all', 'All'], ...TIERS.map(t => [t, tierLabel(t)] as const), ...(hasAnyTier ? [['any', 'Any'] as const] : [])]
  const modelLabel = (code: string) => models.find(([k]) => k === code)?.[1] ?? code
  const span = 2 + columns.length + (editing ? 1 : 0)
  const saveLabel = changes === 0 ? 'Save changes' : removing.size > 0 ? `Save ${plural(changes, 'change')}` : `Save ${plural(changes, 'combo')}`

  return (
    <>
      <FilterPanel>
        <Controls ruled={false}>
          <SearchField value={query} disabled={saving} onChange={setQuery} placeholder="Search combo or module…" label="Search combos" />
          <SelectField label="Model" value={model} disabled={saving} onChange={setModel} options={[['', 'All models'], ...models]} />
          <TierControl value={tier} disabled={saving} onChange={setTier} options={tierOptions} />
        </Controls>
      </FilterPanel>

      <ActionRow count={sets.length.toLocaleString()} rest={`set${sets.length === 1 ? '' : 's'}${model ? ` · Model ${model}` : ''} · price per set (RM)`}>
        {!editing ? <button type="button" className={c.secondary} onClick={() => { setAdding(true); setNotice(null) }}>+ Add combo</button> : null}
        {editing ? (
          <EditingButtons onCancel={cancel} onSave={save} changes={changes} saving={saving} saveLabel={saveLabel} />
        ) : (
          <EditButton label="Edit prices" disabled={combos.length === 0} onClick={() => { setEditing(true); setNotice(null) }} />
        )}
      </ActionRow>
      {editing ? (
        <Note>
          Blank clears a price. Zero is stored; only a positive combo price replaces module prices. In edit mode you can paste a block copied from Excel.
          {removing.size > 0 ? ` ${plural(removing.size, 'set')} marked Remove; Save takes ${removing.size === 1 ? 'it' : 'them'} away with ${removing.size === 1 ? 'its' : 'their'} prices.` : ''}
        </Note>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}

      <div className={c.tableCard}>
        <div className={c.tableScroll} data-window="" tabIndex={0} role="region" aria-label="Combo prices table">
          <table className={c.table} data-banded="">
            <thead>
              <tr>
                <th scope="colgroup" colSpan={2} className={c.band} data-first="">{' '}</th>
                {tierBands.map(t => (
                  <th scope="colgroup" key={t ?? 'any'} colSpan={heights.length} className={c.band}>{t ? `FABRIC ${tierLabel(t)}` : 'ANY FABRIC'}</th>
                ))}
                {editing ? <th scope="col" className={c.band} data-last="">{' '}</th> : null}
              </tr>
              <tr>
                <th scope="col" className={c.th} data-first="" style={{ minWidth: 160 }}>SET</th>
                <th scope="col" className={c.th} style={{ minWidth: 280 }}>WHAT IS IN IT</th>
                {columns.map((col, i) => (
                  <th scope="col" key={`${col.tier}-${col.height}`} className={c.th} data-num="" data-band-start={i % heights.length === 0 || undefined} style={{ minWidth: 104 }}>
                    {col.height}
                  </th>
                ))}
                {editing ? <th scope="col" className={c.th} data-num="" data-last="" style={{ minWidth: 110 }} aria-label="Remove a set">{NBSP}</th> : null}
              </tr>
            </thead>
            <tbody onPaste={paste}>
              {sets.length === 0 ? <tr><td colSpan={span} className={c.empty}>No combos match these filters.</td></tr> : rowsByModel.map(([baseModel, modelSets]) => (
                <Fragment key={baseModel}>
                  <tr className={c.row} data-group="">
                    <td className={c.td} data-first="">Model {modelLabel(baseModel)}</td>
                    <td className={`${c.td} ${c.muted}`} colSpan={span - 1}>{plural(modelSets.length, 'set')}</td>
                  </tr>
                  {modelSets.map((set, i) => {
                    const row = sets.indexOf(set)
                    const name = set.label ?? 'Unnamed combo'
                    const removed = removing.has(set.key)
                    return (
                      <tr key={set.key} className={c.row} data-stripe={i % 2 === 1 || undefined} data-removing={removed || undefined}>
                        <th scope="row" className={c.td} data-first="">
                          {name}{removed ? <CellChip tone="removing">REMOVING</CellChip> : set.isNew ? <CellChip>NEW</CellChip> : null}
                          <div className={c.sub}>{plural(set.slots.length, 'piece')}</div>
                        </th>
                        <td className={`${c.td} ${c.wrap}`}>
                          <div className={c.tiles} aria-label={`${plural(set.slots.length, 'module')} in one set`} title={comboSlotLabel(set.slots)}>
                            {slotGroups(set.slots).map((g, k) => (
                              <Fragment key={k}>
                                {k > 0 ? <span className={c.tilePlus} aria-hidden="true">+</span> : null}
                                <span className={c.tile}>
                                  {g.code}
                                  {g.alternatives ? <span className={c.tileAlt}>{g.alternatives}</span> : null}
                                  {g.count > 1 ? <span className={c.tileCount}>×{g.count}</span> : null}
                                </span>
                              </Fragment>
                            ))}
                            {set.slots.length === 0 ? 'No modules defined' : null}
                          </div>
                        </td>
                        {columns.map((col, column) => {
                          const cell = cellAt(row, column)
                          const bandStart = column % heights.length === 0 || undefined
                          if (!cell) return <td key={column} className={c.td} data-off="" data-band-start={bandStart} title="This set is not sold at this fabric and seat size" />
                          const key = comboKey(cell.combo)
                          const current = comboPriceAt(cell.combo, cell.height)
                          const draft = drafts.get(key)?.[heightKey(cell.height)!]
                          const historical = !cell.combo.heights.some(h => heightKey(h) === heightKey(cell.height))
                          return (
                            <td key={column} className={`${c.td} ${editing && !removed ? c.inputCell : ''}`} data-num="" data-band-start={bandStart}
                              title={historical ? 'Priced at a seat size this set no longer lists' : undefined}>
                              {editing && !removed ? (
                                <CellInput value={draft?.value ?? (current === null ? '' : String(current))} onChange={v => touch(cell.combo, cell.height, v)}
                                  edited={!!draft} width={92} disabled={saving} rowCol={{ row, column }}
                                  label={`${set.baseModel} ${name} ${cell.combo.tier ?? 'any tier'} at ${cell.height}`} />
                              ) : <span className={current === null ? c.faint : c.strong}>{money(current)}</span>}
                            </td>
                          )
                        })}
                        {editing ? (
                          <td className={c.td} data-num="" data-last="">
                            <button type="button" className={c.cellLink} data-tone={removed ? undefined : 'danger'} disabled={saving}
                              aria-label={`${removed ? 'Keep' : 'Remove'} ${set.baseModel} ${name}`} onClick={() => toggleRemove(set.key)}>
                              {removed ? 'Keep' : 'Remove'}
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <TableFoot
          shown={`${plural(sets.length, 'set')} · ${shown.length.toLocaleString()} of ${combos.length.toLocaleString()} combos shown`}
          note="Shaded boxes are sizes the set is not sold at."
        />
      </div>

      <AddComboWindow
        open={adding}
        initialModel={model}
        sofaSkus={sofaSkus}
        heights={sofaSizes.filter(h => heightKey(h) !== 'default')}
        combos={combos}
        onClose={() => setAdding(false)}
        onDirtyChange={setAddDirty}
        onAdded={({ model: added, label, filled }) => {
          setAdding(false)
          setModel(added)
          setTier('all')
          setQuery('')
          setNotice(`${label} added to Model ${added} with ${plural(filled, 'price')}. New sales lines with these compartments use it.`)
          router.refresh()
        }}
      />
    </>
  )
}
