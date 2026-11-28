'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fileRoute } from '@/lib/storage/browser'
import { groupTone, toneBg } from '@/lib/marketing/groups'
import { initialOf } from '@/lib/marketing/shell'
import {
  energyTone, formOf, levelOf, levelUpWords, PET_STATES, petState, trophyShelf, WALLS, workoutWords, WORKOUTS_A_DAY, xpBar,
  type LobbyPet, type PetState, type PetStats, type Space, type Visit,
} from '@/lib/marketing/space'
import { messageLine, type ChatList } from '@/lib/marketing/chat'
import { chatPeek, unreadChats, type AppMe } from '@/lib/mkt-app/model'
import { readVisitNow } from '@/lib/mkt-app/read'
import PetNode from '@/components/mkt/myspace/PetNode'
import RoomTile from '@/components/mkt/myspace/RoomTile'
import LobbyTile from '@/components/mkt/myspace/LobbyTile'
import { BackStep } from '../kit'
import s from '../mkt-app.module.css'

// Space (the handoff's own tab — the room, the pet, the lobby and the chat live here; Tasks is work only): My Space's
// own side as the desktop keeps it (lib/marketing/space.ts) — the cover, the avatar, the pet beside it, the status, the
// room (its walls, floor and furniture as its owner laid them — RoomTile, the desktop's own), the pet's tile with Feed
// and Exercise, the chat, the lobby, the trophies. A teammate's pet in the lobby opens a visit: their space, read only.

export type Done<T = object> = ({ ok: true } & T) | { ok: false; reason: string }

export interface SpaceActions {
  saveSpace: (patch: { status?: string; room?: Space['room'] }) => Promise<Done<{ space: Space }>>
  care: (what: 'feed' | 'workout') => Promise<Done<{ pet: PetStats }>>
  /** A 👋 to a teammate (the visit's Wave). */
  wave: (staff: string) => Promise<Done>
}

export interface SpaceTabProps {
  me: AppMe
  space: Space
  pet: PetStats | null
  hasPet: boolean
  plate: { count: number; red: number; fresh: boolean }
  lobby: Array<LobbyPet & { state: PetState }>
  chat: ChatList
  /** Marketing · Edit on My Space: the status, the wall, Feed and Exercise. */
  canEdit: boolean
  /** On the roster with a login: Message and Wave. */
  canChat: boolean
  visit: string | null
  onVisit: (staff: string | null) => void
  onChat: (withWhom: string | null) => void
  say: (text: string) => void
  actions: SpaceActions
}

const coverStyle = (space: Space) =>
  space.coverPath ? { backgroundImage: `url("${fileRoute('marketing', space.coverPath)}")` } : { background: `var(--mk-sp-cover-${Math.max(0, Math.min(3, space.cover))})` }

/** The level the pet had when this browser last saw it — a convenience (My Space's own key). */
const LEVEL_KEY = (who: string) => `mkt-pet-level:${who}`

