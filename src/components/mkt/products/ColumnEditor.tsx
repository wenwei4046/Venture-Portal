'use client'

import { useEffect, useRef, useState } from 'react'
import { COLUMN_KINDS, type ColumnKind, type ItemColumn } from '@/lib/marketing/catalog'
import { useOnScreenTop } from './use-on-screen'
import qs from './quotes.module.css'

// One of the manager's own Product List columns, set up (the user, 2026-11-12: "管理者可自行增加 column 去填需要的东西",
// "关系到 product list 的自动联动"): its name, what it holds (text, a number, an amount, a choice of its options, yes /
// no), and where its values follow the item — the products' Items, the quotations' lines, the client's PDF. Floats under
// its column's head (position: fixed), closes on Esc, a click outside, a scroll or a resize. Each change saves at once.

export default function ColumnEditor({ column, used, at, first, last, onSave, onMove, onDelete, onClose }: {
  column: ItemColumn
  /** How many items hold a value in it (what a kind changed or the column deleted would clear). */
  used: number
  at: { left: number; top: number; above?: number }
  first: boolean
  last: boolean
  onSave: (patch: Partial<Pick<ItemColumn, 'name' | 'kind' | 'options' | 'inProducts' | 'inQuotes' | 'client'>>) => void
  onMove: (by: -1 | 1) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(column.name)
  const [opt, setOpt] = useState('')
  const [askKind, setAskKind] = useState<ColumnKind | null>(null)
  const [askDelete, setAskDelete] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const off = (e: Event) => {
      if (e.target instanceof Node && box.current?.contains(e.target)) return
      onClose()
    }
    window.addEventListener('keydown', esc)
    document.addEventListener('mousedown', off)
    document.addEventListener('scroll', off, true)
    window.addEventListener('resize', off)
    return () => {
      window.removeEventListener('keydown', esc)
      document.removeEventListener('mousedown', off)
      document.removeEventListener('scroll', off, true)
      window.removeEventListener('resize', off)
    }
  }, [onClose])

  const commitName = () => {
    const n = name.trim().replace(/\s+/g, ' ')
    if (!n) return setName(column.name)
    if (n !== column.name) onSave({ name: n })
  }
  const addOption = () => {
    const o = opt.trim().replace(/\s+/g, ' ')
    if (!o || column.options.includes(o)) return setOpt('')
    onSave({ options: [...column.options, o] })
    setOpt('')
  }
  const left = Math.max(8, Math.min(at.left, (typeof window === 'undefined' ? 1200 : window.innerWidth) - 300))
  const top = useOnScreenTop(box, at)

  return (
    <div ref={box} className={qs.colPop} style={{ left, top }} role="dialog" aria-label={`Column ${column.name}`}>
      <label className={qs.colField}>
        <span className={qs.colLbl}>Column name</span>
        <input className={qs.colIn} value={name} maxLength={40} autoFocus onChange={e => setName(e.target.value)} onBlur={commitName}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      </label>
      <label className={qs.colField}>
        <span className={qs.colLbl}>What it holds</span>
        <select className={qs.colIn} value={column.kind} onChange={e => {
          const k = e.target.value as ColumnKind
          if (k === column.kind) return
          if (used) setAskKind(k)
          else onSave({ kind: k })
        }}>
          {COLUMN_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      {askKind ? (
        <div className={qs.colWarn}>
          <span>{used} item{used === 1 ? '' : 's'} hold{used === 1 ? 's' : ''} a value in it — changing what it holds clears them.</span>
          <span className={qs.colWarnBtns}>
            <button type="button" className={qs.colDanger} onClick={() => { onSave({ kind: askKind }); setAskKind(null) }}>Change and clear</button>
            <button type="button" className={qs.colPlain} onClick={() => setAskKind(null)}>Keep</button>
          </span>
        </div>
      ) : null}
      {column.kind === 'choice' ? (
        <div className={qs.colField}>
          <span className={qs.colLbl}>Options</span>
          <div className={qs.colOpts}>
            {column.options.map(o => (
              <span key={o} className={qs.colOpt}>
                {o}
                <button type="button" className={qs.colOptX} aria-label={`Remove ${o}`} title="Items that picked it are cleared"
                  onClick={() => onSave({ options: column.options.filter(x => x !== o) })}>×</button>
              </span>
            ))}
            {!column.options.length ? <span className={qs.colNone}>No options yet</span> : null}
          </div>
          <span className={qs.colAddRow}>
            <input className={qs.colIn} value={opt} maxLength={40} placeholder="Add an option — press Enter" aria-label="Add an option"
              onChange={e => setOpt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addOption() }} />
            <button type="button" className={`${qs.colPlain}${opt.trim() ? '' : ` ${qs.faded}`}`} onClick={addOption}>Add</button>
          </span>
        </div>
      ) : null}
      <div className={qs.colField}>
        <span className={qs.colLbl}>Follows the item to</span>
        <label className={qs.colTick}>
          <input type="checkbox" checked={column.inProducts} onChange={e => onSave({ inProducts: e.target.checked })} />
          Products · their Items table
        </label>
        <label className={qs.colTick}>
          <input type="checkbox" checked={column.inQuotes} onChange={e => onSave({ inQuotes: e.target.checked, ...(e.target.checked ? {} : { client: false }) })} />
          Quotations · each line and the internal sheet
        </label>
        <label className={`${qs.colTick}${column.inQuotes ? '' : ` ${qs.faded}`}`}>
          <input type="checkbox" checked={column.client} disabled={!column.inQuotes} onChange={e => onSave({ client: e.target.checked })} />
          The client’s PDF
        </label>
      </div>
      <div className={qs.colFoot}>
        <button type="button" className={qs.colPlain} disabled={first} onClick={() => onMove(-1)} aria-label="Move left">←</button>
        <button type="button" className={qs.colPlain} disabled={last} onClick={() => onMove(1)} aria-label="Move right">→</button>
        <span className={qs.grow} />
        {askDelete ? (
          <span className={qs.colWarnBtns}>
            <span className={qs.colAsk}>{used ? `Delete it and ${used} value${used === 1 ? '' : 's'}?` : 'Delete it?'}</span>
            <button type="button" className={qs.colDanger} onClick={onDelete}>Delete</button>
            <button type="button" className={qs.colPlain} onClick={() => setAskDelete(false)}>Keep</button>
          </span>
        ) : (
          <button type="button" className={qs.colDel} onClick={() => setAskDelete(true)}>Delete column</button>
        )}
      </div>
    </div>
  )
}
