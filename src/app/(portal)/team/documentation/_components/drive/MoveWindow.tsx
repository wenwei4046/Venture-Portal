'use client'

import { useState } from 'react'
import { Window } from '@/components/hrv/overlay'
import ds from '../documentation.module.css'
import { CompanyGlyph, FolderGlyph, PersonGlyph } from './icons'
import s from './drive.module.css'

/**
 * Move to… in a Drive (2026-10-12 for the Talent Bank — a person, a folder with everything in it, everybody in a
 * department; 2026-10-13 for the Data center — a folder with everything in it). The Drive's window kind, 440px —
 * where it is now, a finder, every place it may go top down (indented a level at a time; the place it is in marked
 * *Here now*), **Move here**. Since 2026-10-14 the Data center's Copy to… too (`verb` "Copy here", no place marked),
 * and a person's folder is a place (their glyph).
 */
export default function MoveWindow({
  title,
  now,
  targets,
  current,
  kindOf,
  onMove,
  onClose,
  verb = 'Move here',
}: {
  /** "Move Nur Iman", "Move Seniors", "Move everyone in Sales", "Copy Offer.pdf". */
  title: string
  /** "Now in HOUZS Venture › Revenue". */
  now: string
  targets: Array<{ at: string; path: string; depth: number }>
  /** The place it is in — shown, never picked. */
  current?: string
  /** Which glyph a place wears: a company's building, a person, or a folder. */
  kindOf: (at: string) => 'company' | 'person' | 'folder'
  onMove: (at: string) => Promise<{ ok: true } | { ok: false; reason: string }>
  onClose: () => void
  /** The window's button: "Move here", "Copy here". */
  verb?: string
}) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const q = query.trim().toLowerCase()
  const rows = q ? targets.filter(x => x.path.toLowerCase().includes(q)) : targets

  async function move() {
    if (!picked || busy) return
    setBusy(true)
    setError('')
    const res = await onMove(picked).catch(() => ({ ok: false as const, reason: `It could not be ${verb.startsWith('Copy') ? 'copied' : 'moved'}. Please try again.` }))
    setBusy(false)
    if (!res.ok) return setError(res.reason)
    onClose()
  }

  return (
    <Window open onClose={onClose} width={440} scrim={0.22} label={title}>
      <div className={ds.winHead}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={ds.winTitle}>{title}</div>
          <div className={ds.winSub}>{now}</div>
        </div>
        <button type="button" className={ds.close} onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className={ds.winBody}>
        <input className={ds.winInput} value={query} placeholder="Find a company, department, person or folder" aria-label="Find a place" onChange={e => setQuery(e.target.value)} />
        <div className={s.moveList} role="listbox" aria-label="Places">
          {rows.map(x => {
            const here = x.at === current
            return (
              <button
                key={x.at}
                type="button"
                role="option"
                aria-selected={picked === x.at}
                aria-pressed={picked === x.at}
                className={s.moveRow}
                style={{ paddingLeft: 12 + (q ? 0 : x.depth * 18) }}
                disabled={here}
                onClick={() => {
                  setPicked(x.at)
                  setError('')
                }}
              >
                <span className={s.moveIcon}>
                  {kindOf(x.at) === 'company' ? <CompanyGlyph size={16} /> : kindOf(x.at) === 'person' ? <PersonGlyph size={16} /> : <FolderGlyph size={16} />}
                </span>
                <span className={s.moveName} title={x.path}>{q ? x.path : x.path.split(' › ').at(-1)}</span>
                {here ? <span className={s.moveHere}>Here now</span> : null}
              </button>
            )
          })}
          {rows.length ? null : <div className={s.moveEmpty}>No place matches “{query.trim()}”.</div>}
        </div>
        {error ? <span className={ds.winErr} role="alert">{error}</span> : null}
      </div>
      <div className={ds.winFoot}>
        <button type="button" className={ds.cancel} onClick={onClose}>Cancel</button>
        <button type="button" className={ds.go} disabled={!picked || busy} onClick={() => void move()}>{verb}</button>
      </div>
    </Window>
  )
}
