'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatMoneyBare } from '@/lib/utils'
import { valueKey } from '@/lib/catalogue/keys'
import { kpiItemKind, type KpiItemPool } from '@/lib/commission/kpi'
import { MAX_KPI_TIERS, validateKpiItems } from '@/lib/catalogue/rule-edits'
import {
  bonusDiffers,
  brandKpiChanges,
  brandKpiEditOf,
  brandKpiKey,
  brandKpiTaken,
  brandKpiTitle,
  EMPTY_BRAND_KPI_DRAFT,
  pickBrandItem,
  tierDrafts,
  tiersDiffer,
  toBrandKpiListed,
  type BrandKpiAdded,
  type BrandKpiDraft,
  type BrandKpiListed,
  type TierDraft,
} from '@/lib/commission/brand-kpi-edit'
import { fabricCount, SKU_SEARCH_LIMIT } from '@/lib/commission/kpi-items-edit'
import { searchSkuMaster, type KpiSkuHit } from '@/lib/commission/kpi-sku-search'
import { createClient } from '@/lib/supabase/client'
import { SectionHead } from '@/components/RowForm'
import { saveKpiItems } from '../../kpi-actions'
import type { BrandKpiCatalogue, BrandRow, CommissionSettingsData, KpiItemRow, SchemeRow } from './types'

type PickSource = 'sku' | KpiItemPool

/** Where a brand's own item comes from (2026-11-14): the sub-department's sources, and a model and a compartment. */
const SOURCES: ReadonlyArray<{ key: PickSource; label: string }> = [
  { key: 'sku', label: 'SKU Master' },
  { key: 'models', label: 'Models' },
  { key: 'compartments', label: 'Compartments' },
  { key: 'bedframe_specials', label: 'Bed frame specials' },
  { key: 'sofa_specials', label: 'Sofa specials' },
  { key: 'bedframe_fabric_series', label: 'Bed frame fabric series' },
  { key: 'sofa_fabric_series', label: 'Sofa fabric series' },
]

const PILL = 'px-3 py-1.5 rounded-full border text-xs transition-colors disabled:opacity-50'
const PILL_ON = `${PILL} border-accent bg-accent-bg font-semibold`
const PILL_OFF = `${PILL} border-hairline bg-surface hover:bg-surface-2`
const INPUT =
  'px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink focus:outline-none focus:border-accent-border disabled:opacity-60'
const BUTTON_QUIET =
  'bg-surface hover:bg-surface-2 border border-hairline text-ink text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-50'
const LINK = 'text-xs font-sans hover:underline disabled:opacity-50'
const CHANGED = 'border-accent bg-accent-bg'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const NO_ITEMS: KpiItemRow[] = []
const NO_CATALOGUE: BrandKpiCatalogue = { companyId: 1, specials: [], fabricSeries: [], models: [], compartments: [] }

/** One SKU search: what was asked, and what came back. */
interface SkuSearch {
  query: string
  hits: KpiSkuHit[]
  total: number
  pending: boolean
  error: string | null
}

const NO_SEARCH: SkuSearch = { query: '', hits: [], total: 0, pending: false, error: null }

/**
 * The KPI items of the brands on their own commission scheme (2026-11-12 —
 * 2990s; the user: "这个 KPI item 是独立的，属于 2990 专属的 KPI item … KPI item
 * 那边我是可以手动去加的"). Since 2026-11-14 an item is picked as the
 * sub-department's own are (the user: "要跟它上面是一样的"; "by model、by
 * special 或者是 by compartment"), from the brand's own ERP company: a SKU of
 * its SKU Master, a model, a sofa compartment (CNR — any model with a corner),
 * a bed frame's or a sofa's special, a fabric series. It carries a bonus a unit
 * and the tiers the month's units reach — no cost: what the bill charged for
 * the item comes off its commissionable sales (the user: "不需要去选它的 cost …
 * HR 那边只需要 set 哪一个 item 是有 KPI，然后它有没有 tiering"). Paid whatever
 * the sub-department's KPI switch says, so the head says *Always paid*.
 *
 * One block a brand, each with its own draft and its own Save (2026-11-13).
 * Whoever may not manage the rules reads the list — and sees a brand only once
 * it has an item.
 */
