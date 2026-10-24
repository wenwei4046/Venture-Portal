// My Space's own side (`My Space Bento.dc.html`; ⑦-1, migs 20261024007500 and 20261024007600; ⑦-2, mig
// 20261024007700; ⑦-5, mig 20261025037000): the board its owner lays out — tiles moved and resized anywhere, added and
// taken off — the page's background, the accent and the corners, the cover (one of four, or a picture), the avatar, the
// status, the Notes and Photo tiles; the room (its wall, its floor, its furniture) and the pet's look (its kind or one's
// own animal, its name, its colour); the pet's level, XP and energy and the trophies (`mkt_pet()` /
// `mkt_pet_care(what)`). The prototype kept it in the browser; here it is the login's row (`mkt_space()` /
// `mkt_space_save(patch)`). Pure: the page draws what this returns, and sends what it makes.
//
// The board's measures are the prototype's: x and w are fractions of its width, y and h pixels; a column is a quarter
// (CW), a row 182 px (RW), 12 px between tiles (a tile is drawn 12 px narrower and lower than its place).

import { tidyFileName } from './library'

/** The tiles a board offers today (the chat and the lobby come later). */
export type TileKind = 'room' | 'pet' | 'turn' | 'waiting' | 'delegated' | 'trophies' | 'week' | 'notes' | 'photo'
export interface TilePlace { id: string; x: number; y: number; w: number; h: number }

export const RW = 182
export const CW = 0.25
export const MINW = 0.14
export const MINH = 110
export const GAP = 12
const MAXH = 2000

export const TILES: Record<TileKind, { emoji: string; label: string; size: [number, number] }> = {
  room: { emoji: '🏠', label: 'Room', size: [2, 2] },
  pet: { emoji: '🐾', label: 'Pet', size: [1, 1] },
  turn: { emoji: '👉', label: 'My turn', size: [1, 2] },
  waiting: { emoji: '⏳', label: 'Waiting', size: [1, 1] },
  delegated: { emoji: '📤', label: 'Delegated', size: [1, 1] },
  trophies: { emoji: '🏆', label: 'Trophies', size: [1, 1] },
  week: { emoji: '🗓️', label: 'This week', size: [1, 1] },
  notes: { emoji: '📝', label: 'Notes', size: [1, 1] },
  photo: { emoji: '🖼️', label: 'Photo', size: [1, 1] },
}
/** In the drawer's order (the prototype's TILE). */
export const KINDS = Object.keys(TILES) as TileKind[]
/** Always on the board, "so nobody hides their work". */
export const LOCKED: readonly string[] = ['turn', 'waiting']
/** On a board until its owner takes them off — a kind shipped later joins a saved board once (tilesKnown). */
const DEFAULT_ON: TileKind[] = ['room', 'pet', 'turn', 'waiting', 'delegated', 'trophies', 'week']

export const isKind = (id: string): id is TileKind => (KINDS as string[]).includes(id)

const place = (id: TileKind, c: number, r: number, w: number, h: number): TilePlace => ({ id, x: c * CW, y: r * RW, w: w * CW, h: h * RW })
/** Before the first save: the prototype's DEFAULT_POS without what is not here yet (the chat, the lobby) — the room top
 * left, two by two; My turn beside it, two rows high; the pet and the trophies on the right; Waiting, Delegated and
 * This week under the room. */
export const DEFAULT_LAYOUT: TilePlace[] = [
  place('room', 0, 0, 2, 2), place('turn', 2, 0, 1, 2), place('pet', 3, 0, 1, 1), place('trophies', 3, 1, 1, 1),
  place('waiting', 0, 2, 1, 1), place('delegated', 1, 2, 1, 1), place('week', 2, 2, 2, 1),
]

