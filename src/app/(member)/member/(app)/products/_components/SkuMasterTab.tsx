'use client'

import { useMemo, useReducer, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { compareHeights, heightKey } from '@/lib/catalogue/keys'
import { TIERS, type PriceCell } from '@/lib/catalogue/pricing'
import { saveSkuPrices } from '../actions'
import type { CatalogueSku } from '../load'
import { useProductDraftGuard } from './ProductWorkspace'
import ColumnTable, { type TableColumn } from './ColumnTable'
import {
  ActionRow, categoryLabel, CellChip, CellInput, Chip, ChipRow, Controls, EditButton, EditingButtons, FilterPanel,
  money, Note, Notice, orderedCategories, plural, SearchField, SelectField, TableFoot, tierLabel, TierControl,
} from './ui'
import c from './products.module.css'

// Forty rows, then Show more (the prototype's `sLimit`).
const LIMIT_STEP = 40
// The categories whose models gather several SKUs — a model filter there, as
// on the ERP's own SKU Master (user 2026-09-27: not sofas alone). Every
// accessory, bedline, service… is a model of its own, so a filter would only
// repeat the search; it stays off there, as it does under All.
const MODEL_FILTER_CATEGORIES = new Set(['SOFA', 'MATTRESS', 'BEDFRAME'])
type CellDraft = { height: string; tier: string; price: string }
type Draft = { price?: string; cells?: Record<string, CellDraft> }

function cellKey(height: string, tier: string): string {
  return `${heightKey(height)}|${tier}`
}

function cellPrice(grid: PriceCell[] | null, height: string, tier: string): number | null {
  const k = heightKey(height)
  return grid?.find(cell => heightKey(cell.height) === k && cell.tier === tier)?.price ?? null
}

function modelKey(sku: CatalogueSku): string {
  return sku.modelId ?? sku.modelCode ?? ''
}

/** The ERP's SKU rows and matrix shape, with prices owned by the portal. */
export default function SkuMasterTab({ skus, sofaSizes, initialQuery = '', columnLayouts = {} }: {
  skus: CatalogueSku[]
  sofaSizes: string[]
  initialQuery?: string
  /** The reader's column layouts from the request (`layoutsFromCookies`). */
  columnLayouts?: Record<string, string>
}) {
  const router = useRouter()
  const [category, setCategory] = useState<string | null>(null)
  const [query, setQuery] = useState(initialQuery)
  const [model, setModel] = useState('')
  const [showGone, setShowGone] = useState(false)
  const [limit, setLimit] = useState(LIMIT_STEP)
  const [editing, setEditing] = useState(false)
  const [tier, setTier] = useState<string>('PRICE_2')
  const drafts = useRef<Map<string, Draft>>(new Map())
  const [dirty, setDirty] = useState(0)
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const sofaView = category === 'SOFA'
  useProductDraftGuard(dirty, saving)

  const live = useMemo(() => skus.filter(s => showGone || !s.removed), [skus, showGone])
  const categories = useMemo(() => orderedCategories(live.map(s => s.category)), [live])
  const models = useMemo(() => {
    if (category === null || !MODEL_FILTER_CATEGORIES.has(category)) return []
    const options = new Map<string, string>()
    for (const s of live) {
      const key = modelKey(s)
      if ((s.category ?? '').toUpperCase() === category && key) options.set(key, s.modelCode ?? s.modelName ?? key)
    }
    return options.size < 2 ? [] : [...options].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }))
  }, [live, category])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return live.filter(s => {
      if (category !== null && (s.category ?? '').toUpperCase() !== category) return false
      if (model && modelKey(s) !== model) return false
      return !q || [s.code, s.description, s.modelCode, s.modelName, s.brand, s.optionLabel]
        .some(v => (v ?? '').toLowerCase().includes(q))
    })
  }, [live, category, query, model])

  // Keep visible sizes in ERP order, followed by historical priced sizes.
  // DEFAULT stays in saved grids but is not an editable size column here.
  const heights = useMemo(() => {
    if (!sofaView) return []
    const cols = sofaSizes.filter(h => heightKey(h) !== 'default')
    const have = new Set(cols.map(h => heightKey(h)))
    const extra = new Map<string, string>()
    for (const s of shown) {
      for (const cell of s.grid ?? []) {
        const k = heightKey(cell.height)
        if (k !== null && k !== 'default' && !have.has(k) && !extra.has(k)) extra.set(k, cell.height)
      }
    }
    return [...cols, ...[...extra.values()].sort(compareHeights)]
  }, [sofaView, sofaSizes, shown])

  function changeCategory(next: string | null) {
    setCategory(next)
    setModel('')
    setLimit(LIMIT_STEP)
  }

  function touch(erpId: string, update: (d: Draft) => void) {
    const d = drafts.current.get(erpId) ?? {}
    update(d)
    drafts.current.set(erpId, d)
    setDirty(drafts.current.size)
    // The boxes read the drafts: draw again on every key, not only when the count moves.
    bump()
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
      const merged = new Map<string, { height: string; tier: string; price: string | null }>()
      for (const cell of s.grid ?? []) merged.set(cellKey(cell.height, cell.tier), { ...cell, price: String(cell.price) })
      for (const [key, cell] of Object.entries(d.cells ?? {})) {
        // Raw labels travel with the draft, independently of the visible filters.
        // Existing cells also retain their original saved spelling.
        merged.set(key, { ...cell, height: merged.get(key)?.height ?? cell.height })
      }
      return { erpId, price, grid: merged.size ? [...merged.values()] : null }
    })
    setError(null)
    setNotice(null)
    startSaving(async () => {
      try {
        const r = await saveSkuPrices(edits)
        drafts.current = new Map()
        setDirty(0)
        setEditing(false)
        setNotice(`${plural(r.saved, 'SKU')} saved. New sales lines use these prices. To update an existing month, recost its orders in Comm Cal.`)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the prices')
      }
    })
  }

  const visible = shown.slice(0, limit)
  const modelLabel = models.find(([key]) => key === model)?.[1]

  function edited(erpId: string, key?: string): boolean {
    const d = drafts.current.get(erpId)
    return key ? d?.cells?.[key] !== undefined : d?.price !== undefined
  }

  function sizePrice(s: CatalogueSku, h: string) {
    const current = cellPrice(s.grid, h, tier)
    const key = cellKey(h, tier)
    return editing ? (
      <CellInput
        key={`${s.erpId}|${h}|${tier}`}
        value={drafts.current.get(s.erpId)?.cells?.[key]?.price ?? (current === null ? '' : String(current))}
        onChange={value => touch(s.erpId, d => {
          d.cells = { ...(d.cells ?? {}), [key]: { height: h, tier, price: value } }
        })}
        edited={edited(s.erpId, key)}
        disabled={saving} label={`${s.code} at ${h} ${tier}`}
      />
    ) : <span className={current === null ? c.faint : c.strong}>{money(current)}</span>
  }

  function flatPrice(s: CatalogueSku) {
    const isGrid = !!(s.grid && s.grid.length > 0)
    if (isGrid && (s.category ?? '').toUpperCase() === 'SOFA') {
      return <button type="button" className={c.cellLink} disabled={saving} onClick={() => { changeCategory('SOFA'); setModel(modelKey(s)) }}>View prices</button>
    }
    if (editing && !isGrid) {
      return (
        <CellInput
          key={`${s.erpId}|flat`}
          value={drafts.current.get(s.erpId)?.price ?? (s.price === null ? '' : String(s.price))}
          onChange={value => touch(s.erpId, d => { d.price = value })}
          edited={edited(s.erpId)}
          disabled={saving} label={`${s.code} price`}
        />
      )
    }
    if (s.price === null && isGrid) return <span className={c.muted} title="A saved price matrix belongs to this SKU">Matrix price</span>
    return <span className={s.price === null ? c.faint : c.strong}>{money(s.price)}</span>
  }

  // The table's own order. The reader may move and resize the columns
  // (ColumnTable); a sofa's seat sizes stay behind the rest, in the ERP's order.
  const columns: TableColumn<CatalogueSku>[] = [
    { key: 'code', label: 'PRODUCT CODE', defaultWidth: 170, cell: s => <>{s.code}{s.isNew ? <CellChip>NEW</CellChip> : null}</> },
    { key: 'description', label: 'DESCRIPTION', className: c.strong, defaultWidth: 260, cell: s => s.description ?? '—' },
    {
      key: 'model', label: 'MODEL', defaultWidth: 120,
      cell: s => <>
        {s.modelCode ?? '—'}
        {s.modelName && s.modelName !== s.modelCode ? <div className={c.sub}>{s.modelName}</div> : null}
      </>,
    },
  ]
  if (sofaView) {
    columns.push(
      { key: 'category', label: 'CATEGORY', defaultWidth: 90, cell: s => categoryLabel(s.category) },
      { key: 'tier', label: 'TIER', defaultWidth: 70, cell: () => tierLabel(tier) },
      ...heights.map((h): TableColumn<CatalogueSku> => ({
        key: `size:${heightKey(h) ?? h}`, label: `SEAT ${h}`, movable: false, num: true, defaultWidth: 120,
        className: editing ? c.inputCell : undefined, cell: s => sizePrice(s, h),
      })),
    )
  } else {
    columns.push(
      { key: 'size', label: 'SIZE', defaultWidth: 130, cell: s => (s.optionLabel !== s.code ? s.optionLabel : categoryLabel(s.category)) },
      { key: 'brand', label: 'BRAND', defaultWidth: 110, cell: s => s.brand ?? <span className={c.muted} title="Rides any cart; the mattress or sofa decides the ladder">rider</span> },
      { key: 'price', label: 'PRICE (RM)', num: true, defaultWidth: 130, className: editing ? c.inputCell : undefined, cell: flatPrice },
    )
  }

  const tierText = sofaView ? ` · ${tierLabel(tier)}` : ''
  return (
    <>
      <FilterPanel>
        <ChipRow ariaLabel="Product category">
          <Chip on={category === null} disabled={saving} onClick={() => changeCategory(null)}>All</Chip>
          {categories.map(k => (
            <Chip key={k} on={category === k} disabled={saving} onClick={() => changeCategory(k)}>{categoryLabel(k)}</Chip>
          ))}
        </ChipRow>
        <Controls ruled>
          <SearchField value={query} disabled={saving} onChange={v => { setQuery(v); setLimit(LIMIT_STEP) }}
            placeholder="Search product code or description…" label="Search the SKU master" />
          {models.length > 0 ? (
            <SelectField label="Model" value={model} disabled={saving} onChange={v => { setModel(v); setLimit(LIMIT_STEP) }}
              options={[['', 'All models'], ...models]} />
          ) : null}
          {sofaView ? (
            <TierControl value={tier} disabled={saving} onChange={setTier} options={TIERS.map(t => [t, tierLabel(t)] as const)} />
          ) : null}
        </Controls>
      </FilterPanel>

      <ActionRow count={shown.length.toLocaleString()} rest={`SKU${shown.length === 1 ? '' : 's'}${modelLabel ? ` · Model ${modelLabel}` : ''}${tierText}`}>
        {editing ? (
          <EditingButtons onCancel={cancel} onSave={save} changes={dirty} saving={saving}
            saveLabel={dirty === 0 ? 'Save changes' : `Save ${plural(dirty, 'SKU')}`} />
        ) : (
          <EditButton label="Edit prices" onClick={() => { setEditing(true); setNotice(null) }} />
        )}
      </ActionRow>
      {editing ? <Note>Blank clears a price; 0 is a zero price. Changes across models and tiers are saved together.</Note> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}

      <ColumnTable
        id={sofaView ? 'sku-master-sofa' : 'sku-master'}
        initialLayout={columnLayouts[sofaView ? 'sku-master-sofa' : 'sku-master']}
        label="SKU prices table"
        columns={columns}
        rows={visible}
        rowKey={s => s.erpId}
        empty="No SKUs match these filters."
        footer={reset => (
          <TableFoot
            shown={`${visible.length.toLocaleString()} of ${shown.length.toLocaleString()} SKUs shown`}
            more={shown.length > visible.length ? `Show ${Math.min(LIMIT_STEP, shown.length - visible.length)} more` : undefined}
            onMore={() => setLimit(l => l + LIMIT_STEP)}
            note={sofaView ? 'Seat sizes follow the ERP order. Switch tier to price P1, P2 and P3.' : 'Rider: no ladder of its own; the mattress or sofa in the cart decides.'}
          >
            {skus.some(s => s.removed) ? (
              <select className={c.footSelect} aria-label="Catalogue" value={showGone ? 'all' : 'current'} disabled={saving}
                onChange={e => { setShowGone(e.target.value === 'all'); setModel(''); setLimit(LIMIT_STEP) }}>
                <option value="current">Current SKUs</option>
                <option value="all">Include removed SKUs</option>
              </select>
            ) : null}
            {reset}
          </TableFoot>
        )}
      />
    </>
  )
}
