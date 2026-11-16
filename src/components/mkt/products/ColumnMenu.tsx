'use client'

import { useEffect, useState } from 'react'
import type { ItemColumn } from '@/lib/marketing/catalog'
import pb from './products.module.css'
import v2 from './v2.module.css'

// The right-click menu on a Product List column of the manager's (the user, 2026-11-13: "多一个删除和可拖动调整位置"):
// its settings, a move either way, and Delete — asked first, with how many values go with it. Kept on screen.
export default function ColumnMenu({ column, used, x, y, first, last, onSettings, onMove, onDelete, onClose, onInternal }: {
  column: ItemColumn
  /** v2 §5: Internal only — the column off the client's PDF (its `client` off). */
  onInternal?: () => void
  /** How many items hold a value in it. */
  used: number
  x: number
  y: number
  first: boolean
  last: boolean
  onSettings: () => void
  onMove: (by: -1 | 1) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [ask, setAsk] = useState(false)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  const left = Math.max(8, Math.min(x, window.innerWidth - 240))
  const top = Math.max(8, Math.min(y, window.innerHeight - (onInternal ? 290 : 220)))
  return (
    <>
      <div className={pb.ctxScrim} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div className={pb.ctx} style={{ left, top }} role="menu" aria-label={`Column ${column.name}`}>
        <div className={pb.ctxName}>{column.name}</div>
        {onInternal ? (
          <>
            <button type="button" role="menuitemcheckbox" aria-checked={!column.client} className={`${v2.menuRow} ${v2.menuRowTop}`} onClick={onInternal}>
              <span className={v2.menuTwo}><span>Internal only</span><span className={v2.menuHint}>Not shown on the client’s PDF</span></span>
              <span className={`${v2.switch}${!column.client ? ` ${v2.switchOn}` : ''}`} aria-hidden="true" />
            </button>
            <div className={pb.ctxLine} />
          </>
        ) : null}
        <button type="button" role="menuitem" className={pb.ctxRow} onClick={onSettings}>Settings…</button>
        <button type="button" role="menuitem" className={`${pb.ctxRow}${first ? ` ${pb.ctxOff}` : ''}`} disabled={first} onClick={() => onMove(-1)}>← Move left</button>
        <button type="button" role="menuitem" className={`${pb.ctxRow}${last ? ` ${pb.ctxOff}` : ''}`} disabled={last} onClick={() => onMove(1)}>Move right →</button>
        <div className={pb.ctxLine} />
        {ask ? (
          <div className={pb.ctxAsk}>
            <span className={pb.ctxAskText}>{used ? `Delete “${column.name}” and its ${used} value${used === 1 ? '' : 's'}?` : `Delete “${column.name}”?`} This cannot be undone.</span>
            <span className={pb.ctxAskBtns}>
              <button type="button" className={pb.ctxDanger} onClick={onDelete}>Delete</button>
              <button type="button" className={pb.ctxKeep} onClick={() => setAsk(false)}>Keep</button>
            </span>
          </div>
        ) : (
          <button type="button" role="menuitem" className={`${pb.ctxRow} ${pb.ctxDel}`} onClick={() => setAsk(true)}>Delete column</button>
        )}
      </div>
    </>
  )
}
