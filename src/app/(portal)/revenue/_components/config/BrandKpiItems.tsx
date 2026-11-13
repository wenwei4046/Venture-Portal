'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoneyBare } from '@/lib/utils'
import { valueKey } from '@/lib/catalogue/keys'
import { kpiItemKind } from '@/lib/commission/kpi'
import { MAX_KPI_TIERS, validateKpiItems } from '@/lib/catalogue/rule-edits'
import {
  bonusDiffers,
  brandKpiChanges,
  brandKpiEditOf,
  brandKpiTitle,
  EMPTY_BRAND_KPI_DRAFT,
  specialsLeft,
  tierDrafts,
  tiersDiffer,
  toBrandKpiListed,
  type BrandKpiDraft,
  type BrandKpiListed,
  type TierDraft,
} from '@/lib/commission/brand-kpi-edit'
import { SectionHead } from '@/components/RowForm'
import { Select } from '@/components/hrv/select'
import { saveKpiItems } from '../../kpi-actions'
import type { BrandKpiSpecialRow, BrandRow, CommissionSettingsData, KpiItemRow, SchemeRow } from './types'

const INPUT =
  'px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink focus:outline-none focus:border-accent-border disabled:opacity-60'
const BUTTON_QUIET =
  'bg-surface hover:bg-surface-2 border border-hairline text-ink text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-50'
const LINK = 'text-xs font-sans hover:underline disabled:opacity-50'
const CHANGED = 'border-accent bg-accent-bg'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const COUNTED = kpiItemKind({ source: 'option', optionPool: 'sofa_specials', brandCode: 'brand' }).counted
const NO_ITEMS: KpiItemRow[] = []
const NO_SPECIALS: BrandKpiSpecialRow[] = []

