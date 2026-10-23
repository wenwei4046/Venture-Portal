'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { officeTime } from '@/lib/office-time'
import { CATALOG, PET_SIZE, roomScale, type PetColor, type PetState, type Room, type SpeciesKey, type TilePlace } from '@/lib/marketing/space'
import PetNode from './PetNode'
import s from './myspace.module.css'

// My Space's room (`My Space Bento.dc.html` › the room tile): its wall, a window on the sky (night on a night wall, the
// evening after six, office time), its floor, the furniture — standing on the floor or hanging on the wall, facing
// either way — and the pet wandering about. *🎨 Decorate* opens the drawer's Room & pet; while it is open a piece is
// picked and dragged left or right.

export interface RoomPet {
  species: SpeciesKey
  form: number
  img: string | null
  state: PetState
  color: PetColor
}

export interface RoomTileProps {
  room: Room
  place: TilePlace
  /** Nobody's pet lives in a room whose owner has none. */
  pet: RoomPet | null
  label: string
  /** *🎨 Decorate* — its owner's, while the board is not being laid out. */
  canDecorate: boolean
  /** The drawer's Room & pet is open: pieces are picked and dragged. */
  decorating: boolean
  selected: string | null
  onSelect: (id: string) => void
  onMovePiece: (id: string, x: number) => void
  onPieceDropped: () => void
  onDecorate: () => void
}

/** The pet's walk: every 2.8 s, now and then, a few steps left or right (the prototype's wander). */
function useWander(paused: () => boolean) {
  const [spot, setSpot] = useState({ x: 50, facing: 1 as 1 | -1 })
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden || paused() || Math.random() < 0.4) return
      setSpot(cur => {
        const x = Math.max(10, Math.min(90, cur.x + (Math.random() * 40 - 20)))
        return { x, facing: x > cur.x ? -1 : 1 }
      })
    }, 2800)
    return () => clearInterval(id)
  }, [paused])
  return spot
}

export default function RoomTile(p: RoomTileProps) {
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [hour, setHour] = useState<number | null>(null)
  const paused = useRef(() => dragging.current).current
  const spot = useWander(paused)
  useEffect(() => { setHour(officeTime().hour()) }, [])

  const night = p.room.wall === 'night'
  const sky = night ? 'night' : hour != null && hour >= 18 ? 'evening' : 'day'
  const scale = roomScale(p.place)
  const wide = p.place.w >= 0.45

  const grab = (id: string, e: ReactPointerEvent) => {
    if (!p.decorating || e.button !== 0) return
    e.preventDefault()
    const rect = box.current?.getBoundingClientRect()
    p.onSelect(id)
    if (!rect || !rect.width) return
    dragging.current = true
    const move = (ev: PointerEvent) => p.onMovePiece(id, Math.round(Math.max(4, Math.min(96, ((ev.clientX - rect.left) / rect.width) * 100))))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      dragging.current = false
      p.onPieceDropped()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <div ref={box} className={s.room} data-room="" data-wall={p.room.wall} data-floor={p.room.floor}>
      <div className={s.roomWindow} data-sky={sky} style={{ width: wide ? '20%' : '34%' }} aria-hidden="true">
        <span className={s.roomSkyIcon}>{night ? '🌙' : '🌤️'}</span>
      </div>
      <div className={s.roomFloor} aria-hidden="true" />
      <div className={s.roomBase} aria-hidden="true" />
      {p.room.items.map(i => {
        const c = CATALOG[i.k]
        return (
          <div key={i.id} className={s.piece} title={c.label} data-selected={p.decorating && p.selected === i.id ? '' : undefined}
            data-grab={p.decorating ? '' : undefined} onPointerDown={e => grab(i.id, e)}
            style={{ left: `${i.x}%`, bottom: c.wall ? '56%' : '20%', zIndex: c.wall ? 1 : 10 + Math.round(i.x / 10) }}>
            <span className={s.pieceEmoji} style={{ fontSize: Math.round(c.size * scale), transform: `scaleX(${i.flip})` }}>{c.emoji}</span>
            {p.decorating && p.selected === i.id ? <div className={s.pieceRing} aria-hidden="true" /> : null}
          </div>
        )
      })}
      {p.pet ? (
        <div className={s.roomPet} style={{ left: `${spot.x}%` }}>
          <PetNode species={p.pet.species} form={p.pet.form} img={p.pet.img} state={p.pet.state} color={p.pet.color}
            size={Math.round(PET_SIZE[0] * (scale + 0.15))} facing={spot.facing} />
        </div>
      ) : null}
      <span className={s.roomLabel}>🏠 {p.label}</span>
      {p.canDecorate ? <button type="button" className={s.roomDecorate} onClick={p.onDecorate}>🎨 Decorate</button> : null}
    </div>
  )
}
