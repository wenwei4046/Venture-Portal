'use client'

import { Fragment, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ratePct, rankPayLabelOf } from '@/lib/commission/ranks'
import { BRAND_RATE_FIELD, brandRateOf, namesBrandRate, readBrandRates, type BrandRated } from '@/lib/commission/brand-rates'
import { GridHead, GridRow, GridTable, hv } from '@/components/hrv/kit'
import { flash } from '@/components/hrv/toast'
import { removeRankDef, saveRankDef } from '../../config-actions'
import { catalogueLetters, catalogueTopDown } from '../config/RulesTables'
import type { CommissionSettingsData, SchemeRow } from '../config/types'
import { SectionTop } from './SectionTop'
import s from './rules.module.css'

// Rules › Ranks (2026-10-10, the HR revamp): the catalogue as the prototype
// lists it — Rank · Product rate · Held by (shown) — top down. A rank is its
// pay (a percentage, or a group package for IR); the letter is its place from
// the top, never typed. Whoever may manage the rules edits a rank in place
// (rate, package, subsidy cap) and adds one under the list; a rank no title
// sits on can be removed.
//
// A brand that follows its own scheme (2026-11-11 — 2990s) has a column of its
// own, *2990s rate*: what each rank pays on that brand's bills. A rank that
// names none shows, muted, the rate it follows (the nearest rank below that
// has one — `brandRateOf`); its box in the editor is then empty.

const pct = (n: number) => String(Math.round(Number(n) * 10000) / 100)