// ── The look: keys, never colours (the colours are tokens in globals.css) ───────────
export const BGS = ['linen', 'mint', 'lilac', 'sand', 'white'] as const
export const ACCENTS = ['orange', 'walnut', 'blue', 'green', 'pink'] as const
export const CORNERS = ['square', 'soft', 'round'] as const
export type BgKey = (typeof BGS)[number]
export type AccentKey = (typeof ACCENTS)[number]
export type CornerKey = (typeof CORNERS)[number]
export interface SpaceTheme { bg: BgKey; accent: AccentKey; corners: CornerKey }
export const DEFAULT_THEME: SpaceTheme = { bg: 'linen', accent: 'orange', corners: 'soft' }
export const BG_NAMES: Record<BgKey, string> = { linen: 'Linen', mint: 'Mint', lilac: 'Lilac', sand: 'Sand', white: 'White' }
/** The prototype names no accent; a screen reader needs one. */
export const ACCENT_NAMES: Record<AccentKey, string> = { orange: 'Orange', walnut: 'Walnut', blue: 'Blue', green: 'Green', pink: 'Pink' }
export const CORNER_NAMES: Record<CornerKey, string> = { square: 'Square', soft: 'Soft', round: 'Round' }
export const COVERS = 4

// ── ⑦-2: the room and the pet's look (mig 20261024007700) ───────────────────────────
export const WALLS = ['peach', 'sage', 'sky', 'blush', 'cream', 'night'] as const
export const FLOORS = ['oak', 'walnut', 'tile', 'grass', 'carpet'] as const
export type WallKey = (typeof WALLS)[number]
export type FloorKey = (typeof FLOORS)[number]
export const WALL_NAMES: Record<WallKey, string> = { peach: 'Peach', sage: 'Sage', sky: 'Sky', blush: 'Blush', cream: 'Cream', night: 'Night' }
export const FLOOR_NAMES: Record<FloorKey, string> = { oak: 'Oak', walnut: 'Walnut', tile: 'Tile', grass: 'Grass', carpet: 'Carpet' }
/** The furniture — the prototype's CATALOG: its emoji, its name, its size (px at full scale), whether it hangs on the wall. */
export const CATALOG = {
  bed: { emoji: '🛏️', label: 'Bed', size: 64, wall: false }, sofa: { emoji: '🛋️', label: 'Sofa', size: 58, wall: false },
  plant: { emoji: '🪴', label: 'Plant', size: 46, wall: false }, desk: { emoji: '🖥️', label: 'Computer', size: 48, wall: false },
  chair: { emoji: '🪑', label: 'Chair', size: 42, wall: false }, books: { emoji: '📚', label: 'Books', size: 34, wall: false },
  teddy: { emoji: '🧸', label: 'Teddy', size: 36, wall: false }, guitar: { emoji: '🎸', label: 'Guitar', size: 46, wall: false },
  cactus: { emoji: '🌵', label: 'Cactus', size: 40, wall: false }, tv: { emoji: '📺', label: 'TV', size: 48, wall: false },
  candle: { emoji: '🕯️', label: 'Candle', size: 30, wall: false }, game: { emoji: '🕹️', label: 'Arcade', size: 38, wall: false },
  tree: { emoji: '🎄', label: 'Tree', size: 56, wall: false }, frame: { emoji: '🖼️', label: 'Art', size: 36, wall: true },
  clock: { emoji: '🕰️', label: 'Clock', size: 32, wall: true }, trophy: { emoji: '🏆', label: 'Trophy', size: 28, wall: true },
} as const
export type PieceKind = keyof typeof CATALOG
export const PIECES = Object.keys(CATALOG) as PieceKind[]
export interface Piece { id: string; k: PieceKind; x: number; flip: 1 | -1 }
export interface Room { wall: WallKey; floor: FloorKey; items: Piece[] }
const piece = (k: PieceKind, x: number): Piece => ({ id: `${k}-${x}`, k, x, flip: 1 })
/** A room before its owner decorates it: the prototype's first person's (peach, oak, a bed, a plant, art, a computer, a
 * chair and a clock). */
export const DEFAULT_ROOM: Room = {
  wall: 'peach', floor: 'oak', items: [piece('bed', 14), piece('plant', 32), piece('frame', 48), piece('desk', 66), piece('chair', 80), piece('clock', 86)],
}
export const ROOM_MAX_PIECES = 30

