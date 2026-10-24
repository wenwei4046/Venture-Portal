import { describe, expect, it } from 'vitest'
import {
  addable, addedTile, boardHeight, boardOf, clampPlace, DEFAULT_LAYOUT, DEFAULT_ROOM, DEFAULT_THEME, dragged, energyTone, exerciseTitle, formOf,
  knownAfter, layoutToRow, levelOf, levelUpWords, newPiece, NO_PET, nudged, petFromRow, petSize, petState, petStatsFromRow, pictureProblem,
  readingOrder, removedTile, roomFromRow, roomScale, sameLayout, spaceFromRow, spacePatchOf, spacePicturePath, toFront, trophyShelf, twoAbreast,
  workoutWords, xpBar, type TilePlace,
} from './space'

// 2026-10-23 — ⑦-1: My Space's own side (`My Space Bento.dc.html`) — the board its owner lays out (the prototype's
// measures: x and w a share of the width, y and h px, 182 px a row, a quarter a column), the look by keys, the cover,
// the pictures, a save of only what changed. The database's side: tests/member-sql/validate-marketing-spaces.mjs.

const t = (id: string, x: number, y: number, w: number, h: number): TilePlace => ({ id, x, y, w, h })

describe('the board as read', () => {
  it('before the first save: the prototype’s board without what is not here yet — the room top left, My turn beside it, the pet and the trophies on the right', () => {
    const s = spaceFromRow(null)
    expect(s.saved).toBe(false)
    expect(s.layout).toEqual(DEFAULT_LAYOUT)
    expect(s.layout.map(x => [x.id, x.x, x.y, x.w, x.h])).toEqual([
      ['room', 0, 0, 0.5, 364], ['turn', 0.5, 0, 0.25, 364], ['pet', 0.75, 0, 0.25, 182], ['trophies', 0.75, 182, 0.25, 182],
      ['waiting', 0, 364, 0.25, 182], ['delegated', 0.25, 364, 0.25, 182], ['week', 0.5, 364, 0.5, 182],
    ])
    expect([s.theme, s.cover, s.coverPath, s.avatarPath, s.photoPath, s.status, s.notes]).toEqual([DEFAULT_THEME, 0, null, null, null, '', ''])
    expect([s.room, s.pet, s.petPath]).toEqual([DEFAULT_ROOM, NO_PET, null])
  })

  it('a saved board as its owner left it; a kind this page does not draw yet kept as it was', () => {
    const s = spaceFromRow({
      layout: [t('waiting', 0, 0, 0.25, 182), t('turn', 0.25, 0, 0.75, 400), t('chat', 0, 400, 0.25, 546)], tilesKnown: ['delegated', 'pet', 'room', 'trophies', 'turn', 'waiting', 'week'],
      theme: { bg: 'mint', accent: 'blue', corners: 'round' }, cover: 2, coverPath: null, avatarPath: 'space/a/me.png', status: 'Shooting', notes: 'Call PIC',
      photoPath: 'mine/b/beach.jpg', at: '2026-10-23T03:00:00Z', room: {}, pet: {},
    })
    expect(s.saved).toBe(true)
    expect(s.layout.map(x => x.id)).toEqual(['waiting', 'turn', 'chat'])
    expect(s.layout[2]).toEqual(t('chat', 0, 400, 0.25, 546))
    expect([s.theme, s.cover, s.avatarPath, s.photoPath, s.status, s.notes]).toEqual([
      { bg: 'mint', accent: 'blue', corners: 'round' }, 2, 'space/a/me.png', 'mine/b/beach.jpg', 'Shooting', 'Call PIC',
    ])
    expect([s.room, s.pet]).toEqual([DEFAULT_ROOM, NO_PET])
  })

  it('a tile taken off stays off; a kind shipped since the board was saved joins it once, under the rest', () => {
    const b = boardOf([t('turn', 0, 0, 0.5, 364), t('waiting', 0.5, 0, 0.25, 182)], ['pet', 'room', 'trophies', 'turn', 'waiting', 'week'])
    expect(b.map(x => x.id)).toEqual(['turn', 'waiting', 'delegated'])
    expect(b[2]).toEqual(t('delegated', 0, 364, 0.25, 182))
  })

  it('a board saved before the room came (⑦-1) gets the room once, two by two, under the rest', () => {
    const saved = [t('turn', 0, 0, 0.5, 364), t('waiting', 0.5, 0, 0.25, 182), t('delegated', 0.75, 0, 0.25, 182), t('week', 0.5, 182, 0.5, 182)]
    const b = boardOf(saved, ['delegated', 'notes', 'photo', 'turn', 'waiting', 'week'])
    expect(b.map(x => x.id)).toEqual(['turn', 'waiting', 'delegated', 'week', 'room', 'pet', 'trophies'])
    expect(b[4]).toEqual(t('room', 0, 364, 0.5, 364))
    expect(boardOf(saved, knownAfter(['delegated', 'turn', 'waiting', 'week'])).map(x => x.id)).toEqual(['turn', 'waiting', 'delegated', 'week'])
  })

  it('a board saved before the pet’s tile and the trophies came (⑦-5) gets them once, one by one, under the rest', () => {
    const saved = [t('room', 0, 0, 0.5, 364), t('turn', 0.5, 0, 0.25, 364), t('waiting', 0.75, 0, 0.25, 182), t('week', 0, 364, 0.5, 182)]
    const b = boardOf(saved, ['delegated', 'notes', 'photo', 'room', 'turn', 'waiting', 'week'])
    expect(b.map(x => x.id)).toEqual(['room', 'turn', 'waiting', 'week', 'pet', 'trophies'])
    expect(b.slice(4)).toEqual([t('pet', 0, 546, 0.25, 182), t('trophies', 0, 728, 0.25, 182)])
  })

  it('My turn and Waiting are always on it — whatever came back', () => {
    const b = boardOf([t('week', 0, 0, 0.5, 182)], ['room', 'pet', 'turn', 'waiting', 'delegated', 'trophies', 'week'])
    expect(b.map(x => x.id)).toEqual(['week', 'turn', 'waiting'])
  })

  it('each kind once; a tile out of bounds brought back in', () => {
    const b = boardOf([t('turn', 0.9, -5, 0.5, 50), t('turn', 0, 0, 0.25, 182), t('waiting', 0, 0, 0.05, 9000)], ['room', 'pet', 'turn', 'waiting', 'delegated', 'trophies', 'week'])
    expect(b).toEqual([t('turn', 0.5, 0, 0.5, 110), t('waiting', 0, 0, 0.14, 2000)])
  })

  it('a look never read as anything but its keys; a cover outside the four is the first', () => {
    const s = spaceFromRow({ layout: [], theme: { bg: '#000', accent: 'red', corners: 9 }, cover: 7 })
    expect([s.theme, s.cover]).toEqual([DEFAULT_THEME, 0])
    expect(s.layout).toEqual(DEFAULT_LAYOUT)
  })
})

