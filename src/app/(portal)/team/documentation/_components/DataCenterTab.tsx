'use client'

import { useMemo, useRef, useState } from 'react'
import { flash } from '@/components/hrv/toast'
import { fileLetter, withdrawLetter } from '@/lib/documentation/actions'
import { DOC_ACCEPT, dataCenterPeople, deptLabel, docShortDay, fileExt, liveLetters, missingFor, plural, type Documentation } from '@/lib/documentation/model'
import { uploadDocumentationFile } from '@/lib/documentation/upload'
import { downloadFile } from './DocumentsTab'
import UploadLetterWindow from './UploadLetterWindow'
import s from './documentation.module.css'

const UploadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
  </svg>
)
const EyeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)
const DownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
  </svg>
)

/**
 * Documentation › Data center (README §10, portal-25/26): every person on the
 * payroll, a red "!" where a compulsory letter is missing; on the right their
 * record — Upload (the 460px window), each missing compulsory letter as a red
 * row with its own Upload, and the letters on file with View and Download.
 * With Documentation · Edit a letter can be withdrawn (2026-10-11, the user's
 * answer E — asks once more, as Delete does); withdrawn ones wait greyed under
 * "Show withdrawn", their trail a View away.
 */
export default function DataCenterTab({
  data,
  can,
  person,
  onPerson,
  onView,
}: {
  data: Documentation
  can: { create: boolean; edit: boolean }
  person: string | null
  onPerson: (id: string) => void
  onView: (letterId: string) => void
}) {
  const [find, setFind] = useState('')
  const [upload, setUpload] = useState(false)
  const [armed, setArmed] = useState<string | null>(null)
  const [showGone, setShowGone] = useState(false)
  const recordRef = useRef<HTMLElement>(null)
  const people = useMemo(() => dataCenterPeople(data), [data])
  const q = find.trim().toLowerCase()
  const shown = q ? people.filter(p => p.name.toLowerCase().includes(q)) : people
  const me = people.find(p => p.id === person) ?? people[0] ?? null
  const all = me ? data.letters.filter(l => l.staffId === me.id) : []
  const mine = liveLetters(all)
  const gone = all.filter(l => l.withdrawnAt)
  const missing = me ? missingFor(me.id, data.letters, data.letterTypes) : []
  const deptName = me?.departmentId ? deptLabel(data.departments.find(d => d.id === me.departmentId)?.name ?? '') : ''

  async function fileMissing(typeId: string, typeName: string, file: File) {
    if (!me) return
    const up = await uploadDocumentationFile({ letterFor: me.id }, file)
    if (!up.ok) return flash(up.reason)
    const res = await fileLetter({ staffId: me.id, typeId, path: up.path, fileName: up.fileName, contentType: up.contentType, size: up.size })
    flash(res.ok ? `${typeName} filed to ${me.name}'s record` : res.reason)
  }

  // On a phone the record sits under the list: bring it into view.
  function pick(id: string) {
    onPerson(id)
    setArmed(null)
    setShowGone(false)
    if (window.matchMedia('(max-width: 767px)').matches) {
      requestAnimationFrame(() => recordRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }

  async function download(id: string, fileName: string) {
    const refused = await downloadFile('letter', id)
    flash(refused ?? `Downloads ${fileName}`)
  }

  async function withdraw(id: string) {
    if (armed !== id) return setArmed(id)
    setArmed(null)
    const res = await withdrawLetter(id)
    flash(res.ok ? `${res.type} withdrawn · ${res.person || 'its person'} no longer sees it` : res.reason)
  }

  return (
    <div className={s.dcGrid}>
      <section className={s.people} aria-label="People">
        <input className={s.find} value={find} placeholder="Find a person" onChange={e => setFind(e.target.value)} aria-label="Find a person" />
        {shown.map(p => (
          <button key={p.id} type="button" className={s.person} aria-current={me?.id === p.id ? 'true' : undefined} onClick={() => pick(p.id)}>
            <div style={{ minWidth: 0 }}>
              <div className={s.personName}>{p.name}</div>
              <div className={s.personLine}>{p.line}</div>
            </div>
            <span className={s.personRight}>
              {p.missing ? (
                <span className={s.bang} title={p.missing} aria-label={p.missing}>!</span>
              ) : null}
              <span className={s.count}>{p.letters}</span>
            </span>
          </button>
        ))}
      </section>

      {me ? (
        <section ref={recordRef} className={s.record} aria-labelledby="dc-name">
          <div className={s.recordHead}>
            <div className={s.recordWho}>
              <div id="dc-name" className={s.recordName}>{me.name}</div>
              <div className={s.recordMeta}>
                {[me.title, me.code, deptName, `${plural(mine.length, 'letter')} on file`].filter(Boolean).join(' · ')}
              </div>
            </div>
            {can.create ? (
              <button type="button" className={s.uploadBtn} onClick={() => setUpload(true)}>
                <UploadIcon />
                Upload
              </button>
            ) : null}
          </div>
          <div className={s.onFile}>
            <span className={s.onFileLabel}>On file</span>
            {missing.map(t => (
              <div key={t.id} className={s.missingRow}>
                <span className={s.missingBang} aria-hidden="true">!</span>
                <div className={s.missingText}>
                  <span className={s.missingName}>{t.name} missing</span>
                  <span className={s.missingWhy}>Compulsory for everyone</span>
                </div>
                {can.create ? (
                  <label className={s.missingUpload}>
                    Upload
                    <input
                      type="file"
                      accept={DOC_ACCEPT}
                      className={s.hiddenFile}
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) void fileMissing(t.id, t.name, f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                ) : null}
              </div>
            ))}
            {mine.map(l => (
              <div key={l.id} className={s.letterRow} data-edit={can.edit ? 'true' : undefined}>
                <span className={s.page} aria-hidden="true">
                  <span className={s.pageFold} />
                  <span className={s.pageLine1} />
                  <span className={s.pageLine2} />
                  <span className={s.pageExt}>{fileExt(l.fileName) || 'PDF'}</span>
                </span>
                <span className={s.letterType}>{l.typeName}</span>
                <button type="button" className={s.iconBtn} onClick={() => onView(l.id)}>
                  <EyeIcon />
                  View
                </button>
                <button type="button" className={s.iconBtn} onClick={() => download(l.id, l.fileName)}>
                  <DownIcon />
                  Download
                </button>
                {can.edit ? (
                  <button
                    type="button"
                    className={`${s.iconBtn} ${s.deleteBtn}`}
                    data-armed={armed === l.id ? 'true' : undefined}
                    aria-label={armed === l.id ? `Confirm withdrawing ${l.typeName}` : `Withdraw ${l.typeName}`}
                    onClick={() => void withdraw(l.id)}
                  >
                    {armed === l.id ? 'Confirm withdraw' : 'Withdraw'}
                  </button>
                ) : null}
              </div>
            ))}
            {mine.length === 0 ? <div className={s.recordEmpty}>No letters on file yet.</div> : null}
            {showGone
              ? gone.map(l => (
                  <div key={l.id} className={s.letterRow} data-gone="true">
                    <span className={s.page} aria-hidden="true">
                      <span className={s.pageFold} />
                      <span className={s.pageLine1} />
                      <span className={s.pageLine2} />
                      <span className={s.pageExt}>{fileExt(l.fileName) || 'PDF'}</span>
                    </span>
                    <span className={s.letterType}>{l.typeName}</span>
                    <span className={s.deletedMark}>Withdrawn · {docShortDay(l.withdrawnAt ?? '')}</span>
                    <button type="button" className={s.iconBtn} onClick={() => onView(l.id)}>
                      <EyeIcon />
                      View
                    </button>
                  </div>
                ))
              : null}
            {gone.length > 0 ? (
              <button type="button" className={`${s.showDeleted} ${s.goneToggle}`} onClick={() => setShowGone(v => !v)}>
                {showGone ? 'Hide' : 'Show'} withdrawn ({gone.length})
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <section className={s.record}>
          <div className={s.recordEmpty}>Nobody is on the payroll yet.</div>
        </section>
      )}

      {me && upload ? (
        <UploadLetterWindow person={{ id: me.id, name: me.name }} types={data.letterTypes} onClose={() => setUpload(false)} />
      ) : null}
    </div>
  )
}