export const SPECIES = {
  cat: { label: 'Cat', forms: ['🐱', '🐈', '🦁'], names: ['Kitten', 'Cat', 'Lion'] },
  dog: { label: 'Dog', forms: ['🐶', '🐕', '🐺'], names: ['Puppy', 'Dog', 'Wolf'] },
  bird: { label: 'Bird', forms: ['🐣', '🐦', '🦅'], names: ['Chick', 'Bird', 'Eagle'] },
  dragon: { label: 'Dragon', forms: ['🥚', '🦎', '🐉'], names: ['Egg', 'Lizard', 'Dragon'] },
} as const
export type SpeciesKey = keyof typeof SPECIES
export const SPECIES_KEYS = Object.keys(SPECIES) as SpeciesKey[]
export const PET_COLORS = ['original', 'cocoa', 'snow', 'rose', 'mint', 'sky', 'midnight'] as const
export type PetColor = (typeof PET_COLORS)[number]
export const PET_COLOR_NAMES: Record<PetColor, string> = {
  original: 'Original', cocoa: 'Cocoa', snow: 'Snow', rose: 'Rose', mint: 'Mint', sky: 'Sky', midnight: 'Midnight',
}
export interface Pet { species: SpeciesKey; name: string; color: PetColor; onboarded: boolean }
export const NO_PET: Pet = { species: 'cat', name: '', color: 'original', onboarded: false }
export const NAME_IDEAS = ['Mochi', 'Bao', 'Kopi', 'Sambal', 'Teh Tarik', 'Durian']
export const PET_NAME_MAX = 16
/** The pet in the room, by level (px — the prototype's SIZE): it grows. */
export const PET_SIZE = [30, 34, 38, 42, 46, 52]
export const formOf = (level: number) => (level <= 2 ? 0 : level <= 4 ? 1 : 2)
export const FORM_LEVELS = ['Lv 1–2', 'Lv 3–4', 'Lv 5–6']

// ── ⑦-5: the pet's levels, XP and energy; the trophies (mig 20261025037000) ─────────────
/** The XP each level begins at (the prototype's LEVELS): Lv 1–6. */
export const LEVELS = [0, 100, 250, 450, 700, 1000]
export const levelOf = (xp: number) => Math.max(1, LEVELS.filter(x => xp >= x).length)
export const petSize = (level: number) => PET_SIZE[Math.min(PET_SIZE.length, Math.max(1, level)) - 1]
/** The XP bar: how far into its level (its tooltip in words); the last level is full. */
export function xpBar(xp: number): { level: number; pct: number; label: string } {
  const level = levelOf(xp)
  const cur = LEVELS[level - 1]
  const next = LEVELS[level]
  if (next == null) return { level, pct: 100, label: 'Max level' }
  return { level, pct: Math.round(((xp - cur) / (next - cur)) * 100), label: `${xp - cur}/${next - cur} XP to Lv ${level + 1}` }
}
/** The energy bar's colour: red under 20 (the pet is hungry), amber under 50. */
export const energyTone = (energy: number): 'low' | 'mid' | 'high' => (energy < 20 ? 'low' : energy < 50 ? 'mid' : 'high')
/** Workouts a day that earn XP (the office's day). */
export const WORKOUTS_A_DAY = 3
export const exerciseTitle = (workouts: number) => `Exercise · ${Math.max(0, WORKOUTS_A_DAY - workouts)}/${WORKOUTS_A_DAY} left today`

/** A project finished this quarter where its owner did a stage. */
export interface Trophy { track: string; title: string; at: string }
/** `mkt_pet()` / `mkt_pet_care(what)`: the pet in numbers — XP (stages finished, workouts), energy 0–100, snacks to
 * feed, today's workouts — and this quarter's trophies (six listed at most, all counted). */
export interface PetStats { xp: number; energy: number; snacks: number; workouts: number; trophies: Trophy[]; trophyCount: number }

/** What the database hands over; null — off Marketing's roster, no pet. */
export function petStatsFromRow(row: unknown): PetStats | null {
  if (!isObject(row)) return null
  const whole = (v: unknown) => Math.max(0, Math.round(num(v) ?? 0))
  const trophies: Trophy[] = []
  for (const t of Array.isArray(row.trophies) ? row.trophies : []) {
    if (isObject(t) && typeof t.track === 'string' && t.track) trophies.push({ track: t.track, title: text(t.title), at: text(t.at) })
  }
  return {
    xp: whole(row.xp), energy: Math.min(100, whole(row.energy)), snacks: whole(row.snacks), workouts: whole(row.workouts),
    trophies: trophies.slice(0, TROPHY_SET.length), trophyCount: Math.max(whole(row.trophyCount), trophies.length),
  }
}

