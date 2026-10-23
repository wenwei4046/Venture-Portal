'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { flash } from '@/components/hrv/toast'
import { saveMktSpace } from '@/lib/marketing/actions'
import type { PlateColumn, WeekRow } from '@/lib/marketing/my-space'
import type { MktNotice } from '@/lib/marketing/shell'
import {
  addedTile, DEFAULT_LAYOUT, DEFAULT_THEME, formOf, knownAfter, newPiece, PET_NAME_MAX, PET_STATES, petState, pictureProblem, removedTile,
  ROOM_MAX_PIECES, sameLayout, spacePicturePath, twoAbreast, type Pet, type PetState, type PieceKind, type Room, type Space, type SpacePatch,
  type SpaceTheme, type TileKind, type TilePlace,
} from '@/lib/marketing/space'
import { createClient } from '@/lib/supabase/client'
import NotesTile from './NotesTile'
import Onboarding from './Onboarding'
import PetNode from './PetNode'
import PhotoTile from './PhotoTile'
import RoomDrawerTab from './RoomDrawerTab'
import RoomTile from './RoomTile'
import SpaceBoard, { type BoardTile } from './SpaceBoard'
import SpaceCover from './SpaceCover'
import SpaceDrawer, { type DrawerTab } from './SpaceDrawer'
import TaskTile from './TaskTile'
import WeekTile from './WeekTile'
import s from './myspace.module.css'

// My Space (`My Space.dc.html` → `My Space Bento.dc.html`, ⑦-1 and ⑦-2): the viewer's cover, avatar (and their pet beside
// it), name, role and status, *✥ Edit layout*, the greeting with what is on their plate, and their board — the room,
// My turn, Waiting on others, Delegated by me, This week, Notes and Photo, laid out as they left it. Above it, an
// Assignment plan that put them on a project, while it is unread. The first visit of somebody on Marketing's roster
// opens the pet's setup. What they change is saved as they change it (only that part); what is drawn is theirs from
// then on — a page drawn again by the server never takes it back.

type Picture = 'cover' | 'avatar' | 'photo' | 'pet'
const PICTURE_KEY = { cover: 'coverPath', avatar: 'avatarPath', photo: 'photoPath', pet: 'petPath' } as const
/** A layout or a room settles, words stop being typed: then it is saved. */
const SETTLE_MS = { layout: 400, room: 400, pet: 600, status: 700, notes: 800 } as const
type Later = keyof typeof SETTLE_MS

export interface MySpaceProps {
  name: string
  role: string | null
  letter: string
  avatarBg: string
  greeting: string
  first: string
  plateLine: string
  columns: PlateColumn[]
  week: WeekRow[]
  plans: MktNotice[]
  /** What is on the viewer's plate, for the pet's mood: My turn's cards, those late, a stage just put on it. */
  plate: { count: number; red: number; fresh: boolean }
  /** On Marketing's roster: a pet lives in their room (and its setup opens on the first visit). */
  hasPet: boolean
  /** Marketing · Edit: the space is laid out and dressed, a stage to accept accepted on its tile. */
  canEdit: boolean
  space: Space
}