export default function SpaceTab(p: SpaceTabProps) {
  const [space, setSpace] = useState(p.space)
  const [pet, setPet] = useState(p.pet)
  const [status, setStatus] = useState(p.space.status)
  const [flash, setFlash] = useState<PetState | null>(null)
  const [caring, setCaring] = useState(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedStatus = useRef(p.space.status)

  // A fresh read from the server (after any write) — what was typed and not yet saved stays.
  useEffect(() => { setSpace(p.space) }, [p.space])
  useEffect(() => { setPet(p.pet) }, [p.pet])
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    if (statusTimer.current) clearTimeout(statusTimer.current)
  }, [])

  const level = levelOf(pet?.xp ?? 0)
  const own = space.petPath
  const mood: PetState = flash ?? petState(p.plate, pet?.energy ?? 100)
  const petHere = p.hasPet && !!pet
  const shown = (state: PetState) => ({ species: space.pet.species, form: own ? 0 : formOf(level), img: own, state, color: space.pet.color })

  // A level reached since this browser last saw the pet (a stage finished elsewhere): said once.
  useEffect(() => {
    if (!petHere || !p.me.staff) return
    try {
      const was = Number(localStorage.getItem(LEVEL_KEY(p.me.staff)) || 0)
      if (was && level > was) p.say(levelUpWords(space.pet.name || 'Your pet', space.pet.species, was, level, !!own))
      localStorage.setItem(LEVEL_KEY(p.me.staff), String(level))
    } catch {
      /* storage closed: nothing said */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, petHere])

  const flashFor = (state: PetState, ms: number) => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setFlash(state)
    flashTimer.current = setTimeout(() => setFlash(null), ms)
  }

  const saveStatus = (text: string) => {
    if (statusTimer.current) clearTimeout(statusTimer.current)
    statusTimer.current = null
    if (text === savedStatus.current || !p.canEdit) return
    void p.actions.saveSpace({ status: text }).then(r => {
      if (r.ok) {
        savedStatus.current = r.space.status
        return
      }
      p.say(r.reason)
      setStatus(savedStatus.current)
    })
  }
  const typeStatus = (text: string) => {
    setStatus(text)
    if (statusTimer.current) clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => saveStatus(text), 700)
  }

  // "🎨 Wall": the wall's next colour (the handoff's stand-in for Decorate), saved as the room is.
  const nextWall = () => {
    const at = WALLS.indexOf(space.room.wall)
    const room = { ...space.room, wall: WALLS[(at + 1) % WALLS.length] }
    const before = space
    setSpace({ ...space, room })
    void p.actions.saveSpace({ room }).then(r => {
      if (!r.ok) {
        p.say(r.reason)
        setSpace(before)
      }
    })
  }

  const care = (what: 'feed' | 'workout') => {
    if (!pet || caring) return
    if (what === 'feed' && pet.snacks < 1) return p.say('No snacks left — finish a stage to earn more.')
    setCaring(true)
    void p.actions.care(what).then(r => {
      setCaring(false)
      if (!r.ok) return p.say(r.reason)
      const before = levelOf(pet.xp)
      const after = levelOf(r.pet.xp)
      setPet(r.pet)
      if (what === 'feed') {
        flashFor('eating', 2500)
        p.say('+20 energy')
      } else if (after > before) {
        flashFor('levelUp', 3500)
        p.say(levelUpWords(space.pet.name || 'Your pet', space.pet.species, before, after, !!own))
      } else {
        flashFor('exercising', 3000)
        p.say(workoutWords(space.pet.name || 'Your pet', r.pet.xp > pet.xp))
      }
      try { if (p.me.staff) localStorage.setItem(LEVEL_KEY(p.me.staff), String(after)) } catch { /* storage closed */ }
    })
  }

  const say = p.chat.lobby.last ? { staff: p.chat.lobby.last.from, text: messageLine(p.chat.lobby.last) } : null
  const unread = unreadChats(p.chat)
  const shelf = trophyShelf(pet)

  if (p.visit) {
    // The visit's one step stands outside the visit drawn (keyed by whose space it is): from one room straight to another
    // the step stays, never one taken back as the next is pushed (MktApp › Moving about).
    return (
      <>
        <BackStep k="mkt-app-visit" onBack={() => p.onVisit(null)} />
        <VisitView key={p.visit} staff={p.visit} me={p.me} lobby={p.lobby} canChat={p.canChat} say={say}
          onBack={() => p.onVisit(null)} onVisit={p.onVisit} onChat={p.onChat} toast={p.say} wave={p.actions.wave} />
      </>
    )
  }

  return (
    <div className={`${s.tabPage} ${s.space}`}>
      <div className={s.scroll}>
        <div className={`${s.cover}`} style={coverStyle(space)}>
          <span className={s.avatar80} style={{ background: p.me.avatarBg }}>
            {space.avatarPath ? <img src={fileRoute('marketing', space.avatarPath)} alt="" /> : p.me.letter}
          </span>
          {petHere ? <div className={s.coverPet}><PetNode {...shown(mood)} size={44} /></div> : null}
        </div>
        <div className={s.who}>
          <div className={s.whoName}>{p.me.full}{p.me.role ? <span className={s.whoRole}> · {p.me.role}</span> : null}</div>
          <div className={s.whoLine}>
            {p.canEdit ? (
              <input className={s.status} value={status} maxLength={80} placeholder="Set a status" aria-label="Status"
                onChange={e => typeStatus(e.target.value)} onBlur={() => saveStatus(status)} />
            ) : status ? <span>“{status}”</span> : null}
            {petHere ? <span className={s.whoPet}>· {space.pet.name || 'Pet'} Lv {level} · {PET_STATES[mood].bubble || '🙂'} {PET_STATES[mood].label}</span> : null}
          </div>
        </div>
        <div className={s.spaceTiles}>
          <div className={s.roomBox}>
            <RoomTile room={space.room} place={{ id: 'room', x: 0, y: 0, w: 0.3, h: 300 }} pet={petHere ? { ...shown(mood), level } : null}
              label="My room" canDecorate={false} decorating={false} selected={null} onSelect={() => {}} onMovePiece={() => {}} onPieceDropped={() => {}} onDecorate={() => {}} />
            {p.canEdit ? (
              <button type="button" className={s.wallBtn} onClick={nextWall} aria-label="Change the wall's colour"><span className={s.wallChip}>🎨 Wall</span></button>
            ) : null}
          </div>
          <PetCard name={space.pet.name || 'Pet'} pet={petHere ? pet : null} node={petHere ? <PetNode {...shown(mood)} size={50} /> : null}
            care={p.canEdit && petHere ? { caring, onFeed: () => care('feed'), onWorkout: () => care('workout') } : null} />
          {/* Everybody with Marketing · View reads the lobby; the roster speaks (⑦-3). */}
          <button type="button" className={s.chatRow} onClick={() => p.onChat(null)}>
            <span className={s.chatIcon}>💬</span>
            <span style={{ fontWeight: 600 }}>Chat</span>
            <span className={s.chatPeek}>{chatPeek(p.chat)}</span>
            {unread ? <span className={s.unread}>{unread}</span> : null}
          </button>
          <div className={s.lobbyBox}>
            <LobbyTile pets={p.lobby.map(x => (x.staff === p.me.staff ? { ...x, state: mood } : x))} me={p.me.staff} home onVisit={staff => p.onVisit(staff === p.me.staff ? null : staff)} say={say} />
          </div>
          <Trophies shelf={shelf} />
        </div>
      </div>
    </div>
  )
}