export default function BrandKpiItems({ data, scheme, canManage }: { data: CommissionSettingsData; scheme: SchemeRow; canManage: boolean }) {
  // Each brand's rows keep one identity until the page's data changes: a block waits on it after its Save.
  const items = data.brandKpiItems ?? NO_ITEMS
  const itemsOf = useMemo(() => {
    const by = new Map<string, KpiItemRow[]>()
    for (const item of items) {
      if (!item.brand_id) continue
      const list = by.get(item.brand_id)
      if (list) list.push(item)
      else by.set(item.brand_id, [item])
    }
    return by
  }, [items])
  const catalogues = useMemo(() => new Map((data.brandKpiCatalogues ?? []).map(c => [c.companyId, c])), [data.brandKpiCatalogues])
  const gone = useMemo(() => new Set(data.kpiGoneSkus), [data.kpiGoneSkus])

  const brands = data.brands.filter(b => b.own_scheme && b.is_active !== false && (canManage || itemsOf.has(b.id)))
  if (brands.length === 0) return null
  return (
    <>
      {brands.map(brand => (
        <BrandKpiBlock
          key={brand.id}
          brand={brand}
          scheme={scheme}
          items={itemsOf.get(brand.id) ?? NO_ITEMS}
          catalogue={catalogues.get(brand.erp_company_id ?? 1) ?? NO_CATALOGUE}
          goneSkus={gone}
          canManage={canManage}
        />
      ))}
    </>
  )
}

