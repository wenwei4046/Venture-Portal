'use client'

import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  boardHeight, dragged, GAP, HANDLES, isKind, LOCKED, nudged, readingOrder, TILES, toFront, withPlace, type Grip, type TilePlace,
} from '@/lib/marketing/space'
import s from './myspace.module.css'

// My Space's board (`My Space Bento.dc.html`): each tile where its owner put it — x and w a share of the board's width,
// y and h pixels, drawn 12 px apart. While the drawer is open every tile is laid out: dragged anywhere by its face
// (drawn over the others), resized from any edge or corner by its eight handles, taken off by ✕ (🔒 on My turn and
// Waiting), or moved with the arrow keys (Shift: resized). A narrow screen draws them one under another (the CSS).

export interface BoardTile {
  body: ReactNode
  /** Drawn without the tile's white (Notes, Photo — they bring their own). */
  bare?: boolean
  /** The red edge of a tile with something late in it (Waiting). */
  red?: boolean
}

export interface SpaceBoardProps {
  layout: TilePlace[]
  /** What each tile on the board shows, by its kind — a kind with nothing here is not drawn (yet). */
  tiles: Partial<Record<string, BoardTile>>
  editing: boolean
  /** The layout while it moves — drawn, not saved. */
  onMove: (layout: TilePlace[]) => void
  /** A move finished — the layout to keep. */
  onPlace: (layout: TilePlace[]) => void
  onRemove: (id: string) => void
}

export default function SpaceBoard(p: SpaceBoardProps) {
  const board = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<string | null>(null)

  const start = (id: string, grip: Grip, e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const from = p.layout.find(t => t.id === id)
    const width = board.current?.getBoundingClientRect().width
    if (!from || !width) return
    const x0 = e.clientX
    const y0 = e.clientY
    let now = toFront(p.layout, id)
    let last: PointerEvent | null = null
    let frame = 0
    setActive(id)
    p.onMove(now)
    const apply = () => {
      frame = 0
      if (!last) return
      now = withPlace(now, dragged(from, grip, (last.clientX - x0) / width, last.clientY - y0))
      p.onMove(now)
    }
    const move = (ev: PointerEvent) => {
      last = ev
      if (!frame) frame = requestAnimationFrame(apply)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (frame) cancelAnimationFrame(frame)
      apply()
      setActive(null)
      p.onPlace(now)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const key = (id: string, e: KeyboardEvent) => {
    const t = p.layout.find(x => x.id === id)
    const next = t ? nudged(t, e.key, e.shiftKey) : null
    if (!next) return
    e.preventDefault()
    p.onPlace(withPlace(p.layout, next))
    // A tile moved up or down may now be read elsewhere on the board: its face keeps the keyboard.
    requestAnimationFrame(() => board.current?.querySelector<HTMLElement>(`[data-tile="${id}"] [data-mover]`)?.focus())
  }

  const z = new Map(p.layout.map((t, i) => [t.id, i + 1]))
  return (
    <div ref={board} className={s.board} data-board="" data-editing={p.editing ? '' : undefined} style={{ height: boardHeight(p.layout, p.editing) }}>
      {readingOrder(p.layout).map((t, order) => {
        const tile = p.tiles[t.id]
        if (!tile) return null
        const name = isKind(t.id) ? TILES[t.id] : { emoji: '', label: t.id }
        const cls = [s.tile, tile.bare ? s.tileBare : '', tile.red ? s.tileRed : '', active === t.id ? s.tileActive : ''].filter(Boolean).join(' ')
        return (
          <div key={t.id} data-tile={t.id} className={cls}
            style={{
              left: `${(t.x * 100).toFixed(3)}%`, top: Math.round(t.y), width: `calc(${(t.w * 100).toFixed(3)}% - ${GAP}px)`,
              height: Math.round(t.h - GAP), zIndex: active === t.id ? 500 : z.get(t.id), order,
            }}>
            {tile.body}
            {p.editing ? (
              <>
                <button type="button" className={s.mover} data-mover="" aria-label={`${name.label}: move with the arrow keys, resize with Shift and the arrow keys`}
                  onPointerDown={e => start(t.id, 'move', e)} onKeyDown={e => key(t.id, e)} />
                <span className={s.grip} aria-hidden="true">✥</span>
                <div className={s.tileTools}>
                  {LOCKED.includes(t.id) ? (
                    <span className={s.tileTool} role="img" title="Always on your space" aria-label="Always on your space">🔒</span>
                  ) : (
                    <button type="button" className={s.tileTool} title="Remove tile" aria-label={`Remove ${name.label}`}
                      onPointerDown={e => e.stopPropagation()} onClick={() => p.onRemove(t.id)}>✕</button>
                  )}
                </div>
                <span className={s.tileName} aria-hidden="true">{name.emoji} {name.label}</span>
                {HANDLES.map(g => (
                  <div key={g} className={s.handle} data-grip={g} aria-hidden="true" onPointerDown={e => start(t.id, g, e)} />
                ))}
              </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
