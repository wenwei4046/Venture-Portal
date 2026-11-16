'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CATALOGUE_ICONS } from '@/lib/marketing/catalog'
import v2 from './v2.module.css'

// A catalogue's icon (v2 §5): a 252px popover — "ICON · <catalogue>", 21 emoji in seven columns, the one picked framed
// in brown — under its button, or above it when under 180px are free below. Escape or a click outside closes it.

export default function IconPicker({ anchor, catalogue, value, onPick, onClose }: {
  anchor: HTMLElement
  catalogue: string
  value: string
  onPick: (emoji: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>(() => {
    const r = anchor.getBoundingClientRect()
    return { left: r.left, top: r.bottom + 6 }
  })
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect()
    const h = ref.current?.offsetHeight ?? 160
    const up = window.innerHeight - r.bottom < 180
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 260)), top: up ? Math.max(8, r.top - h - 6) : r.bottom + 6 })
  }, [anchor])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const off = (e: Event) => {
      if (ref.current && e.target instanceof Node && (ref.current.contains(e.target) || anchor.contains(e.target))) return
      onClose()
    }
    window.addEventListener('keydown', esc)
    document.addEventListener('mousedown', off)
    document.addEventListener('contextmenu', off)
    return () => {
      window.removeEventListener('keydown', esc)
      document.removeEventListener('mousedown', off)
      document.removeEventListener('contextmenu', off)
    }
  }, [anchor, onClose])
  return (
    <div ref={ref} className={v2.pop} style={pos} role="dialog" aria-label={`Icon for ${catalogue}`}>
      <div className={v2.popHead}>Icon · {catalogue}</div>
      <div className={v2.emojiGrid} role="listbox" aria-label="Icons">
        {CATALOGUE_ICONS.map(e => (
          <button key={e} type="button" role="option" aria-selected={e === value} className={`${v2.emoji}${e === value ? ` ${v2.emojiOn}` : ''}`} onClick={() => onPick(e)}>{e}</button>
        ))}
      </div>
    </div>
  )
}