describe('Edit layout', () => {
  const tl = t('notes', 0.25, 182, 0.25, 182)
  it('moved: anywhere within the width, never above the top', () => {
    expect(dragged(tl, 'move', 0.1, 40)).toEqual(t('notes', 0.35, 222, 0.25, 182))
    expect(dragged(tl, 'move', 0.9, -500)).toEqual(t('notes', 0.75, 0, 0.25, 182))
    expect(dragged(tl, 'move', -1, 0).x).toBe(0)
  })

  it('resized from each edge and corner — never past the right edge, never below 14% × 110 px', () => {
    expect(dragged(tl, 'e', 0.1, 99)).toEqual(t('notes', 0.25, 182, 0.35, 182))
    expect(dragged(tl, 'e', 0.9, 0).w).toBe(0.75)
    expect(dragged(tl, 'w', -0.1, 0)).toEqual(t('notes', 0.15, 182, 0.35, 182))
    expect(dragged(tl, 'w', 0.2, 0)).toEqual(t('notes', 0.36, 182, 0.14, 182))
    expect(dragged(tl, 's', 0, 50)).toEqual(t('notes', 0.25, 182, 0.25, 232))
    expect(dragged(tl, 's', 0, -150).h).toBe(110)
    expect(dragged(tl, 'n', 0, -100)).toEqual(t('notes', 0.25, 82, 0.25, 282))
    expect(dragged(tl, 'n', 0, 150)).toEqual(t('notes', 0.25, 254, 0.25, 110))
    expect(dragged(tl, 'n', 0, -400)).toEqual(t('notes', 0.25, 0, 0.25, 364))
    expect(dragged(tl, 'se', 0.05, 18)).toEqual(t('notes', 0.25, 182, 0.3, 200))
    expect(dragged(tl, 'nw', -0.05, -18).x).toBeCloseTo(0.2)
  })

  it('the arrow keys: a step of 1% or 12 px; with Shift, its size', () => {
    expect(nudged(tl, 'ArrowRight', false)?.x).toBeCloseTo(0.26)
    expect(nudged(tl, 'ArrowDown', false)?.y).toBe(194)
    expect(nudged(tl, 'ArrowLeft', true)?.w).toBeCloseTo(0.24)
    expect(nudged(tl, 'ArrowUp', true)?.h).toBe(170)
    expect(nudged(tl, 'Enter', false)).toBeNull()
  })

  it('the tile last moved goes on top (last); My turn and Waiting cannot be taken off', () => {
    const b = DEFAULT_LAYOUT
    expect(toFront(b, 'turn').map(x => x.id)).toEqual(['room', 'pet', 'trophies', 'waiting', 'delegated', 'week', 'turn'])
    expect(removedTile(b, 'turn')).toBe(b)
    expect(removedTile(b, 'waiting')).toBe(b)
    expect(removedTile(b, 'week').map(x => x.id)).toEqual(['room', 'turn', 'pet', 'trophies', 'waiting', 'delegated'])
    expect(removedTile(b, 'pet').map(x => x.id)).toEqual(['room', 'turn', 'trophies', 'waiting', 'delegated', 'week'])
  })

  it('a tile added: its own size, under everything; the drawer offers only those not on the board', () => {
    expect(addable(DEFAULT_LAYOUT)).toEqual(['notes', 'photo'])
    expect(addedTile(DEFAULT_LAYOUT, 'notes')).toEqual(t('notes', 0, 546, 0.25, 182))
    expect(addedTile([], 'room')).toEqual(t('room', 0, 0, 0.5, 364))
    expect(addable([...DEFAULT_LAYOUT, addedTile(DEFAULT_LAYOUT, 'notes'), t('photo', 0.5, 400, 0.25, 182)])).toEqual([])
  })

  it('the board as high as its lowest tile, less the gap — and 140 px more to drag into while laying out', () => {
    expect(boardHeight(DEFAULT_LAYOUT, false)).toBe(534)
    expect(boardHeight(DEFAULT_LAYOUT, true)).toBe(674)
    expect(boardHeight([], false)).toBe(170)
  })

  it('read top to bottom, left to right; a task tile half the board wide lays its cards two abreast', () => {
    expect(readingOrder([t('week', 0.5, 182, 0.5, 182), t('turn', 0, 0, 0.5, 364), t('waiting', 0.5, 0, 0.25, 182)]).map(x => x.id)).toEqual(['turn', 'waiting', 'week'])
    expect([twoAbreast(t('turn', 0, 0, 0.5, 364)), twoAbreast(t('turn', 0, 0, 0.45, 364)), twoAbreast(t('turn', 0, 0, 0.25, 364))]).toEqual([true, true, false])
  })

  it('clamped whole: within the board, the minimum kept', () => {
    expect(clampPlace(t('notes', -1, -1, 2, 5000))).toEqual(t('notes', 0, 0, 1, 2000))
  })
})

