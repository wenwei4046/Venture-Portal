'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { revenuePath } from '@/lib/revenue'
import { valueKey } from '@/lib/catalogue/keys'
import { parseMoney } from '@/lib/catalogue/edits'
import { kpiAddKey, validateKpiItems, type KpiItemsEdit } from '@/lib/catalogue/rule-edits'
import { kpiItemKind, type KpiOptionPool } from '@/lib/commission/kpi'
import { saveKpiItems } from '../actions'
import type { KpiItemSetting, MaintenanceOption, PickSku } from '../load'
import PageScrolledTable from './PageScrolledTable'
import SubDepartmentChips, { type SubRef } from './SubDepartmentChips'
import { useProductDraftGuard } from './ProductWorkspace'
import {
  ActionRow, categoryLabel, CellChip, CellInput, EditButton, EditingButtons, FilterPanel, Heading, MirrorFlags, money,
  Notice, plural, SearchIcon, TableFoot,
} from './ui'
import c from './products.module.css'

const PICK_LIMIT = 20

type PickSource = 'sku' | KpiOptionPool

const SOURCES: Array<{ key: PickSource; label: string }> = [
  { key: 'sku', label: 'SKU Master' },
  { key: 'bedframe_specials', label: 'Bed frame specials' },
  { key: 'sofa_specials', label: 'Sofa specials' },
]

type Added =
  | { key: string; source: 'sku'; erpId: string; code: string; name: string | null }
  | { key: string; source: 'option'; pool: KpiOptionPool; value: string; name: string | null }

type Line = { key: string; saved: KpiItemSetting; added?: undefined } | { key: string; saved?: undefined; added: Added }

const optionKey = (pool: string | null, value: string | null) => `${pool}:${valueKey(value) ?? ''}`

function amountDiffers(text: string, saved: number): boolean {
  try {
    return parseMoney(text, 'KPI amount', true) !== saved
  } catch {
    return true
  }
}

/**
 * Product List › Add-on / KPI Items (user 2026-09-27): a SKU from the SKU
 * Master, or a special from Maintenance — a bed frame's *HB Straight* is not a
 * product, it rides on the bed frame's line — with the amount it is worth.
 * When a bill carries one, that amount comes off the bill's sales and is paid
 * flat as KPI (`lib/commission/kpi.ts`); the switch and the monthly quantity
 * bonus stay on Rules.
 */