/**
 * The KPI items of the brands on their own commission scheme (2026-11-12 —
 * 2990s; the user: "这个 KPI item 是独立的，属于 2990 专属的 KPI item … KPI item
 * 那边我是可以手动去加的"): a sofa special of the brand's own ERP company, found
 * on its bills where the bill charges for it — what it charged off the bill's
 * sales, the bonus a unit paid, at the tier the month's units reach. Paid
 * whatever the sub-department's KPI switch says, so the head says *Always
 * paid*.
 *
 * One block a brand, each with its own draft and its own Save (2026-11-13):
 * the bonus retyped, tiers added, retyped or dropped, an item taken off, a
 * special of the brand's pool added under a name of its own. Whoever may not
 * manage the rules reads the list — and sees a brand only once it has an item.
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
  // The specials a brand's item may be: its own ERP company's sofa specials — the ERP's first company's (the
  // sub-department's own picker reads those) for a brand that names no company, as the database reads it.
  const brandSpecials = data.brandKpiSpecials ?? NO_SPECIALS
  const ownSpecials = data.kpiSpecials
  const poolOf = useMemo(() => {
    const by = new Map<number, BrandKpiSpecialRow[]>()
    for (const row of brandSpecials) {
      const list = by.get(row.companyId)
      if (list) list.push(row)
      else by.set(row.companyId, [row])
    }
    if (!by.has(1)) {
      by.set(1, ownSpecials.filter(o => o.pool === 'sofa_specials')
        .map(o => ({ companyId: 1, value: o.value, label: o.label, sort_order: o.sort_order, removed: o.removed })))
    }
    return by
  }, [brandSpecials, ownSpecials])

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
          pool={poolOf.get(brand.erp_company_id ?? 1) ?? NO_SPECIALS}
          canManage={canManage}
        />
      ))}
    </>
  )
}

function BrandKpiBlock({ brand, scheme, items, pool, canManage }: {
  brand: BrandRow
  scheme: SchemeRow
  items: KpiItemRow[]
  pool: BrandKpiSpecialRow[]
  canManage: boolean
}) {
  const router = useRouter()
  const listed = useMemo(() => items.map(toBrandKpiListed).sort((a, b) => brandKpiTitle(a).localeCompare(brandKpiTitle(b))), [items])
  const [draft, setDraft] = useState<BrandKpiDraft>(EMPTY_BRAND_KPI_DRAFT)
  const [pick, setPick] = useState('')
  const [pickName, setPickName] = useState('')
  const [pickAmount, setPickAmount] = useState('')
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
  const left = useMemo(() => specialsLeft(pool, listed, draft), [pool, listed, draft])
  const poolByKey = useMemo(() => new Map(pool.map(o => [valueKey(o.value), o])), [pool])
  const picked = left.includes(pick) ? pick : left[0] ?? ''

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

  function update(change: (d: BrandKpiDraft) => BrandKpiDraft) {
    setDraft(change)
    setError(null)
    setNotice(null)
  }
  const setAmount = (id: string, text: string) => update(d => ({ ...d, amounts: new Map(d.amounts).set(id, text) }))
  const setTiers = (item: BrandKpiListed, change: (tiers: TierDraft[]) => TierDraft[]) =>
    update(d => ({ ...d, tiers: new Map(d.tiers).set(item.id, change([...(d.tiers.get(item.id) ?? tierDrafts(item.tiers))])) }))
  const setAdded = (key: string, change: (a: BrandKpiDraft['added'][number]) => BrandKpiDraft['added'][number]) =>
    update(d => ({ ...d, added: d.added.map(a => (a.key === key ? change(a) : a)) }))
  function toggleRemove(id: string) {
    update(d => {
      const removing = new Set(d.removing)
      if (removing.has(id)) removing.delete(id)
      else removing.add(id)
      return { ...d, removing }
    })
  }
  function add() {
    if (!picked) return
    update(d => ({ ...d, added: [...d.added, { key: `new:${valueKey(picked)}`, special: picked, name: pickName, amount: pickAmount, tiers: [] }] }))
    setPick('')
    setPickName('')
    setPickAmount('')
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
      {error ? <p className="sheet-danger" role="alert">{error}</p> : null}
      {notice ? <p className="sheet-notice" role="status">{notice}</p> : null}
      <div className="table-frame">
        <div className="table-frame-scroll">
          <table className="ledger-table" aria-label={`${brand.name} KPI items`}>
            <thead>
              <tr>
                <th>Item</th>
                <th className="whitespace-nowrap">Counted</th>
                <th className="right whitespace-nowrap">Bonus a unit · RM</th>
                <th>By the month&apos;s units</th>
                {canManage ? <th className="w-24 relative"><span className="sr-only">Remove</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {listed.map(item => {
                const title = brandKpiTitle(item)
                const going = draft.removing.has(item.id)
                const amount = draft.amounts.get(item.id)
                const tiers = draft.tiers.get(item.id)
                // Said only when known: a pool that could not be read names nothing gone.
                const inPool = poolByKey.get(valueKey(item.special))
                const outOfErp = pool.length > 0 && (!inPool || inPool.removed)
                return (
                  <tr key={item.id}>
                    <td>
                      <span className={`font-medium ${going ? 'line-through' : ''}`}>{title}</span>
                      {going ? <span className="chip danger ml-2">Coming off</span> : null}
                      {outOfErp && !going ? (
                        <span className="chip alert ml-2" title="The ERP no longer has it, so no new bill can carry it">Gone from the ERP</span>
                      ) : null}
                      {/* The ERP's own name of the special the item is found by. */}
                      {item.name ? <div className="text-[11px] mt-0.5">{item.special}</div> : null}
                    </td>
                    <td className="whitespace-nowrap">{COUNTED}</td>
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
              {draft.added.map(a => {
                const title = a.name.trim() || a.special
                return (
                  <tr key={a.key} className="bg-accent-bg/60">
                    <td>
                      <span className="font-medium">{title}</span>
                      <span className="chip accent ml-2">New</span>
                      {a.name.trim() ? <div className="text-[11px] mt-0.5">{a.special}</div> : null}
                    </td>
                    <td className="whitespace-nowrap">{COUNTED}</td>
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
              {listed.length + draft.added.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="text-center text-sm py-6">{brand.name} has no KPI items yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {canManage ? (
          <div className="table-frame-foot">
            <span className="inline-flex flex-wrap items-center gap-2">
              {left.length > 0 ? (
                <>
                  {/* HR's pages draw every select as the soft dropdown (`soft-select-coverage.test.ts`). */}
                  <Select bare value={picked} onChange={e => setPick(e.target.value)} disabled={saving}
                    aria-label={`${brand.name} special to add`} className={`${INPUT} max-w-[14rem]`}>
                    {left.map(value => {
                      const label = poolByKey.get(valueKey(value))?.label
                      return <option key={value} value={value}>{label && label !== value ? `${value} · ${label}` : value}</option>
                    })}
                  </Select>
                  <input value={pickName} onChange={e => setPickName(e.target.value)} disabled={saving} maxLength={120}
                    placeholder="Name" aria-label={`${brand.name} new item name`} className={`${INPUT} w-40`} />
                  <input value={pickAmount} onChange={e => setPickAmount(e.target.value)} disabled={saving} inputMode="decimal"
                    placeholder="0.00" aria-label={`${brand.name} new item bonus a unit`} className={`${INPUT} w-24 text-right tabular-nums`} />
                  <button type="button" className={BUTTON_QUIET} disabled={saving} onClick={add}
                    aria-label={`Add ${brand.name} item`}>
                    Add item
                  </button>
                </>
              ) : (
                <span>{plural(count, 'item')}</span>
              )}
              {changes > 0 ? <span>{plural(changes, 'change')} not saved</span> : null}
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
