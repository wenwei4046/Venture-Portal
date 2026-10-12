'use client'

import { useState } from 'react'
import { Window } from '@/components/hrv/overlay'
import { parsePlace } from '@/lib/hiring/bank'
import ds from '@/app/(portal)/team/documentation/_components/documentation.module.css'
import { CompanyGlyph, FolderGlyph } from '@/app/(portal)/team/documentation/_components/drive/icons'
import b from './bank.module.css'

/**
 * Move to… in the Talent Bank's Drive (2026-10-12): a person, a folder with everything in it, or everybody in a
 * department ("change name, and move together"). The Data center's window kind, 440px — where it is now, a finder,
 * every place it may go top down (indented a level at a time; the place it is in marked *Here now*), **Move here**.
 */
export default function MoveWindow({
  title,
  now,
  targets,
  current,
  onMove,
  onClose,
}: {
  /** "Move Nur Iman", "Move Seniors", "Move everyone in Sales". */
  title: string
  /** "Now in HOUZS Venture › Revenue". */
  now: string
  targets: Array<{ at: string; path: string; depth: number }>
  /** The place it is in — shown, never picked. */
  current?: string
  onMove: (at: string) => Promise<{ ok: true } | { ok: false; reason: string }>
  onClose: () => void
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
    const res = await onMove(picked).catch(() => ({ ok: false as const, reason: 'It could not be moved. Please try again.' }))
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
        <input className={ds.winInput} value={query} placeholder="Find a company, department or folder" aria-label="Find a place" onChange={e => setQuery(e.target.value)} />
        <div className={b.moveList} role="listbox" aria-label="Places">
          {rows.map(x => {
            const here = x.at === current
            const company = parsePlace(x.at)?.kind === 'company'
            return (
              <button
                key={x.at}
                type="button"
                role="option"
                aria-selected={picked === x.at}
                aria-pressed={picked === x.at}
                className={b.moveRow}
                style={{ paddingLeft: 12 + (q ? 0 : x.depth * 18) }}
                disabled={here}
                onClick={() => {
                  setPicked(x.at)
                  setError('')
                }}
              >
                <span className={b.moveIcon}>{company ? <CompanyGlyph size={16} /> : <FolderGlyph size={16} />}</span>
                <span className={b.moveName} title={x.path}>{q ? x.path : x.path.split(' › ').at(-1)}</span>
                {here ? <span className={b.moveHere}>Here now</span> : null}
              </button>
            )
          })}
          {rows.length ? null : <div className={b.moveEmpty}>No place matches “{query.trim()}”.</div>}
        </div>
        {error ? <span className={ds.winErr} role="alert">{error}</span> : null}
      </div>
      <div className={ds.winFoot}>
        <button type="button" className={ds.cancel} onClick={onClose}>Cancel</button>
        <button type="button" className={ds.go} disabled={!picked || busy} onClick={() => void move()}>Move here</button>
      </div>
    </Window>
  )
}
