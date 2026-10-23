'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Chip, HvPage, PageHead, SecLabel } from '@/components/hrv/kit'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { addHiringFiles, hiringFileLink, inviteHiringTalent, removeHiringFile, removeHiringTalent, replaceHiringFile, saveTalentNotes } from '@/lib/hiring/actions'
import { HIRING_ACCEPT, startingType } from '@/lib/hiring/files'
import { cameFrom } from '@/lib/hiring/reasons'
import { uploadHiringFile } from '@/lib/hiring/upload'
import { OPEN, answerOf, dayLabel, talentStatus } from '@/lib/hiring/view'
import type { HiringBoard, HiringFile, HiringTalent } from '@/lib/hiring/types'
import { FileRow, FileTypePick, NEW_TYPE, sendWaiting } from './HiringFiles'
import ReasonPick from './ReasonPick'
import s from './hiring.module.css'

/**
 * A talent's own page (README §13, portal-36): their profile, HR's notes
 * (saved as they are written), their files (2026-10-11: each with its type —
 * Open, Replace, Remove asked twice, "+ Add file" with a type), Invite to
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
      flash(`${t.name} moved to the Bin`)
      router.push('/hiring/talent')
    })
  }

  const tiles = [
    ['Good fit for', t.position],
    ['Department', t.department],
    ['Phone', t.phone || '—'],
    ['Email', t.email || '—'],
    ['Came from', cameFrom(board, t)],
    ['Saved', `${dayLabel(t.savedAt)} · ${t.savedBy}`],
  ]

  return (
    <HvPage>
      <PageHead eyebrow="Hiring · Talent Bank" title="Talent Bank" />
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
              {/* Why they are kept (2026-10-24): HR changes it here; their History says from what to what. */}
              <div className={s.tvTile}>
                <div className={s.tvTileLabel}>Reason</div>
                <div className={s.tvTileValue}>
                  <ReasonPick talent={t} canEdit={can.edit} className={s.select} />
                </div>
              </div>
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
          <TalentFiles board={board} talent={t} can={can} />
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

/**
 * Their files (2026-10-11 — a row each where the résumé card was): the
 * extension tile, the name, its type under it; Open (a download link made at
 * the press), Replace (a new upload in its place, the type kept — Edit), Remove
 * (asked twice — Edit); "+ Add file" (Create or Edit): the type, then the file,
 * filed as soon as it is chosen.
 */
function TalentFiles({ board, talent: t, can }: { board: HiringBoard; talent: HiringTalent; can: { create: boolean; edit: boolean } }) {
  const [adding, setAdding] = useState(false)
  const [typeId, setTypeId] = useState('')
  const [newName, setNewName] = useState('')
  const [armed, setArmed] = useState<string | null>(null)
  const [busy, start] = useTransition()

  const open = (f: HiringFile) =>
    start(async () => {
      const out = await hiringFileLink('file', f.id, true)
      if (!out.ok) return flash(out.reason)
      window.location.assign(out.url)
    })
  const replace = (f: HiringFile, file: File) =>
    start(async () => {
      const up = await uploadHiringFile(file)
      if (!up.ok) return flash(up.reason)
      const out = await replaceHiringFile(f.id, { path: up.path, name: up.name })
      flash(out.ok ? (out.warning ?? `${f.type} replaced`) : out.reason)
    })
  const remove = (f: HiringFile) => {
    if (armed !== f.id) return setArmed(f.id)
    setArmed(null)
    start(async () => {
      const out = await removeHiringFile(f.id)
      flash(out.ok ? (out.warning ?? `${f.name} moved to the Bin`) : out.reason)
    })
  }
  const begin = () => {
    setTypeId(startingType(board.fileTypes, t.files, []))
    setNewName('')
    setAdding(true)
  }
  const add = (file: File) => {
    if (!typeId) return flash('Pick what kind of file it is.')
    if (typeId === NEW_TYPE && !newName.trim()) return flash('Name the new file type.')
    start(async () => {
      const sent = await sendWaiting([{ key: file.name, file, typeId, newName }], board.fileTypes)
      if (!sent.ok) return flash(sent.reason)
      const out = await addHiringFiles('talent', t.id, sent.files)
      if (!out.ok) return flash(out.reason)
      flash(`${file.name} added`)
      setAdding(false)
    })
  }

  return (
    <section className={`${s.card} ${s.hfCard}`} aria-label="Files">
      <div className={s.hfHead}>
        <SecLabel>Files</SecLabel>
        <span className={s.grow} />
        {(can.create || can.edit) && !adding ? (
          <button type="button" className={s.btnGhost} onClick={begin}>
            + Add file
          </button>
        ) : null}
      </div>
      {t.files.map(f => (
        <FileRow key={f.id} name={f.name} type={f.type}>
          <button type="button" className={s.btnGhost} onClick={() => open(f)}>
            Open
          </button>
          {can.edit ? (
            <label className={s.btnGhost} style={{ cursor: 'pointer' }}>
              Replace
              <input
                type="file"
                accept={HIRING_ACCEPT}
                className={s.hiddenFile}
                aria-label={`Replace ${f.name}`}
                onChange={e => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) replace(f, file)
                }}
              />
            </label>
          ) : null}
          {can.edit ? (
            <button type="button" className={`${s.btnGhost} ${s.hfRemove}`} data-armed={armed === f.id ? 'true' : undefined} onClick={() => remove(f)}>
              {armed === f.id ? 'Confirm remove' : 'Remove'}
            </button>
          ) : null}
        </FileRow>
      ))}
      {t.files.length === 0 && !adding ? <div className={s.hfNone}>No files yet.</div> : null}
      {adding ? (
        <div className={s.hfAdd}>
          <FileTypePick types={board.fileTypes} value={typeId} newName={newName} canAdd={can.edit} label="What the file is" onChange={setTypeId} onNewName={setNewName} />
          <label className={s.btnOrange} style={{ cursor: busy ? 'wait' : 'pointer' }}>
            Choose file
            <input
              type="file"
              accept={HIRING_ACCEPT}
              className={s.hiddenFile}
              aria-label="Choose the file"
              disabled={busy}
              onChange={e => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) add(file)
              }}
            />
          </label>
          <button type="button" className={s.btnPlain} onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      ) : null}
    </section>
  )
}
