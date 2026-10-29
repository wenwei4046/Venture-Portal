'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatMoneyBare } from '@/lib/utils'
import { valueKey } from '@/lib/catalogue/keys'
import { isFabricSeriesPool, kpiItemKind, type KpiOptionPool } from '@/lib/commission/kpi'
import { validateKpiItems } from '@/lib/catalogue/rule-edits'
import {
  amountDiffers,
  draftChanges,
  EMPTY_KPI_DRAFT,
  fabricCount,
  kpiItemsEditOf,
  listedKeys,
  listedLabel,
  pickFabricSeries,
  pickSku,
  pickSpecial,
  SKU_SEARCH_LIMIT,
  skuCodeKey,
  skuIdKey,
  sortListed,
  specialKey,
  type KpiItemsDraft,
  type KpiListedItem,
  type KpiPickedItem,
} from '@/lib/commission/kpi-items-edit'
import { saveKpiItems } from '../../kpi-actions'
import { createClient } from '@/lib/supabase/client'
import { searchSkuMaster, type KpiSkuHit } from '@/lib/commission/kpi-sku-search'
import { deleteKpiThreshold, upsertKpiThreshold } from '../../config-actions'
import { ActionButton, Field, Hidden, RowForm, SaveButton, SectionHead, toPct } from '@/components/RowForm'
import type { CommissionSettingsData, KpiItemRow, SchemeRow } from './types'

type PickSource = 'sku' | KpiOptionPool

const SOURCES: ReadonlyArray<{ key: PickSource; label: string }> = [
  { key: 'sku', label: 'SKU Master' },
  { key: 'bedframe_specials', label: 'Bed frame specials' },
  { key: 'sofa_specials', label: 'Sofa specials' },
  { key: 'bedframe_fabric_series', label: 'Bed frame fabric series' },
  { key: 'sofa_fabric_series', label: 'Sofa fabric series' },
]

/** The Brands tab's picker pill: white, and the one being read on a peach wash with an orange rim. */
const PILL = 'px-3 py-1.5 rounded-full border text-xs transition-colors disabled:opacity-50'
const PILL_ON = `${PILL} border-accent bg-accent-bg font-semibold`
const PILL_OFF = `${PILL} border-hairline bg-surface hover:bg-surface-2`
const INPUT =
  'px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink focus:outline-none focus:border-accent-border disabled:opacity-60'
const BUTTON_QUIET =
  'bg-surface hover:bg-surface-2 border border-hairline text-ink text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-50'
const BUTTON_PRIMARY =
  'bg-accent hover:bg-accent-hover text-white text-xs font-medium px-3 py-1.5 rounded transition-colors disabled:opacity-50'
const LINK = 'text-xs font-sans hover:underline disabled:opacity-50'