describe('a save', () => {
  it('sends only the parts given, as the database keeps them', () => {
    expect(spacePatchOf({ status: 'Shooting all day' })).toEqual({ status: 'Shooting all day' })
    expect(spacePatchOf({ layout: [t('turn', 0.123456, 10.6, 0.333333, 200.4)], tilesKnown: ['turn', 'waiting'] })).toEqual({
      layout: [{ id: 'turn', x: 0.1235, y: 11, w: 0.3333, h: 200 }], tilesKnown: ['turn', 'waiting'],
    })
    expect(spacePatchOf({ cover: 2, coverPath: null })).toEqual({ cover: 2, coverPath: null })
    expect(spacePatchOf({ photoPath: '' })).toEqual({ photoPath: null })
    expect(spacePatchOf({ notes: 'x'.repeat(5000) }).notes).toHaveLength(4000)
  })

  it('a look sent as keys — whatever came in', () => {
    expect(spacePatchOf({ theme: { bg: 'mint', accent: 'blue', corners: 'round' } })).toEqual({ theme: { bg: 'mint', accent: 'blue', corners: 'round' } })
    expect(spacePatchOf({ theme: { bg: '#000', accent: 'x', corners: 'y' } as never })).toEqual({ theme: DEFAULT_THEME })
  })

  it('a tile without its numbers is left out; the kinds the board has offered are remembered', () => {
    expect(spacePatchOf({ layout: [t('turn', 0, 0, 0.5, 364), { id: 'week', x: Number.NaN, y: 0, w: 0.5, h: 182 }] }).layout).toEqual([t('turn', 0, 0, 0.5, 364)])
    expect(knownAfter(['room'])).toEqual(['delegated', 'notes', 'pet', 'photo', 'room', 'trophies', 'turn', 'waiting', 'week'])
  })

  it('the same board — to four places and whole pixels, in its order', () => {
    expect(sameLayout([t('turn', 0.12341, 0.4, 0.5, 364)], [t('turn', 0.12339, 0, 0.5, 364.2)])).toBe(true)
    expect(sameLayout(DEFAULT_LAYOUT, toFront(DEFAULT_LAYOUT, 'turn'))).toBe(false)
    expect(layoutToRow([t('turn', 0.5, 12.5, 0.25, 181.5)])).toEqual([{ id: 'turn', x: 0.5, y: 13, w: 0.25, h: 182 }])
  })
})