export default function RanksPanel({
  data,
  scheme,
  holders,
  canManage,
}: {
  data: CommissionSettingsData
  scheme: SchemeRow
  holders: Record<string, string[]>
  canManage: boolean
}) {
  const router = useRouter()
  const letters = catalogueLetters(data)
  const catalogue = catalogueTopDown(data)
  const taken = new Set(data.ranks.map(r => r.rank_def_id))
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  // The brands on their own scheme, and the catalogue as their rate rule reads it (rates keyed by the brand's id).
  const ownBrands = data.brands.filter(b => b.own_scheme && b.is_active)
  const rated = new Map<string, BrandRated>(data.rankDefs.map(d => [d.id, {
    sortOrder: d.sort_order,
    productRate: Number(d.product_rate),
    brandRates: readBrandRates(d.brand_rates),
  }]))
  const ladder = [...rated.values()]
  const brandCols = ownBrands.map(() => ' 130px').join('')
  const cols = canManage ? `120px 140px${brandCols} minmax(0,1fr) 150px` : `120px 140px${brandCols} minmax(0,1fr)`

  function save(fd: FormData, label: string) {
    setError('')
    start(async () => {
      const res = await saveRankDef(fd)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      setEditing(null)
      router.refresh()
      flash(`${label} saved — every rung on it pays the new rate`)
    })
  }

  function remove(id: string, label: string) {
    if (!window.confirm(`Remove ${label}? No title sits on it.`)) return
    setError('')
    start(async () => {
      const res = await removeRankDef(id)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      router.refresh()
      flash(`${label} removed`)
    })
  }

  const editor = (key: string, d: { id?: string; product_rate?: number; group_incentive_amount?: number; group_subsidy_cap?: number } | null, label: string) => (
    <form
      className={s.rankEdit}
      onSubmit={e => {
        e.preventDefault()
        save(new FormData(e.currentTarget), label)
      }}
      aria-label={`Edit ${label}`}
    >
      {d?.id ? <input type="hidden" name="id" value={d.id} /> : null}
      <input type="hidden" name="scheme_id" value={scheme.id} />
      <label>
        Rate{' '}
        <input className={s.rankInput} name="product_rate" type="number" step="0.01" required defaultValue={d ? pct(d.product_rate ?? 0) : ''} placeholder="11" aria-label="Rate percent" /> %
      </label>
      <label>
        Group incentive RM{' '}
        <input className={s.rankInput} name="group_incentive_amount" type="number" step="0.01" defaultValue={d?.group_incentive_amount ?? 0} aria-label="Group incentive RM" />
      </label>
      <label>
        Subsidy cap RM{' '}
        <input className={s.rankInput} name="group_subsidy_cap" type="number" step="0.01" defaultValue={d?.group_subsidy_cap ?? 0} aria-label="Subsidy cap RM" />
      </label>
      {ownBrands.map(b => {
        const rank = d?.id ? rated.get(d.id) : undefined
        const own = rank?.brandRates?.[b.id.toLowerCase()]
        return (
          <label key={b.id}>
            {b.name} rate{' '}
            <input
              className={s.rankInput}
              name={`${BRAND_RATE_FIELD}${b.id}`}
              type="number"
              step="0.01"
              min="0"
              max="100"
              defaultValue={own === undefined ? '' : pct(own)}
              // An empty box: the rank names none, and pays the rate shown here.
              placeholder={rank ? pct(brandRateOf(rank, b.id, ladder)) : ''}
              aria-label={`${b.name} rate percent`}
            />{' '}
            %
          </label>
        )
      })}
      <span style={{ flex: 1 }} />
      <button type="button" className={hv.linkBtn} onClick={() => setEditing(null)}>
        Cancel
      </button>
      <button type="submit" className={`${hv.btn} ${hv.primary}`} disabled={pending} style={{ padding: '6px 14px', fontSize: 12.5 }}>
        {pending ? 'Saving…' : key === 'new' ? 'Add' : 'Save'}
      </button>
    </form>
  )

  return (
    <>
      <SectionTop title="Ranks" />
      {error ? <p className={s.saveError} role="alert">{error}</p> : null}
      <GridTable label="Ranks">
        <GridHead
          cols={cols}
          cellStyle={{ padding: '12px 14px' }}
          cells={[
            'Rank',
            { label: 'Product rate', style: { textAlign: 'right' } },
            ...ownBrands.map(b => ({ label: `${b.name} rate`, style: { textAlign: 'right' as const } })),
            'Held by (shown)',
            ...(canManage ? [''] : []),
          ]}
        />
        {catalogue.map(d => {
          const label = `Rank ${letters.get(d.id) ?? '?'}`
          const rank = rated.get(d.id)
          return (
            <Fragment key={d.id}>
              <GridRow cols={cols}>
                <span role="cell" style={{ padding: '11px 14px', fontWeight: 500 }}>{label}</span>
                <span role="cell" className={`${hv.right} ${hv.mono}`} style={{ padding: '11px 14px' }}>{rankPayLabelOf(d)}</span>
                {ownBrands.map(b => {
                  // A package rank pays its package, never a rate.
                  if (!rank || Number(d.group_incentive_amount) > 0) {
                    return <span key={b.id} role="cell" className={`${hv.right} ${hv.mono}`} style={{ padding: '11px 14px' }}>—</span>
                  }
                  const own = namesBrandRate(rank, b.id)
                  return (
                    <span
                      key={b.id}
                      role="cell"
                      className={`${hv.right} ${hv.mono}`}
                      style={{ padding: '11px 14px', color: own ? undefined : 'rgb(var(--hv-brown))' }}
                      title={own ? undefined : `No ${b.name} rate of its own — it pays the nearest rank below that has one`}
                      data-own={own ? 'yes' : 'no'}
                    >
                      {ratePct(brandRateOf(rank, b.id, ladder))}
                    </span>
                  )
                })}
                <span role="cell" style={{ padding: '11px 14px', color: 'rgb(var(--hv-body-2))' }}>{(holders[d.id] ?? []).join(', ') || '—'}</span>
                {canManage ? (
                  <span role="cell" className={s.rowActions}>
                    <button type="button" className={hv.linkBtn} onClick={() => setEditing(editing === d.id ? null : d.id)}>
                      Edit
                    </button>
                    {!taken.has(d.id) ? (
                      <button type="button" className={hv.linkBtn} style={{ color: 'rgb(var(--hv-danger))' }} onClick={() => remove(d.id, label)} disabled={pending}>
                        Remove
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </GridRow>
              {editing === d.id ? editor(d.id, d, label) : null}
            </Fragment>
          )
        })}
        {canManage ? (
          editing === 'new' ? (
            editor('new', null, 'New rank')
          ) : (
            <button type="button" className={s.addRow} onClick={() => setEditing('new')}>
              + Add rank
            </button>
          )
        ) : null}
      </GridTable>
      {catalogue.length === 0 ? <p className="sheet-warning">No ranks yet — add one; a title needs one to pay.</p> : null}
    </>
  )
}