function toListed(row: KpiItemRow): KpiListedItem {
  return {
    id: row.id,
    source: row.source === 'option' ? 'option' : 'sku',
    erpId: row.erp_product_id ?? null,
    code: row.product_code,
    name: row.product_name,
    optionPool: row.option_pool,
    optionValue: row.option_value,
    amount: Number(row.kpi_amount),
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

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
 * Rules › KPI items (2026-10-08) — which items count as KPI, what each pays,
 * and the threshold ladder over them, on one tab. It moved here from the
 * Product List's *Add-on / KPI Items* (user: "rules 这里是用来算薪水的 … 我
 * 的 KPI tab 只需要能够选择哪一项 count as KPI item"): the Product List sets
 * what things cost; this sets what the pay does with them.
 *
 * A KPI item is a SKU of the SKU Master (searched for — the master is 2,368
 * rows), a bed frame's or sofa's special from Maintenance (all 39 listed), or
 * a bed frame's or sofa's FABRIC SERIES from the ERP's fabric list (2026-10-29,
 * some 130 listed). When the commission calculation finds one on a bill it
 * counts by itself (`kpi.ts` `orderKpiHits`, `comm_kpi_hits`): its amount off
 * the bill's sales, paid flat as KPI. Nothing here changes how a bill is read
 * — only where the list is kept and who keeps it (Principal and HR, as every
 * rule).
 *
 * One draft for the whole list — picked, retyped, coming off — saved in one
 * transaction. It survives a switch to another tab (the section stays mounted,
 * hidden) and, after a save, stays on screen until the refreshed list lands,
 * as Costing Setting does, so the list never flashes back to before the save.
 *
 * The threshold ladder below it is the one the run has always read — every KPI
 * unit of the month together, a % on the whole KPI amount (the user kept it,
 * 2026-10-08) — one row per rung, each saved on its own as before.
 */
export default function KpiItemsSection({
  data,
  scheme,
  subName,
  onSchemeRules,
}: {
  data: CommissionSettingsData
  scheme: SchemeRow
  subName: string
  onSchemeRules: () => void
}) {
  const router = useRouter()
  const items = data.kpiItems
  const listed = useMemo(() => sortListed(items.map(toListed)), [items])
  const gone = useMemo(() => new Set(data.kpiGoneSkus), [data.kpiGoneSkus])
  const specials = data.kpiSpecials
  const specialByKey = useMemo(() => new Map(specials.map(o => [specialKey(o.pool, o.value), o])), [specials])
  const fabricSeries = data.kpiFabricSeries
  const seriesByKey = useMemo(() => new Map(fabricSeries.map(s => [valueKey(s.series), s])), [fabricSeries])

  const [draft, setDraft] = useState<KpiItemsDraft>(EMPTY_KPI_DRAFT)
  const [source, setSource] = useState<PickSource>('sku')
  const [query, setQuery] = useState('')
  const [pickAmount, setPickAmount] = useState('')
  const [sku, setSku] = useState<SkuSearch>(NO_SEARCH)
  const [pending, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // After a save the drafts stay, read-only, until the refreshed list arrives —
  // clearing them at once showed the list from before the save for a moment.
  // Settled when the server's items change, or a little later should the
  // refresh never land.
  const [settling, setSettling] = useState(false)
  const settleFrom = useRef<KpiItemRow[] | null>(null)
  const settle = useCallback(() => {
    settleFrom.current = null
    setSettling(false)
    setDraft(EMPTY_KPI_DRAFT)
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

  const changes = draftChanges(listed, draft)
  const taken = useMemo(() => listedKeys(listed, draft), [listed, draft])

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

  // The SKU Master is searched a moment after typing stops — from the browser,
  // under the reader's own session, never as a Server Action: one still running
  // when a section is picked is dropped by Next and the page refreshed, and a
  // Back during that refresh stuck on the skeleton (2026-10-11). Only the newest
  // answer is shown.
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
      searchSkuMaster(createClient() as unknown as SupabaseClient, q)
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
  }, [source, query])

  function update(change: (d: KpiItemsDraft) => KpiItemsDraft) {
    setDraft(change)
    setError(null)
    setNotice(null)
  }

  function add(item: KpiPickedItem) {
    update(d => ({ ...d, added: [item, ...d.added], amounts: new Map(d.amounts).set(item.key, pickAmount.trim()) }))
  }

  function takeOff(key: string) {
    update(d => {
      const amounts = new Map(d.amounts)
      amounts.delete(key)
      return { ...d, added: d.added.filter(a => a.key !== key), amounts }
    })
  }

  function toggleRemove(id: string) {
    update(d => {
      const removing = new Set(d.removing)
      if (removing.has(id)) removing.delete(id)
      else removing.add(id)
      return { ...d, removing }
    })
  }

  function setAmount(key: string, text: string) {
    update(d => ({ ...d, amounts: new Map(d.amounts).set(key, text) }))
  }

  function cancel() {
    if (saving) return
    setDraft(EMPTY_KPI_DRAFT)
    setError(null)
  }

  function save() {
    if (saving || changes === 0) return
    const edit = kpiItemsEditOf(listed, draft)
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
        const result = await saveKpiItems(scheme.id, edit)
        if (!result.ok) {
          setError(result.reason)
          return
        }
        settleFrom.current = before
        setSettling(true)
        setNotice(
          scheme.enable_kpi
            ? 'Saved. From this month, a bill carrying one of these pays its amount flat as KPI.'
            : `Saved. KPI item allowance is off for ${subName}, so nothing is paid until it is switched on in Scheme rules.`,
        )
        router.refresh()
      } catch {
        setError('Could not save the KPI items. Try again.')
      }
    })
  }

  // What the picker offers for the source chosen.
  const q = query.trim().toLowerCase()
  const fabricPool = isFabricSeriesPool(source) ? source : null
  const specialMatches = source === 'sku' || fabricPool
    ? []
    : specials
        .filter(o => o.pool === source && !o.removed)
        .filter(o => !q || o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q))
        .sort((a, b) => a.sort_order - b.sort_order || a.value.localeCompare(b.value))
  // A series every fabric of which the ERP has removed cannot be on a new bill, as a removed special cannot.
  const seriesMatches = fabricPool
    ? fabricSeries.filter(s => !s.removed && (!q || s.series.toLowerCase().includes(q)))
    : []
  const results: Array<{ key: string; code: string; mono?: boolean; desc: string; listed: boolean; muted?: string; add: () => void }> =
    source === 'sku'
      ? sku.hits.map(h => ({
          key: h.erpId,
          code: h.code,
          mono: true,
          desc: [h.description, h.category].filter(Boolean).join(' · '),
          listed: taken.has(skuIdKey(h.erpId)) || taken.has(skuCodeKey(h.code)),
          muted: h.active ? undefined : 'Off in the ERP',
          add: () => add(pickSku({ erpId: h.erpId, code: h.code, name: h.description })),
        }))
      : fabricPool
        ? seriesMatches.map(s => ({
            key: `${fabricPool}:${s.series}`,
            code: s.series,
            desc: fabricCount(s.fabrics),
            listed: taken.has(specialKey(fabricPool, s.series)),
            add: () => add(pickFabricSeries(fabricPool, s)),
          }))
        : specialMatches.map(o => ({
            key: `${o.pool}:${o.value}`,
            code: o.value,
            desc: o.label !== o.value ? o.label : '',
            listed: taken.has(specialKey(o.pool, o.value)),
            add: () => add(pickSpecial({ pool: o.pool, value: o.value, label: o.label })),
          }))
  const message =
    source === 'sku'
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
      : fabricPool
        ? seriesMatches.length === 0
          ? 'No fabric series matches.'
          : null
        : specialMatches.length === 0
          ? 'No special matches.'
          : null

  const lines: Array<{ key: string; added?: KpiPickedItem; saved?: KpiListedItem }> = [
    ...draft.added.map(a => ({ key: a.key, added: a })),
    ...listed.map(i => ({ key: i.id, saved: i })),
  ]
  const count = listed.length

  return (
    <section aria-label={`KPI items · ${plural(count, 'item')}`}>
      {!scheme.enable_kpi ? (
        <p className="sheet-warning">
          <strong>KPI item allowance is off</strong> for {subName}: nothing below comes off a bill or is paid until it
          is switched on in{' '}
          <button type="button" onClick={onSchemeRules} className="text-accent underline underline-offset-[3px]">
            Scheme rules
          </button>
          . The list and the ladder are kept.
        </p>
      ) : null}

      {/* One column (flex-nowrap): the toolbar wraps by default, and a wrapping
          column sizes itself to its widest row — the picker's list — so the
          pills ran off a phone's screen once the list showed. */}
      <div className="sheet-toolbar flex-col flex-nowrap items-stretch" role="group" aria-label="Add a KPI item">
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
            placeholder={source === 'sku' ? 'Search SKU code or description…' : fabricPool ? 'Filter the fabric series…' : 'Filter the specials…'}
            aria-label={source === 'sku' ? 'Find a SKU' : fabricPool ? 'Filter the fabric series' : 'Filter the specials'}
            className="flex-1 min-w-[14rem]"
          />
          <label className="inline-flex items-center gap-2 text-xs">
            <span className="whitespace-nowrap">Amount RM</span>
            <input
              value={pickAmount}
              disabled={saving}
              onChange={e => setPickAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="KPI amount for the next item added"
              className="w-28 text-right tabular-nums"
            />
          </label>
        </div>
        {message ? <p className="text-xs">{message}</p> : null}
        {results.length > 0 ? (
          <ul className="border border-hairline rounded-[8px] bg-surface divide-y divide-hairline max-h-64 overflow-y-auto" aria-label="Items to add">
            {results.map(r => (
              <li key={r.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className={`whitespace-nowrap ${r.mono ? 'font-mono text-xs' : 'text-sm font-medium'}`}>{r.code}</span>
                <span className="flex-1 min-w-0 truncate text-xs">{r.desc}</span>
                {r.muted ? <span className="chip alert whitespace-nowrap">{r.muted}</span> : null}
                {r.listed ? (
                  <span className="chip whitespace-nowrap">On the list</span>
                ) : (
                  <button type="button" className={BUTTON_QUIET} disabled={saving} onClick={r.add} aria-label={`Add ${r.code}`}>
                    Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? <p className="sheet-danger" role="alert">{error}</p> : null}
      {notice ? <p className="sheet-notice" role="status">{notice}</p> : null}

      <div className="table-frame">
        <div className="table-frame-scroll">
          <table className="ledger-table" aria-label="KPI items">
            <thead>
              <tr>
                <th>Item</th>
                <th>Name</th>
                <th>Kind</th>
                <th>Counted</th>
                <th className="right">KPI amount · RM</th>
                {/* `relative`: the hidden label is absolutely placed, and without
                    a positioned cell to hold it, it escapes the table's scroll
                    box and widens a phone's page by the table's overhang. */}
                <th className="w-24 relative"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.map(line => {
                const saved = line.saved
                const added = line.added
                const kind = kpiItemKind(
                  saved ? { source: saved.source, optionPool: saved.optionPool } : { source: added!.source, optionPool: added!.source === 'option' ? added!.pool : null },
                )
                const title = saved ? listedLabel(saved) : added!.source === 'sku' ? added!.code : added!.value
                const savedFabric = saved?.source === 'option' && isFabricSeriesPool(saved.optionPool)
                const series = savedFabric ? seriesByKey.get(valueKey(saved!.optionValue)) : undefined
                const special = saved?.source === 'option' && !savedFabric ? specialByKey.get(specialKey(saved.optionPool, saved.optionValue)) : undefined
                const name = saved
                  ? saved.source === 'sku'
                    ? saved.name
                    : savedFabric
                      ? series ? fabricCount(series.fabrics) : null
                      : special && special.label !== special.value ? special.label : null
                  : added!.name
                const going = saved ? draft.removing.has(saved.id) : false
                // Said only when known: a pool or a fabric list that could not be read names nothing gone.
                const outOfErp = saved
                  ? saved.source === 'sku'
                    ? !!saved.erpId && gone.has(saved.erpId)
                    : savedFabric
                      ? fabricSeries.length > 0 && (!series || series.removed)
                      : specials.length > 0 && (!special || special.removed)
                  : false
                const text = draft.amounts.get(line.key)
                const edited = text !== undefined && (!saved || amountDiffers(text, saved.amount))
                return (
                  <tr key={line.key} className={added ? 'bg-accent-bg/60' : undefined}>
                    <td>
                      <span className={`font-medium whitespace-nowrap ${going ? 'line-through' : ''}`}>{title}</span>
                      {added ? <span className="chip accent ml-2">New</span> : null}
                      {going ? <span className="chip danger ml-2">Coming off</span> : null}
                      {outOfErp && !going ? (
                        <span className="chip alert ml-2" title="The ERP no longer has it, so no new bill can carry it">Gone from the ERP</span>
                      ) : null}
                    </td>
                    <td className={going ? 'line-through' : undefined}>{name ?? '—'}</td>
                    <td>{kind.kind}</td>
                    <td>{kind.counted}</td>
                    <td className="num">
                      {going ? (
                        <span className="line-through">{saved ? formatMoneyBare(saved.amount) : ''}</span>
                      ) : (
                        <input
                          value={text ?? (saved ? String(saved.amount) : '')}
                          onChange={e => setAmount(line.key, e.target.value)}
                          disabled={saving}
                          inputMode="decimal"
                          placeholder="0.00"
                          aria-label={`${title} KPI amount`}
                          className={`${INPUT} w-28 text-right tabular-nums ${edited ? 'border-accent bg-accent-bg' : ''}`}
                        />
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {added ? (
                        <button type="button" className={`${LINK} text-danger`} disabled={saving} onClick={() => takeOff(line.key)} aria-label={`Take ${title} off`}>
                          Take off
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`${LINK} ${going ? '' : 'text-danger'}`}
                          disabled={saving}
                          onClick={() => toggleRemove(line.key)}
                          aria-label={`${going ? 'Keep' : 'Remove'} ${title}`}
                        >
                          {going ? 'Keep' : 'Remove'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-sm py-6">
                    {subName} has no KPI items yet — pick one above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="table-frame-foot">
          <span>
            {plural(count, 'item')}
            {changes > 0 ? ` · ${plural(changes, 'change')} not saved` : ''}
          </span>
          <span className="inline-flex items-center gap-2">
            <button type="button" className={BUTTON_QUIET} disabled={saving || changes === 0} onClick={cancel}>
              Cancel
            </button>
            <button type="button" className={BUTTON_PRIMARY} disabled={saving || changes === 0} onClick={save}>
              {pending ? 'Saving…' : settling ? 'Saved' : changes === 0 ? 'Save changes' : `Save ${plural(changes, 'change')}`}
            </button>
          </span>
        </div>
      </div>

      <ThresholdLadder data={data} scheme={scheme} />
    </section>
  )
}

/**
 * The quantity bonus on top (the old section V, on this tab since 2026-10-08):
 * every KPI unit of the month together, and the highest rung reached lifts the
 * WHOLE KPI amount by its % — the run's `kpi_threshold` line. The user kept it
 * as it was (2026-10-08) rather than a threshold per item.
 */
function ThresholdLadder({ data, scheme }: { data: CommissionSettingsData; scheme: SchemeRow }) {
  return (
    <div className="mt-10">
      <SectionHead title="Threshold ladder" count={`${data.kpiThresholds.length} RUNG${data.kpiThresholds.length === 1 ? '' : 'S'}`} />
      <div className="overflow-x-auto">
        <table className="ledger-table" aria-label="KPI threshold ladder">
          <thead>
            <tr>
              <th>Tier</th>
              <th className="right">Minimum units</th>
              <th className="right">Bonus %</th>
              <th className="w-32"></th>
            </tr>
          </thead>
          <tbody>
            {data.kpiThresholds.map(t => (
              <RowForm key={t.id} action={upsertKpiThreshold}>
                {({ pending }) => (
                  <tr>
                    <td>
                      <Hidden name="id" value={t.id} />
                      <Hidden name="scheme_id" value={scheme.id} />
                      <Hidden name="effective_from" value={t.effective_from} />
                      <Field name="tier_label" defaultValue={t.tier_label} width="w-32" ariaLabel={`${t.tier_label ?? 'Tier'} label`} />
                    </td>
                    <td className="num">
                      <Field name="min_qty" type="number" step="1" width="w-24" defaultValue={t.min_qty} ariaLabel={`${t.tier_label ?? 'Tier'} minimum units`} />
                    </td>
                    <td className="num">
                      <Field name="bonus_pct" type="number" step="0.01" width="w-24" defaultValue={toPct(t.bonus_pct)} ariaLabel={`${t.tier_label ?? 'Tier'} bonus percent`} />
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-3">
                        <SaveButton pending={pending} />
                        <ActionButton run={() => deleteKpiThreshold(t.id)} label="Remove" danger />
                      </span>
                    </td>
                  </tr>
                )}
              </RowForm>
            ))}
            <RowForm action={upsertKpiThreshold}>
              {({ pending }) => (
                <tr className="bg-surface-2/40">
                  <td>
                    <Hidden name="scheme_id" value={scheme.id} />
                    <Field name="tier_label" placeholder="Tier 2" width="w-32" ariaLabel="new tier label" />
                  </td>
                  <td className="num"><Field name="min_qty" type="number" step="1" width="w-24" placeholder="25" required ariaLabel="new tier minimum units" /></td>
                  <td className="num"><Field name="bonus_pct" type="number" step="0.01" width="w-24" placeholder="35" required ariaLabel="new tier bonus percent" /></td>
                  <td><SaveButton pending={pending} label="Add" /></td>
                </tr>
              )}
            </RowForm>
          </tbody>
        </table>
      </div>
    </div>
  )
}