describe('pictures', () => {
  it('the cover and the avatar under space/ (Marketing sees them), the photo under mine/ (its owner alone)', () => {
    const uuid = '00000000-0000-4000-8000-000000000001'
    expect(spacePicturePath('cover', 'Beach (1).JPG', uuid)).toBe(`space/${uuid}/Beach-1.jpg`)
    expect(spacePicturePath('avatar', 'me.png', uuid)).toBe(`space/${uuid}/me.png`)
    expect(spacePicturePath('photo', 'me.png', uuid)).toBe(`mine/${uuid}/me.png`)
  })

  it('an image, at most 10 MB', () => {
    expect(pictureProblem({ name: 'a.png', type: 'image/png', size: 1000 })).toBeNull()
    expect(pictureProblem({ name: 'cv.pdf', type: 'application/pdf', size: 1000 })).toMatch(/is an image/)
    expect(pictureProblem({ name: 'big.jpg', type: 'image/jpeg', size: 11 * 1024 * 1024 })).toBe('big.jpg is over 10 MB.')
  })
})

// 2026-10-23 — ⑦-2: the room (its wall, its floor, its furniture) and the pet's look.
describe('the room', () => {
  it('never set: the prototype’s first room — a copy, never the default itself', () => {
    const r = roomFromRow({})
    expect(r).toEqual(DEFAULT_ROOM)
    expect(r.items).not.toBe(DEFAULT_ROOM.items)
    expect(DEFAULT_ROOM.items.map(i => `${i.k}@${i.x}`)).toEqual(['bed@14', 'plant@32', 'frame@48', 'desk@66', 'chair@80', 'clock@86'])
  })

  it('read by its keys; each piece the catalogue’s, once, inside the room', () => {
    const r = roomFromRow({ wall: 'night', floor: '#000', items: [
      { id: 'tv-1', k: 'tv', x: 16.6, flip: -1 }, { id: 'tv-1', k: 'tv', x: 30 }, { id: 'jet-1', k: 'jet', x: 50 },
      { id: 'bed-2', k: 'bed', x: 'left' }, { id: 'sofa-3', k: 'sofa', x: 120, flip: 7 }, { id: 'frame-4', k: 'frame', x: -3 },
    ] })
    expect(r).toEqual({ wall: 'night', floor: 'oak', items: [
      { id: 'tv-1', k: 'tv', x: 17, flip: -1 }, { id: 'sofa-3', k: 'sofa', x: 96, flip: 1 }, { id: 'frame-4', k: 'frame', x: 4, flip: 1 },
    ] })
    expect(roomFromRow({ items: Array.from({ length: 40 }, (_, i) => ({ id: `bed-${i}`, k: 'bed', x: 50 })) }).items).toHaveLength(30)
  })

  it('furniture drawn smaller in a short or a narrow room', () => {
    expect([roomScale(t('room', 0, 0, 0.5, 364)), roomScale(t('room', 0, 0, 0.25, 364)), roomScale(t('room', 0, 0, 0.5, 182))]).toEqual([1, 0.75, 0.55])
  })

  it('a new piece: an id the database takes, somewhere in the middle, never the same id twice', () => {
    const a = newPiece('sofa')
    const b = newPiece('sofa')
    expect(a.id).toMatch(/^[a-z]+-[0-9a-z]{1,24}$/)
    expect(a.id).not.toBe(b.id)
    expect(a.x).toBeGreaterThanOrEqual(20)
    expect(a.x).toBeLessThanOrEqual(80)
    expect(newPiece('bed', 33)).toMatchObject({ k: 'bed', x: 33, flip: 1 })
  })
})

