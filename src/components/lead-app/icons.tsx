import type { CSSProperties } from 'react'

/**
 * The phone's glyphs, path for path as the handoff draws them (`docs/design_handoff_lead_view_phone/icons.json` —
 * Lucide 0.460, Lead View's set, flattened to one `d`; the composer's own five beside them). Stroked in the current colour.
 */
export const PATH = {
  search: 'M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0Z M0 0m21 21-4.3-4.3',
  searchField: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.35-4.35',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0',
  house: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8 M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  chevronDown: 'M0 0m6 9 6 6 6-6',
  chevronLeft: 'M0 0m15 18-6-6 6-6',
  chevronRight: 'M0 0m9 18 6-6-6-6',
  clock: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z M12 6L12 12L16 14',
  alert: 'M21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3 M12 9v4 M12 17h.01',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
  messenger: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z',
  instagram: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1 -5 5h-10a5 5 0 0 1 -5 -5v-10a5 5 0 0 1 5 -5Z M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z M17.5 6.5L17.51 6.5',
  userRound: 'M7 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0Z M20 21a8 8 0 0 0-16 0',
  send: 'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z M0 0m21.854 2.147-10.94 10.939',
  attach: 'M16.5 7.5v8.25a4.5 4.5 0 0 1-9 0V6a3 3 0 0 1 6 0v9.5a1.5 1.5 0 0 1-3 0V8',
  camera: 'M3 9a2 2 0 0 1 2-2h2l1.5-2.2A1.5 1.5 0 0 1 9.75 4h4.5a1.5 1.5 0 0 1 1.25.8L17 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z M8.5 13a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0Z',
  smiley: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3',
  sendMain: 'M4 12 20 4l-4 16-4-7-8-1Zm8 1 8-9',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
  x: 'M18 6 6 18 M0 0m6 6 12 12',
  check: 'M20 6 9 17l-5-5',
  inbox: 'M22 12L16 12L14 15L10 15L8 12L2 12 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  contact: 'M16 2v2 M7 22v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2 M8 2v2 M9 11a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  trendingUp: 'M22 7 13.5 15.5 8.5 10.5 2 17 M16 7h6v6',
  megaphone: 'M0 0m3 11 18-5v12L3 14v-3z M11.6 16.8a3 3 0 1 1-5.8-1.6',
  eye: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0 M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z',
  logOut: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8ZM14 3v5h5M9 13h6M9 17h4',
} as const

export type IconName = keyof typeof PATH

/** A glyph at its drawn size and stroke (the handoff writes each one's own). */
export function Ic({ name, size, stroke = 2, style }: { name: IconName; size: number; stroke?: number; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"
      style={{ fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none', ...style }}>
      <path d={PATH[name]} />
    </svg>
  )
}
