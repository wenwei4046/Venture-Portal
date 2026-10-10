'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { flash } from '@/components/hrv/toast'
import { fetchBrandWeeksAdmin, saveBrandWeeksAdmin } from '../brand-weeks-actions'
import { arenaShortDay, type ArenaWeekBrand, type ArenaWeekPicks } from '@/lib/member/arena'
import { brandWeekChanges, brandWeeksAdminRows, brandWeeksToSave, type BrandWeekBooth, type BrandWeekCell, type BrandWeeksAdminSnapshot } from '@/lib/member/brand-weeks-admin'
import { nextWeekBrand, weekBrand, weeksChangedText } from '@/lib/member/member-services'
import { formatIntlDate, formatMoney } from '@/lib/utils'
import s from './member-services.module.css'

const thisMonth = () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()).slice(0, 7)
const monthLabel = (period: string) => formatIntlDate(new Date(`${period}-01T00:00:00Z`), { month: 'short', year: 'numeric', timeZone: 'UTC' }, 'en-GB')
const shift = (period: string, by: number) => {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const copy = (picks: Record<string, ArenaWeekPicks>) => Object.fromEntries(Object.entries(picks).map(([id, weeks]) => [id, { ...weeks }]))
const bills = (n: number) => `${n} bill${n === 1 ? '' : 's'}`

/** What a cell's tooltip says: what is stored, then each booth the member wrote at. */
const brandName = (code: string | null) => (code ? weekBrand(code)?.name ?? code : 'No brand')

function cellTitle(cell: BrandWeekCell): string {
  const stored =
    cell.state === 'picked'
      ? cell.pickedElsewhere ? `Picked ${brandName(cell.pick)} — no booth of it this week, so no place scores` : `Picked ${brandName(cell.pick)}`
      : cell.state === 'unconfirmed'
        ? `Not picked yet — ${cell.scoringBrand ? brandName(cell.scoringBrand) : 'the booth with the most bills'} counts until the week closes`
        : cell.state === 'auto'
          ? `Nobody picked — auto-located at ${cell.scoringBrand ? brandName(cell.scoringBrand) : 'the booth with the most bills'}`
          : cell.booths.length ? 'No brand to place' : 'No bills this week'
  const booths = cell.booths.map((b: BrandWeekBooth) =>
    `${brandName(b.brand)} · ${b.venue} — ${bills(b.orders)}, ${formatMoney(b.sales)}${b.held > 0 ? ` · ${formatMoney(b.held)} held below the deposit` : ''}${b.scoring ? ' · earns the points' : ''}`)
  return [stored, ...booths, 'Click to change'].join('\n')
}

const savedOn = (at: string) => formatIntlDate(new Date(at), { day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' }, 'en-GB')

/** The member's own line: title, login, who last saved their month. */
function personTitle(p: BrandWeeksAdminSnapshot['people'][number]): string {
  return [
    p.title,
    p.hasLogin ? null : 'No member login',
    p.savedAt ? `Saved ${savedOn(p.savedAt)} · ${p.savedBySelf ? 'by the member' : p.savedBy ?? 'back office'}` : null,
  ].filter(Boolean).join(' · ')
}

/**
 * Member services › Brand weeks (2026-10-10, the HR revamp; the back office of
 * My brand weeks since 2026-10-03): a department's month, one row per member,
 * one chip per Friday's week — closed weeks too. A click cycles the brand
 * (Akemi → Dunlopillo → Zanotti → Ergotex → not picked); a changed chip turns
 * peach and the bar under the grid saves them all. A week nobody picked shows
 * the brand the board counts, dashed; the booths and bills are in its
 * tooltip. Read when the tab is first opened (a user's click, never a page's
 * own Server Action) and again on ‹ ›.
 */
export default function BrandWeeksPanel({ departments }: { departments: Array<{ id: string; name: string }> }) {
  const [subId, setSubId] = useState(() => (departments.find(d => d.name.trim().toLowerCase() === 'fair') ?? departments[0])?.id ?? '')
  const [period, setPeriod] = useState(thisMonth)
  const [revision, setRevision] = useState(0)
  const [snapshot, setSnapshot] = useState<BrandWeeksAdminSnapshot | null>(null)
  const [drafts, setDrafts] = useState<Record<string, ArenaWeekPicks>>({})
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
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
        if (result.ok) {
          setSnapshot(result.data)
          setDrafts(copy(result.data.picks))
        } else {
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
  }, [subId, period, revision])

  if (!departments.length) return <p className={s.empty}>There is no Revenue sub-department to set brand weeks for.</p>

  const rows = snapshot ? brandWeeksAdminRows(snapshot) : []
  const weeks = snapshot?.weeks ?? []
  const stored = snapshot?.picks ?? {}
  const changes = snapshot ? brandWeekChanges(snapshot.period, stored, drafts) : 0
  const cols = `minmax(0,1.4fr) repeat(${Math.max(weeks.length, 1)},minmax(0,1fr))`
  const sub = departments.find(d => d.id === subId)

  async function save() {
    if (!snapshot || saving || !changes) return
    const toSave = brandWeeksToSave(snapshot.period, stored, drafts)
    setSaving(true)
    setError('')
    try {
      const result = await saveBrandWeeksAdmin(snapshot.subDepartmentId, snapshot.period, toSave)
      if (!result.ok) {
        setError(result.error)
        return
      }
      flash(`Saved ${changes} brand week${changes === 1 ? '' : 's'}`)
      setRevision(v => v + 1)
    } catch {
      setError('The brand weeks could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="bw-title">
      <div className={s.bwHead}>
        <h2 id="bw-title" className={s.bwTitle}>Brand weeks</h2>
        <span className={s.bwSub}>Set any member&apos;s brand for each Friday&apos;s week — closed weeks too.</span>
        <span className={s.spacer} />
        {departments.length > 1 ? (
          <select
            className={s.subChip}
            aria-label="Sub-department"
            value={subId}
            disabled={changes > 0 || saving}
            title={changes > 0 ? 'Save or discard the changes first' : undefined}
            onChange={e => {
              setSubId(e.target.value)
              setSnapshot(null)
            }}
          >
            {departments.map(d => (
              <option key={d.id} value={d.id}>Revenue · {d.name}</option>
            ))}
          </select>
        ) : (
          <span className={s.subChip}>Revenue · {sub?.name}</span>
        )}
        <span className={s.stepper}>
          <button type="button" className={s.stepBtn} aria-label="Previous month" disabled={changes > 0 || saving} onClick={() => setPeriod(p => shift(p, -1))}>
            ‹
          </button>
          <span className={s.stepLabel}>{monthLabel(period)}</span>
          <button
            type="button"
            className={s.stepBtn}
            aria-label="Next month"
            disabled={changes > 0 || saving || period >= thisMonth()}
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
              <span key={lock.week} role="columnheader" title={lock.locked ? `Closed ${arenaShortDay(lock.closesOn)}` : `Open until ${arenaShortDay(lock.closesOn)}`}>
                Fri {Number(lock.week.slice(8, 10))}
                {lock.locked ? <span className={s.bwState}>closed</span> : null}
              </span>
            ))}
          </div>
          {busy && !snapshot ? <div className={s.loading}>Loading brand weeks…</div> : null}
          {rows.map(({ person, cells }) => (
            <div key={person.id} className={s.bwRow} role="row" style={{ gridTemplateColumns: cols }}>
              <span className={s.bwName} role="cell" title={personTitle(person) || undefined}>{person.name}</span>
              {cells.map(cell => {
                const value = (drafts[person.id]?.[cell.week] ?? null) as ArenaWeekBrand | null
                const changed = value !== (cell.pick ?? null)
                const shown = weekBrand(value) ?? (!changed && cell.scoringBrand ? weekBrand(cell.scoringBrand) : null)
                const guess = !value && !changed && shown !== null
                const label = shown?.name ?? (value ? value : 'Not picked')
                return (
                  <span key={cell.week} className={s.bwCell} role="cell">
                    <button
                      type="button"
                      className={s.bwChip}
                      data-changed={changed ? 'true' : undefined}
                      data-guess={guess ? 'true' : undefined}
                      style={shown ? ({ '--bw-fg': shown.fg, '--bw-bg': shown.bg } as CSSProperties) : undefined}
                      title={changed ? 'Changed · saved when you press Save' : cellTitle(cell)}
                      aria-label={`${person.name}, week of ${cell.week}: ${label}${guess ? ' (not picked)' : ''}`}
                      disabled={saving}
                      onClick={() =>
                        setDrafts(d => ({ ...d, [person.id]: { ...(d[person.id] ?? {}), [cell.week]: nextWeekBrand(value) ?? undefined } }))
                      }
                    >
                      <span className={s.bwDot} aria-hidden="true" />
                      {label}
                    </button>
                  </span>
                )
              })}
            </div>
          ))}
          {snapshot && rows.length === 0 ? <div className={s.loading}>Nobody is a member of {sub?.name ?? 'this sub-department'} yet.</div> : null}
          {changes > 0 ? (
            <div className={s.bwBar} role="region" aria-label="Unsaved brand weeks">
              <span className={s.bwBarText}><b>{weeksChangedText(changes)}</b></span>
              <span className={s.bwBarActions}>
                <button type="button" className={s.discard} disabled={saving} onClick={() => setDrafts(copy(stored))}>
                  Discard
                </button>
                <button type="button" className={s.save} disabled={saving} onClick={save}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className={s.foot}>
        Brands: Akemi, Dunlopillo, Zanotti, Ergotex. Click a cell to cycle. A dashed one is not picked yet — the booth with the most bills counts; its bills are in its tooltip.
      </div>
    </section>
  )
}
