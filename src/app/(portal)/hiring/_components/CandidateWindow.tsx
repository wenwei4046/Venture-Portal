'use client'

import { useEffect, useState, useTransition } from 'react'
import { Window } from '@/components/hrv/overlay'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { saveHiringCandidate } from '@/lib/hiring/actions'
import { NEW_REASON, outReason, startReason } from '@/lib/hiring/reasons'
import { STAGE, STAGE_ORDER, answerOf } from '@/lib/hiring/view'
import type { CandidateStage, HiringBoard, HiringCandidate, HiringRequest } from '@/lib/hiring/types'
import { FileRow, WaitingFiles, sendWaiting, waitingProblem, type Waiting } from './HiringFiles'
import { ReasonSelect, sendReason } from './ReasonSelect'
import s from './hiring.module.css'

/**
 * Add candidate / Edit candidate (README §11, portal-32 — a centred 560px
 * window): Name *, Phone, Status, the candidate fields, a reference or special
 * note, their files, and "Change which fields appear here". Files (2026-10-11):
 * the ones on record, each to Remove (on Save), and new ones with their type
 * — uploaded, then filed with the rest on Save. Status turned to Not selected
 * asks why (2026-10-24): they are kept in the Talent Bank with it — one of HR's
 * reasons, or a new one named here (Edit).
 */
export default function CandidateWindow({
  board,
  request: r,
  state,
  canAddType,
  canAddReason,
  onClose,
  onFields,
}: {
  board: HiringBoard
  request: HiringRequest
  state: { mode: 'add' } | { mode: 'edit'; candidate: HiringCandidate } | null
  /** Hiring · Edit names new file types. */
  canAddType: boolean
  /** …and new reasons. */
  canAddReason: boolean
  onClose: () => void
  onFields: () => void
}) {
  const editing = state?.mode === 'edit' ? state.candidate : null
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [stage, setStage] = useState<CandidateStage>('shortlisted')
  const [reason, setReason] = useState('')
  const [newReason, setNewReason] = useState('')
  const [note, setNote] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [waiting, setWaiting] = useState<Waiting[]>([])
  const [removing, setRemoving] = useState<string[]>([])
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!state) return
    const c = state.mode === 'edit' ? state.candidate : null
    setName(c?.name ?? '')
    setPhone(c?.phone ?? '')
    setStage(c?.stage ?? 'shortlisted')
    setReason(startReason(board.talentReasons, outReason(c?.stage ?? 'shortlisted')))
    setNewReason('')
    setNote(c?.note ?? '')
    setAnswers(c ? { ...c.answers } : {})
    setWaiting([])
    setRemoving([])
  }, [state])

  const kept = editing?.files ?? []
  // Turning Not selected here keeps them in the Talent Bank: why. One already not selected is the bank's to change.
  const asksWhy = stage === 'rejected' && editing?.stage !== 'rejected'
  const save = () => {
    if (!name.trim()) return flash(editing ? 'Name can’t be empty' : 'Add the candidate’s name')
    const problem = waitingProblem(waiting)
    if (problem) return flash(problem)
    if (asksWhy && reason === NEW_REASON && !newReason.trim()) return flash('Name the new reason.')
    start(async () => {
      const why = asksWhy ? await sendReason(board.talentReasons, reason, newReason) : null
      if (why && !why.ok) return flash(why.reason)
      const sent = await sendWaiting(waiting, board.fileTypes)
      if (!sent.ok) return flash(sent.reason)
      const form = new FormData()
      form.set('request', r.id)
      if (editing) form.set('candidate', editing.id)
      form.set('name', name)
      form.set('phone', phone)
      form.set('stage', stage)
      if (why?.ok) form.set('reason', why.id)
      form.set('note', note)
      form.set('answers', JSON.stringify(answers))
      form.set('files', JSON.stringify(sent.files))
      if (editing) form.set('remove', JSON.stringify(removing))
      const out = await saveHiringCandidate(form)
      if (!out.ok) return flash(out.reason)
      flash(out.warning ?? name.trim() + (editing ? ' saved' : ' added') + (asksWhy ? ' · kept in Talent Bank' : ''))
      onClose()
    })
  }

  return (
    <Window open={!!state} onClose={onClose} width={560} scrim={0.22} label={editing ? 'Edit candidate' : 'Add candidate'}>
      <div className={s.winHead}>
        <div className={s.winHeadMain}>
          <div className={s.winTitle}>{editing ? 'Edit candidate' : 'Add candidate'}</div>
          <div className={s.winSubMono}>{r.id + ' · ' + answerOf(r, 'position')}</div>
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
            <span className={s.labelText}>Status</span>
            <Select bare className={s.select} value={stage} onChange={e => setStage(e.target.value as CandidateStage)}>
              {STAGE_ORDER.map(v => (
                <option key={v} value={v}>
                  {STAGE[v].label}
                </option>
              ))}
            </Select>
          </label>
          {asksWhy ? (
            <ReasonSelect
              label="Why not selected"
              reasons={board.talentReasons}
              value={reason}
              newName={newReason}
              canAdd={canAddReason}
              onChange={setReason}
              onNewName={setNewReason}
            />
          ) : null}
          {board.candidateFields.map(f => (
            <label key={f.id} className={s.label}>
              <span className={s.labelText}>{f.label}</span>
              {f.type === 'choice' ? (
                <Select bare className={s.select} value={answers[f.id] ?? ''} onChange={e => setAnswers(a => ({ ...a, [f.id]: e.target.value }))}>
                  <option value="">Choose…</option>
                  {f.options
                    .split(',')
                    .map(o => o.trim())
                    .filter(Boolean)
                    .map(o => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                </Select>
              ) : (
                <input
                  className={s.input}
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  value={answers[f.id] ?? ''}
                  onChange={e => setAnswers(a => ({ ...a, [f.id]: e.target.value }))}
                />
              )}
            </label>
          ))}
        </div>
        <label className={s.label}>
          <span className={s.labelText}>Reference / special note</span>
          <textarea className={s.textarea} rows={3} value={note} placeholder="e.g. Referred by Chea Huan; strong at roadshows" onChange={e => setNote(e.target.value)} />
        </label>
        {/* A group, not a <label>: pressing a label's text presses the first button inside it. */}
        <div className={s.hfGroup} role="group" aria-label="Files">
          {kept.length ? <span className={s.labelText}>Files</span> : null}
          {kept.map(f => {
            const off = removing.includes(f.id)
            return (
              <FileRow key={f.id} name={f.name} type={f.type} struck={off}>
                <button
                  type="button"
                  className={s.btnGhost}
                  aria-label={`${off ? 'Keep' : 'Remove'} ${f.name}`}
                  onClick={() => setRemoving(list => (off ? list.filter(id => id !== f.id) : [...list, f.id]))}
                >
                  {off ? 'Undo' : 'Remove'}
                </button>
              </FileRow>
            )
          })}
          <WaitingFiles types={board.fileTypes} kept={kept.filter(f => !removing.includes(f.id))} waiting={waiting} canAddType={canAddType} onChange={setWaiting} />
        </div>
        <button type="button" className={s.linkQuiet} style={{ alignSelf: 'flex-start', fontSize: 12 }} onClick={onFields}>
          Change which fields appear here
        </button>
      </div>
      <div className={s.winFoot}>
        <button type="button" className={s.btnPlain} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={s.btnOrange} style={{ padding: '8px 18px 10px' }} onClick={save} disabled={pending}>
          {editing ? 'Save' : 'Add candidate'}
        </button>
      </div>
    </Window>
  )
}
