'use client'

import { useMemo, useState } from 'react'
import { flash } from '@/components/hrv/toast'
import { fileLetter } from '@/lib/documentation/actions'
import { DOC_ACCEPT, dataCenterPeople, deptLabel, fileExt, missingFor, plural, type Documentation } from '@/lib/documentation/model'
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
  const people = useMemo(() => dataCenterPeople(data), [data])
  const q = find.trim().toLowerCase()
  const shown = q ? people.filter(p => p.name.toLowerCase().includes(q)) : people
  const me = people.find(p => p.id === person) ?? people[0] ?? null
  const mine = me ? data.letters.filter(l => l.staffId === me.id) : []
  const missing = me ? missingFor(me.id, data.letters, data.letterTypes) : []
  const deptName = me?.departmentId ? deptLabel(data.departments.find(d => d.id === me.departmentId)?.name ?? '') : ''

  async function fileMissing(typeId: string, typeName: string, file: File) {
    if (!me) return
    const up = await uploadDocumentationFile({ letterFor: me.id }, file)
    if (!up.ok) return flash(up.reason)
    const res = await fileLetter({ staffId: me.id, typeId, path: up.path, fileName: up.fileName, contentType: up.contentType, size: up.size })
    flash(res.ok ? `${typeName} filed to ${me.name}'s record` : res.reason)
  }

  async function download(id: string, fileName: string) {
    const refused = await downloadFile('letter', id)
    flash(refused ?? `Downloads ${fileName}`)
  }

  return (
    <div className={s.dcGrid}>
      <section className={s.people} aria-label="People">
        <input className={s.find} value={find} placeholder="Find a person" onChange={e => setFind(e.target.value)} aria-label="Find a person" />
        {shown.map(p => (
          <button key={p.id} type="button" className={s.person} aria-current={me?.id === p.id ? 'true' : undefined} onClick={() => onPerson(p.id)}>
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
        <section className={s.record} aria-labelledby="dc-name">
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
              <div key={l.id} className={s.letterRow}>
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
              </div>
            ))}
            {mine.length === 0 ? <div className={s.recordEmpty}>No letters on file yet.</div> : null}
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
