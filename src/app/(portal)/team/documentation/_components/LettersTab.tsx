'use client'

import { useState } from 'react'
import { flash } from '@/components/hrv/toast'
import { addLetterType, deleteLetterType, setLetterTypeCompulsory } from '@/lib/documentation/actions'
import { LETTER_STATUS, docDay, letterStatus, liveLetters, missingCount, plural, type Documentation, type LetterType } from '@/lib/documentation/model'
import { downloadFile } from './DocumentsTab'
import SwitchMenu from './SwitchMenu'
import s from './documentation.module.css'

const ALL = 'all'

/**
 * Documentation › Letters (README §10, portal-27): every letter on file, of
 * one type or all — the type switcher holds the types themselves (count,
 * Compulsory, × and a new one at its foot); a compulsory type says how many
 * people still have none. A name opens their record in Data center, where a
 * letter is withdrawn (2026-10-11); withdrawn ones show here under "Show
 * withdrawn", greyed, View only — the table keeps the handoff's columns.
 */
export default function LettersTab({
  data,
  can,
  onView,
  onPerson,
}: {
  data: Documentation
  can: { create: boolean; edit: boolean }
  onView: (letterId: string) => void
  onPerson: (staffId: string) => void
}) {
  const [sel, setSel] = useState<string>(ALL)
  const [showGone, setShowGone] = useState(false)
  // A type just added shows, picked, at once — until the page's next read brings it.
  const [justAdded, setJustAdded] = useState<{ type: LetterType; before: readonly LetterType[] } | null>(null)
  const pending = justAdded && justAdded.before === data.letterTypes && !data.letterTypes.some(t => t.id === justAdded.type.id) ? justAdded.type : null
  const types = pending ? [...data.letterTypes, pending] : data.letterTypes
  const cur = types.find(t => t.id === sel) ?? null
  const ofType = cur ? data.letters.filter(l => l.typeId === cur.id) : data.letters
  const live = liveLetters(ofType)
  const gone = ofType.filter(l => l.withdrawnAt)
  const list = showGone ? [...live, ...gone] : live
  const missing = cur ? missingCount(cur, data.people, data.letters) : 0

  async function toggleCompulsory(id: string, name: string, on: boolean) {
    const res = await setLetterTypeCompulsory(id, !on)
    flash(res.ok ? (on ? `${name} is no longer compulsory` : `${name} is now compulsory · people without one are flagged in Data center`) : res.reason)
  }

  async function remove(id: string, name: string, count: number) {
    if (count > 0) return flash(`${name} has letters on file, so it cannot be deleted`)
    const res = await deleteLetterType(id)
    if (res.ok && sel === id) setSel(ALL)
    flash(res.ok ? `${name} deleted` : res.reason)
  }

  async function add(name: string): Promise<boolean> {
    if (types.some(t => t.name.trim().toLowerCase() === name.toLowerCase())) {
      flash(`${name} already exists`)
      return false
    }
    const res = await addLetterType(name)
    if (!res.ok) {
      flash(res.reason)
      return false
    }
    setJustAdded({ type: { id: res.id, name, compulsory: false, count: 0 }, before: data.letterTypes })
    setSel(res.id)
    flash(`${name} added`)
    return true
  }

  async function download(id: string, fileName: string) {
    const refused = await downloadFile('letter', id)
    flash(refused ?? `Downloads ${fileName}`)
  }

  const rows = [{ id: ALL, name: 'All letters', count: liveLetters(data.letters).length, compulsory: false }, ...types]

  return (
    <div>
      <div className={s.letBar}>
        <SwitchMenu
          keyWord="Letter type"
          value={cur ? cur.name : 'All letters'}
          minWidth={260}
          menuWidth={360}
          label="Letter type"
          addPlaceholder={can.create || can.edit ? 'New letter type' : undefined}
          onAdd={can.create || can.edit ? add : undefined}
        >
          {close =>
            rows.map(t => {
              const all = t.id === ALL
              const on = sel === t.id
              return (
                <div key={t.id} className={s.menuRow} aria-current={on ? 'true' : undefined}>
                  <button
                    type="button"
                    className={s.menuPick}
                    role="menuitem"
                    onClick={() => {
                      setSel(t.id)
                      close()
                    }}
                  >
                    {t.name}
                    <span className={s.menuCount}>{t.count}</span>
                  </button>
                  {!all && can.edit ? (
                    <>
                      <button
                        type="button"
                        className={s.req}
                        aria-pressed={t.compulsory}
                        title="Compulsory letters are flagged as missing in Data center"
                        onClick={() => void toggleCompulsory(t.id, t.name, t.compulsory)}
                      >
                        Compulsory
                        <span className={s.reqTrack} aria-hidden="true">
                          <span className={s.reqKnob} />
                        </span>
                      </button>
                      <button type="button" className={s.x} title="Delete letter type" aria-label={`Delete ${t.name}`} onClick={() => void remove(t.id, t.name, t.count)}>
                        ×
                      </button>
                    </>
                  ) : null}
                </div>
              )
            })
          }
        </SwitchMenu>
        {cur?.compulsory ? (
          <span className={s.reqPill}>Compulsory · {missing ? `${plural(missing, 'person', 'people')} missing` : 'everyone has one'}</span>
        ) : null}
        <span className={s.countLine}>
          {plural(live.length, 'letter')}
          {cur ? '' : ` across ${plural(types.length, 'type')}`}
        </span>
        {gone.length > 0 ? (
          <button type="button" className={s.showDeleted} onClick={() => setShowGone(v => !v)}>
            {showGone ? 'Hide' : 'Show'} withdrawn ({gone.length})
          </button>
        ) : null}
      </div>

      <div className={s.tableScroll}>
        <div className={s.table} role="table" aria-label="Letters">
          <div className={s.tableHead} role="row">
            <span role="columnheader">Person</span>
            <span role="columnheader">Letter</span>
            <span role="columnheader">File</span>
            <span role="columnheader">Filed</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" aria-label="Actions" />
          </div>
          {list.map(l => {
            const st = LETTER_STATUS[letterStatus(l)]
            const withdrawn = !!l.withdrawnAt
            return (
              <div key={l.id} className={s.tableRow} role="row" data-gone={withdrawn ? 'true' : undefined}>
                <button type="button" className={s.cellName} onClick={() => onPerson(l.staffId)}>{l.staffName}</button>
                <span className={s.cell}>{l.typeName}</span>
                <span className={s.cellFile}>{l.fileName}</span>
                <span className={s.cellWhen}>{docDay(l.filedAt)}</span>
                <span className={s.cell}>
                  <span className={s.status} data-tone={st.tone}>
                    <span className={s.statusDot} aria-hidden="true" />
                    {st.label}
                  </span>
                  {l.hiddenAt && !withdrawn ? (
                    <span className={s.status} data-tone="muted" title={`Kept from ${l.staffName} — still on the record`}>Hidden</span>
                  ) : null}
                </span>
                <span className={s.cellActions}>
                  <button type="button" className={s.smallBtn} onClick={() => onView(l.id)}>View</button>
                  {withdrawn ? null : (
                    <button type="button" className={s.smallBtn} onClick={() => void download(l.id, l.fileName)}>Download</button>
                  )}
                </span>
              </div>
            )
          })}
          {list.length === 0 ? <div className={s.tableEmpty}>No letters of this type yet. Upload one from a person&apos;s record in Data center.</div> : null}
        </div>
      </div>
    </div>
  )
}