/** The trophy shelf (the prototype's): one a project, six at most — each named by its project — then two still to win,
 * greyed. */
export const TROPHY_SET = ['🏆', '🥇', '🎖️', '🏅', '🥈', '🎗️']
export function trophyShelf(stats: PetStats | null): { got: { emoji: string; name: string }[]; locked: string[]; line: string } {
  const n = stats?.trophyCount ?? 0
  const shown = Math.min(TROPHY_SET.length, n)
  return {
    got: TROPHY_SET.slice(0, shown).map((emoji, i) => {
      const t = stats?.trophies[i]
      return { emoji, name: t ? `${t.track} · ${t.title}` : '' }
    }),
    locked: TROPHY_SET.slice(shown, shown + 2),
    line: `${n} project${n === 1 ? '' : 's'} finished this quarter`,
  }
}

/** A level reached — and, its kind's form changed, what it evolved into (one's own animal does not evolve). */
export function levelUpWords(name: string, species: SpeciesKey, from: number, to: number, ownAnimal: boolean): string {
  const evolved = !ownAnimal && formOf(to) > formOf(from)
  return `${name} reached Lv ${to}${evolved ? ` and evolved into a ${SPECIES[species].names[formOf(to)]}!` : '!'}`
}
/** A workout done: its XP, or none — three a day earn it. */
export const workoutWords = (name: string, earned: boolean) =>
  earned ? `+10 XP · ${name} worked out` : `${WORKOUTS_A_DAY}/${WORKOUTS_A_DAY} workouts today. No more XP until tomorrow`

export type PetState = 'idle' | 'newTask' | 'busy' | 'overload' | 'sleeping' | 'eating' | 'exercising' | 'levelUp' | 'hungry'
/** Each state's words and the bubble over the pet (the prototype's STATES). */
export const PET_STATES: Record<PetState, { label: string; bubble: string }> = {
  idle: { label: 'Chilling', bubble: '' }, newTask: { label: 'New task!', bubble: '❗' }, busy: { label: 'Working', bubble: '💻' },
  overload: { label: 'Overloaded', bubble: '💦' }, sleeping: { label: 'Sleeping', bubble: '💤' }, eating: { label: 'Eating', bubble: '🍙' },
  exercising: { label: 'Working out', bubble: '💪' }, levelUp: { label: 'Level up!', bubble: '✨' }, hungry: { label: 'Hungry', bubble: '🍽️' },
}

/** How the pet looks with what is on its owner's plate (the prototype's myState): hungry under 20 energy, overloaded
 * with two things late or four on the plate, a new stage to accept, working, or asleep with nothing on it. */
export function petState(plate: { count: number; red: number; fresh: boolean }, energy = 100): PetState {
  if (energy < 20) return 'hungry'
  if (plate.red >= 2 || plate.count >= 4) return 'overload'
  if (plate.fresh) return 'newTask'
  if (plate.count >= 1) return 'busy'
  return 'sleeping'
}

/** The room's furniture as drawn in a tile so big: smaller in a short or narrow room (the prototype's buildRoom). */
export function roomScale(t: TilePlace): number {
  return t.h < 240 ? 0.55 : t.w < 0.4 ? 0.75 : 1
}

let pieceSerial = 0
/** A new piece, somewhere in the middle of the room. */
export function newPiece(k: PieceKind, at = 20 + Math.round(Math.random() * 60)): Piece {
  pieceSerial = (pieceSerial + 1) % 1000
  return { id: `${k}-${Date.now().toString(36)}${pieceSerial.toString(36)}`, k, x: at, flip: 1 }
}

export interface Space {
  layout: TilePlace[]
  theme: SpaceTheme
  /** A preset, 0–3 — drawn when no picture is. */
  cover: number
  coverPath: string | null
  avatarPath: string | null
  status: string
  notes: string
  photoPath: string | null
  /** The kinds the saved board has seen. */
  tilesKnown: string[]
  room: Room
  pet: Pet
  /** One's own animal, in place of the four kinds. */
  petPath: string | null
  /** Saved at least once. */
  saved: boolean
}

