// Marketing's Appearance (the handoff's Settings › Appearance, `Marketing Shell.dc.html`): the font size (S / M / L /
// XL = 12 / 13 / 14.5 / 16px — everything in the view is sized in em from it), the face (Inter, Nunito, IBM Plex Sans)
// and the density (Compact / Comfortable: the sidebar's rows 30 / 38px, its subsidiaries 26 / 30px, the tiles 24 /
// 28px). Kept per browser in a cookie (lib/marketing-view.ts MKT_LOOK_COOKIE), so the server draws it as chosen.

export type LookSize = 'S' | 'M' | 'L' | 'XL'
export type LookFont = 'Inter' | 'Nunito' | 'IBM Plex'
export type LookDensity = 'compact' | 'comfortable'

export interface Look {
  size: LookSize
  font: LookFont
  density: LookDensity
}

export const LOOK_SIZES: Readonly<Record<LookSize, number>> = { S: 12, M: 13, L: 14.5, XL: 16 }
export const LOOK_FONTS: readonly LookFont[] = ['Inter', 'Nunito', 'IBM Plex']
export const DEFAULT_LOOK: Look = { size: 'M', font: 'Inter', density: 'comfortable' }

const SIZE_KEYS = Object.keys(LOOK_SIZES) as LookSize[]

/** The cookie's value read back — anything it does not know falls back to the default, field by field. */
export function lookFromCookie(value: string | null | undefined): Look {
  if (!value) return DEFAULT_LOOK
  // The server reads it decoded; a browser's document.cookie, still encoded (writeCookie encodes it).
  let raw: unknown
  try {
    raw = JSON.parse(value)
  } catch {
    try {
      raw = JSON.parse(decodeURIComponent(value))
    } catch {
      return DEFAULT_LOOK
    }
  }
  if (!raw || typeof raw !== 'object') return DEFAULT_LOOK
  const r = raw as Record<string, unknown>
  return {
    size: SIZE_KEYS.includes(r.size as LookSize) ? (r.size as LookSize) : DEFAULT_LOOK.size,
    font: LOOK_FONTS.includes(r.font as LookFont) ? (r.font as LookFont) : DEFAULT_LOOK.font,
    density: r.density === 'compact' || r.density === 'comfortable' ? r.density : DEFAULT_LOOK.density,
  }
}

/** What the cookie keeps (lib/hr-view.ts writeCookie encodes it). */
export function lookToCookie(look: Look): string {
  return JSON.stringify(look)
}

/** The pixel sizes the shell draws with for a density. */
export function densityOf(density: LookDensity): { rowH: number; subH: number; tileS: number } {
  return density === 'compact' ? { rowH: 30, subH: 26, tileS: 24 } : { rowH: 38, subH: 30, tileS: 28 }
}
