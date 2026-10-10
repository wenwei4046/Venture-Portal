'use client'

import { Fragment, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { rankPayLabelOf } from '@/lib/commission/ranks'
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
  const cols = canManage ? '120px 140px minmax(0,1fr) 150px' : '120px 140px minmax(0,1fr)'

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
      <SectionTop title="Ranks" desc="The rates a title pays from, lettered from the top of the catalogue." />
      {error ? <p className={s.saveError} role="alert">{error}</p> : null}
      <GridTable label="Ranks">
        <GridHead
          cols={cols}
          cellStyle={{ padding: '12px 14px' }}
          cells={['Rank', { label: 'Product rate', style: { textAlign: 'right' } }, 'Held by (shown)', ...(canManage ? [''] : [])]}
        />
        {catalogue.map(d => {
          const label = `Rank ${letters.get(d.id) ?? '?'}`
          return (
            <Fragment key={d.id}>
              <GridRow cols={cols}>
                <span role="cell" style={{ padding: '11px 14px', fontWeight: 500 }}>{label}</span>
                <span role="cell" className={`${hv.right} ${hv.mono}`} style={{ padding: '11px 14px' }}>{rankPayLabelOf(d)}</span>
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
