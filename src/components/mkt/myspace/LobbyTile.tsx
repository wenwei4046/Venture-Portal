'use client'

import { useEffect, useState } from 'react'
import { formOf, levelOf, lobbySpots, PET_STATES, type LobbyPet, type PetState } from '@/lib/marketing/space'
import PetNode from './PetNode'
import s from './myspace.module.css'

// The lobby (`My Space Bento.dc.html` › the lobby tile, ⑦-4 — the user's answer 37): the pets of Marketing's roster
// wandering its floor, each with its owner's name — the lobby's last message over its sender's (⑦-3); a teammate's
// opens their space, one's own the way home. Everybody with Marketing · View sees it; the Principal's shared login has
// no pet in it.

export interface LobbyEntry extends LobbyPet {
  /** How it feels: its owner's plate and its energy (the page reckons it). */
  state: PetState
}

export interface LobbyTileProps {
  pets: LobbyEntry[]
  /** The viewer's staff id: their pet is "(you)". */
  me: string | null
  /** On one's own space: one's own pet goes nowhere. */
  home: boolean
  onVisit: (staff: string) => void
  /** The lobby's last message, over its sender's pet (⑦-3). */
  say?: { staff: string; text: string } | null
}

type Spot = { x: number; y: number; facing: 1 | -1 }
const spotsFor = (n: number): Spot[] => lobbySpots(n).map(p => ({ ...p, facing: 1 }))

/** Every pet's walk: every 2.8 s, now and then, a few steps left or right (the prototype's wander, each on its own). */
function useStroll(n: number): Spot[] {
  const [spots, setSpots] = useState<Spot[]>(() => spotsFor(n))
  const [count, setCount] = useState(n)
  if (count !== n) {
    setCount(n)
    setSpots(spotsFor(n))
  }
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return
      setSpots(cur => cur.map(sp => {
        if (Math.random() < 0.4) return sp
        const x = Math.max(6, Math.min(94, sp.x + (Math.random() * 20 - 10)))
        return { ...sp, x, facing: x > sp.x ? -1 : 1 }
      }))
    }, 2800)
    return () => clearInterval(id)
  }, [])
  return spots
}

export default function LobbyTile({ pets, me, home, onVisit, say = null }: LobbyTileProps) {
  const spots = useStroll(pets.length)
  return (
    <div className={s.lobby} data-lobby="">
      <div className={s.lobbyFloor} aria-hidden="true" />
      <span className={s.roomLabel}>🏛️ Lobby · {pets.length}</span>
      {pets.length ? null : <span className={s.lobbyNone}>No pets yet</span>}
      {pets.map((p, i) => {
        const level = levelOf(p.xp)
        const mine = p.staff === me
        const spot = spots[i] ?? { x: 50, y: 8, facing: 1 }
        const style = { left: `${spot.x}%`, bottom: `${spot.y}%`, zIndex: 10 - (i % 2) }
        const title = `${p.name} · Lv ${level} · ${PET_STATES[p.state].label}`
        const body = (
          <>
            {say && say.staff === p.staff ? <span className={s.lobbySay}>{say.text}</span> : null}
            <PetNode species={p.species} form={formOf(level)} img={p.petPath} size={30} state={p.state} color={p.color} facing={spot.facing} />
            <span className={s.lobbyName}>{mine ? `${p.first} (you)` : p.first}</span>
          </>
        )
        if (mine && home) {
          return <div key={p.staff} className={s.lobbyPet} style={style} title={title}>{body}</div>
        }
        return (
          <button key={p.staff} type="button" className={s.lobbyPet} style={style} title={title}
            aria-label={mine ? 'Back to my space' : `Visit ${p.first}'s space`} onClick={() => onVisit(p.staff)}>
            {body}
          </button>
        )
      })}
    </div>
  )
}
