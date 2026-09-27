'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate, formatMoneyBare } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import { valueKey } from '@/lib/catalogue/keys'
import { parseMoney } from '@/lib/catalogue/edits'
import { kpiAddKey, validateKpiItems, type KpiItemsEdit } from '@/lib/catalogue/rule-edits'
import { kpiItemKind, type KpiOptionPool } from '@/lib/commission/kpi'
import { saveKpiItems } from '../../catalogue-actions'
import type { KpiItemSetting, MaintenanceOption, PickSku } from '../load'
import PageScrolledTable from './PageScrolledTable'
import SubDepartmentChips, { type SubRef } from './SubDepartmentChips'
import { useProductDraftGuard } from './ProductWorkspace'
import { categoryLabel, MirrorFlags } from './ui'

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
  useProductDraftGuard(dirty > 0, saving)

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
            ? "Saved. This month's run pays them when it is computed; a month already run keeps what it was run at."
            : `Saved. KPI item allowance is off for ${sub.name}, so no run pays them until it is switched on.`,
        )
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the KPI items.')
      }
    })
  }

  const columns = editing ? 6 : 5

  return (
    <section className="sku-master rule-setting" aria-label="Add-on / KPI Items">
      <div className="sku-filters">
        <SubDepartmentChips subs={subs} active={sub.slug} tab="kpi" dirty={dirty > 0} saving={saving} />
      </div>

      <div className="rule-card" data-tone={enableKpi ? 'on' : 'off'}>
        <div className="rule-card-figure">
          <span className="rule-card-label">{sub.name} · KPI item allowance</span>
          <strong className="rule-card-value">{enableKpi ? 'On' : 'Off'}</strong>
        </div>
        <p>
          {enableKpi ? 'The run pays every item below. ' : 'The run pays none of the items below until it is switched on. '}
          The switch, and the monthly quantity bonus paid on top, are on{' '}
          <Link href={`${revenuePath(sub.slug, 'rules')}?tab=scheme`}>Rules › Scheme rules</Link>.
        </p>
      </div>

      <div className="sku-actions">
        <div className="maintenance-pool-heading">
          <h2>KPI items</h2>
          <p className="sku-count" aria-live="polite">
            <strong>{items.length.toLocaleString()}</strong> item{items.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="sku-action-buttons">
          {editing ? (
            <>
              <button type="button" className="sku-secondary-button" disabled={saving} onClick={cancel}>
                Cancel changes
              </button>
              <button type="button" className="sku-primary-button" disabled={saving || dirty === 0} onClick={save}>
                {pending ? 'Saving…' : settling ? 'Saved' : dirty === 0 ? 'Save changes' : `Save ${dirty} change${dirty === 1 ? '' : 's'}`}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="sku-primary-button"
              onClick={() => {
                setEditing(true)
                setNotice(null)
              }}
            >
              Edit items
            </button>
          )}
        </div>
      </div>
      <p className="sku-edit-note">
        When a bill carries one of these, its amount comes off the bill&apos;s sales — the margin is judged on what is left —
        and is paid to the salesperson flat, as KPI. A SKU counts per unit, a bed frame special per bed frame, a sofa special
        once per bill. A bill whose sales do not cover its items (a RM 0 exchange) pays none and keeps its sales.
        {editing ? " Changes apply from this month's run; a month already run keeps what it was run at." : ''}
      </p>
      {error ? <p className="sku-notice" data-tone="error" role="alert">{error}</p> : null}
      {notice ? <p className="sku-notice" data-tone="ok" role="status">{notice}</p> : null}

      {editing ? (
        <div className="rule-picker" role="group" aria-label="Add KPI items">
          <div className="rule-picker-head">
            <h3>Add an item</h3>
            <div className="rule-picker-sources" role="group" aria-label="Add from">
              {SOURCES.map(s => (
                <button
                  key={s.key}
                  type="button"
                  className="sku-chip"
                  aria-pressed={source === s.key}
                  disabled={saving}
                  onClick={() => {
                    setSource(s.key)
                    setQuery('')
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="rule-picker-controls">
            <label className="sku-search">
              <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="5.5" />
                <path d="m13 13 4 4" />
              </svg>
              <input
                type="search"
                value={query}
                disabled={saving}
                onChange={e => setQuery(e.target.value)}
                placeholder={source === 'sku' ? 'Find a SKU by code, model or description…' : 'Filter the specials…'}
                aria-label={source === 'sku' ? 'Find a SKU' : 'Filter the specials'}
              />
            </label>
            <label className="rule-picker-field">
              <span>KPI amount (RM)</span>
              <input
                value={pickAmount}
                onChange={e => setPickAmount(e.target.value)}
                disabled={saving}
                inputMode="decimal"
                placeholder="200"
                aria-label="KPI amount for the next item added"
                className="sku-price-input"
              />
            </label>
          </div>
          {source === 'sku' ? (
            !q ? (
              <p className="rule-pick-empty">Type part of a SKU code, a model or a description.</p>
            ) : skuMatches.length === 0 ? (
              <p className="rule-pick-empty">No SKU matches &ldquo;{query.trim()}&rdquo;.</p>
            ) : (
              <ul className="rule-pick-list">
                {skuMatches.slice(0, PICK_LIMIT).map(s => {
                  const listed = taken.has(`sku:${s.erpId}`) || taken.has(`code:${s.code.trim().toUpperCase()}`)
                  return (
                    <li key={s.erpId} className="rule-pick-row" data-disabled={listed || undefined}>
                      <span className="rule-pick-code">{s.code}</span>
                      <span className="rule-pick-desc">
                        {s.description ?? '—'}
                        <span className="sku-model-name">
                          {[s.model, categoryLabel(s.category)].filter(v => v && v !== '—').join(' · ')}
                        </span>
                      </span>
                      {listed ? (
                        <span className="rule-pick-cost">On the list</span>
                      ) : (
                        <button
                          type="button"
                          className="sku-secondary-button"
                          disabled={saving}
                          aria-label={`Add ${s.code}`}
                          onClick={() =>
                            add({
                              key: kpiAddKey({ source: 'sku', erpId: s.erpId }),
                              source: 'sku',
                              erpId: s.erpId,
                              code: s.code,
                              name: s.description,
                            })
                          }
                        >
                          Add
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )
          ) : specialMatches.length === 0 ? (
            <p className="rule-pick-empty">{q ? `No special matches “${query.trim()}”.` : 'This pool has no specials yet.'}</p>
          ) : (
            <ul className="rule-pick-list">
              {specialMatches.map(o => {
                const listed = taken.has(`option:${optionKey(o.pool, o.value)}`)
                return (
                  <li key={o.value} className="rule-pick-row" data-disabled={listed || undefined}>
                    <span className="rule-pick-code">{o.value}</span>
                    <span className="rule-pick-desc">{o.label !== o.value ? o.label : ''}</span>
                    {listed ? (
                      <span className="rule-pick-cost">On the list</span>
                    ) : (
                      <button
                        type="button"
                        className="sku-secondary-button"
                        disabled={saving}
                        aria-label={`Add ${o.value}`}
                        onClick={() =>
                          add({
                            key: kpiAddKey({ source: 'option', optionPool: o.pool, optionValue: o.value }),
                            source: 'option',
                            pool: o.pool as KpiOptionPool,
                            value: o.value,
                            name: o.label !== o.value ? o.label : null,
                          })
                        }
                      >
                        Add
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {source === 'sku' && skuMatches.length > PICK_LIMIT ? (
            <p className="rule-pick-more">
              Showing {PICK_LIMIT} of {skuMatches.length.toLocaleString()} — narrow the search.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="sku-table-panel">
        <PageScrolledTable label="KPI items">
          <table className="ledger-table sku-table">
            <thead>
              <tr>
                <th scope="col" className="sku-code-column">Item</th>
                <th scope="col">Kind</th>
                <th scope="col">Counted</th>
                <th scope="col" className="num">KPI amount (RM)</th>
                <th scope="col">From</th>
                {editing ? (
                  <th scope="col">
                    <span className="sr-only">Remove</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {lines.map(line => {
                const saved = line.saved
                const source = saved ? saved.source : line.added.source
                const pool = saved ? saved.optionPool : line.added.source === 'option' ? line.added.pool : null
                const { kind, counted } = kpiItemKind({ source, optionPool: pool })
                const going = saved ? removing.has(saved.id) : false
                const title = saved ? labelOf(saved) : line.added.source === 'sku' ? line.added.code : line.added.value
                const name = saved ? (saved.source === 'sku' ? saved.name : null) : line.added.name
                const mirror = saved
                  ? saved.source === 'sku'
                    ? saved.erpId
                      ? skuById.get(saved.erpId)
                      : undefined
                    : specialByKey.get(optionKey(saved.optionPool, saved.optionValue))
                  : undefined
                return (
                  <tr key={line.key} data-state={line.added ? 'new' : going ? 'removing' : undefined}>
                    <td className="sku-code-column">
                      {title}
                      {name ? <span className="sku-model-name">{name}</span> : null}
                    </td>
                    <td>
                      {kind}
                      <span className="rule-flags">
                        {line.added ? <span className="chip accent whitespace-nowrap">NEW</span> : null}
                        {going ? <span className="chip whitespace-nowrap">REMOVED ON SAVE</span> : null}
                        {mirror ? <MirrorFlags isNew={false} active={mirror.active} removed={mirror.removed} /> : null}
                      </span>
                    </td>
                    <td>{counted}</td>
                    <td className="num">
                      {editing && !going ? (
                        <input
                          value={amounts.get(line.key) ?? (saved ? String(saved.amount) : '')}
                          onChange={e => setAmount(line.key, e.target.value)}
                          disabled={saving}
                          inputMode="decimal"
                          placeholder="0.00"
                          aria-label={`${title} KPI amount`}
                          className="sku-price-input"
                        />
                      ) : saved ? (
                        formatMoneyBare(saved.amount)
                      ) : null}
                    </td>
                    <td className="sku-nowrap">
                      {saved ? `${formatDate(saved.from)}${saved.to ? ` – ${formatDate(saved.to)}` : ''}` : 'Today'}
                    </td>
                    {editing ? (
                      <td className="sku-nowrap">
                        {line.added ? (
                          <button type="button" className="rule-row-button" disabled={saving} onClick={() => takeOff(line.key)}>
                            Take off
                          </button>
                        ) : (
                          <button type="button" className="rule-row-button" disabled={saving} onClick={() => toggleRemove(line.key)}>
                            {going ? 'Keep' : 'Remove'}
                          </button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                )
              })}
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={columns} className="sku-empty">
                    No KPI items for {sub.name} yet. Edit items to add one from the SKU Master or a bed frame or sofa special.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </PageScrolledTable>
        <div className="sku-table-footer">
          <span>
            {items.length.toLocaleString()} item{items.length === 1 ? '' : 's'} in force · amounts in RM, paid per item the
            bill carries
          </span>
        </div>
      </div>
    </section>
  )
}

function labelOf(item: KpiItemSetting): string {
  return (item.source === 'sku' ? item.code : item.optionValue) ?? '—'
}

function kindOrder(item: KpiItemSetting): number {
  return item.source === 'sku' ? 2 : item.optionPool === 'bedframe_specials' ? 0 : 1
}