const oneOf = <T extends string>(list: readonly T[], v: unknown, d: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null)
const text = (v: unknown) => (typeof v === 'string' ? v : '')
const path = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)

/** A tile kept within the board and no smaller than the prototype's minimum. */
export function clampPlace(t: TilePlace): TilePlace {
  const w = Math.min(1, Math.max(MINW, t.w))
  return { id: t.id, x: Math.min(1 - w, Math.max(0, t.x)), y: Math.max(0, t.y), w, h: Math.min(MAXH, Math.max(MINH, t.h)) }
}

/** A tile of its default size, under everything on the board. */
export function addedTile(layout: TilePlace[], kind: TileKind): TilePlace {
  const [w, h] = TILES[kind].size
  return { id: kind, x: 0, y: Math.max(0, ...layout.map(t => t.y + t.h)), w: w * CW, h: h * RW }
}

/** The board as read: the kinds it knows (one place each), My turn and Waiting always on, and any kind shipped since it
 * was saved that is on by default, once, under the rest. A kind this page does not draw yet is kept as it was. */
export function boardOf(saved: TilePlace[] | null, known: string[]): TilePlace[] {
  if (!saved) return DEFAULT_LAYOUT.map(t => ({ ...t }))
  const seen = new Set<string>()
  const out: TilePlace[] = []
  for (const t of saved) {
    if (seen.has(t.id)) continue
    seen.add(t.id)
    out.push(isKind(t.id) ? clampPlace(t) : t)
  }
  for (const k of DEFAULT_ON) {
    if (seen.has(k) || (known.includes(k) && !LOCKED.includes(k))) continue
    out.push(addedTile(out, k))
    seen.add(k)
  }
  return out
}

