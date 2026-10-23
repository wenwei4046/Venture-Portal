// My Space's own side (⑦-1, `My Space Bento.dc.html`; migs 20261024007500 and 20261024007600): the board its owner
// lays out — tiles moved and resized anywhere, added and taken off — the page's background, the accent and the
// corners, the cover (one of four, or a picture), the avatar, the status, and the Notes and Photo tiles. The prototype
// kept it in the browser; here it is the login's row (`mkt_space()` / `mkt_space_save(patch)`). Pure: the page draws
// what this returns, and sends what it makes.
//
// The board's measures are the prototype's: x and w are fractions of its width, y and h pixels; a column is a quarter
// (CW), a row 182 px (RW), 12 px between tiles (a tile is drawn 12 px narrower and lower than its place).

import { tidyFileName } from './library'

/** The tiles a board offers today (the room, the pet, the chat, the lobby and the trophies come later). */
export type TileKind = 'turn' | 'waiting' | 'delegated' | 'week' | 'notes' | 'photo'
export interface TilePlace { id: string; x: number; y: number; w: number; h: number }

export const RW = 182
export const CW = 0.25
export const MINW = 0.14
export const MINH = 110
export const GAP = 12
const MAXH = 2000

export const TILES: Record<TileKind, { emoji: string; label: string; size: [number, number] }> = {
  turn: { emoji: '👉', label: 'My turn', size: [1, 2] },
  waiting: { emoji: '⏳', label: 'Waiting', size: [1, 1] },
  delegated: { emoji: '📤', label: 'Delegated', size: [1, 1] },
  week: { emoji: '🗓️', label: 'This week', size: [1, 1] },
  notes: { emoji: '📝', label: 'Notes', size: [1, 1] },
  photo: { emoji: '🖼️', label: 'Photo', size: [1, 1] },
}
/** In the drawer's order (the prototype's TILE). */
export const KINDS = Object.keys(TILES) as TileKind[]
/** Always on the board, "so nobody hides their work". */
export const LOCKED: readonly string[] = ['turn', 'waiting']
/** On a board until its owner takes them off — a kind shipped later joins a saved board once (tilesKnown). */
const DEFAULT_ON: TileKind[] = ['turn', 'waiting', 'delegated', 'week']

export const isKind = (id: string): id is TileKind => (KINDS as string[]).includes(id)

const place = (id: TileKind, c: number, r: number, w: number, h: number): TilePlace => ({ id, x: c * CW, y: r * RW, w: w * CW, h: h * RW })
/** Before the first save, the page as it stood: My turn on the left half, two rows high (its cards two abreast),
 * Waiting and Delegated beside it, This week under them. The prototype's DEFAULT_POS begins with the room and the pet,
 * which are not here yet. */
export const DEFAULT_LAYOUT: TilePlace[] = [place('turn', 0, 0, 2, 2), place('waiting', 2, 0, 1, 1), place('delegated', 3, 0, 1, 1), place('week', 2, 1, 2, 1)]

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
    saved,
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
}
const PATCH_PATHS = ['coverPath', 'avatarPath', 'photoPath'] as const

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
  return out
}

// ── Pictures ───────────────────────────────────────────────────────────────────────
/** The cover and the avatar — space/<uuid>/<name>, which Marketing sees; the photo — mine/<uuid>/<name>, which only
 * its owner does (the bucket's policies, mig 20261024007600). */
export const spacePicturePath = (kind: 'cover' | 'avatar' | 'photo', fileName: string, uuid: string) =>
  `${kind === 'photo' ? 'mine' : 'space'}/${uuid}/${tidyFileName(fileName)}`

/** A space's picture: an image, and not a large one. */
export const PICTURE_MAX = 10 * 1024 * 1024

/** What a picture's problem is, in words — or null when it may go. */
export function pictureProblem(file: { name: string; type: string; size: number }): string | null {
  if (!file.type.startsWith('image/')) return 'A picture here is an image — PNG, JPG, WebP or GIF.'
  if (file.size > PICTURE_MAX) return `${file.name} is over 10 MB.`
  return null
}
