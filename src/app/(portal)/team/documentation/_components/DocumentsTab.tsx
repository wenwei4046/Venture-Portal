'use client'

import { useMemo, useState } from 'react'
import { flash } from '@/components/hrv/toast'
import { deleteDocument, openDocumentationFile, saveDocument } from '@/lib/documentation/actions'
import { DOC_ACCEPT, deptLabel, docDay, fileExt, nameFromFile, plural, type Documentation } from '@/lib/documentation/model'
import { uploadDocumentationFile } from '@/lib/documentation/upload'
import s from './documentation.module.css'

/** The department a new document goes to first: the biggest — Revenue, as the handoff starts it. */
export function firstDepartment(data: Pick<Documentation, 'departments'>): string[] {
  const rev = data.departments.find(d => /^revenue/i.test(d.name)) ?? data.departments[0]
  return rev ? [rev.id] : []
}

/** Opens a file the way the browser downloads: a short link with its name. */
export async function downloadFile(kind: 'document' | 'letter', id: string): Promise<string | null> {
  const link = await openDocumentationFile(kind, id, 'download')
  if (!link.ok) return link.reason
  window.location.assign(link.url)
  return null
}

/**
 * Documentation › Documents (README §10, portal-24): upload a document for
 * whole departments to see in the Revenue app; the list beside it — View ·
 * Download · Delete (asks once more), deleted ones kept under "Show deleted".
 */
export default function DocumentsTab({
  data,
  can,
  onView,
}: {
  data: Documentation
  can: { create: boolean; edit: boolean }
  onView: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [depts, setDepts] = useState<string[]>(() => firstDepartment(data))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState<string | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)

  const live = useMemo(() => data.documents.filter(d => !d.deletedAt), [data.documents])
  const gone = useMemo(() => data.documents.filter(d => d.deletedAt), [data.documents])
  const rows = data.documents.filter(d => !d.deletedAt || showDeleted)

  async function save() {
    if (busy) return
    if (!file) return setError('Choose a file to upload.')
    if (depts.length === 0) return setError('Pick at least one department.')
    setBusy(true)
    setError('')
    try {
      const up = await uploadDocumentationFile('documents', file)
      if (!up.ok) return setError(up.reason)
      const docName = name.trim() || nameFromFile(file.name)
      const res = await saveDocument({ name: docName, path: up.path, fileName: up.fileName, contentType: up.contentType, size: up.size, departmentIds: depts })
      if (!res.ok) return setError(res.reason)
      const names = data.departments.filter(d => depts.includes(d.id)).map(d => deptLabel(d.name))
      setName('')
      setFile(null)
      flash(`${docName} saved · ${names.join(', ')} can see it in the Revenue app`)
    } catch {
      setError('The document could not be saved. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string, docName: string) {
    if (armed !== id) return setArmed(id)
    setArmed(null)
    const res = await deleteDocument(id)
    flash(res.ok ? `${docName} deleted · removed from the Revenue app` : res.reason)
  }

  async function download(id: string, fileName: string) {
    const refused = await downloadFile('document', id)
    flash(refused ?? `Downloads ${fileName}`)
  }

  return (
    <div className={s.docsGrid}>
      {can.create ? (
        <section className={`${s.card} ${s.uploadCard}`} aria-labelledby="doc-upload">
          <div id="doc-upload" className={s.cardTitle}>Upload a document</div>
          <label className={s.field}>
            <span className={s.fieldLabel}>Name</span>
            <input
              className={s.input}
              value={name}
              maxLength={200}
              placeholder="e.g. Price list · November 2026"
              onChange={e => {
                setName(e.target.value)
                setError('')
              }}
            />
          </label>
          <div className={s.fileBox}>
            <div className={s.fileBoxText}>
              <div className={s.fileBoxName}>{file ? file.name : 'No file chosen'}</div>
              <div className={s.fileBoxHint}>PDF, Excel, Word or image</div>
            </div>
            <label className={s.fileBtn}>
              {file ? 'Replace' : 'Upload'}
              <input
                type="file"
                accept={DOC_ACCEPT}
                className={s.hiddenFile}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) {
                    setFile(f)
                    setError('')
                  }
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          <div className={s.field} style={{ gap: 6 }}>
            <span className={s.fieldLabel} id="doc-depts">Who can see it · by department</span>
            <div className={s.pickRow} role="group" aria-labelledby="doc-depts">
              {data.departments.map(d => {
                const on = depts.includes(d.id)
                return (
                  <button
                    key={d.id}
                    type="button"
                    className={s.pick}
                    aria-pressed={on}
                    onClick={() => {
                      setDepts(x => (on ? x.filter(id => id !== d.id) : [...x, d.id]))
                      setError('')
                    }}
                  >
                    <span aria-hidden="true">{on ? '☑' : '☐'}</span>
                    {deptLabel(d.name)}
                  </button>
                )
              })}
            </div>
          </div>
          <div className={s.saveRow}>
            <span className={s.err} role={error ? 'alert' : undefined}>{error}</span>
            <button type="button" className={s.primary} onClick={save} disabled={busy}>
              Save
            </button>
          </div>
        </section>
      ) : null}

      <section className={s.card} aria-labelledby="doc-list" style={can.create ? undefined : { gridColumn: '1 / -1' }}>
        <div className={s.listHead}>
          <span id="doc-list" className={s.cardTitle}>Documents</span>
          <span className={s.listHeadRight}>
            {gone.length > 0 ? (
              <button type="button" className={s.showDeleted} onClick={() => setShowDeleted(v => !v)}>
                {showDeleted ? 'Hide' : 'Show'} deleted ({gone.length})
              </button>
            ) : null}
            <span className={s.count}>{plural(live.length, 'file')}</span>
          </span>
        </div>
        {rows.map(d => {
          const deleted = !!d.deletedAt
          const isArmed = armed === d.id
          return (
            <div key={d.id} className={s.docRow} data-deleted={deleted ? 'true' : undefined}>
              <span className={s.extTile} aria-hidden="true">{fileExt(d.fileName)}</span>
              <div className={s.docText}>
                <div className={s.docName}>{d.name}</div>
                <div className={s.docMeta}>{`${d.fileName} · ${docDay(d.uploadedAt)} · ${d.uploadedBy}`}</div>
                <div className={s.deptPills}>
                  {d.departments.map(x => (
                    <span key={x} className={s.deptPill}>{deptLabel(x)}</span>
                  ))}
                </div>
              </div>
              <button type="button" className={s.smallBtn} onClick={() => onView(d.id)}>View</button>
              {deleted ? (
                <span className={s.deletedMark}>Deleted</span>
              ) : (
                <>
                  <button type="button" className={s.smallBtn} onClick={() => download(d.id, d.fileName)}>Download</button>
                  {can.edit ? (
                    <button type="button" className={`${s.smallBtn} ${s.deleteBtn}`} data-armed={isArmed ? 'true' : undefined} onClick={() => remove(d.id, d.name)}>
                      {isArmed ? 'Confirm delete' : 'Delete'}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          )
        })}
        {live.length === 0 && !showDeleted ? <div className={s.empty}>No documents yet.</div> : null}
      </section>
    </div>
  )
}