/** What `mkt_space()` hands over; null (nothing saved) is the design's default. */
export function spaceFromRow(row: unknown): Space {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>
  const saved = row != null && typeof row === 'object'
  const layoutIn = Array.isArray(r.layout) ? (r.layout as unknown[]) : null
  const places: TilePlace[] = []
  for (const x of layoutIn ?? []) {
    const t = (x ?? {}) as Record<string, unknown>
    const [px, py, pw, ph] = [num(t.x), num(t.y), num(t.w), num(t.h)]
    if (typeof t.id === 'string' && px != null && py != null && pw != null && ph != null) places.push({ id: t.id, x: px, y: py, w: pw, h: ph })
  }
  const known = Array.isArray(r.tilesKnown) ? (r.tilesKnown as unknown[]).filter((k): k is string => typeof k === 'string') : []
  const th = (r.theme ?? {}) as Record<string, unknown>
  const cover = num(r.cover)
  return {
    layout: boardOf(saved && layoutIn && places.length ? places : null, known),
    theme: { bg: oneOf(BGS, th.bg, DEFAULT_THEME.bg), accent: oneOf(ACCENTS, th.accent, DEFAULT_THEME.accent), corners: oneOf(CORNERS, th.corners, DEFAULT_THEME.corners) },
    cover: cover != null && cover >= 0 && cover < COVERS ? Math.round(cover) : 0,
    coverPath: path(r.coverPath),
    avatarPath: path(r.avatarPath),
    status: text(r.status),
    notes: text(r.notes),
    photoPath: path(r.photoPath),
    tilesKnown: known,
    room: roomFromRow(r.room),
    pet: petFromRow(r.pet),
    petPath: path(r.petPath),
    saved,
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** A room as kept — never set (`{}`) is the default room. */
export function roomFromRow(v: unknown): Room {
  if (!isObject(v) || !Object.keys(v).length) return { ...DEFAULT_ROOM, items: DEFAULT_ROOM.items.map(i => ({ ...i })) }
  const seen = new Set<string>()
  const items: Piece[] = []
  for (const x of Array.isArray(v.items) ? v.items : []) {
    if (!isObject(x) || typeof x.id !== 'string' || seen.has(x.id) || !(PIECES as string[]).includes(String(x.k))) continue
    const at = num(x.x)
    if (at == null) continue
    seen.add(x.id)
    items.push({ id: x.id, k: x.k as PieceKind, x: Math.min(96, Math.max(4, Math.round(at))), flip: x.flip === -1 ? -1 : 1 })
  }
  return { wall: oneOf(WALLS, v.wall, DEFAULT_ROOM.wall), floor: oneOf(FLOORS, v.floor, DEFAULT_ROOM.floor), items: items.slice(0, ROOM_MAX_PIECES) }
}

/** A pet as kept — never set (`{}`) is a cat with no name yet, not set up. */
export function petFromRow(v: unknown): Pet {
  if (!isObject(v)) return { ...NO_PET }
  return {
    species: oneOf(SPECIES_KEYS, v.species, NO_PET.species),
    name: typeof v.name === 'string' ? v.name.slice(0, PET_NAME_MAX) : '',
    color: oneOf(PET_COLORS, v.color, NO_PET.color),
    onboarded: v.onboarded === true,
  }
}

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places
/** A layout as the database keeps it (x and w to four places, y and h whole) — and as it is sent. */
export function layoutToRow(layout: TilePlace[]): TilePlace[] {
  return layout.map(t => ({ id: t.id, x: round(t.x, 4), y: Math.round(t.y), w: round(t.w, 4), h: Math.round(t.h) }))
}
export const sameLayout = (a: TilePlace[], b: TilePlace[]) => JSON.stringify(layoutToRow(a)) === JSON.stringify(layoutToRow(b))
/** Every kind the board has offered, so a kind shipped later is added only once. */
export const knownAfter = (known: string[]) => [...new Set([...known, ...KINDS])].sort()

// ── Edit layout ────────────────────────────────────────────────────────────────────
export type Grip = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
/** The eight handles, in the prototype's order: edges, then corners. */
export const HANDLES: Exclude<Grip, 'move'>[] = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se']

/** Where a tile goes when dragged dx (a fraction of the board's width) and dy (px) by a grip — the prototype's
 * startXform: moved within the board, or resized from that edge or corner, never below the minimum. */
export function dragged(s0: TilePlace, grip: Grip, dx: number, dy: number): TilePlace {
  const n = { ...s0 }
  if (grip === 'move') {
    n.x = Math.max(0, Math.min(1 - s0.w, s0.x + dx))
    n.y = Math.max(0, s0.y + dy)
    return n
  }
  if (grip.includes('e')) n.w = Math.max(MINW, Math.min(1 - s0.x, s0.w + dx))
  if (grip.includes('w')) {
    const nx = Math.max(0, Math.min(s0.x + s0.w - MINW, s0.x + dx))
    n.w = s0.w + (s0.x - nx)
    n.x = nx
  }
  if (grip.includes('s')) n.h = Math.min(MAXH, Math.max(MINH, s0.h + dy))
  if (grip.includes('n')) {
    const ny = Math.max(0, Math.min(s0.y + s0.h - MINH, s0.y + dy))
    n.h = s0.h + (s0.y - ny)
    n.y = ny
  }
  return n
}

/** The arrow keys on a tile being laid out: a step of 1% across or 12 px down; with Shift, its size instead. */
export function nudged(t: TilePlace, key: string, shift: boolean): TilePlace | null {
  const d: Record<string, [number, number]> = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -GAP], ArrowDown: [0, GAP] }
  const step = d[key]
  if (!step) return null
  return dragged(t, shift ? (step[0] ? 'e' : 's') : 'move', step[0], step[1])
}

/** The tile last moved is drawn over the others: it goes last. */
export function toFront(layout: TilePlace[], id: string): TilePlace[] {
  const t = layout.find(x => x.id === id)
  return t ? [...layout.filter(x => x.id !== id), t] : layout
}

export function withPlace(layout: TilePlace[], next: TilePlace): TilePlace[] {
  return layout.map(t => (t.id === next.id ? next : t))
}

export function removedTile(layout: TilePlace[], id: string): TilePlace[] {
  return LOCKED.includes(id) ? layout : layout.filter(t => t.id !== id)
}

