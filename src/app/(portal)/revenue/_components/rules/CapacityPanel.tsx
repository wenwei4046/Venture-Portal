'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { hv } from '@/components/hrv/kit'
import { flash } from '@/components/hrv/toast'
import { capacityCards, capacityRefusal, type SubDepartmentCapacity } from '@/lib/commission/capacity'
import { revenuePath } from '@/lib/revenue'
import { saveSubDepartmentCapacity } from '../../capacity-actions'
import { SectionTop } from './SectionTop'
import s from './rules.module.css'

// Rules › Capacity (2026-10-10, the HR revamp): the headcount limit moved here
// from Member services — the four figures, the limit and its Save, and how
// many are waiting for a seat. The figures come with the page
// (`member_capacity_of`); a save answers with the fresh ones.

/** What the page read: the figures, or why there are none. */
export type CapacityInitial = { ok: true; data: SubDepartmentCapacity } | { ok: false; reason: string }

const limitOf = (c: SubDepartmentCapacity) => (c.capacity === null ? '' : String(c.capacity))

export default function CapacityPanel({
  subDepartmentId,
  subName,
  subSlug,
  initial,
}: {
  subDepartmentId: string
  subName: string
  subSlug: string
  initial: CapacityInitial
}) {
  const [data, setData] = useState<SubDepartmentCapacity | null>(initial.ok ? initial.data : null)
  const [draft, setDraft] = useState(initial.ok ? limitOf(initial.data) : '')
  const [pending, start] = useTransition()
  // The page read again (a save here, or anywhere on Rules): follow it.
  const [seen, setSeen] = useState(initial)
  if (seen !== initial) {
    setSeen(initial)
    setData(initial.ok ? initial.data : null)
    setDraft(initial.ok ? limitOf(initial.data) : '')
  }

  function save() {
    if (!data || pending) return
    const refused = capacityRefusal(draft, data)
    if (refused) {
      flash(refused)
      return
    }
    start(async () => {
      const res = await saveSubDepartmentCapacity(subDepartmentId, draft)
      if (!res.ok) {
        flash(res.reason)
        return
      }
      setData(res.data)
      setDraft(limitOf(res.data))
      flash(`${subName} capacity set to ${res.data.capacity} — matching runs against it`)
    })
  }

  return (
    <>
      <SectionTop title="Capacity" />
      {!data ? (
        <p className={s.saveError} role="alert" style={{ margin: 0 }}>
          {initial.ok ? 'The capacity could not be read.' : initial.reason}
        </p>
      ) : (
        <>
          <section className={s.capCards} aria-label={`${subName} capacity`}>
            {capacityCards(data).map(c => (
              <div className={s.capCard} key={c.label} role="group" aria-label={c.label}>
                <div className={s.capLabel}>{c.label}</div>
                <div className={s.capValue}>{c.value}</div>
              </div>
            ))}
          </section>
          <form
            className={s.limit}
            onSubmit={e => {
              e.preventDefault()
              save()
            }}
          >
            <div style={{ flex: 1 }}>
              <div className={s.limitTitle}>Headcount limit</div>
              <div className={s.limitSub}>Can&apos;t go below active members plus reserved positions.</div>
            </div>
            <input
              className={s.limitInput}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Limit"
              inputMode="numeric"
              aria-label="Headcount limit"
              disabled={pending}
            />
            <button type="submit" className={`${hv.btn} ${hv.primary}`} style={{ padding: '7px 16px' }} disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </button>
          </form>
          <div className={s.queue}>
            {data.waiting} waiting for a seat ·{' '}
            <Link href={`${revenuePath(subSlug, 'hierarchy')}?tab=waiting`}>Open Sales Groups › Waiting list</Link>
          </div>
        </>
      )}
    </>
  )
}
