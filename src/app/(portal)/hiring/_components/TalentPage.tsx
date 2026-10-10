'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Chip, HvPage, PageHead, SecLabel } from '@/components/hrv/kit'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { hiringFileLink, inviteHiringTalent, removeHiringTalent, replaceTalentResume, saveTalentNotes } from '@/lib/hiring/actions'
import { extLabel } from '@/lib/hiring/files'
import { OPEN, answerOf, dayLabel, talentStatus } from '@/lib/hiring/view'
import type { HiringBoard, HiringTalent } from '@/lib/hiring/types'
import s from './hiring.module.css'

/**
 * A talent's own page (README §13, portal-36): their profile, HR's notes
 * (saved as they are written), the résumé (Open, Replace), Invite to
 * interview on an open request, Remove from Talent Bank (asked twice) and
 * their history.
 */
export default function TalentPage({ board, talent: t, can }: { board: HiringBoard; talent: HiringTalent; can: { create: boolean; edit: boolean } }) {
  const router = useRouter()
  const [notes, setNotes] = useState(t.notes)
  const [armed, setArmed] = useState(false)
  const [, start] = useTransition()
  const open = board.requests.filter(r => OPEN.has(r.status))
  const suggested = open.find(r => answerOf(r, 'position').toLowerCase() === t.position.toLowerCase()) ?? open[0]
  const [invite, setInvite] = useState(suggested?.id ?? '')
  const inviteId = open.some(r => r.id === invite) ? invite : (suggested?.id ?? '')
  const status = talentStatus(board, t)
  const fileInput = useRef<HTMLInputElement>(null)

  // HR notes save themselves a moment after the last key, and on leaving the field.
  const saved = useRef(t.notes)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keep = (value: string) => {
    if (value === saved.current) return
    saved.current = value
    start(async () => {
      const out = await saveTalentNotes(t.id, value)
      if (!out.ok) flash(out.reason)
    })
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const openFile = () =>
    start(async () => {
      if (!t.resumeName) return flash('No résumé yet')
      const out = await hiringFileLink('talent', t.id, true)
      if (!out.ok) return flash(out.reason)
      window.location.assign(out.url)
    })
  const replace = (file: File) => {
    const data = new FormData()
    data.set('talent', t.id)
    data.set('file', file)
    start(async () => {
      const out = await replaceTalentResume(data)
      flash(out.ok ? 'Résumé replaced' : out.reason)
    })
  }
  const inviteNow = () => {
    const r = open.find(x => x.id === inviteId)
    if (!r) return
    start(async () => {
      const out = await inviteHiringTalent(t.id, r.id)
      flash(out.ok ? `${t.name} invited to interview for ${r.id}` : out.reason)
    })
  }
  const remove = () => {
    if (!armed) return setArmed(true)
    start(async () => {
      const out = await removeHiringTalent(t.id)
      if (!out.ok) return flash(out.reason)
      flash(`${t.name} removed from the Talent Bank`)
      router.push('/hiring/talent')
    })
  }

  const tiles = [
    ['Good fit for', t.position],
    ['Department', t.department],
    ['Phone', t.phone || '—'],
    ['Email', t.email || '—'],
    ['Saved from', t.fromRequest || 'Added directly'],
    ['Saved', `${dayLabel(t.savedAt)} · ${t.savedBy}`],
  ]

  return (
    <HvPage>
      <PageHead eyebrow="Hiring · Talent Bank" title="Talent Bank" subtitle="Good candidates kept on file, ready to invite when a role opens." />
      <Link href="/hiring/talent" className={s.back}>
        ‹ Talent Bank
      </Link>
      <div className={s.pHead}>
        <div className={s.pHeadMain}>
          <div className={s.pId}>{t.no}</div>
          <div className={s.pTitle}>{t.name}</div>
          <div className={s.pMeta}>{`Good fit for ${t.position} · ${t.department} · saved ${dayLabel(t.savedAt)} by ${t.savedBy}`}</div>
        </div>
        <Chip tone={status.tone} style={{ fontSize: 10.5 }}>
          {status.label}
        </Chip>
      </div>
      <div className={s.pGrid}>
        <div className={s.pMain}>
          <section className={s.card} aria-label="Profile">
            <SecLabel>Profile</SecLabel>
            <div className={s.tvTiles}>
              {tiles.map(([l, v]) => (
                <div key={l} className={s.tvTile}>
                  <div className={s.tvTileLabel}>{l}</div>
                  <div className={s.tvTileValue}>{v}</div>
                </div>
              ))}
            </div>
          </section>
          <section className={s.card} aria-label="HR notes">
            <SecLabel>HR notes</SecLabel>
            <textarea
              className={s.tvNotes}
              rows={6}
              value={notes}
              readOnly={!can.edit}
              aria-label="HR notes"
              onChange={e => {
                const v = e.target.value
                setNotes(v)
                if (timer.current) clearTimeout(timer.current)
                timer.current = setTimeout(() => keep(v), 800)
              }}
              onBlur={() => {
                if (timer.current) clearTimeout(timer.current)
                keep(notes)
              }}
            />
          </section>
          <section className={`${s.card} ${s.tvFileCard}`} aria-label="Résumé">
            <span className={s.extTile} data-size="38">
              {extLabel(t.resumeName)}
            </span>
            <div className={s.tvFileMain}>
              <div className={s.tvFileName}>{t.resumeName || 'No résumé uploaded'}</div>
              <div className={s.tvFileKind}>Résumé</div>
            </div>
            <button type="button" className={s.btnGhost} onClick={openFile}>
              Open
            </button>
            {can.edit ? (
              <label className={s.btnGhost} style={{ cursor: 'pointer' }}>
                Replace
                <input
                  ref={fileInput}
                  type="file"
                  accept=".pdf,.doc,.docx,image/*"
                  className={s.hiddenFile}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) replace(f)
                  }}
                />
              </label>
            ) : null}
          </section>
        </div>
        <div className={s.pSide}>
          <section className={`${s.card} ${s.inviteCard}`} aria-label="Invite to interview">
            <SecLabel>Invite to interview</SecLabel>
            {open.length ? (
              can.create ? (
                <>
                  <Select bare className={s.select} value={inviteId} aria-label="Open request" onChange={e => setInvite(e.target.value)}>
                    {open.map(r => (
                      <option key={r.id} value={r.id}>
                        {`${r.id} · ${answerOf(r, 'position')} · ${answerOf(r, 'dept')}`}
                      </option>
                    ))}
                  </Select>
                  <button type="button" className={`${s.btnOrange} ${s.inviteBtn}`} onClick={inviteNow}>
                    Invite to interview
                  </button>
                </>
              ) : null
            ) : (
              <div className={s.noOpen}>No open hiring requests right now.</div>
            )}
            {can.edit ? (
              <button type="button" className={s.removeBtn} data-armed={armed ? 'true' : undefined} onClick={remove}>
                {armed ? 'Confirm remove' : 'Remove from Talent Bank'}
              </button>
            ) : null}
          </section>
          <section className={s.card} aria-label="History">
            <SecLabel style={{ marginBottom: 12 }}>History</SecLabel>
            {t.events.map((e, i) => {
              const last = i === t.events.length - 1
              return (
                <div key={i} className={s.histRow}>
                  <div className={s.histRail} aria-hidden="true">
                    <span className={s.histDot} data-last={last ? 'true' : undefined} />
                    <span className={s.histLine} data-last={last ? 'true' : undefined} />
                  </div>
                  <div className={s.histBody}>
                    <div className={s.histTop}>
                      <span className={s.histWhat}>{e.what}</span>
                      <span className={s.histWhen}>{dayLabel(e.at)}</span>
                    </div>
                    <div className={s.histWho}>{e.who}</div>
                    {e.note ? <div className={s.histNote}>{e.note}</div> : null}
                  </div>
                </div>
              )
            })}
          </section>
        </div>
      </div>
    </HvPage>
  )
}
