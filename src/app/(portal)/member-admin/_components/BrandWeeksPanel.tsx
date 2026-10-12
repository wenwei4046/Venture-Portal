'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { fetchBrandWeeksAdmin } from '../brand-weeks-actions'
import { arenaShortDay } from '@/lib/member/arena'
import { brandWeeksAdminRows, type BrandWeekBooth, type BrandWeekCell, type BrandWeeksAdminSnapshot } from '@/lib/member/brand-weeks-admin'
import { weekBrand } from '@/lib/member/member-services'
import { formatIntlDate, formatMoney } from '@/lib/utils'
import s from './member-services.module.css'
import { Select } from '@/components/hrv/select'

const thisMonth = () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()).slice(0, 7)
const monthLabel = (period: string) => formatIntlDate(new Date(`${period}-01T00:00:00Z`), { month: 'short', year: 'numeric', timeZone: 'UTC' }, 'en-GB')
const shift = (period: string, by: number) => {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const bills = (n: number) => `${n} bill${n === 1 ? '' : 's'}`
const brandName = (code: string | null) => (code ? weekBrand(code)?.name ?? code : 'No brand')
const days = (start: string | null, end: string | null) =>
  start ? (end && end !== start ? `${arenaShortDay(start)} – ${arenaShortDay(end)}` : arenaShortDay(start)) : null
const receivedOn = (at: string) =>
  formatIntlDate(new Date(at), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }, 'en-GB')

/** What a cell's tooltip says: where it counts and why, then each booth the member wrote at. */
function cellTitle(cell: BrandWeekCell): string {
  const why =
    cell.state === 'erp'
      ? [
          `The ERP's Sales Attending lists them at ${brandName(cell.brand)} · ${cell.erp?.venue ?? 'a booth'}${days(cell.erp?.start ?? null, cell.erp?.end ?? null) ? ` (${days(cell.erp?.start ?? null, cell.erp?.end ?? null)})` : ''}`,
          (cell.erp?.booths ?? 1) > 1 ? `Listed at ${cell.erp?.booths} booths that weekend — the one with the most of their bills counts` : null,
          cell.soldElsewhere ? 'None of their bills is at that booth, so no place of theirs earns points this week' : null,
        ]
      : cell.state === 'auto'
        ? [`The ERP lists them at no booth — auto-located at ${brandName(cell.brand)}, where they wrote the most bills`]
        : [cell.booths.length ? 'No brand to place' : 'Not in the ERP’s Sales Attending, and no bills at a fair this week']
  const booths = cell.booths.map((b: BrandWeekBooth) =>
    `${brandName(b.brand)} · ${b.venue} — ${bills(b.orders)}, ${formatMoney(b.sales)}${b.held > 0 ? ` · ${formatMoney(b.held)} held below the deposit` : ''}${b.scoring ? ' · earns the points' : ''}`)
  return [...why.filter(Boolean), ...booths].join('\n')
}

/**
 * Member services › Brand weeks: a department's month, one row per member, one
 * chip per Friday's week. Read only since 2026-10-12 (the user: the ERP's
 * Sales Attending fixes where every salesperson works, so nobody picks a brand
 * week): a solid chip is the booth the ERP lists the member at, a dashed one a
 * weekend it lists them nowhere — the booth with the most of their bills
 * counts. The booths and bills are in each chip's tooltip; a wrong week is
 * changed in the ERP. Read when the tab is first opened (a user's click, never
 * a page's own Server Action) and again on ‹ ›.
 */