export default function MySpace(p: MySpaceProps) {
  const [space, setSpace] = useState<Space>(p.space)
  const [drawer, setDrawer] = useState<DrawerTab | null>(null)
  const [coverPop, setCoverPop] = useState(false)
  const [sending, setSending] = useState<Picture | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [redo, setRedo] = useState(false)
  const [mood, setMood] = useState<PetState | null>(null)
  // The space as last saved (to put back what a refused save changed) and as now drawn (what a later save sends).
  const confirmed = useRef<Space>(p.space)
  const latest = useRef<Space>(p.space)
  const timers = useRef(new Map<Later, ReturnType<typeof setTimeout>>())
  const moodTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const picking = useRef<Picture | null>(null)
  useEffect(() => { latest.current = space }, [space])
  useEffect(() => () => { if (moodTimer.current) clearTimeout(moodTimer.current) }, [])

  const save = useCallback(async (patch: SpacePatch): Promise<boolean> => {
    const r = await saveMktSpace(patch)
    if (!r.ok) {
      flash(r.reason)
      const keys = Object.keys(patch) as (keyof SpacePatch)[]
      setSpace(cur => {
        const back: Space = { ...cur }
        for (const k of keys) Object.assign(back, { [k]: confirmed.current[k] })
        return back
      })
      return false
    }
    confirmed.current = r.space
    return true
  }, [])

  const patchOf = (key: Later): SpacePatch => {
    const now = latest.current
    return key === 'layout' ? { layout: now.layout, tilesKnown: knownAfter(now.tilesKnown) } : { [key]: now[key] }
  }
  const later = (key: Later) => {
    const was = timers.current.get(key)
    if (was) clearTimeout(was)
    timers.current.set(key, setTimeout(() => {
      timers.current.delete(key)
      void save(patchOf(key))
    }, SETTLE_MS[key]))
  }
  const drop = (key: Later) => {
    const was = timers.current.get(key)
    if (was) clearTimeout(was)
    timers.current.delete(key)
  }
  const flushKey = (key: Later) => {
    if (!timers.current.has(key)) return
    drop(key)
    void save(patchOf(key))
  }
  // Leaving the page keeps what was typed or moved a moment ago.
  const flushAll = useRef(() => {})
  flushAll.current = () => { for (const key of [...timers.current.keys()]) flushKey(key) }
  useEffect(() => () => flushAll.current(), [])

  /** Drawn at once; kept once it settles. */
  const change = <K extends Later>(key: K, value: Space[K]) => {
    setSpace(cur => ({ ...cur, [key]: value }))
    latest.current = { ...latest.current, [key]: value }
    later(key)
  }

  // ── The board ────────────────────────────────────────────────────────────────────
  const setLayout = (layout: TilePlace[], keep: boolean) => {
    if (keep) change('layout', layout)
    else setSpace(cur => ({ ...cur, layout }))
  }
  const placed = (layout: TilePlace[]) => {
    if (sameLayout(layout, confirmed.current.layout) && !timers.current.has('layout')) {
      setSpace(cur => ({ ...cur, layout }))
      return
    }
    setLayout(layout, true)
  }
  const setTheme = (theme: SpaceTheme) => {
    setSpace(cur => ({ ...cur, theme }))
    void save({ theme })
  }
  const reset = () => {
    const layout = DEFAULT_LAYOUT.map(t => ({ ...t }))
    setSpace(cur => ({ ...cur, layout, theme: DEFAULT_THEME }))
    drop('layout')
    void save({ layout, theme: DEFAULT_THEME, tilesKnown: knownAfter(latest.current.tilesKnown) })
  }
  const closeDrawer = () => {
    flushKey('layout')
    flushKey('room')
    flushKey('pet')
    setSelected(null)
    setDrawer(null)
  }
  const openLayout = () => {
    if (drawer === 'layout') closeDrawer()
    else {
      setDrawer('layout')
      setSelected(null)
      setCoverPop(false)
    }
  }

  // ── The room ─────────────────────────────────────────────────────────────────────
  const room = space.room
  const setRoom = (next: Room) => change('room', next)
  const movePiece = (id: string, x: number) =>
    setSpace(cur => ({ ...cur, room: { ...cur.room, items: cur.room.items.map(i => (i.id === id ? { ...i, x } : i)) } }))
  const pieceDropped = () => change('room', latest.current.room)
  const addPiece = (k: PieceKind) => {
    if (latest.current.room.items.length >= ROOM_MAX_PIECES) {
      flash(`A room holds ${ROOM_MAX_PIECES} pieces at most.`)
      return
    }
    const piece = newPiece(k)
    setRoom({ ...latest.current.room, items: [...latest.current.room.items, piece] })
    setSelected(piece.id)
  }
  const flipPiece = () => {
    if (!selected) return
    setRoom({ ...latest.current.room, items: latest.current.room.items.map(i => (i.id === selected ? { ...i, flip: i.flip === 1 ? -1 : 1 } : i)) })
  }
  const removePiece = () => {
    if (!selected) return
    setRoom({ ...latest.current.room, items: latest.current.room.items.filter(i => i.id !== selected) })
    setSelected(null)
  }

  // ── The pet ──────────────────────────────────────────────────────────────────────
  const setPet = (patch: Partial<Pet>) => change('pet', { ...latest.current.pet, ...patch })
  const showMood = (state: PetState, ms: number) => {
    if (moodTimer.current) clearTimeout(moodTimer.current)
    setMood(state)
    moodTimer.current = setTimeout(() => setMood(null), ms)
  }
  const clearPetPicture = () => {
    if (!latest.current.petPath) return
    setSpace(cur => ({ ...cur, petPath: null }))
    latest.current = { ...latest.current, petPath: null }
    void save({ petPath: null })
  }
  const finishSetup = async (pet: Pet) => {
    drop('pet')
    setSpace(cur => ({ ...cur, pet }))
    latest.current = { ...latest.current, pet }
    if (await save({ pet })) {
      setRedo(false)
      flash(`Welcome! ${pet.name} moved into your room 🏠`)
      showMood('levelUp', 2500)
    }
  }
  const redoSetup = () => {
    closeDrawer()
    setRedo(true)
  }

  // ── Pictures ─────────────────────────────────────────────────────────────────────
  const presetCover = (cover: number) => {
    setCoverPop(false)
    setSpace(cur => ({ ...cur, cover, coverPath: null }))
    void save({ cover, coverPath: null })
  }
  const pick = (kind: Picture) => {
    if (sending) return
    picking.current = kind
    setCoverPop(false)
    fileInput.current?.click()
  }
  const send = async (list: FileList | null) => {
    const kind = picking.current
    const file = list?.[0]
    if (fileInput.current) fileInput.current.value = ''
    if (!kind || !file) return
    const problem = pictureProblem(file)
    if (problem) {
      flash(problem)
      return
    }
    setSending(kind)
    try {
      const db = createClient() as unknown as SupabaseClient
      const path = spacePicturePath(kind, file.name, crypto.randomUUID())
      const put = await db.storage.from('marketing').upload(path, file, { contentType: file.type })
      if (put.error) {
        flash(put.error.message || `${file.name} could not be uploaded.`)
        return
      }
      const key = PICTURE_KEY[kind]
      if (await save({ [key]: path })) {
        setSpace(cur => ({ ...cur, [key]: path }))
        latest.current = { ...latest.current, [key]: path }
      } else await db.storage.from('marketing').remove([path]).catch(() => undefined)
    } finally {
      setSending(null)
    }
  }

  // ── Drawn ────────────────────────────────────────────────────────────────────────
  const col = (key: PlateColumn['key']) => p.columns.find(c => c.key === key) as PlateColumn
  const placeOf = (id: string) => space.layout.find(t => t.id === id)
  const wide = (id: string) => {
    const t = placeOf(id)
    return t ? twoAbreast(t) : false
  }
  const level = 1
  const state = mood ?? petState(p.plate)
  const pet = p.hasPet ? { species: space.pet.species, form: formOf(level), img: space.petPath, state, color: space.pet.color } : null
  const petName = space.pet.name || 'Your pet'
  const roomPlace = placeOf('room')
  const tiles: Partial<Record<TileKind, BoardTile>> = {
    room: roomPlace ? {
      bare: true,
      body: (
        <RoomTile room={room} place={roomPlace} pet={pet} label="My room" canDecorate={p.canEdit && drawer !== 'layout'} decorating={drawer === 'room'}
          selected={selected} onSelect={setSelected} onMovePiece={movePiece} onPieceDropped={pieceDropped}
          onDecorate={() => { setDrawer('room'); setCoverPop(false) }} />
      ),
    } : undefined,
    turn: { body: <TaskTile column={col('turn')} wide={wide('turn')} canAccept={p.canEdit} /> },
    waiting: { body: <TaskTile column={col('waiting')} wide={wide('waiting')} canAccept={p.canEdit} />, red: col('waiting').anyRed },
    delegated: { body: <TaskTile column={col('delegated')} wide={wide('delegated')} canAccept={p.canEdit} /> },
    week: { body: <WeekTile week={p.week} /> },
    notes: { bare: true, body: <NotesTile text={space.notes} canEdit={p.canEdit} onChange={t => change('notes', t)} onDone={() => flushKey('notes')} /> },
    photo: { bare: true, body: <PhotoTile path={space.photoPath} canEdit={p.canEdit && !drawer} sending={sending === 'photo'} onPick={() => pick('photo')} /> },
  }
  const setupOpen = p.hasPet && p.canEdit && (redo || !space.pet.onboarded)

  return (
    <div className={s.page} data-bg={space.theme.bg} data-accent={space.theme.accent} data-corners={space.theme.corners}>
      {p.plans.map(n => (
        <Link key={n.id} href={n.ref ? `/marketing/projects/${n.ref}` : '/marketing/projects'} className={s.plan}>
          <span className={s.planIcon} aria-hidden="true">📋</span>
          <span className={s.planKicker}>Assignment plan</span>
          <span>{n.title}</span>
        </Link>
      ))}
      <div className={s.frame}>
        <div className={s.space}>
          <SpaceCover cover={space.cover} coverPath={space.coverPath} avatarPath={space.avatarPath} letter={p.letter} avatarBg={p.avatarBg}
            canEdit={p.canEdit} sending={sending === 'pet' ? null : sending} popOpen={coverPop} onPop={setCoverPop} onPreset={presetCover}
            onPick={pick}
            pet={pet ? <PetNode species={pet.species} form={pet.form} img={pet.img} size={44} state={pet.state} color={pet.color} /> : null} />
          <div className={s.who}>
            <div className={s.whoMain}>
              <div className={s.name}>
                {p.name} {p.role ? <span className={s.role}>· {p.role}</span> : null}
              </div>
              <div className={s.statusLine}>
                {p.canEdit ? (
                  <input className={s.statusInput} value={space.status} maxLength={80} placeholder="Set a status" aria-label="Status"
                    onChange={e => change('status', e.target.value)} onBlur={() => flushKey('status')}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                ) : space.status ? (
                  <span>“{space.status}”</span>
                ) : null}
                {pet ? (
                  <span className={s.petLine}>· {petName} Lv {level} · {PET_STATES[state].bubble || '🙂'} {PET_STATES[state].label}</span>
                ) : null}
              </div>
            </div>
            {p.canEdit ? (
              <button type="button" className={s.editBtn} aria-pressed={drawer === 'layout'} onClick={openLayout}>
                ✥ Edit layout
              </button>
            ) : null}
          </div>
          <div className={s.greet}>
            {p.greeting}, {p.first} ☀️ <span className={s.greetRest}>— {p.plateLine}</span>
          </div>
          <div className={s.boardPad}>
            <SpaceBoard layout={space.layout} tiles={tiles} editing={drawer === 'layout'} onMove={l => setLayout(l, false)} onPlace={placed}
              onRemove={id => setLayout(removedTile(latest.current.layout, id), true)} />
          </div>
        </div>
        {p.canEdit && drawer ? (
          <SpaceDrawer tab={drawer} onTab={t => { setDrawer(t); setSelected(null) }} roomLabel={p.hasPet ? '🎨 Room & pet' : '🎨 Room'}
            layout={space.layout} theme={space.theme} onAdd={k => setLayout([...latest.current.layout, addedTile(latest.current.layout, k)], true)}
            onTheme={setTheme} onReset={reset} onDone={closeDrawer}
            room={
              <RoomDrawerTab room={room} selected={selected} onRoom={setRoom} onAddPiece={addPiece} onFlip={flipPiece} onRemovePiece={removePiece}
                pet={p.hasPet ? space.pet : null} petPath={space.petPath} form={formOf(level)} sendingPet={sending === 'pet'}
                onPet={setPet} onPetName={name => setPet({ name: name.slice(0, PET_NAME_MAX) })} onPetNameDone={() => flushKey('pet')}
                onPickPet={() => pick('pet')} onClearPet={clearPetPicture} onRedo={redoSetup} />
            } />
        ) : null}
      </div>
      {setupOpen ? (
        <Onboarding pet={space.pet} petPath={space.petPath} redo={redo} cover={space.cover} coverPath={space.coverPath} avatarPath={space.avatarPath}
          letter={p.letter} avatarBg={p.avatarBg} sending={sending} onPickPet={() => pick('pet')} onUseKind={clearPetPicture}
          onPreset={presetCover} onPick={pick} onFinish={pet => void finishSetup(pet)} />
      ) : null}
      {p.canEdit ? <input ref={fileInput} type="file" accept="image/*" hidden onChange={e => void send(e.target.files)} /> : null}
    </div>
  )
}