export default function KpiItemsTab({
  sub,
  subs,
  schemeId,
  enableKpi,
  items,
  skus,
  specials,
}: {
  sub: SubRef
  subs: SubRef[]
  schemeId: string
  enableKpi: boolean
  items: KpiItemSetting[]
  skus: PickSku[]
  /** The Bedframe and Sofa Maintenance specials pools. */
  specials: MaintenanceOption[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [amounts, setAmounts] = useState<ReadonlyMap<string, string>>(new Map())
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set())
  const [added, setAdded] = useState<Added[]>([])
  const [source, setSource] = useState<PickSource>('bedframe_specials')
  const [query, setQuery] = useState('')
  const [pickAmount, setPickAmount] = useState('')
  const [pending, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reset = useCallback(() => {
    setAmounts(new Map())
    setRemoving(new Set())
    setAdded([])
    setQuery('')
    setPickAmount('')
  }, [])

  // A save leaves its drafts on screen, read-only, until the refreshed items
  // arrive (as Costing Setting does): clearing them at once showed the list
  // from before the save for a moment. Settled when the server's items
  // change — or, should the refresh never land, a little later.
  const [settling, setSettling] = useState(false)
  const settleFrom = useRef<KpiItemSetting[] | null>(null)
  const settle = useCallback(() => {
    settleFrom.current = null
    setSettling(false)
    setEditing(false)
    reset()
  }, [reset])
  useEffect(() => {
    if (settling && settleFrom.current && settleFrom.current !== items) settle()
  }, [settling, items, settle])
  useEffect(() => {
    if (!settling) return
    const timer = window.setTimeout(settle, 15_000)
    return () => window.clearTimeout(timer)
  }, [settling, settle])
  const saving = pending || settling

  const skuById = useMemo(() => new Map(skus.map(s => [s.erpId, s])), [skus])
  const specialByKey = useMemo(() => new Map(specials.map(o => [optionKey(o.pool, o.value), o])), [specials])

  const lines = useMemo<Line[]>(
    () => [
      ...added.map(a => ({ key: a.key, added: a })),
      ...[...items]
        .sort((a, b) => kindOrder(a) - kindOrder(b) || labelOf(a).localeCompare(labelOf(b)))
        .map(saved => ({ key: saved.id, saved })),
    ],
    [added, items],
  )

  // What is already an item — the picker offers it no second time.
  const taken = useMemo(() => {
    const keys = new Set<string>()
    for (const i of items) {
      if (removing.has(i.id)) continue
      if (i.source === 'sku') {
        if (i.erpId) keys.add(`sku:${i.erpId}`)
        if (i.code) keys.add(`code:${i.code.trim().toUpperCase()}`)
      } else {
        keys.add(`option:${optionKey(i.optionPool, i.optionValue)}`)
      }
    }
    for (const a of added) {
      if (a.source === 'sku') {
        keys.add(`sku:${a.erpId}`)
        keys.add(`code:${a.code.trim().toUpperCase()}`)
      } else {
        keys.add(`option:${optionKey(a.pool, a.value)}`)
      }
    }
    return keys
  }, [items, added, removing])

  const changed = editing ? items.filter(i => !removing.has(i.id) && amounts.has(i.id) && amountDiffers(amounts.get(i.id)!, i.amount)) : []
  const dirty = editing ? added.length + removing.size + changed.length : 0
  useProductDraftGuard(dirty, saving)

  const q = query.trim().toLowerCase()
  const skuMatches = useMemo(
    () =>
      source === 'sku' && q
        ? skus.filter(
            s =>
              !s.removed &&
              [s.code, s.description, s.model, s.category ? categoryLabel(s.category) : null].some(v =>
                (v ?? '').toLowerCase().includes(q),
              ),
          )
        : [],
    [skus, source, q],
  )
  const specialMatches = useMemo(
    () =>
      source === 'sku'
        ? []
        : specials
            .filter(o => o.pool === source && !o.removed)
            .filter(o => !q || o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q))
            .sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value)),
    [specials, source, q],
  )

  function cancel() {
    if (saving) return
    reset()
    setEditing(false)
    setError(null)
  }

  function setAmount(key: string, text: string) {
    setAmounts(previous => new Map(previous).set(key, text))
    setNotice(null)
  }

  function add(item: Added) {
    setAdded(previous => [item, ...previous])
    setAmounts(previous => new Map(previous).set(item.key, pickAmount.trim()))
    setError(null)
    setNotice(null)
  }

  function takeOff(key: string) {
    setAdded(previous => previous.filter(a => a.key !== key))
    setAmounts(previous => {
      const next = new Map(previous)
      next.delete(key)
      return next
    })
  }

  function toggleRemove(id: string) {
    setRemoving(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setNotice(null)
  }

  function save() {
    if (saving || dirty === 0) return
    const edit: KpiItemsEdit = {
      adds: added.map(a =>
        a.source === 'sku'
          ? { source: 'sku', erpId: a.erpId, amount: amounts.get(a.key) ?? '', label: a.code }
          : { source: 'option', optionPool: a.pool, optionValue: a.value, amount: amounts.get(a.key) ?? '', label: a.value },
      ),
      changes: changed.map(i => ({ id: i.id, amount: amounts.get(i.id) ?? '', label: labelOf(i) })),
      removes: [...removing],
    }
    try {
      validateKpiItems(edit)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the KPI amounts.')
      return
    }
    setError(null)
    setNotice(null)
    const before = items
    startSaving(async () => {
      try {
        await saveKpiItems(schemeId, edit)
        settleFrom.current = before
        setSettling(true)
        setNotice(
          enableKpi
            ? 'Saved. New bills carrying these items pay their amount flat as KPI.'
            : `Saved. KPI item allowance is off for ${sub.name}, so no run pays them until it is switched on.`,
        )
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the KPI items.')
      }
    })
  }

  const results: Array<{ key: string; code: string; desc: string; listed: boolean; add: () => void }> = source === 'sku'
    ? skuMatches.slice(0, PICK_LIMIT).map(s => ({
        key: s.erpId, code: s.code, desc: s.description ?? '—',
        listed: taken.has(`sku:${s.erpId}`) || taken.has(`code:${s.code.trim().toUpperCase()}`),
        add: () => add({ key: kpiAddKey({ source: 'sku', erpId: s.erpId }), source: 'sku', erpId: s.erpId, code: s.code, name: s.description }),
      }))
    : specialMatches.slice(0, PICK_LIMIT).map(o => ({
        key: o.value, code: o.value, desc: o.label !== o.value ? o.label : '',
        listed: taken.has(`option:${optionKey(o.pool, o.value)}`),
        add: () => add({ key: kpiAddKey({ source: 'option', optionPool: o.pool, optionValue: o.value }), source: 'option', pool: o.pool as KpiOptionPool, value: o.value, name: o.label !== o.value ? o.label : null }),
      }))
  const total = source === 'sku' ? skuMatches.length : specialMatches.length
  const msg = source === 'sku' && !q ? 'Type to find SKUs. Nothing shows until you search.'
    : total === 0 ? 'Nothing matches.'
    : total > PICK_LIMIT ? `Showing ${PICK_LIMIT} of ${total.toLocaleString()}. Narrow the search to see the rest.`
    : null

  return (
    <>
      <FilterPanel>
        <SubDepartmentChips subs={subs} active={sub.slug} tab="kpi" />
      </FilterPanel>

      <div className={c.fig} data-tone={enableKpi ? 'on' : 'off'}>
        <div className={c.figText}>
          <span className={c.figEye}>{sub.name.toUpperCase()} · KPI</span>
          <div className={c.figLine}>
            <span className={c.figBig}>{enableKpi ? 'On' : 'Off'}</span>
            <span className={c.figAfter}>{enableKpi ? 'KPI items are paid flat' : 'KPI items are not paid'}</span>
          </div>
          <span className={c.figSub}>
            {enableKpi
              ? 'When a bill carries an item below, its amount comes off the bill’s sales and is paid flat as KPI. The monthly quantity bonus stays on Rules.'
              : 'The list is kept, but no amount comes off a bill or is paid until KPI is switched on in Rules.'}
          </span>
        </div>
        <div className={c.figSide}>
          <a className={c.figLink} href={`${revenuePath(sub.slug, 'rules')}?tab=scheme`}>Set on Rules →</a>
        </div>
      </div>

      <Heading title="Add-on / KPI items" sub={plural(items.length, 'item')} />
      <ActionRow>
        {editing ? (
          <EditingButtons cancelLabel="Cancel changes" onCancel={cancel} onSave={save} changes={dirty} saving={saving} pending={pending}
            saveLabel={pending ? 'Saving…' : settling ? 'Saved' : dirty === 0 ? 'Save changes' : `Save ${plural(dirty, 'change')}`} />
        ) : (
          <EditButton label="Edit items" onClick={() => { setEditing(true); setNotice(null) }} />
        )}
      </ActionRow>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}

      {editing ? (
        <div className={c.picker} role="group" aria-label="Add KPI items">
          <div className={c.pickerHead}>
            <span className={c.pickerTitle}>ADD AN ITEM</span>
            <div className={c.pickerSeg} role="group" aria-label="Add from">
              {SOURCES.map(s => (
                <button key={s.key} type="button" className={c.pickerSegButton} aria-pressed={source === s.key} disabled={saving}
                  onClick={() => { setSource(s.key); setQuery('') }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className={c.pickerControls}>
            <label className={c.pickerSearch}>
              <SearchIcon />
              <input type="search" className={c.searchInput} value={query} disabled={saving} onChange={e => setQuery(e.target.value)}
                placeholder={source === 'sku' ? 'Search SKU code or description…' : 'Filter specials…'}
                aria-label={source === 'sku' ? 'Find a SKU' : 'Filter the specials'} />
            </label>
            <label className={c.pickerAmount}>
              <span className={c.selectLabel}>Amount RM</span>
              <input className={c.pickerAmountInput} value={pickAmount} onChange={e => setPickAmount(e.target.value)} disabled={saving}
                inputMode="decimal" placeholder="0.00" aria-label="KPI amount for the next item added" />
            </label>
          </div>
          {msg ? <p className={c.pickerMsg}>{msg}</p> : null}
          {results.length > 0 ? (
            <ul className={c.results}>
              {results.map(r => (
                <li key={r.key} className={c.result}>
                  <span className={c.resultCode}>{r.code}</span>
                  <span className={c.resultDesc}>{r.desc}</span>
                  {r.listed ? <span className={c.pill}>On the list</span> : (
                    <button type="button" className={c.resultAdd} disabled={saving} aria-label={`Add ${r.code}`} onClick={r.add}>Add</button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className={c.tableCard} data-page="">
        <PageScrolledTable label="KPI items">
          <table className={c.table}>
            <thead>
              <tr>
                <th scope="col" className={c.th} data-first="" style={{ minWidth: 170 }}>ITEM</th>
                <th scope="col" className={c.th} style={{ minWidth: 230 }}>NAME</th>
                <th scope="col" className={c.th} style={{ minWidth: 140 }}>KIND</th>
                <th scope="col" className={c.th} style={{ minWidth: 150 }}>COUNTED</th>
                <th scope="col" className={c.th} data-num="" style={{ minWidth: 150 }}>KPI AMOUNT (RM)</th>
                {editing ? <th scope="col" className={c.th} data-num="" style={{ minWidth: 100 }}><span className="sr-only">Remove</span>{' '}</th> : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const saved = line.saved
                const src = saved ? saved.source : line.added.source
                const pool = saved ? saved.optionPool : line.added.source === 'option' ? line.added.pool : null
                const { kind, counted } = kpiItemKind({ source: src, optionPool: pool })
                const going = saved ? removing.has(saved.id) : false
                const title = saved ? labelOf(saved) : line.added.source === 'sku' ? line.added.code : line.added.value
                const special = saved?.source === 'option' ? specialByKey.get(optionKey(saved.optionPool, saved.optionValue)) : undefined
                const name = saved
                  ? saved.source === 'sku' ? saved.name : special && special.label !== special.value ? special.label : null
                  : line.added.name
                const mirror = saved ? (saved.source === 'sku' ? (saved.erpId ? skuById.get(saved.erpId) : undefined) : special) : undefined
                const text = amounts.get(line.key)
                return (
                  <tr key={line.key} className={c.row} data-stripe={(!line.added && i % 2 === 1) || undefined} data-new={line.added ? '' : undefined} data-removing={going || undefined}>
                    <td className={c.td} data-first="">
                      {title}
                      {line.added ? <CellChip tone="new">NEW</CellChip> : going ? <CellChip tone="removing">REMOVING</CellChip> : null}
                      {mirror ? <MirrorFlags isNew={false} active={mirror.active} removed={mirror.removed} /> : null}
                    </td>
                    <td className={`${c.td} ${c.wrap} ${going ? c.struck : ''}`}>{name ?? '—'}</td>
                    <td className={c.td}>{kind}</td>
                    <td className={`${c.td} ${c.muted}`}>{counted}</td>
                    <td className={`${c.td} ${editing && !going ? c.inputCell : c.bold}`} data-num="">
                      {editing && !going ? (
                        <CellInput value={text ?? (saved ? String(saved.amount) : '')} onChange={v => setAmount(line.key, v)}
                          edited={text !== undefined && (!saved || amountDiffers(text, saved.amount))} width={96} disabled={saving}
                          placeholder="0.00" label={`${title} KPI amount`} />
                      ) : saved ? money(saved.amount) : '—'}
                    </td>
                    {editing ? (
                      <td className={c.td} data-num="">
                        {line.added ? (
                          <button type="button" className={c.cellLink} data-tone="danger" disabled={saving} onClick={() => takeOff(line.key)}>Take off</button>
                        ) : (
                          <button type="button" className={c.cellLink} data-tone={going ? undefined : 'danger'} disabled={saving} onClick={() => toggleRemove(line.key)}>
                            {going ? 'Keep' : 'Remove'}
                          </button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                )
              })}
              {lines.length === 0 ? (
                <tr><td colSpan={editing ? 6 : 5} className={c.empty}>{sub.name} has no KPI items yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </PageScrolledTable>
        <TableFoot shown={plural(lines.length, 'item')} note="A special rides on its bed frame or sofa line; it is not a product of its own." />
      </div>
    </>
  )
}

function labelOf(item: KpiItemSetting): string {
  return (item.source === 'sku' ? item.code : item.optionValue) ?? '—'
}

function kindOrder(item: KpiItemSetting): number {
  return item.source === 'sku' ? 2 : item.optionPool === 'bedframe_specials' ? 0 : 1
}
