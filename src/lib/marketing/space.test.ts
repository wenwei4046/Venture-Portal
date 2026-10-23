import { describe, expect, it } from 'vitest'
import {
  addable, addedTile, boardHeight, boardOf, clampPlace, DEFAULT_LAYOUT, DEFAULT_ROOM, DEFAULT_THEME, dragged, formOf, knownAfter, layoutToRow,
  newPiece, NO_PET, nudged, petFromRow, petState, pictureProblem, readingOrder, removedTile, roomFromRow, roomScale, sameLayout, spaceFromRow,
  spacePatchOf, spacePicturePath, toFront, twoAbreast, type TilePlace,
} from './space'

// 2026-10-23 — ⑦-1: My Space's own side (`My Space Bento.dc.html`) — the board its owner lays out (the prototype's
// measures: x and w a share of the width, y and h px, 182 px a row, a quarter a column), the look by keys, the cover,
// the pictures, a save of only what changed. The database's side: tests/member-sql/validate-marketing-spaces.mjs.

const t = (id: string, x: number, y: number, w: number, h: number): TilePlace => ({ id, x, y, w, h })

describe('the board as read', () => {
  it('before the first save: the prototype’s board without what is not here yet — the room top left, My turn beside it', () => {
    const s = spaceFromRow(null)
    expect(s.saved).toBe(false)
    expect(s.layout).toEqual(DEFAULT_LAYOUT)
    expect(s.layout.map(x => [x.id, x.x, x.y, x.w, x.h])).toEqual([
      ['room', 0, 0, 0.5, 364], ['turn', 0.5, 0, 0.25, 364], ['waiting', 0.75, 0, 0.25, 182], ['delegated', 0.75, 182, 0.25, 182], ['week', 0, 364, 0.5, 182],
    ])
    expect([s.theme, s.cover, s.coverPath, s.avatarPath, s.photoPath, s.status, s.notes]).toEqual([DEFAULT_THEME, 0, null, null, null, '', ''])
    expect([s.room, s.pet, s.petPath]).toEqual([DEFAULT_ROOM, NO_PET, null])
  })

  it('a saved board as its owner left it; a kind this page does not draw yet kept as it was', () => {
    const s = spaceFromRow({
      layout: [t('waiting', 0, 0, 0.25, 182), t('turn', 0.25, 0, 0.75, 400), t('chat', 0, 400, 0.25, 546)], tilesKnown: ['delegated', 'room', 'turn', 'waiting', 'week'],
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
    const b = boardOf([t('turn', 0, 0, 0.5, 364), t('waiting', 0.5, 0, 0.25, 182)], ['room', 'turn', 'waiting', 'week'])
    expect(b.map(x => x.id)).toEqual(['turn', 'waiting', 'delegated'])
    expect(b[2]).toEqual(t('delegated', 0, 364, 0.25, 182))
  })

  it('a board saved before the room came (⑦-1) gets the room once, two by two, under the rest', () => {
    const saved = [t('turn', 0, 0, 0.5, 364), t('waiting', 0.5, 0, 0.25, 182), t('delegated', 0.75, 0, 0.25, 182), t('week', 0.5, 182, 0.5, 182)]
    const b = boardOf(saved, ['delegated', 'notes', 'photo', 'turn', 'waiting', 'week'])
    expect(b.map(x => x.id)).toEqual(['turn', 'waiting', 'delegated', 'week', 'room'])
    expect(b[4]).toEqual(t('room', 0, 364, 0.5, 364))
    expect(boardOf(saved, knownAfter(['delegated', 'turn', 'waiting', 'week'])).map(x => x.id)).toEqual(['turn', 'waiting', 'delegated', 'week'])
  })

  it('My turn and Waiting are always on it — whatever came back', () => {
    const b = boardOf([t('week', 0, 0, 0.5, 182)], ['room', 'turn', 'waiting', 'delegated', 'week'])
    expect(b.map(x => x.id)).toEqual(['week', 'turn', 'waiting'])
  })

  it('each kind once; a tile out of bounds brought back in', () => {
    const b = boardOf([t('turn', 0.9, -5, 0.5, 50), t('turn', 0, 0, 0.25, 182), t('waiting', 0, 0, 0.05, 9000)], ['room', 'turn', 'waiting', 'delegated', 'week'])
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
    expect(toFront(b, 'turn').map(x => x.id)).toEqual(['room', 'waiting', 'delegated', 'week', 'turn'])
    expect(removedTile(b, 'turn')).toBe(b)
    expect(removedTile(b, 'waiting')).toBe(b)
    expect(removedTile(b, 'week').map(x => x.id)).toEqual(['room', 'turn', 'waiting', 'delegated'])
    expect(removedTile(b, 'room').map(x => x.id)).toEqual(['turn', 'waiting', 'delegated', 'week'])
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
    expect(knownAfter(['room'])).toEqual(['delegated', 'notes', 'photo', 'room', 'turn', 'waiting', 'week'])
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

  it('looks as its owner’s plate is: overloaded, a new task, working, asleep', () => {
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
