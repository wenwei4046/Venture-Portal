'use client'

import { useState } from 'react'
import { flash } from '@/components/hrv/toast'
import { fileLetter, setLetterShare, withdrawLetter } from '@/lib/documentation/actions'
import {
  DOC_ACCEPT, LETTER_STATUS, deptLabel, docShortDay, letterStatus, liveLetters, missingFor, plural, type DataCenterPerson, type Documentation,
} from '@/lib/documentation/model'
import { uploadDocumentationFile } from '@/lib/documentation/upload'
import { downloadFile } from '../DocumentsTab'
import ds from '../documentation.module.css'
import { FileTile } from './Cards'
import type { MenuItem } from './Menu'
import { BinGlyph, DownGlyph, EyeGlyph, SharedGlyph, UploadGlyph } from './icons'
import s from './drive.module.css'

/**
 * A person's folder in the Data center (2026-10-12): their record, as before — name, `title · code · dept · N
 * letters on file`, the orange Upload, every compulsory letter they lack as a red row with its own Upload — and
 * their letters as the Drive's file cards: a press views one; ⋮ › View · Download · (Documentation · Edit)
 * Withdraw, asked twice. Withdrawn ones wait greyed under "Show withdrawn". Every copy "Publish & save" makes for
 * them lands here by itself.
 *
 * Since 2026-10-14 (the user: a document such as the offer letter can be kept from its person) each letter's ⋮ has
 * "<person> can view", ticked while they see it (Edit): unticked, the letter stays on the record and counts, but is
 * nowhere in their app — *Hidden* on its card. The folders and files HR keeps for them are drawn under it by the
 * Data center (DataCenterTab).
 */
export default function PersonFolder({
  data,
  person,
  can,
  onView,
  onUpload,
}: {
  data: Documentation
  person: DataCenterPerson
  can: { create: boolean; edit: boolean }
  onView: (letterId: string) => void
  onUpload: () => void
}) {
  const [showGone, setShowGone] = useState(false)
  const all = data.letters.filter(l => l.staffId === person.id)
  const mine = liveLetters(all)
  const gone = all.filter(l => l.withdrawnAt)
  const missing = missingFor(person.id, data.letters, data.letterTypes)
  const deptName = person.departmentId ? deptLabel(data.departments.find(d => d.id === person.departmentId)?.name ?? '') : ''

  async function fileMissing(typeId: string, typeName: string, file: File) {
    const up = await uploadDocumentationFile({ letterFor: person.id }, file)
    if (!up.ok) return flash(up.reason)
    const res = await fileLetter({ staffId: person.id, typeId, path: up.path, fileName: up.fileName, contentType: up.contentType, size: up.size })
    flash(res.ok ? `${typeName} filed to ${person.name}'s record` : res.reason)
  }

  async function download(id: string, fileName: string) {
    const refused = await downloadFile('letter', id)
    flash(refused ?? `Downloads ${fileName}`)
  }

  async function withdraw(id: string) {
    const res = await withdrawLetter(id)
    flash(res.ok ? `${res.type} withdrawn · ${res.person || 'its person'} no longer sees it` : res.reason)
  }

  async function share(id: string, on: boolean) {
    const res = await setLetterShare(id, on)
    flash(!res.ok ? res.reason : on ? `${res.type} · ${res.person || person.name} can view it again` : `${res.type} kept from ${res.person || person.name} · still on the record`)
  }

  /**
   * A letter's ⋮: View · Download; for Documentation · Edit, "<person> can view" (ticked while they see it) and
   * Withdraw (asked twice).
   */
  function letterItems(id: string, fileName: string, hidden: boolean): Array<MenuItem | 'rule'> {
    const items: Array<MenuItem | 'rule'> = [
      { key: 'view', label: 'View', icon: <EyeGlyph />, onSelect: () => onView(id) },
      { key: 'download', label: 'Download', icon: <DownGlyph />, onSelect: () => void download(id, fileName) },
    ]
    if (can.edit) {
      items.push(
        'rule',
        { key: 'share', label: `${person.name} can view`, icon: <SharedGlyph />, checked: !hidden, onSelect: () => void share(id, hidden) },
        'rule',
        { key: 'withdraw', label: 'Withdraw', confirm: 'Confirm withdraw', tone: 'danger', icon: <BinGlyph />, onSelect: () => void withdraw(id) },
      )
    }
    return items
  }

  return (
    <section className={ds.record} aria-labelledby="dc-name">
      <div className={ds.recordHead}>
        <div className={ds.recordWho}>
          <div id="dc-name" className={ds.recordName}>{person.name}</div>
          <div className={ds.recordMeta}>
            {[person.title, person.code, deptName, `${plural(mine.length, 'letter')} on file`].filter(Boolean).join(' · ')}
          </div>
        </div>
        {can.create ? (
          <button type="button" className={ds.uploadBtn} onClick={onUpload}>
            <UploadGlyph size={14} />
            Upload
          </button>
        ) : null}
      </div>

      {missing.length ? (
        <div className={ds.onFile}>
          {missing.map(t => (
            <div key={t.id} className={ds.missingRow}>
              <span className={ds.missingBang} aria-hidden="true">!</span>
              <div className={ds.missingText}>
                <span className={ds.missingName}>{t.name} missing</span>
                <span className={ds.missingWhy}>Compulsory for everyone</span>
              </div>
              {can.create ? (
                <label className={ds.missingUpload}>
                  Upload
                  <input
                    type="file"
                    accept={DOC_ACCEPT}
                    className={ds.hiddenFile}
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
        </div>
      ) : null}

      <div className={s.sect}>
        <div className={s.sectHead}>
          Letters on file <span className={s.sectCount}>{mine.length}</span>
        </div>
        {mine.length ? (
          <div className={s.grid}>
            {mine.map(l => {
              const status = LETTER_STATUS[letterStatus(l)]
              return (
                <FileTile
                  key={l.id}
                  title={l.typeName}
                  sub={l.fileName}
                  fileName={l.fileName}
                  contentType={l.contentType}
                  onView={() => onView(l.id)}
                  meta={
                    <>
                      <span>Filed {docShortDay(l.filedAt)}</span>
                      <span className={s.fileMetaGap} />
                      {l.hiddenAt ? (
                        <span className={s.status} data-tone="muted" title={`Kept from ${person.name} — still on the record`}>Hidden</span>
                      ) : null}
                      <span className={s.status} data-tone={status.tone}>{status.label}</span>
                    </>
                  }
                  items={letterItems(l.id, l.fileName, !!l.hiddenAt)}
                />
              )
            })}
          </div>
        ) : (
          <div className={ds.recordEmpty}>No letters on file yet.</div>
        )}
        {showGone && gone.length ? (
          <div className={s.grid}>
            {gone.map(l => (
              <FileTile
                key={l.id}
                gone
                title={l.typeName}
                sub={l.fileName}
                fileName={l.fileName}
                contentType={l.contentType}
                onView={() => onView(l.id)}
                meta={<span className={s.gone}>Withdrawn · {docShortDay(l.withdrawnAt ?? '')}</span>}
                items={[{ key: 'view', label: 'View', icon: <EyeGlyph />, onSelect: () => onView(l.id) }]}
              />
            ))}
          </div>
        ) : null}
        {gone.length ? (
          <button type="button" className={s.toggle} onClick={() => setShowGone(v => !v)}>
            {showGone ? 'Hide' : 'Show'} withdrawn ({gone.length})
          </button>
        ) : null}
      </div>
    </section>
  )
}