function PetCard({ name, pet, node, care }: {
  name: string
  pet: PetStats | null
  node: ReactNode
  care: { caring: boolean; onFeed: () => void; onWorkout: () => void } | null
}) {
  if (!pet) {
    return (
      <div className={s.petCard}>
        <span className={s.petNone}>🐾 No pet</span>
      </div>
    )
  }
  const bar = xpBar(pet.xp)
  return (
    <div className={s.petCard}>
      <div className={s.petFace}>{node}</div>
      <div className={s.petMain}>
        <div className={s.petHead}>
          <span className={s.petName}>{name}</span>
          <span className={s.grow} />
          <span className={s.lvPill}>Lv {bar.level}</span>
        </div>
        <div className={s.stat} title={bar.label}>
          <span className={s.statLabel}>XP</span>
          <span className={s.statBar} role="progressbar" aria-label="XP" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bar.pct} aria-valuetext={bar.label}>
            <span className={s.statFill} style={{ width: `${bar.pct}%`, display: 'block' }} />
          </span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Energy</span>
          <span className={s.statBar} role="progressbar" aria-label="Energy" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pet.energy}>
            <span className={s.statFill} data-tone={energyTone(pet.energy)} style={{ width: `${pet.energy}%`, display: 'block' }} />
          </span>
        </div>
        {care ? (
          <div className={s.care}>
            <button type="button" className={s.careBtn} disabled={care.caring} onClick={care.onFeed}>🍙 Feed · {pet.snacks}</button>
            <button type="button" className={s.careBtn} disabled={care.caring} onClick={care.onWorkout}>🏃 {Math.max(0, WORKOUTS_A_DAY - pet.workouts)}/{WORKOUTS_A_DAY} left</button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Trophies({ shelf }: { shelf: ReturnType<typeof trophyShelf> }) {
  return (
    <div className={s.trophies}>
      <div style={{ fontWeight: 600 }}>🏆 Trophies</div>
      <div className={s.trophyRow}>
        {shelf.got.map((t, i) => <span key={i} title={t.name}>{t.emoji}</span>)}
        {shelf.locked.map((t, i) => <span key={`l${i}`} className={s.trophyLocked}>{t}</span>)}
      </div>
      <div className={s.trophyLine}>{shelf.line}</div>
    </div>
  )
}

/** A visit (`mkt_space_of`): the teammate's cover, room and pet, read only — 💬 Message and 👋 Wave for the roster's. */
function VisitView({ staff, me, lobby, canChat, say, onBack, onVisit, onChat, toast, wave }: {
  staff: string
  me: AppMe
  lobby: Array<LobbyPet & { state: PetState }>
  canChat: boolean
  say: { staff: string; text: string } | null
  onBack: () => void
  onVisit: (staff: string | null) => void
  onChat: (withWhom: string | null) => void
  toast: (text: string) => void
  wave: (staff: string) => Promise<Done>
}) {
  const [visit, setVisit] = useState<Visit | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void readVisitNow(staff).then(v => { if (live) setVisit(v) })
    return () => { live = false }
  }, [staff])
  const pet = lobby.find(x => x.staff === staff) ?? null
  const first = visit?.first ?? pet?.first ?? 'Someone'
  const level = levelOf(visit?.stats?.xp ?? pet?.xp ?? 0)
  const mood: PetState = pet?.state ?? 'sleeping'
  const shown = visit && visit.stats
    ? { species: visit.space.pet.species, form: visit.space.petPath ? 0 : formOf(level), img: visit.space.petPath, state: mood, color: visit.space.pet.color }
    : null
  return (
    <div className={`${s.tabPage} ${s.space}`}>
      <div className={s.visitBar}>
        <span className={s.grow}>👀 You&apos;re visiting {first}&apos;s space</span>
        <button type="button" className={s.visitBack} onClick={onBack}>← Back to mine</button>
      </div>
      <div className={s.scroll}>
        {visit === undefined ? <div className={s.emptyTall}>…</div> : visit === null ? <div className={s.emptyTall}>This space is not open.</div> : (
          <>
            <div className={`${s.cover} ${s.coverVisit}`} style={coverStyle(visit.space)}>
              <span className={s.avatar80} style={{ background: toneBg(groupTone(visit.title)) }}>
                {visit.space.avatarPath ? <img src={fileRoute('marketing', visit.space.avatarPath)} alt="" /> : initialOf(first)}
              </span>
              {shown ? <div className={s.coverPet}><PetNode {...shown} size={44} /></div> : null}
            </div>
            <div className={s.who}>
              <div className={s.whoName}>{visit.full}{visit.role || visit.title ? <span className={s.whoRole}> · {visit.role || visit.title}</span> : null}</div>
              <div className={s.whoLine}>
                {visit.space.status ? <span>“{visit.space.status}”</span> : null}
                {shown ? <span className={s.whoPet}>· {visit.space.pet.name || 'Pet'} Lv {level} · {PET_STATES[mood].bubble || '🙂'} {PET_STATES[mood].label}</span> : null}
              </div>
              {canChat ? (
                <div className={s.visitBtns}>
                  {/* The chat over the visit (closed, back to it): the visit's step stays under the chat's, never swapped for it. */}
                  <button type="button" className={s.btn44} onClick={() => onChat(staff)}>💬 Message {first}</button>
                  <button type="button" className={s.btn44Ghost} onClick={() => void wave(staff).then(r => toast(r.ok ? `You waved at ${first}` : r.reason))}>👋 Wave</button>
                </div>
              ) : null}
            </div>
            <div className={s.spaceTiles}>
              <div className={s.roomBox}>
                <RoomTile room={visit.space.room} place={{ id: 'room', x: 0, y: 0, w: 0.3, h: 300 }} pet={shown ? { ...shown, level } : null}
                  label={`${first}'s room`} canDecorate={false} decorating={false} selected={null} onSelect={() => {}} onMovePiece={() => {}} onPieceDropped={() => {}} onDecorate={() => {}} />
              </div>
              <PetCard name={visit.space.pet.name || 'Pet'} pet={shown ? visit.stats : null} node={shown ? <PetNode {...shown} size={50} /> : null} care={null} />
              <div className={s.lobbyBox}>
                <LobbyTile pets={lobby} me={me.staff} home={false} onVisit={x => onVisit(x === me.staff ? null : x)} say={say} />
              </div>
              <Trophies shelf={trophyShelf(visit.stats)} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
