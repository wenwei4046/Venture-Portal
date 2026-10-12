'use client'

import { useState } from 'react'
import { Chip } from '@/components/hrv/kit'
import { flash } from '@/components/hrv/toast'
import { saveFoodClaimAdmin } from '../food-claim-actions'
import {
  foodClaimChanged,
  foodClaimDraft,
  foodClaimProblems,
  foodClaimToSave,
  toggleFoodTitle,
  type FoodClaimAdmin,
  type FoodClaimDraft,
} from '@/lib/member/food-claim-admin'
import { formatIntlDate } from '@/lib/utils'
import s from './member-services.module.css'

const TITLE_COLS = 'minmax(0,1.6fr) minmax(0,1fr) 120px 150px'
const savedOn = (at: string) => formatIntlDate(new Date(at), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' }, 'en-GB')

/**
 * Member services › Food claim (2026-10-13 — the user: set its amount a day, and which titles may claim
 * it; "this food claim is only for fair sub-department"): the rate a day, and every Revenue title with
 * how many hold it in Fair, each ticked or not. One Save, at the top, lit while anything differs from
 * what is stored — as Claim rates; `member_admin_save_food_claim` checks it all again. Read with the page.
 */
export default function FoodClaimPanel({ initial }: { initial: FoodClaimAdmin | null }) {
  const [saved, setSaved] = useState(initial)
  const [draft, setDraft] = useState<FoodClaimDraft | null>(initial ? foodClaimDraft(initial) : null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!saved || !draft) return <p className={s.alert} role="alert">The food claim could not be read. Reload the page to try again.</p>

  const changed = foodClaimChanged(saved, draft)
  const problems = foodClaimProblems(draft)
  const ticked = new Set(draft.titleIds)
  const edit = (next: FoodClaimDraft) => {
    setDraft(next)
    setError('')
  }

  async function save() {
    if (!draft || saving || !changed) return
    if (problems.length) {
      setError(problems[0])
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await saveFoodClaimAdmin(foodClaimToSave(draft))
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSaved(result.data)
      setDraft(foodClaimDraft(result.data))
      flash('Food claim saved — new claims use it')
    } catch {
      setError('The food claim could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={s.crCard} aria-labelledby="fc-title">
      <div className={s.crHead}>
        <div className={s.fcTitleRow}>
          <h2 id="fc-title" className={s.crTitle}>Food claim</h2>
          {saved.subName ? <Chip tone="info" soft>{saved.subName} only</Chip> : null}
        </div>
        <button type="button" className={s.crSave} disabled={!changed || saving} onClick={save}>
          {saving ? 'Saving…' : changed ? 'Save' : 'Saved'}
        </button>
      </div>
      {error || (changed && problems.length) ? (
        <p className={s.alert} role="alert">{error || problems[0]}</p>
      ) : null}

      <div className={s.fcBox}>
        <label className={s.crLine} title="What a member claims for each day of their brand week's fair they worked. Blank = not set">
          <span className={s.crLabel}>Rate a day</span>
          <span className={s.crUnit}>
            RM
            <input
              className={s.crInput}
              inputMode="decimal"
              value={draft.perDay}
              disabled={saving}
              onChange={e => edit({ ...draft, perDay: e.target.value })}
              aria-label="Rate a day"
            />
          </span>
        </label>
      </div>

      <div className={s.crScroll}>
        <div className={s.crTable} role="table" aria-label="Titles that may claim">
          <div className={s.crTHead} role="row" style={{ gridTemplateColumns: TITLE_COLS }}>
            <span role="columnheader">Title</span>
            <span role="columnheader">Level</span>
            <span role="columnheader" style={{ textAlign: 'right' }}>In {saved.subName ?? 'Fair'}</span>
            <span role="columnheader">Food claim</span>
          </div>
          {saved.titles.map((t, i) => {
            const on = ticked.has(t.id)
            return (
              <div key={t.id} className={s.crTRow} role="row" data-zebra={i % 2 ? 'true' : undefined} style={{ gridTemplateColumns: TITLE_COLS }}>
                <span className={s.crVenue} role="cell">
                  {t.name}
                  {t.active ? null : <span className={s.crVenueMeta}>No longer in use</span>}
                </span>
                <span className={s.fcLevel} role="cell">{t.level ?? '—'}</span>
                <span className={s.crPays} role="cell">{t.people} {t.people === 1 ? 'person' : 'people'}</span>
                <button
                  type="button"
                  className={s.crPlane}
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`${t.name} may claim food`}
                  disabled={saving}
                  onClick={() => edit(toggleFoodTitle(saved, draft, t.id))}
                >
                  <span className={s.crBox14} data-on={on ? 'true' : undefined} aria-hidden="true">{on ? '✓' : ''}</span>
                  Can claim
                </button>
              </div>
            )
          })}
          {saved.titles.length === 0 ? <div className={s.loading}>No Revenue title yet.</div> : null}
        </div>
      </div>
      {saved.updatedAt ? (
        <div className={s.foot}>
          Last saved {savedOn(saved.updatedAt)}{saved.updatedBy ? ` by ${saved.updatedBy}` : ''}.
        </div>
      ) : null}
    </section>
  )
}