describe('the pet', () => {
  it('never set: a cat with no name yet, not set up; read by its keys', () => {
    expect(petFromRow({})).toEqual(NO_PET)
    expect(petFromRow(null)).toEqual(NO_PET)
    expect(petFromRow({ species: 'dog', name: 'Teh Tarik', color: 'mint', onboarded: true })).toEqual({ species: 'dog', name: 'Teh Tarik', color: 'mint', onboarded: true })
    expect(petFromRow({ species: 'tiger', name: 'x'.repeat(20), color: '#f00', onboarded: 'yes' })).toEqual({ species: 'cat', name: 'x'.repeat(16), color: 'original', onboarded: false })
  })

  it('looks as its owner’s plate is: hungry, overloaded, a new task, working, asleep', () => {
    expect(petState({ count: 1, red: 2, fresh: true }, 19)).toBe('hungry')
    expect(petState({ count: 1, red: 2, fresh: true }, 20)).toBe('overload')
    expect(petState({ count: 1, red: 2, fresh: true })).toBe('overload')
    expect(petState({ count: 4, red: 0, fresh: false })).toBe('overload')
    expect(petState({ count: 1, red: 0, fresh: true })).toBe('newTask')
    expect(petState({ count: 2, red: 1, fresh: false })).toBe('busy')
    expect(petState({ count: 0, red: 0, fresh: false })).toBe('sleeping')
  })

  it('its form by level: 1–2, 3–4, 5–6', () => {
    expect([1, 2, 3, 4, 5, 6].map(formOf)).toEqual([0, 0, 1, 1, 2, 2])
  })

  it('a save sends the room, the pet and one’s own animal as the database takes them', () => {
    expect(spacePatchOf({ room: { wall: 'sky', floor: 'grass', items: [{ id: 'cactus-9', k: 'cactus', x: 101.2, flip: -1 }] } })).toEqual({
      room: { wall: 'sky', floor: 'grass', items: [{ id: 'cactus-9', k: 'cactus', x: 96, flip: -1 }] },
    })
    expect(spacePatchOf({ room: { wall: 'sky', floor: 'grass', items: [] } })).toEqual({ room: { wall: 'sky', floor: 'grass', items: [] } })
    expect(spacePatchOf({ pet: { species: 'bird', name: 'Kopi', color: 'sky', onboarded: true } })).toEqual({ pet: { species: 'bird', name: 'Kopi', color: 'sky', onboarded: true } })
    expect(spacePatchOf({ petPath: '' })).toEqual({ petPath: null })
  })
})

