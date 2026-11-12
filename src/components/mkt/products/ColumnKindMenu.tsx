'use client'

import { useEffect, useRef } from 'react'
import { COLUMN_KIND_MENU, type ColumnKind } from '@/lib/marketing/catalog'
import { useOnScreenTop } from './use-on-screen'
import qs from './quotes.module.css'

// The Product List's + (the user, 2026-11-13: "在 product list 的加号，点选之后可以选择勾选，价格，下拉式，文字"): what the new
// column holds, picked first — Text, Price (RM), Number, Dropdown, Tick box. The column is made with it, named after it,
// and its settings open (a Dropdown's to add its options). Floats under the + (position: fixed), closes on Esc, a click
// outside, a scroll or a resize.

export default function ColumnKindMenu({ at, anchor, onPick, onClose }: {
  at: { left: number; top: number; above?: number }
  /** The + it opened from: a click on it toggles, not closes and reopens. */
  anchor: HTMLElement
  onPick: (kind: ColumnKind) => void
  onClose: () => void
}) {
  const box = useRef<HTMLDivElement | null>(null)
  useEffect(() => { box.current?.querySelector('button')?.focus() }, [])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const off = (e: Event) => {
      if (e.target instanceof Node && (box.current?.contains(e.target) || anchor.contains(e.target))) return
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
  }, [anchor, onClose])
  const left = Math.max(8, Math.min(at.left, (typeof window === 'undefined' ? 1200 : window.innerWidth) - 248))
  const top = useOnScreenTop(box, at)
  return (
    <div ref={box} className={qs.kindPop} style={{ left, top }} role="menu" aria-label="New column holds">
      <div className={qs.kindHead}>New column</div>
      {COLUMN_KIND_MENU.map(k => (
        <button key={k.kind} type="button" role="menuitem" className={qs.kindOpt} onClick={() => onPick(k.kind)}>
          <span className={qs.kindMark} aria-hidden>{k.mark}</span>
          <span className={qs.kindTwo}>
            <span className={qs.kindLbl}>{k.label}</span>
            <span className={qs.kindHint}>{k.hint}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