function BrandKpiBlock({ brand, scheme, items, catalogue, goneSkus, canManage }: {
  brand: BrandRow
  scheme: SchemeRow
  items: KpiItemRow[]
  catalogue: BrandKpiCatalogue
  goneSkus: ReadonlySet<string>
  canManage: boolean
}) {
  const router = useRouter()
  const listed = useMemo(() => items.map(toBrandKpiListed).sort((a, b) => brandKpiTitle(a).localeCompare(brandKpiTitle(b))), [items])
  const [draft, setDraft] = useState<BrandKpiDraft>(EMPTY_BRAND_KPI_DRAFT)
  const [source, setSource] = useState<PickSource>('sku')
  const [query, setQuery] = useState('')
  const [pickAmount, setPickAmount] = useState('')
  const [sku, setSku] = useState<SkuSearch>(NO_SEARCH)
  const [pending, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // After a save the draft stays, read-only, until the refreshed list arrives (as the list above does).
  const [settling, setSettling] = useState(false)
  const settleFrom = useRef<KpiItemRow[] | null>(null)
  const settle = useCallback(() => {
    settleFrom.current = null
    setSettling(false)
    setDraft(EMPTY_BRAND_KPI_DRAFT)
    setPickAmount('')
  }, [])
  useEffect(() => {
    if (settling && settleFrom.current && settleFrom.current !== items) settle()
  }, [settling, items, settle])
  useEffect(() => {
    if (!settling) return
    const timer = window.setTimeout(settle, 15_000)
    return () => window.clearTimeout(timer)
  }, [settling, settle])
  const saving = pending || settling

  const changes = brandKpiChanges(listed, draft)
  const taken = useMemo(() => brandKpiTaken(listed, draft), [listed, draft])

  // A page closed or reloaded with changes not saved asks first.
  useEffect(() => {
    if (changes === 0 || saving) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [changes, saving])

  // The brand's own SKU Master is searched a moment after typing stops, from the browser, as the list above does it.
  const searchSeq = useRef(0)
  useEffect(() => {
    if (source !== 'sku') return
    const q = query.trim()
    const seq = ++searchSeq.current
    if (!q) {
      setSku(NO_SEARCH)
      return
    }
    setSku(previous => ({ ...previous, pending: true, error: null }))
    const timer = window.setTimeout(() => {
      searchSkuMaster(createClient() as unknown as SupabaseClient, q, catalogue.companyId)
        .then(result => {
          if (seq !== searchSeq.current) return
          setSku(result.ok
            ? { query: q, hits: result.hits, total: result.total, pending: false, error: null }
            : { query: q, hits: [], total: 0, pending: false, error: result.reason })
        })
        .catch(() => {
          if (seq !== searchSeq.current) return
          setSku({ query: q, hits: [], total: 0, pending: false, error: 'The SKU Master could not be searched just now. Try again.' })
        })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [source, query, catalogue.companyId])

  function update(change: (d: BrandKpiDraft) => BrandKpiDraft) {
    setDraft(change)
    setError(null)
    setNotice(null)
  }
  const setAmount = (id: string, text: string) => update(d => ({ ...d, amounts: new Map(d.amounts).set(id, text) }))
  const setTiers = (item: BrandKpiListed, change: (tiers: TierDraft[]) => TierDraft[]) =>
    update(d => ({ ...d, tiers: new Map(d.tiers).set(item.id, change([...(d.tiers.get(item.id) ?? tierDrafts(item.tiers))])) }))
  const setAdded = (key: string, change: (a: BrandKpiAdded) => BrandKpiAdded) =>
    update(d => ({ ...d, added: d.added.map(a => (a.key === key ? change(a) : a)) }))
  function toggleRemove(id: string) {
    update(d => {
      const removing = new Set(d.removing)
      if (removing.has(id)) removing.delete(id)
      else removing.add(id)
      return { ...d, removing }
    })
  }
  function add(item: BrandKpiAdded) {
    update(d => ({ ...d, added: [item, ...d.added] }))
  }
  function cancel() {
    if (saving) return
    setDraft(EMPTY_BRAND_KPI_DRAFT)
    setError(null)
  }
  function save() {
    if (saving || changes === 0) return
    const edit = brandKpiEditOf(brand.id, listed, draft)
    try {
      validateKpiItems(edit)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the bonus and the tiers.')
      return
    }
    setError(null)
    setNotice(null)
    const before = items
    startSaving(async () => {
      try {
        const result = await saveKpiItems(scheme.id, edit)
        if (!result.ok) {
          setError(result.reason)
          return
        }
        settleFrom.current = before
        setSettling(true)
        setNotice('Saved.')
        router.refresh()
      } catch {
        setError(`Could not save ${brand.name}'s KPI items. Try again.`)
      }
    })
  }

  // What the picker offers for the source chosen, from the brand's own catalogue.
  const q = query.trim().toLowerCase()
  const has = (...texts: Array<string | null | undefined>) => !q || texts.some(t => (t ?? '').toLowerCase().includes(q))
  const isTaken = (pick: { source: 'sku' | 'option'; pool: string | null; value: string }) => taken.has(brandKpiKey(pick))
  type Result = { key: string; code: string; mono?: boolean; desc: string; listed: boolean; muted?: string; add: () => void }
  const results: Result[] = source === 'sku'
    ? sku.hits.map(h => ({
        key: h.erpId,
        code: h.code,
        mono: true,
        desc: [h.description, h.category].filter(Boolean).join(' · '),
        listed: isTaken({ source: 'sku', pool: null, value: h.code }),
        muted: h.active ? undefined : 'Off in the ERP',
        add: () => add(pickBrandItem({ source: 'sku', code: h.code, erpId: h.erpId, label: h.description }, pickAmount.trim())),
      }))
    : source === 'models'
      ? catalogue.models.filter(m => has(m.model, m.sample)).map(m => ({
          key: `models:${m.model}`,
          code: m.model,
          desc: [m.category, plural(m.skus, 'SKU'), m.sample].filter(Boolean).join(' · '),
          listed: isTaken({ source: 'option', pool: 'models', value: m.model }),
          add: () => add(pickBrandItem({ source: 'option', pool: 'models', value: m.model, label: m.sample }, pickAmount.trim())),
        }))
      : source === 'compartments'
        ? catalogue.compartments.filter(c => has(c.compartment)).map(c => ({
            key: `compartments:${c.compartment}`,
            code: c.compartment,
            desc: plural(c.models, 'sofa model'),
            listed: isTaken({ source: 'option', pool: 'compartments', value: c.compartment }),
            add: () => add(pickBrandItem({ source: 'option', pool: 'compartments', value: c.compartment }, pickAmount.trim())),
          }))
        : source === 'bedframe_fabric_series' || source === 'sofa_fabric_series'
          ? catalogue.fabricSeries.filter(s => !s.removed && has(s.series)).map(s => ({
              key: `${source}:${s.series}`,
              code: s.series,
              desc: fabricCount(s.fabrics),
              listed: isTaken({ source: 'option', pool: source, value: s.series }),
              add: () => add(pickBrandItem({ source: 'option', pool: source, value: s.series }, pickAmount.trim())),
            }))
          : catalogue.specials
              .filter(o => o.pool === source && !o.removed && has(o.value, o.label))
              .sort((a, b) => a.sort_order - b.sort_order || a.value.localeCompare(b.value))
              .map(o => ({
                key: `${o.pool}:${o.value}`,
                code: o.value,
                desc: o.label !== o.value ? o.label : '',
                listed: isTaken({ source: 'option', pool: o.pool, value: o.value }),
                add: () => add(pickBrandItem({ source: 'option', pool: o.pool, value: o.value, label: o.label }, pickAmount.trim())),
              }))
  const message = source === 'sku'
    ? !q
      ? 'Type a SKU code or a word of its description.'
      : sku.error
        ? sku.error
        : sku.pending && sku.query !== query.trim()
          ? 'Searching…'
          : sku.total === 0
            ? 'No SKU matches.'
            : sku.total > SKU_SEARCH_LIMIT
              ? `Showing ${SKU_SEARCH_LIMIT} of ${sku.total.toLocaleString()} — type more to narrow it.`
              : null
    : results.length === 0
      ? 'Nothing matches.'
      : null

  // Said only when known: a list that could not be read names nothing gone.
  const goneFromErp = (item: BrandKpiListed): boolean => {
    if (item.source === 'sku') return !!item.erpId && goneSkus.has(item.erpId)
    const key = valueKey(item.value)
    switch (item.pool) {
      case 'models':
        return catalogue.models.length > 0 && !catalogue.models.some(m => valueKey(m.model) === key)
      case 'compartments':
        return catalogue.compartments.length > 0 && !catalogue.compartments.some(c => valueKey(c.compartment) === key)
      case 'bedframe_fabric_series':
      case 'sofa_fabric_series': {
        const series = catalogue.fabricSeries.find(s => valueKey(s.series) === key)
        return catalogue.fabricSeries.length > 0 && (!series || series.removed)
      }
      default: {
        const special = catalogue.specials.find(o => o.pool === item.pool && valueKey(o.value) === key)
        return catalogue.specials.length > 0 && (!special || special.removed)
      }
    }
  }
  const kindOf = (item: { source: 'sku' | 'option'; pool: KpiItemPool | null }) =>
    kpiItemKind({ source: item.source, optionPool: item.pool, brandCode: brand.code })

  const count = listed.length
  /** The tiers' inputs: from N units, what a unit pays; a row dropped, a row added. */
  const tierInputs = (title: string, tiers: readonly TierDraft[], onChange: (change: (tiers: TierDraft[]) => TierDraft[]) => void, edited: boolean) => (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {tiers.map((tier, i) => (
        <span key={i} className="inline-flex items-center gap-1 whitespace-nowrap">
          <input
            value={tier.minQty}
            onChange={e => onChange(rows => rows.map((r, k) => (k === i ? { ...r, minQty: e.target.value } : r)))}
            disabled={saving}
            inputMode="numeric"
            placeholder="5"
            aria-label={`${title} tier ${i + 1} from units`}
            className={`${INPUT} w-14 text-right tabular-nums ${edited ? CHANGED : ''}`}
          />
          <span>+ ·</span>
          <input
            value={tier.amount}
            onChange={e => onChange(rows => rows.map((r, k) => (k === i ? { ...r, amount: e.target.value } : r)))}
            disabled={saving}
            inputMode="decimal"
            placeholder="0.00"
            aria-label={`${title} tier ${i + 1} pays`}
            className={`${INPUT} w-20 text-right tabular-nums ${edited ? CHANGED : ''}`}
          />
          <button type="button" className={`${LINK} text-danger`} disabled={saving} aria-label={`Drop ${title} tier ${i + 1}`}
            onClick={() => onChange(rows => rows.filter((_, k) => k !== i))}>
            ×
          </button>
        </span>
      ))}
      {tiers.length < MAX_KPI_TIERS ? (
        <button type="button" className={`${LINK} text-accent`} disabled={saving} aria-label={`Add a tier to ${title}`}
          onClick={() => onChange(rows => [...rows, { minQty: '', amount: '' }])}>
          + Tier
        </button>
      ) : null}
    </span>
  )
  const tiersText = (tiers: readonly { minQty: number; amount: number }[]) =>
    tiers.length === 0 ? '—' : tiers.map(t => `${t.minQty}+ · ${formatMoneyBare(t.amount)}`).join('  ·  ')

  return (
    <div className="mt-10">
      <SectionHead title={`${brand.name} · KPI items`} count={`${plural(count, 'ITEM').toUpperCase()} · ALWAYS PAID`} />
      {canManage ? (
        <div className="sheet-toolbar flex-col flex-nowrap items-stretch" role="group" aria-label={`Add a ${brand.name} KPI item`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] mr-1">Add an item from</span>
            {SOURCES.map(s => (
              <button
                key={s.key}
                type="button"
                aria-pressed={source === s.key}
                disabled={saving}
                onClick={() => {
                  setSource(s.key)
                  setQuery('')
                }}
                className={source === s.key ? PILL_ON : PILL_OFF}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              disabled={saving}
              onChange={e => setQuery(e.target.value)}
              placeholder={source === 'sku' ? 'Search SKU code or description…' : 'Filter…'}
              aria-label={source === 'sku' ? `Find a ${brand.name} SKU` : `Filter ${brand.name}'s ${SOURCES.find(s => s.key === source)?.label.toLowerCase()}`}
              className="flex-1 min-w-[14rem]"
            />
            <label className="inline-flex items-center gap-2 text-xs">
              <span className="whitespace-nowrap">Bonus RM</span>
              <input
                value={pickAmount}
                disabled={saving}
                onChange={e => setPickAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                aria-label={`${brand.name} bonus for the next item added`}
                className="w-28 text-right tabular-nums"
              />
            </label>
          </div>
          {message ? <p className="text-xs">{message}</p> : null}
          {results.length > 0 ? (
            <ul className="border border-hairline rounded-[8px] bg-surface divide-y divide-hairline max-h-64 overflow-y-auto"
              aria-label={`${brand.name} items to add`}>
              {results.map(r => (
                <li key={r.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className={`whitespace-nowrap ${r.mono ? 'font-mono text-xs' : 'text-sm font-medium'}`}>{r.code}</span>
                  <span className="flex-1 min-w-0 truncate text-xs">{r.desc}</span>
                  {r.muted ? <span className="chip alert whitespace-nowrap">{r.muted}</span> : null}
                  {r.listed ? (
                    <span className="chip whitespace-nowrap">On the list</span>
                  ) : (
                    <button type="button" className={BUTTON_QUIET} disabled={saving} onClick={r.add} aria-label={`Add ${r.code} to ${brand.name}`}>
                      Add
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="sheet-danger" role="alert">{error}</p> : null}
      {notice ? <p className="sheet-notice" role="status">{notice}</p> : null}
      <div className="table-frame">
        <div className="table-frame-scroll">
          <table className="ledger-table" aria-label={`${brand.name} KPI items`}>
            <thead>
              <tr>
                <th>Item</th>
                <th>Kind</th>
                <th className="whitespace-nowrap">Counted</th>
                <th className="right">Bonus a unit · RM</th>
                <th>By the month&apos;s units</th>
                {canManage ? <th className="w-24 relative"><span className="sr-only">Remove</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {draft.added.map(a => {
                const title = a.name.trim() || a.label || a.value
                const kind = kindOf(a)
                return (
                  <tr key={a.key} className="bg-accent-bg/60">
                    <td>
                      <span className={`font-medium ${a.source === 'sku' ? 'font-mono text-xs' : ''}`}>{a.value}</span>
                      <span className="chip accent ml-2">New</span>
                      <div className="mt-1">
                        <input value={a.name} onChange={e => setAdded(a.key, row => ({ ...row, name: e.target.value }))} disabled={saving}
                          maxLength={120} placeholder={a.label ?? 'Name'} aria-label={`${title} name`} className={`${INPUT} w-48`} />
                      </div>
                    </td>
                    <td>{kind.kind}</td>
                    <td className="whitespace-nowrap">{kind.counted}</td>
                    <td className="num">
                      <input
                        value={a.amount}
                        onChange={e => setAdded(a.key, row => ({ ...row, amount: e.target.value }))}
                        disabled={saving}
                        inputMode="decimal"
                        placeholder="0.00"
                        aria-label={`${title} bonus a unit`}
                        className={`${INPUT} w-24 text-right tabular-nums ${CHANGED}`}
                      />
                    </td>
                    <td>{tierInputs(title, a.tiers, change => setAdded(a.key, row => ({ ...row, tiers: change([...row.tiers]) })), true)}</td>
                    <td className="whitespace-nowrap text-right">
                      <button type="button" className={`${LINK} text-danger`} disabled={saving} aria-label={`Take ${title} off`}
                        onClick={() => update(d => ({ ...d, added: d.added.filter(x => x.key !== a.key) }))}>
                        Take off
                      </button>
                    </td>
                  </tr>
                )
              })}
              {listed.map(item => {
                const title = brandKpiTitle(item)
                const going = draft.removing.has(item.id)
                const amount = draft.amounts.get(item.id)
                const tiers = draft.tiers.get(item.id)
                const kind = kindOf(item)
                const outOfErp = goneFromErp(item)
                return (
                  <tr key={item.id}>
                    <td>
                      <span className={`font-medium ${going ? 'line-through' : ''}`}>{title}</span>
                      {going ? <span className="chip danger ml-2">Coming off</span> : null}
                      {outOfErp && !going ? (
                        <span className="chip alert ml-2" title="The ERP no longer has it, so no new bill can carry it">Gone from the ERP</span>
                      ) : null}
                      {/* What the item is found by: the SKU's code, the special, the series, the model, the compartment. */}
                      {item.name && item.name !== item.value ? (
                        <div className={`mt-0.5 ${item.source === 'sku' ? 'font-mono text-[11px]' : 'text-[11px]'}`}>{item.value}</div>
                      ) : null}
                    </td>
                    <td className={going ? 'line-through' : undefined}>{kind.kind}</td>
                    <td className="whitespace-nowrap">{kind.counted}</td>
                    <td className="num">
                      {!canManage || going ? (
                        <span className={going ? 'line-through' : undefined}>{formatMoneyBare(item.amount)}</span>
                      ) : (
                        <input
                          value={amount ?? String(item.amount)}
                          onChange={e => setAmount(item.id, e.target.value)}
                          disabled={saving}
                          inputMode="decimal"
                          placeholder="0.00"
                          aria-label={`${title} bonus a unit`}
                          className={`${INPUT} w-24 text-right tabular-nums ${amount !== undefined && bonusDiffers(amount, item.amount) ? CHANGED : ''}`}
                        />
                      )}
                    </td>
                    <td className={canManage && !going ? undefined : 'whitespace-nowrap'}>
                      {!canManage || going
                        ? <span className={going ? 'line-through' : undefined}>{tiersText(item.tiers)}</span>
                        : tierInputs(title, tiers ?? tierDrafts(item.tiers), change => setTiers(item, change), tiers !== undefined && tiersDiffer(tiers, item.tiers))}
                    </td>
                    {canManage ? (
                      <td className="whitespace-nowrap text-right">
                        <button type="button" className={`${LINK} ${going ? '' : 'text-danger'}`} disabled={saving}
                          onClick={() => toggleRemove(item.id)} aria-label={`${going ? 'Keep' : 'Remove'} ${title}`}>
                          {going ? 'Keep' : 'Remove'}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
              {listed.length + draft.added.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="text-center text-sm py-6">{brand.name} has no KPI items yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {canManage ? (
          <div className="table-frame-foot">
            <span>
              {plural(count, 'item')}
              {changes > 0 ? ` · ${plural(changes, 'change')} not saved` : ''}
            </span>
            <span className="inline-flex items-center gap-2">
              <button type="button" className={BUTTON_QUIET} disabled={saving || changes === 0} onClick={cancel}
                aria-label={`Cancel ${brand.name} KPI item changes`}>
                Cancel
              </button>
              <button type="button" className={BUTTON_QUIET} disabled={saving || changes === 0} onClick={save}
                aria-label={`Save ${brand.name} KPI items`}>
                {pending ? 'Saving…' : settling ? 'Saved' : changes === 0 ? 'Save' : `Save ${plural(changes, 'change')}`}
              </button>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