/** The kinds not on the board, for the drawer's *Add a tile*. */
export const addable = (layout: TilePlace[]) => KINDS.filter(k => !layout.some(t => t.id === k))

/** The board's height: its lowest tile — and room under it to drag into while laying out. */
export function boardHeight(layout: TilePlace[], editing: boolean): number {
  return Math.max(RW, ...layout.map(t => t.y + t.h)) - GAP + (editing ? 140 : 0)
}

/** A narrow screen draws the tiles one under another, in the order they are read on the board. */
export const readingOrder = (layout: TilePlace[]) => [...layout].sort((a, b) => a.y - b.y || a.x - b.x)

/** A task tile half the board wide or more lays its cards two abreast (the prototype's taskTile). */
export const twoAbreast = (t: TilePlace) => t.w >= 0.45

// ── A save ─────────────────────────────────────────────────────────────────────────
export interface SpacePatch {
  layout?: TilePlace[]
  tilesKnown?: string[]
  theme?: SpaceTheme
  cover?: number | null
  coverPath?: string | null
  avatarPath?: string | null
  photoPath?: string | null
  status?: string
  notes?: string
  room?: Room
  pet?: Pet
  petPath?: string | null
}
const PATCH_PATHS = ['coverPath', 'avatarPath', 'photoPath', 'petPath'] as const

/** Only the parts sent, as `mkt_space_save` takes them — whatever else came in left out (the database checks the rest). */
export function spacePatchOf(p: SpacePatch): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (Array.isArray(p.layout)) {
    out.layout = layoutToRow(p.layout.filter(t => t && typeof t.id === 'string' && [t.x, t.y, t.w, t.h].every(v => typeof v === 'number' && Number.isFinite(v))).slice(0, 20))
  }
  if (Array.isArray(p.tilesKnown)) out.tilesKnown = p.tilesKnown.filter((k): k is string => typeof k === 'string').slice(0, 30)
  if (p.theme && typeof p.theme === 'object') {
    out.theme = { bg: oneOf(BGS, p.theme.bg, DEFAULT_THEME.bg), accent: oneOf(ACCENTS, p.theme.accent, DEFAULT_THEME.accent), corners: oneOf(CORNERS, p.theme.corners, DEFAULT_THEME.corners) }
  }
  if ('cover' in p) out.cover = p.cover == null ? null : Math.round(Number(p.cover))
  for (const k of PATCH_PATHS) if (k in p) out[k] = typeof p[k] === 'string' && p[k] ? p[k] : null
  if ('status' in p) out.status = String(p.status ?? '').slice(0, 80)
  if ('notes' in p) out.notes = String(p.notes ?? '').slice(0, 4000)
  if (p.room && typeof p.room === 'object') {
    const r = roomFromRow({ ...p.room, items: Array.isArray(p.room.items) ? p.room.items : [] })
    out.room = { wall: r.wall, floor: r.floor, items: r.items }
  }
  if (p.pet && typeof p.pet === 'object') {
    const pet = petFromRow(p.pet)
    out.pet = { species: pet.species, name: pet.name, color: pet.color, onboarded: pet.onboarded }
  }
  return out
}

// ── Pictures ───────────────────────────────────────────────────────────────────────
/** A space's pictures. One goes up at a time: while it does, every button that picks one waits. */
export type SpacePicture = 'cover' | 'avatar' | 'photo' | 'pet'

/** The cover, the avatar and one's own animal — space/<uuid>/<name>, which Marketing sees; the photo —
 * mine/<uuid>/<name>, which only its owner does (the bucket's policies, mig 20261024007600). */
export const spacePicturePath = (kind: SpacePicture, fileName: string, uuid: string) =>
  `${kind === 'photo' ? 'mine' : 'space'}/${uuid}/${tidyFileName(fileName)}`

/** A space's picture: an image, and not a large one. */
export const PICTURE_MAX = 10 * 1024 * 1024

/** What a picture's problem is, in words — or null when it may go. */
export function pictureProblem(file: { name: string; type: string; size: number }): string | null {
  if (!file.type.startsWith('image/')) return 'A picture here is an image — PNG, JPG, WebP or GIF.'
  if (file.size > PICTURE_MAX) return `${file.name} is over 10 MB.`
  return null
}
