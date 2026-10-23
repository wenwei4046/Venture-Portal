'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { flash } from '@/components/hrv/toast'
import { saveMktSpace } from '@/lib/marketing/actions'
import type { PlateColumn, WeekRow } from '@/lib/marketing/my-space'
import type { MktNotice } from '@/lib/marketing/shell'
import {
  addedTile, DEFAULT_LAYOUT, DEFAULT_THEME, knownAfter, pictureProblem, removedTile, sameLayout, spacePicturePath, twoAbreast,
  type Space, type SpacePatch, type SpaceTheme, type TileKind, type TilePlace,
} from '@/lib/marketing/space'
import { createClient } from '@/lib/supabase/client'
import NotesTile from './NotesTile'
import PhotoTile from './PhotoTile'
import SpaceBoard, { type BoardTile } from './SpaceBoard'
import SpaceCover from './SpaceCover'
import SpaceDrawer from './SpaceDrawer'
import TaskTile from './TaskTile'
import WeekTile from './WeekTile'
import s from './myspace.module.css'

// My Space (`My Space.dc.html` → `My Space Bento.dc.html`, ⑦-1): the viewer's cover, avatar, name, role and status,
// *✥ Edit layout*, the greeting with what is on their plate, and their board — My turn, Waiting on others, Delegated by
// me, This week, Notes and Photo, laid out as they left it. Above it, an Assignment plan that put them on a project,
// while it is unread. What they change is saved as they change it (only that part); what is drawn is theirs from then
// on — a page drawn again by the server never takes it back.

type Picture = 'cover' | 'avatar' | 'photo'
const PICTURE_KEY = { cover: 'coverPath', avatar: 'avatarPath', photo: 'photoPath' } as const
/** A layout settles, words stop being typed: then it is saved. */
const SETTLE_MS = { layout: 400, status: 700, notes: 800 } as const
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
  /** Marketing · Edit: the space is laid out and dressed, a stage to accept accepted on its tile. */
  canEdit: boolean
  space: Space
}

export default function MySpace(p: MySpaceProps) {
  const [space, setSpace] = useState<Space>(p.space)
  const [drawer, setDrawer] = useState(false)
  const [coverPop, setCoverPop] = useState(false)
  const [sending, setSending] = useState<Picture | null>(null)
  // The space as last saved (to put back what a refused save changed) and as now drawn (what a later save sends).
  const confirmed = useRef<Space>(p.space)
  const latest = useRef<Space>(p.space)
  const timers = useRef(new Map<Later, ReturnType<typeof setTimeout>>())
  const fileInput = useRef<HTMLInputElement>(null)
  const picking = useRef<Picture | null>(null)
  useEffect(() => { latest.current = space }, [space])

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
  const flushKey = (key: Later) => {
    const was = timers.current.get(key)
    if (!was) return
    clearTimeout(was)
    timers.current.delete(key)
    void save(patchOf(key))
  }
  // Leaving the page keeps what was typed or moved a moment ago.
  const flushAll = useRef(() => {})
  flushAll.current = () => { for (const key of [...timers.current.keys()]) flushKey(key) }
  useEffect(() => () => flushAll.current(), [])

  const setLayout = (layout: TilePlace[], keep: boolean) => {
    setSpace(cur => ({ ...cur, layout }))
    if (keep) {
      latest.current = { ...latest.current, layout }
      later('layout')
    }
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
  const setWords = (key: 'status' | 'notes', value: string) => {
    setSpace(cur => ({ ...cur, [key]: value }))
    latest.current = { ...latest.current, [key]: value }
    later(key)
  }
  const reset = () => {
    const layout = DEFAULT_LAYOUT.map(t => ({ ...t }))
    setSpace(cur => ({ ...cur, layout, theme: DEFAULT_THEME }))
    const was = timers.current.get('layout')
    if (was) clearTimeout(was)
    timers.current.delete('layout')
    void save({ layout, theme: DEFAULT_THEME, tilesKnown: knownAfter(latest.current.tilesKnown) })
  }
  const closeDrawer = () => {
    flushKey('layout')
    setDrawer(false)
  }
  const toggleDrawer = () => {
    if (drawer) closeDrawer()
    else {
      setDrawer(true)
      setCoverPop(false)
    }
  }

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
      if (await save({ [key]: path })) setSpace(cur => ({ ...cur, [key]: path }))
      else await db.storage.from('marketing').remove([path]).catch(() => undefined)
    } finally {
      setSending(null)
    }
  }

  const col = (key: PlateColumn['key']) => p.columns.find(c => c.key === key) as PlateColumn
  const placeOf = (id: string) => space.layout.find(t => t.id === id)
  const wide = (id: string) => {
    const t = placeOf(id)
    return t ? twoAbreast(t) : false
  }
  const tiles: Partial<Record<TileKind, BoardTile>> = {
    turn: { body: <TaskTile column={col('turn')} wide={wide('turn')} canAccept={p.canEdit} /> },
    waiting: { body: <TaskTile column={col('waiting')} wide={wide('waiting')} canAccept={p.canEdit} />, red: col('waiting').anyRed },
    delegated: { body: <TaskTile column={col('delegated')} wide={wide('delegated')} canAccept={p.canEdit} /> },
    week: { body: <WeekTile week={p.week} /> },
    notes: { bare: true, body: <NotesTile text={space.notes} canEdit={p.canEdit} onChange={t => setWords('notes', t)} onDone={() => flushKey('notes')} /> },
    photo: { bare: true, body: <PhotoTile path={space.photoPath} canEdit={p.canEdit && !drawer} sending={sending === 'photo'} onPick={() => pick('photo')} /> },
  }

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
            canEdit={p.canEdit} sending={sending} popOpen={coverPop} onPop={setCoverPop} onPreset={presetCover} onPick={pick} />
          <div className={s.who}>
            <div className={s.whoMain}>
              <div className={s.name}>
                {p.name} {p.role ? <span className={s.role}>· {p.role}</span> : null}
              </div>
              <div className={s.statusLine}>
                {p.canEdit ? (
                  <input className={s.statusInput} value={space.status} maxLength={80} placeholder="Set a status" aria-label="Status"
                    onChange={e => setWords('status', e.target.value)} onBlur={() => flushKey('status')}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                ) : space.status ? (
                  <span>“{space.status}”</span>
                ) : null}
              </div>
            </div>
            {p.canEdit ? (
              <button type="button" className={s.editBtn} aria-pressed={drawer} onClick={toggleDrawer}>
                ✥ Edit layout
              </button>
            ) : null}
          </div>
          <div className={s.greet}>
            {p.greeting}, {p.first} ☀️ <span className={s.greetRest}>— {p.plateLine}</span>
          </div>
          <div className={s.boardPad}>
            <SpaceBoard layout={space.layout} tiles={tiles} editing={drawer} onMove={l => setLayout(l, false)} onPlace={placed}
              onRemove={id => setLayout(removedTile(latest.current.layout, id), true)} />
          </div>
        </div>
        {p.canEdit && drawer ? (
          <SpaceDrawer layout={space.layout} theme={space.theme} onAdd={k => setLayout([...latest.current.layout, addedTile(latest.current.layout, k)], true)}
            onTheme={setTheme} onReset={reset} onDone={closeDrawer} />
        ) : null}
      </div>
      {p.canEdit ? <input ref={fileInput} type="file" accept="image/*" hidden onChange={e => void send(e.target.files)} /> : null}
    </div>
  )
}
