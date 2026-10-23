'use client'

import { useEffect, useState, useTransition } from 'react'
import { Window } from '@/components/hrv/overlay'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { inviteHiringTalent, saveHiringTalent } from '@/lib/hiring/actions'
import { savedIn } from '@/lib/hiring/bank'
import { REASONS } from '@/lib/hiring/reasons'
import { answerOf, departmentNames, pickRows } from '@/lib/hiring/view'
import type { HiringBoard, HiringCandidate, HiringRequest, TalentReason } from '@/lib/hiring/types'
import s from './hiring.module.css'

/** Pick from Talent Bank (README §11): the bank's people not already on this request, matching ones first; Add invites them. */
export function PickTalentWindow({ board, request: r, open, onClose }: { board: HiringBoard; request: HiringRequest; open: boolean; onClose: () => void }) {
  const [pending, start] = useTransition()
  const rows = pickRows(board, r)
  return (
    <Window open={open} onClose={onClose} width={560} scrim={0.22} label="Pick from Talent Bank">
      <div className={s.winHead}>
        <div className={s.winHeadMain}>
          <div className={s.winTitle}>Pick from Talent Bank</div>
          <div className={s.winSub}>Matching people are listed first.</div>
        </div>
        <button type="button" className={s.winClose} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className={s.winBodyList}>
        {rows.map(({ talent: t, match, note }) => (
          <div key={t.id} className={s.pickRow}>
            <div className={s.pickMain}>
              <div className={s.pickName}>
                <span>{t.name}</span>
                <span className={s.pickPos}>{t.position}</span>
                {match ? <span className={s.pickMatch}>Matches</span> : null}
              </div>
              <div className={s.pickNote}>{note}</div>
            </div>
            <button
              type="button"
              className={s.pickAdd}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const out = await inviteHiringTalent(t.id, r.id)
                  if (!out.ok) return flash(out.reason)
                  flash(`${t.name} invited to interview for ${r.id}`)
                  onClose()
                })
              }
            >
              Add
            </button>
          </div>
        ))}
        {rows.length === 0 ? <div className={s.pickEmpty}>Everyone in the Talent Bank is already on this request.</div> : null}
      </div>
    </Window>
  )
}

/**
 * Move to Talent Bank… (README §11): a candidate kept on file — name, phone, email, department, what they fit, why keep
 * them; their files go with them. The reason they are kept (2026-10-24): Not right now for somebody still in the running.
 */
export function MoveToTalentWindow({
  board,
  request: r,
  candidate: c,
  onClose,
}: {
  board: HiringBoard
  request: HiringRequest
  candidate: HiringCandidate | null
  onClose: () => void
}) {
  const departments = departmentNames(board)
  // A guest's candidate is kept in their company's department as the request names it (2026-10-12, the Talent Bank as a
  // Drive) — HOUZS Venture's list is not theirs; HOUZS Venture's are kept in the department picked here.
  const guest = r.source === 'guest' && !!r.requesterCompany?.trim()
  const files = c?.files ?? []
  const onlyResume = files.length === 1 && files[0].resume
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [dept, setDept] = useState('')
  const [position, setPosition] = useState('')
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState<TalentReason>('not_right_now')
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!c) return
    setName(c.name)
    setPhone(c.phone)
    setEmail('')
    setPosition(answerOf(r, 'position'))
    setReason(c.stage === 'rejected' ? 'not_shortlisted' : 'not_right_now')
    const first = (answerOf(r, 'dept') || 'Revenue').split(' · ')[0]
    setDept(guest ? answerOf(r, 'dept') || first : departments.includes(first) ? first : departments[0] ?? first)
    setNotes(c.note)
    setErr('')
    // A fresh form for each candidate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c])

  const save = () => {
    if (!c) return
    if (!name.trim() || !position.trim()) return setErr('Name and position are needed.')
    const form = new FormData()
    form.set('candidate', c.id)
    form.set('name', name)
    form.set('phone', phone)
    form.set('email', email)
    form.set('department', dept)
    form.set('position', position)
    form.set('notes', notes)
    form.set('reason', reason)
    start(async () => {
      const out = await saveHiringTalent(form)
      if (!out.ok) return setErr(out.reason)
      flash(name.trim() + ' saved to the Talent Bank')
      onClose()
    })
  }

  return (
    <Window open={!!c} onClose={onClose} width={560} scrim={0.22} label="Move to Talent Bank">
      <div className={s.winHead}>
        <div className={s.winHeadMain}>
          <div className={s.winTitle}>Move to Talent Bank</div>
          <div className={s.winSub}>{'From ' + r.id + ' · ' + answerOf(r, 'position')}</div>
        </div>
        <button type="button" className={s.winClose} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className={s.winBody}>
        <div className={s.twoCol}>
          <label className={s.label}>
            <span className={s.labelText}>Name *</span>
            <input className={s.input} value={name} onChange={e => setName(e.target.value)} />
          </label>
          <label className={s.label}>
            <span className={s.labelText}>Phone</span>
            <input className={s.input} value={phone} onChange={e => setPhone(e.target.value)} />
          </label>
          <label className={s.label}>
            <span className={s.labelText}>Email</span>
            <input className={s.input} value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className={s.label}>
            <span className={s.labelText}>Reason *</span>
            <Select bare className={s.select} value={reason} onChange={e => setReason(e.target.value as TalentReason)}>
              {REASONS.map(x => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </Select>
          </label>
          {guest ? null : (
            <label className={s.label}>
              <span className={s.labelText}>Department *</span>
              <Select bare className={s.select} value={dept} onChange={e => setDept(e.target.value)}>
                {departments.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className={`${s.label} ${s.full}`}>
            <span className={s.labelText}>Good fit for (position) *</span>
            <input className={s.input} value={position} onChange={e => setPosition(e.target.value)} />
          </label>
        </div>
        <label className={s.label}>
          <span className={s.labelText}>Why keep them</span>
          <textarea className={s.textarea} rows={4} value={notes} onChange={e => setNotes(e.target.value)} />
        </label>
        <div className={s.resumeRow}>
          <span className={s.labelText}>Kept in</span>
          <span className={s.resumeRowName}>{'Talent Bank › ' + savedIn(r, dept).label}</span>
        </div>
        {/* Their one file a résumé, the row keeps the handoff's words (Résumé · CV.pdf); otherwise each with its type. */}
        <div className={s.resumeRow}>
          <span className={s.labelText}>{onlyResume ? 'Résumé' : 'Files'}</span>
          <span className={s.resumeRowName}>
            {!files.length ? 'No files' : onlyResume ? files[0].name : files.map(f => `${f.type} · ${f.name}`).join(', ')}
          </span>
        </div>
      </div>
      <div className={s.winFoot}>
        <span className={s.winFootErr}>{err}</span>
        <button type="button" className={s.btnPlain} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={s.btnOrange} style={{ padding: '8px 18px 10px' }} onClick={save} disabled={pending}>
          Save to Talent Bank
        </button>
      </div>
    </Window>
  )
}