export default function BrandWeeksPanel({ departments }: { departments: Array<{ id: string; name: string }> }) {
  const [subId, setSubId] = useState(() => (departments.find(d => d.name.trim().toLowerCase() === 'fair') ?? departments[0])?.id ?? '')
  const [period, setPeriod] = useState(thisMonth)
  const [snapshot, setSnapshot] = useState<BrandWeeksAdminSnapshot | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const sequence = useRef(0)

  useEffect(() => {
    if (!subId) return
    const at = ++sequence.current
    let alive = true
    setBusy(true)
    setError('')
    void fetchBrandWeeksAdmin(subId, period)
      .then(result => {
        if (!alive || sequence.current !== at) return
        if (result.ok) setSnapshot(result.data)
        else {
          setSnapshot(null)
          setError(result.error)
        }
      })
      .catch(() => {
        if (alive && sequence.current === at) setError('Brand weeks could not be loaded. Please try again.')
      })
      .finally(() => {
        if (alive && sequence.current === at) setBusy(false)
      })
    return () => {
      alive = false
    }
  }, [subId, period])

  if (!departments.length) return <p className={s.empty}>There is no Revenue sub-department to show brand weeks for.</p>

  const rows = snapshot ? brandWeeksAdminRows(snapshot) : []
  const weeks = snapshot?.weeks ?? []
  const cols = `minmax(0,1.4fr) repeat(${Math.max(weeks.length, 1)},minmax(0,1fr))`
  const sub = departments.find(d => d.id === subId)
  const unlisted = snapshot?.unlisted ?? []

  return (
    <section aria-labelledby="bw-title">
      <div className={s.bwHead}>
        <h2 id="bw-title" className={s.bwTitle}>Brand weeks</h2>
        <span className={s.bwSub}>From the ERP&apos;s Sales Attending — change who attends a booth there.</span>
        <span className={s.spacer} />
        {departments.length > 1 ? (
          <Select
            plain
            className={s.subChip}
            aria-label="Sub-department"
            value={subId}
            onChange={e => {
              setSubId(e.target.value)
              setSnapshot(null)
            }}
          >
            {departments.map(d => (
              <option key={d.id} value={d.id}>Revenue · {d.name}</option>
            ))}
          </Select>
        ) : (
          <span className={s.subChip}>Revenue · {sub?.name}</span>
        )}
        <span className={s.stepper}>
          <button type="button" className={s.stepBtn} aria-label="Previous month" onClick={() => setPeriod(p => shift(p, -1))}>
            ‹
          </button>
          <span className={s.stepLabel}>{monthLabel(period)}</span>
          <button
            type="button"
            className={s.stepBtn}
            aria-label="Next month"
            disabled={period >= thisMonth()}
            onClick={() => setPeriod(p => shift(p, 1))}
          >
            ›
          </button>
        </span>
      </div>

      {error ? <p className={s.alert} role="alert">{error}</p> : null}

      <div className={s.bwScroll}>
        <div className={s.bwFrame} role="table" aria-label={`Brand weeks, ${monthLabel(period)}`}>
          <div className={s.bwHeadRow} role="row" style={{ gridTemplateColumns: cols }}>
            <span role="columnheader">Member</span>
            {weeks.map(lock => (
              <span key={lock.week} role="columnheader">Fri {Number(lock.week.slice(8, 10))}</span>
            ))}
          </div>
          {busy && !snapshot ? <div className={s.loading}>Loading brand weeks…</div> : null}
          {rows.map(({ person, cells }) => (
            <div key={person.id} className={s.bwRow} role="row" style={{ gridTemplateColumns: cols }}>
              <span className={s.bwName} role="cell" title={[person.title, person.hasLogin ? null : 'No member login'].filter(Boolean).join(' · ') || undefined}>
                {person.name}
              </span>
              {cells.map(cell => {
                const shown = weekBrand(cell.brand)
                const label = cell.state === 'none' ? 'No fair' : shown?.name ?? cell.brand ?? 'No brand'
                const where = cell.state === 'erp' ? cell.erp?.venue ?? null : cell.state === 'auto' ? cell.booths.find(b => b.scoring)?.venue ?? null : null
                return (
                  <span key={cell.week} className={s.bwCell} role="cell">
                    <span
                      className={s.bwChip}
                      data-guess={cell.state === 'auto' ? 'true' : undefined}
                      data-none={cell.state === 'none' ? 'true' : undefined}
                      style={shown ? ({ '--bw-fg': shown.fg, '--bw-bg': shown.bg } as CSSProperties) : undefined}
                      title={cellTitle(cell)}
                      aria-label={`${person.name}, week of ${cell.week}: ${label}${cell.state === 'erp' ? ' (the ERP’s Sales Attending)' : cell.state === 'auto' ? ' (auto-located)' : ''}`}
                    >
                      <span className={s.bwDot} aria-hidden="true" />
                      {label}
                    </span>
                    {/* "No bills" first, so a narrow column cuts the venue, never the warning. */}
                    {where ? <span className={s.bwWhere}>{cell.soldElsewhere ? 'No bills · ' : ''}{where}</span> : null}
                  </span>
                )
              })}
            </div>
          ))}
          {snapshot && rows.length === 0 ? <div className={s.loading}>Nobody is a member of {sub?.name ?? 'this sub-department'} yet.</div> : null}
        </div>
      </div>
      <div className={s.foot}>
        A solid chip is the booth the ERP lists the member at; that booth alone earns their Fair result points that week. A dashed one is a
        weekend the ERP lists them nowhere — the booth with the most of their bills counts. Hover a chip for its booths and bills.
        {snapshot?.erpReceivedAt ? ` Last sent by the ERP ${receivedOn(snapshot.erpReceivedAt)}.` : ' The ERP has not sent its Sales Attending yet.'}
        {unlisted.length ? ` Listed in the ERP but not matched to a member here: ${unlisted.join(', ')}.` : ''}
      </div>
    </section>
  )
}