// 2026-10-24 — ⑦-5: the pet's levels, XP and energy, the trophies (the user's answers 32–34; the database's side:
// tests/member-sql/validate-marketing-pet.mjs).
describe('the pet’s levels', () => {
  it('Lv 1–6 at 0 · 100 · 250 · 450 · 700 · 1000 XP; it grows in the room', () => {
    expect([0, 99, 100, 249, 250, 450, 699, 700, 999, 1000, 5000].map(levelOf)).toEqual([1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6])
    expect([0, 1, 3, 6, 9].map(petSize)).toEqual([30, 30, 38, 52, 52])
  })

  it('the XP bar: how far into its level, its tooltip in words — the last full', () => {
    expect(xpBar(0)).toEqual({ level: 1, pct: 0, label: '0/100 XP to Lv 2' })
    expect(xpBar(160)).toEqual({ level: 2, pct: 40, label: '60/150 XP to Lv 3' })
    expect(xpBar(520)).toEqual({ level: 4, pct: 28, label: '70/250 XP to Lv 5' })
    expect(xpBar(1040)).toEqual({ level: 6, pct: 100, label: 'Max level' })
  })

  it('the energy bar red under 20, amber under 50; three workouts a day earn XP', () => {
    expect([0, 19, 20, 49, 50, 100].map(energyTone)).toEqual(['low', 'low', 'mid', 'mid', 'high', 'high'])
    expect([0, 2, 3, 5].map(exerciseTitle)).toEqual(['Exercise · 3/3 left today', 'Exercise · 1/3 left today', 'Exercise · 0/3 left today', 'Exercise · 0/3 left today'])
    expect([workoutWords('Kopi', true), workoutWords('Kopi', false)]).toEqual(['+10 XP · Kopi worked out', '3/3 workouts today. No more XP until tomorrow'])
  })

  it('a level reached — evolved when its form changes; one’s own animal does not', () => {
    expect(levelUpWords('Kopi', 'cat', 1, 2, false)).toBe('Kopi reached Lv 2!')
    expect(levelUpWords('Kopi', 'cat', 2, 3, false)).toBe('Kopi reached Lv 3 and evolved into a Cat!')
    expect(levelUpWords('Rex', 'dragon', 4, 6, false)).toBe('Rex reached Lv 6 and evolved into a Dragon!')
    expect(levelUpWords('Bao', 'dog', 2, 3, true)).toBe('Bao reached Lv 3!')
  })

  it('read from the database — off the roster, none', () => {
    expect(petStatsFromRow(null)).toBeNull()
    expect(petStatsFromRow({ xp: 130, energy: 104, snacks: '2', workouts: 1, trophyCount: 1, trophies: [
      { track: 'TSK-CAR-2610-004', title: 'Price banner', at: '2026-10-24T03:00:00Z' }, { title: 'no track' }, 'x',
    ] })).toEqual({ xp: 130, energy: 100, snacks: 2, workouts: 1, trophyCount: 1, trophies: [{ track: 'TSK-CAR-2610-004', title: 'Price banner', at: '2026-10-24T03:00:00Z' }] })
    expect(petStatsFromRow({})).toEqual({ xp: 0, energy: 0, snacks: 0, workouts: 0, trophies: [], trophyCount: 0 })
  })
})

describe('the trophies', () => {
  const stats = (n: number) => ({ xp: 0, energy: 64, snacks: 3, workouts: 0, trophyCount: n,
    trophies: Array.from({ length: Math.min(6, n) }, (_, i) => ({ track: `TSK-CAR-2610-00${i + 1}`, title: `Story ${i + 1}`, at: '' })) })
  it('one a project finished this quarter, each named by its project; two still to win greyed', () => {
    expect(trophyShelf(null)).toEqual({ got: [], locked: ['🏆', '🥇'], line: '0 projects finished this quarter' })
    expect(trophyShelf(stats(1))).toEqual({ got: [{ emoji: '🏆', name: 'TSK-CAR-2610-001 · Story 1' }], locked: ['🥇', '🎖️'], line: '1 project finished this quarter' })
    const nine = trophyShelf(stats(9))
    expect([nine.got.map(g => g.emoji).join(''), nine.locked, nine.line]).toEqual(['🏆🥇🎖️🏅🥈🎗️', [], '9 projects finished this quarter'])
  })
})
