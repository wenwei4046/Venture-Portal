'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Window } from '@/components/hrv/overlay'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { saveHiringCandidate } from '@/lib/hiring/actions'
import { STAGE, STAGE_ORDER, answerOf } from '@/lib/hiring/view'
import type { CandidateStage, HiringBoard, HiringCandidate, HiringRequest } from '@/lib/hiring/types'
import s from './hiring.module.css'

/**
 * Add candidate / Edit candidate (README §11, portal-32 — a centred 560px
 * window): Name *, Phone, Status, the candidate fields, a reference or special
 * note, the résumé, and "Change which fields appear here".
 */
export default function CandidateWindow({
  board,
  request: r,
  state,
  onClose,
  onFields,
}: {
  board: HiringBoard
  request: HiringRequest
  state: { mode: 'add' } | { mode: 'edit'; candidate: HiringCandidate } | null
  onClose: () => void
  onFields: () => void
}) {
  const editing = state?.mode === 'edit' ? state.candidate : null
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [stage, setStage] = useState<CandidateStage>('shortlisted')
  const [note, setNote] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [file, setFile] = useState<File | null>(null)
  const [pending, start] = useTransition()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!state) return
    const c = state.mode === 'edit' ? state.candidate : null
    setName(c?.name ?? '')
    setPhone(c?.phone ?? '')
    setStage(c?.stage ?? 'shortlisted')
    setNote(c?.note ?? '')
    setAnswers(c ? { ...c.answers } : {})
    setFile(null)
  }, [state])

  const save = () => {
    if (!name.trim()) return flash(editing ? 'Name can’t be empty' : 'Add the candidate’s name')
    const form = new FormData()
    form.set('request', r.id)
    if (editing) form.set('candidate', editing.id)
    form.set('name', name)
    form.set('phone', phone)
    form.set('stage', stage)
    form.set('note', note)
    form.set('answers', JSON.stringify(answers))
    if (file) form.set('file', file)
    start(async () => {
      const out = await saveHiringCandidate(form)
      if (!out.ok) return flash(out.reason)
      flash(name.trim() + (editing ? ' saved' : ' added'))
      onClose()
    })
  }

  const fileLabel = file ? file.name : editing?.resumeName ? editing.resumeName : 'Upload résumé'

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
        <label className={s.fileDrop}>
          <span className={s.fileDropName}>{fileLabel}</span>
          <span className={s.fileDropBtn}>Choose file</span>
          <input
            ref={input}
            type="file"
            accept=".pdf,.doc,.docx,image/*"
            className={s.hiddenFile}
            onChange={e => {
              setFile(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
        </label>
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
